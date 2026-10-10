-- Explicit, private seller permission. This migration does not book visits,
-- send notifications, infer consent from legacy text or change credit balances.
begin;
create table velox_private.visit_authorizations (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references public.profiles(id),
 vehicle_id uuid not null references public.vehicles(id),
 request_id uuid not null,
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 duration_minutes integer not null,
 location text not null,
 timezone text not null,
 consent_version text not null default 'visit-window-v1' check(consent_version='visit-window-v1'),
 authorized_at timestamptz not null default clock_timestamp(),
 revoked_at timestamptz,
 unique(owner_id,request_id),
 check(isfinite(starts_at) and isfinite(ends_at) and ends_at>starts_at and ends_at<=starts_at+interval '24 hours'),
 check(duration_minutes between 1 and 1440 and duration_minutes*interval '1 minute'<=ends_at-starts_at),
 check(length(btrim(location)) between 1 and 300),
 check(revoked_at is null or (isfinite(revoked_at) and revoked_at>=authorized_at))
);
alter table velox_private.visit_authorizations enable row level security;
revoke all on velox_private.visit_authorizations from public,anon,authenticated;
create index visit_authorizations_vehicle on velox_private.visit_authorizations(vehicle_id,ends_at desc);

create function velox_private.guard_visit_authorization()
returns trigger language plpgsql set search_path='' as $$
begin
 if (to_jsonb(new)-'revoked_at') is distinct from (to_jsonb(old)-'revoked_at')
   or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at)
   or new.revoked_at is null then
  raise exception 'La autorización conserva sus datos originales; revocá y creá otra para cambiarlos' using errcode='42501';
 end if;
 return new;
end;$$;
revoke all on function velox_private.guard_visit_authorization() from public,anon,authenticated;
create trigger guard_visit_authorization before update on velox_private.visit_authorizations
for each row execute function velox_private.guard_visit_authorization();

create function public.get_visit_authorizations(target_vehicle uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller public.profiles%rowtype;
begin
 select * into caller from public.profiles where id=auth.uid() for share;
 if caller.id is null or caller.is_blocked or caller.role not in ('particular','reseller','agency') then
  raise exception 'No tenés permiso para gestionar estos horarios' using errcode='42501';
 end if;
 perform 1 from public.vehicles where id=target_vehicle and owner_id=caller.id for share;
 if not found then raise exception 'No tenés permiso para gestionar estos horarios' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(to_jsonb(a)-'owner_id' order by (a.revoked_at is null and a.ends_at>now()) desc,a.starts_at desc,a.id),'[]'::jsonb)
  from (select * from velox_private.visit_authorizations where vehicle_id=target_vehicle and owner_id=caller.id
    order by (revoked_at is null and ends_at>now()) desc,starts_at desc,id limit 100) a);
end;$$;

