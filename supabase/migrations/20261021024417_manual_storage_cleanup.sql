-- Manual cleanup guards; applying this migration does not delete any file.
-- Physical removal is exclusively the Storage API after a reviewed plan.
-- Rollback is operational: stop cleanup, retain tombstones/guards, forward-fix.
-- Never drop tombstones while an acknowledged or uncertain delete can be in flight.
begin;
create table velox_private.storage_cleanup_claims (
 object_id uuid primary key, bucket_id text not null, path text not null,
 owner_id uuid not null, claimed_at timestamptz not null default clock_timestamp(),
 state text not null default 'claimed' check(state in ('claimed','deleted')),
 unique(bucket_id,path)
);
create index storage_cleanup_owner_state on velox_private.storage_cleanup_claims(owner_id,state);
alter table velox_private.storage_cleanup_claims enable row level security;
revoke all on velox_private.storage_cleanup_claims from public,anon,authenticated,service_role;

create function velox_private.storage_path_referenced(object_path text)
returns boolean language sql stable security definer set search_path='' as $$
 -- An avatar may be an encoded/signed URL. Hold all owner files rather than
 -- guessing URL decoding and deleting an ambiguously referenced original.
 select exists(select 1 from public.profiles p where p.id::text=split_part(object_path,'/',1) and nullif(btrim(p.avatar_url),'') is not null)
 or exists(select 1 from public.vehicle_media where storage_path=object_path)
 or exists(select 1 from public.inspection_media where storage_path=object_path)
 or exists(select 1 from public.publication_requests where user_id::text=split_part(object_path,'/',1) and position(to_jsonb(object_path)::text in request_media::text)>0)
 or exists(select 1 from public.publication_drafts where user_id::text=split_part(object_path,'/',1) and position(to_jsonb(object_path)::text in data::text)>0);
$$;
revoke all on function velox_private.storage_path_referenced(text) from public,anon,authenticated,service_role;


create function velox_private.cleanup_old_enough(document jsonb, retention_days integer)
returns boolean language plpgsql set search_path='' as $$
declare born timestamptz; changed timestamptz;
begin
 born:=nullif(document->>'created_at','')::timestamptz;
 changed:=coalesce(nullif(document->>'updated_at','')::timestamptz,born);
 return born is not null and isfinite(born) and isfinite(changed)
 and greatest(born,changed)<=clock_timestamp()-retention_days*interval '1 day';
exception when invalid_datetime_format or datetime_field_overflow then return false;
end $$;
revoke all on function velox_private.cleanup_old_enough(jsonb,integer) from public,anon,authenticated,service_role;

create function public.storage_cleanup_preview(retention_days integer default 7)
returns jsonb language plpgsql security definer set search_path='' as $$
declare plan jsonb;
begin
 if retention_days is null or retention_days not between 7 and 365 then raise exception 'Invalid retention' using errcode='23514'; end if;
 select coalesce(jsonb_agg(item),'[]'::jsonb) into plan from (
 select jsonb_build_object('object_id',o.id,'bucket',o.bucket_id,'path',o.name,'created_at',to_jsonb(o)->>'created_at') item
 from storage.objects o where o.bucket_id in ('vehicle-media','inspection-media')
 and split_part(o.name,'/',1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 and velox_private.cleanup_old_enough(to_jsonb(o),retention_days)
 and not velox_private.storage_path_referenced(o.name)
 and not exists(select 1 from velox_private.upload_reservations r where r.bucket_id=o.bucket_id and r.path=o.name and r.state='pending' and r.expires_at>clock_timestamp())
 and not exists(select 1 from velox_private.storage_cleanup_claims c where c.bucket_id=o.bucket_id and c.path=o.name)
 order by o.id limit 100
 ) candidates;
 return jsonb_build_object('generated_at',clock_timestamp(),'retention_days',retention_days,'objects',plan);
end $$;

create function public.claim_storage_cleanup(target_object uuid, expected_bucket text, expected_path text, retention_days integer default 7)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; obj storage.objects; prior velox_private.storage_cleanup_claims;
begin
 if target_object is null or retention_days is null or retention_days not between 7 and 365 or expected_bucket is null or expected_bucket not in ('vehicle-media','inspection-media')
 or expected_path is null or length(expected_path)>300 or split_part(expected_path,'/',1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Invalid cleanup target' using errcode='23514'; end if;
 actor:=split_part(expected_path,'/',1)::uuid;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,61501));
 select * into prior from velox_private.storage_cleanup_claims where bucket_id=expected_bucket and path=expected_path;
 if found then
  if prior.object_id<>target_object then raise exception 'Cleanup generation mismatch' using errcode='23514'; end if;
  return jsonb_build_object('state',prior.state);
 end if;
 select * into obj from storage.objects where id=target_object and bucket_id=expected_bucket and name=expected_path;
 if not found or not coalesce(velox_private.cleanup_old_enough(to_jsonb(obj),retention_days),false)
 or velox_private.storage_path_referenced(expected_path)
 or exists(select 1 from velox_private.upload_reservations r where r.owner_id=actor and r.bucket_id=expected_bucket and r.path=expected_path and r.state='pending' and r.expires_at>clock_timestamp()) then
 raise exception 'Cleanup target no longer eligible' using errcode='23514'; end if;
 insert into velox_private.storage_cleanup_claims(object_id,bucket_id,path,owner_id) values(target_object,expected_bucket,expected_path,actor);
 return jsonb_build_object('state','claimed');
