-- New candidate only. No production SQL or storage-object deletion is performed.
begin;
create table velox_private.upload_limits (
 singleton boolean primary key default true check(singleton),
 max_objects integer not null default 100 check(max_objects between 4 and 10000),
 max_bytes bigint not null default 262144000 check(max_bytes between 1048576 and 10737418240),
 hourly_attempts integer not null default 60 check(hourly_attempts between 4 and 10000),
 ttl_seconds integer not null default 3600 check(ttl_seconds between 60 and 86400)
);
insert into velox_private.upload_limits(singleton) values(true);
create table velox_private.upload_reservations (
 owner_id uuid not null references public.profiles(id), bucket_id text not null, path text not null,
 bytes bigint not null check(bytes between 1 and 26214400), mime text not null,
 state text not null check(state in ('pending','consumed','released')),
 expires_at timestamptz not null, primary key(owner_id,bucket_id,path)
);
create table velox_private.upload_windows (
 owner_id uuid primary key references public.profiles(id),
 started_at timestamptz not null, attempts integer not null
);
alter table velox_private.upload_limits enable row level security;
alter table velox_private.upload_reservations enable row level security;
alter table velox_private.upload_windows enable row level security;
revoke all on velox_private.upload_limits,velox_private.upload_reservations,velox_private.upload_windows from public,anon,authenticated;

create function public.reserve_vehicle_upload(object_path text, byte_size bigint, mime_type text, object_bucket text default 'vehicle-media')
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

-- Storage INSERT and release serialize on the same owner lock. Admission is
-- consumed in the object INSERT transaction; failure rolls back both changes.
create function velox_private.consume_vehicle_upload()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); reservation velox_private.upload_reservations;
begin
 if new.bucket_id not in ('vehicle-media','inspection-media') then return new; end if;
 -- Trusted maintenance/restore is outside browser admission. Anonymous writes
 -- remain denied by Storage RLS. Never grant clients service-role credentials.
 if actor is null then return new; end if;
 if not velox_private.is_active_user() then raise exception 'Upload denied' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,61501));
 select * into reservation from velox_private.upload_reservations where owner_id=actor and bucket_id=new.bucket_id and path=new.name;
 if not found or reservation.state<>'pending' or reservation.expires_at<=clock_timestamp()
 or new.metadata->>'size' is distinct from reservation.bytes::text
 or new.metadata->>'mimetype' is distinct from reservation.mime then
 raise exception 'Upload reservation missing or invalid' using errcode='23514'; end if;
 update velox_private.upload_reservations set state='consumed' where owner_id=actor and bucket_id=new.bucket_id and path=new.name;
 return new;
end $$;
revoke all on function velox_private.consume_vehicle_upload() from public,anon,authenticated;
create trigger consume_vehicle_upload before insert on storage.objects for each row execute function velox_private.consume_vehicle_upload();

create function public.finish_vehicle_upload(object_path text, release_pending boolean default false, object_bucket text default 'vehicle-media')
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); reservation velox_private.upload_reservations; stored boolean;
begin
 if actor is null then raise exception 'Upload denied' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,61501));
 select * into reservation from velox_private.upload_reservations where owner_id=actor and bucket_id=object_bucket and path=object_path;
 if not found then raise exception 'Unknown upload' using errcode='23514'; end if;
 select exists(select 1 from storage.objects where bucket_id=object_bucket and name=object_path) into stored;
 if stored then return jsonb_build_object('state','consumed'); end if;
 if release_pending then
 update velox_private.upload_reservations set state='released' where owner_id=actor and bucket_id=object_bucket and path=object_path;
 return jsonb_build_object('state','released'); end if;
 raise exception 'Upload not confirmed' using errcode='23514';
end $$;
revoke all on function public.reserve_vehicle_upload(text,bigint,text,text),public.finish_vehicle_upload(text,boolean,text) from public,anon;
grant execute on function public.reserve_vehicle_upload(text,bigint,text,text),public.finish_vehicle_upload(text,boolean,text) to authenticated;
commit;