create function public.authorize_visit_window(target_vehicle uuid,window_start timestamptz,window_end timestamptz,
 visit_minutes integer,meeting_location text,display_timezone text,consent boolean,request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller public.profiles%rowtype;vehicle public.vehicles%rowtype;saved velox_private.visit_authorizations%rowtype;
begin
 select * into caller from public.profiles where id=auth.uid() for share;
 if caller.id is null or caller.is_blocked or caller.role not in ('particular','reseller','agency') then
  raise exception 'No tenés permiso para gestionar estos horarios' using errcode='42501';end if;
 select * into vehicle from public.vehicles where id=target_vehicle and owner_id=caller.id for update;
 if not found then raise exception 'No tenés permiso para gestionar estos horarios' using errcode='42501';end if;
 if consent is distinct from true or request_id is null then
  raise exception 'Revisá y autorizá expresamente este horario' using errcode='23514';end if;
 -- Lock owner/request as well as the vehicle: one request cannot race across cars.
 perform pg_catalog.pg_advisory_xact_lock(hashtextextended(caller.id::text||':'||request_id::text,49009005));
 select * into saved from velox_private.visit_authorizations a where a.owner_id=caller.id and a.request_id=authorize_visit_window.request_id;
 if found then
  if saved.vehicle_id is distinct from target_vehicle or saved.starts_at is distinct from window_start or saved.ends_at is distinct from window_end
   or saved.duration_minutes is distinct from visit_minutes or saved.location is distinct from btrim(meeting_location) or saved.timezone is distinct from display_timezone then
   raise exception 'Este intento ya se usó con otros datos; actualizá los horarios' using errcode='23514';end if;
  return to_jsonb(saved)-'owner_id';
 end if;
 if vehicle.status<>'active' then raise exception 'Activá la publicación antes de autorizar nuevos horarios' using errcode='42501';end if;
 if window_start is null or window_end is null or not isfinite(window_start) or not isfinite(window_end)
   or window_start<=clock_timestamp() or window_end<=window_start or window_end>window_start+interval '24 hours'
   or visit_minutes is null or visit_minutes not between 1 and 1440 or visit_minutes*interval '1 minute'>window_end-window_start
   or meeting_location is null or length(btrim(meeting_location)) not between 1 and 300
   or display_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=display_timezone) then
  raise exception 'Revisá fecha, franja de hasta 24 horas, duración, lugar y zona horaria' using errcode='23514';end if;
 if (select count(*) from velox_private.visit_authorizations where vehicle_id=target_vehicle and revoked_at is null and ends_at>now())>=20 then
  raise exception 'Podés mantener hasta 20 horarios vigentes por auto; revocá uno para agregar otro' using errcode='23514';end if;
 if exists(select 1 from velox_private.visit_authorizations where vehicle_id=target_vehicle and revoked_at is null and starts_at<window_end and ends_at>window_start) then
  raise exception 'Ya hay un horario autorizado que se superpone; actualizá o revocalo antes de agregar otro' using errcode='23514';end if;
 insert into velox_private.visit_authorizations(owner_id,vehicle_id,request_id,starts_at,ends_at,duration_minutes,location,timezone)
 values(caller.id,target_vehicle,request_id,window_start,window_end,visit_minutes,btrim(meeting_location),display_timezone) returning * into saved;
 return to_jsonb(saved)-'owner_id';
end;$$;

create function public.revoke_visit_authorization(target_authorization uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare caller public.profiles%rowtype;saved velox_private.visit_authorizations%rowtype;target_vehicle uuid;
begin
 select * into caller from public.profiles where id=auth.uid() for share;
 if caller.id is null or caller.is_blocked or caller.role not in ('particular','reseller','agency') then
  raise exception 'No tenés permiso para gestionar estos horarios' using errcode='42501';end if;
 select vehicle_id into target_vehicle from velox_private.visit_authorizations where id=target_authorization and owner_id=caller.id;
 perform 1 from public.vehicles where id=target_vehicle and owner_id=caller.id for update;
 if not found then raise exception 'No tenés permiso para gestionar estos horarios' using errcode='42501';end if;
 select * into saved from velox_private.visit_authorizations where id=target_authorization and owner_id=caller.id for update;
 if saved.revoked_at is null then
  update velox_private.visit_authorizations set revoked_at=clock_timestamp() where id=saved.id returning * into saved;
 end if;
 return to_jsonb(saved)-'owner_id';
end;$$;
revoke all on function public.get_visit_authorizations(uuid) from public,anon;
revoke all on function public.authorize_visit_window(uuid,timestamptz,timestamptz,integer,text,text,boolean,uuid) from public,anon;
revoke all on function public.revoke_visit_authorization(uuid) from public,anon;
grant execute on function public.get_visit_authorizations(uuid) to authenticated;
grant execute on function public.authorize_visit_window(uuid,timestamptz,timestamptz,integer,text,text,boolean,uuid) to authenticated;
grant execute on function public.revoke_visit_authorization(uuid) to authenticated;
commit;