end $$;

-- Permanent tombstones: never free a path while a Storage delete may be in flight.
-- All real media links serialize with claim on the same owner key. If cleanup
-- wins, publication/report rolls back; if publication wins, claim sees its link.
create function velox_private.guard_cleanup_media_link()
returns trigger language plpgsql security definer set search_path='' as $$
declare owner_prefix text:=split_part(new.storage_path,'/',1); bucket text:=case when tg_table_name='vehicle_media' then 'vehicle-media' else 'inspection-media' end;
begin
 if owner_prefix ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_prefix,61501));
 if exists(select 1 from velox_private.storage_cleanup_claims where bucket_id=bucket and path=new.storage_path) then raise exception 'File is quarantined for cleanup' using errcode='23514'; end if;
 end if;
 return new;
end $$;
create trigger guard_cleanup_media before insert or update on public.vehicle_media for each row execute function velox_private.guard_cleanup_media_link();
create trigger guard_cleanup_media before insert or update on public.inspection_media for each row execute function velox_private.guard_cleanup_media_link();

create function velox_private.guard_cleanup_object()
returns trigger language plpgsql security definer set search_path='' as $$
declare prefix text:=split_part(new.name,'/',1);
begin
 if new.bucket_id in ('vehicle-media','inspection-media') and prefix ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(prefix,61501));
 if exists(select 1 from velox_private.storage_cleanup_claims where bucket_id=new.bucket_id and path=new.name) then raise exception 'Cleanup path cannot be reused' using errcode='23514'; end if;
 end if;
 return new;
end $$;
create trigger a_guard_cleanup_object before insert or update on storage.objects for each row execute function velox_private.guard_cleanup_object();


-- Draft/idempotency writes carry references before final media links exist.
-- Foreign-owner draft paths cannot be attached by the publication RPC.
create function velox_private.guard_cleanup_payload_reference()
returns trigger language plpgsql security definer set search_path='' as $$
declare document jsonb;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text,61501));
 if tg_table_name='publication_drafts' then document:=new.data;
 else document:=new.request_media; end if;
 if exists(select 1 from velox_private.storage_cleanup_claims c
   where c.owner_id=new.user_id and position(to_jsonb(c.path)::text in document::text)>0) then
  raise exception 'File is quarantined for cleanup' using errcode='23514';
 end if;
 return new;
end $$;
create trigger guard_cleanup_payload before insert or update on public.publication_drafts for each row execute function velox_private.guard_cleanup_payload_reference();
create trigger guard_cleanup_payload before insert or update on public.publication_requests for each row execute function velox_private.guard_cleanup_payload_reference();

-- Opaque avatar URLs cannot be reliably mapped to a bucket/path. Hold a new
-- nonempty avatar while deletions are unresolved; blanking and unrelated edits
-- stay possible. Completed tombstones must not ban future pictures forever.
create function velox_private.guard_cleanup_avatar_reference()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.avatar_url is not distinct from old.avatar_url then return new; end if;
 if nullif(btrim(new.avatar_url),'') is null then return new; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.id::text,61501));
 if exists(select 1 from velox_private.storage_cleanup_claims where owner_id=new.id and state='claimed') then
  raise exception 'Avatar change waits for storage reconciliation' using errcode='23514';
 end if;
 return new;
end $$;
create trigger guard_cleanup_avatar before insert or update of avatar_url on public.profiles for each row execute function velox_private.guard_cleanup_avatar_reference();
revoke all on function velox_private.guard_cleanup_payload_reference(),velox_private.guard_cleanup_avatar_reference() from public,anon,authenticated,service_role;

