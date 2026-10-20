-- CANDIDATE ONLY: convert with the Supabase CLI to a reviewed migration later.
-- No Storage row is deleted here. Physical removal is exclusively Storage API.
-- Never apply before backup/preflight and hosted compatibility checks.
begin;
create table velox_private.storage_cleanup_claims (
 object_id uuid primary key, bucket_id text not null, path text not null,
 owner_id uuid not null, claimed_at timestamptz not null default clock_timestamp(),
 state text not null default 'claimed' check(state in ('claimed','deleted')),
 unique(bucket_id,path)
);
alter table velox_private.storage_cleanup_claims enable row level security;
revoke all on velox_private.storage_cleanup_claims from public,anon,authenticated,service_role;

create function velox_private.storage_path_referenced(object_path text)
returns boolean language sql stable security definer set search_path='' as $$
 -- An avatar may be an encoded/signed URL. Hold all owner files rather than
 -- guessing URL decoding and deleting an ambiguously referenced original.
 select exists(select 1 from public.profiles p where p.id::text=split_part(object_path,'/',1) and nullif(btrim(p.avatar_url),'') is not null)
 or exists(select 1 from public.vehicle_media where storage_path=object_path)
 or exists(select 1 from public.inspection_media where storage_path=object_path)
 or exists(select 1 from public.publication_requests where position(to_jsonb(object_path)::text in request_media::text)>0)
 or exists(select 1 from public.publication_drafts where position(to_jsonb(object_path)::text in data::text)>0);
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
commit;