create function public.complete_storage_cleanup(target_object uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare claim velox_private.storage_cleanup_claims;
begin
 select * into claim from velox_private.storage_cleanup_claims where object_id=target_object;
 if not found then raise exception 'Unknown cleanup claim' using errcode='23514'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(claim.owner_id::text,61501));
 if exists(select 1 from storage.objects where bucket_id=claim.bucket_id and name=claim.path) then return jsonb_build_object('state','pending'); end if;
 update velox_private.storage_cleanup_claims set state='deleted' where object_id=target_object;
 return jsonb_build_object('state','deleted');
end $$;
revoke all on function velox_private.guard_cleanup_media_link(),velox_private.guard_cleanup_object() from public,anon,authenticated,service_role;
revoke all on function public.storage_cleanup_preview(integer),public.claim_storage_cleanup(uuid,text,text,integer),public.complete_storage_cleanup(uuid) from public,anon,authenticated;
grant execute on function public.storage_cleanup_preview(integer),public.claim_storage_cleanup(uuid,text,text,integer),public.complete_storage_cleanup(uuid) to service_role;

-- Do not report an existing-but-quarantined upload as reusable during retry.
create or replace function public.reserve_vehicle_upload(object_path text, byte_size bigint, mime_type text, object_bucket text default 'vehicle-media')
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); limits velox_private.upload_limits; prior velox_private.upload_reservations;
 stored_count bigint; stored_bytes bigint; pending_count bigint; pending_bytes bigint; attempts integer;
begin
 if actor is null or not velox_private.is_active_user() or not exists(select 1 from public.profiles where id=actor and ((object_bucket='vehicle-media' and role in ('particular','reseller','agency')) or (object_bucket='inspection-media' and role='mechanic'))) then raise exception 'Upload denied' using errcode='42501'; end if;
 if object_path is null or length(object_path)>300 or split_part(object_path,'/',1)<>actor::text
 or object_path like '%..%' or byte_size is null or byte_size<1 or byte_size>26214400
 or mime_type is null or mime_type<>all(array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime']) then
 raise exception 'Invalid upload' using errcode='23514'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,61501));
 if exists(select 1 from velox_private.storage_cleanup_claims where bucket_id=object_bucket and path=object_path) then
  raise exception 'Cleanup path cannot be reused' using errcode='23514'; end if;
 select * into limits from velox_private.upload_limits where singleton;
 if not found then raise exception 'Upload limits unavailable' using errcode='23514'; end if;
 select * into prior from velox_private.upload_reservations where owner_id=actor and bucket_id=object_bucket and path=object_path;
 if found then
   if prior.bytes<>byte_size or prior.mime<>mime_type then raise exception 'Upload retry changed' using errcode='23514'; end if;
   if prior.state='consumed' and exists(select 1 from storage.objects where bucket_id=object_bucket and name=object_path) then return jsonb_build_object('state','consumed'); end if;
   if prior.state='pending' and prior.expires_at>clock_timestamp() then return jsonb_build_object('state','reserved'); end if;
 end if;
 select count(*),coalesce(sum(case when metadata->>'size' ~ '^[0-9]{1,10}$' then case when (metadata->>'size')::bigint>0 then (metadata->>'size')::bigint else 26214400 end else 26214400 end),0)
 into stored_count,stored_bytes from storage.objects where bucket_id in ('vehicle-media','inspection-media') and split_part(name,'/',1)=actor::text;
 if exists(select 1 from storage.objects where bucket_id=object_bucket and name=object_path) then raise exception 'Existing unreserved upload' using errcode='23514'; end if;
 select count(*),coalesce(sum(bytes),0) into pending_count,pending_bytes from velox_private.upload_reservations
 where owner_id=actor and state='pending' and expires_at>clock_timestamp();
 if stored_count+pending_count+1>limits.max_objects or stored_bytes+pending_bytes+byte_size>limits.max_bytes then
 raise exception 'Upload quota exceeded' using errcode='23514'; end if;
 insert into velox_private.upload_windows values(actor,clock_timestamp(),1)
 on conflict(owner_id) do update set
 attempts=case when upload_windows.started_at<=clock_timestamp()-interval '1 hour' then 1 else upload_windows.attempts+1 end,
 started_at=case when upload_windows.started_at<=clock_timestamp()-interval '1 hour' then clock_timestamp() else upload_windows.started_at end
 returning upload_windows.attempts into attempts;
 if attempts>limits.hourly_attempts then raise exception 'Upload frequency exceeded' using errcode='23514'; end if;
 insert into velox_private.upload_reservations values(actor,object_bucket,object_path,byte_size,mime_type,'pending',clock_timestamp()+limits.ttl_seconds*interval '1 second')
 on conflict(owner_id,bucket_id,path) do update set state='pending',expires_at=excluded.expires_at;
 return jsonb_build_object('state','reserved');
end $$;

commit;
