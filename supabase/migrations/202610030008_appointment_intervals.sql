-- Interval reservations and durable proposal idempotency.
-- Requires btree_gist; verify extension availability/permission in staging.
-- No visit duration or travel buffer is invented by this migration.
begin;

create extension if not exists btree_gist;
alter table public.appointments add column if not exists duration_minutes integer;
do $$
begin
  if exists (select 1 from public.appointments where not legacy_unverified and duration_minutes is null and status in ('proposed','accepted','confirmed')) then
    raise exception 'Hay visitas legacy vigentes sin duración explícita. Revisar cada visita y acordar su duración antes de aplicar esta migración; no se asignó ningún valor por defecto';
  end if;
end;
$$;
-- Closed historical visits may lack a recorded duration; do not invent one or
-- force a new agreement for cancelled/rejected history. New inserts always need
-- explicit minutes, and the CHECK never permits NULL on an active visit.
alter table public.appointments alter column duration_minutes drop not null;
alter table public.appointments drop constraint if exists appointments_duration_check;
alter table public.appointments add constraint appointments_duration_check check (
  legacy_unverified
  or (duration_minutes is not null and duration_minutes > 0)
  or (duration_minutes is null and status in ('rejected','cancelled'))
);

-- Preserve the original consent/block/cancellation trigger. This additional
-- trigger validates duration before it and never rewrites existing user choices.
create or replace function velox_private.guard_appointment_duration()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.legacy_unverified or (tg_op = 'UPDATE' and old.legacy_unverified) then
    raise exception 'Este registro histórico conserva un acuerdo no verificado y es sólo de consulta' using errcode = '42501';
  end if;
  if new.duration_minutes is null or new.duration_minutes <= 0 then
    raise exception 'Indicá una duración explícita en minutos enteros positivos';
  end if;
  if tg_op = 'UPDATE' and new.duration_minutes is distinct from old.duration_minutes then
    raise exception 'La duración de una visita no puede editarse. Cancelá y proponé otra visita' using errcode = '42501';
  end if;
  if new.scheduled_at is null or not isfinite(new.scheduled_at)
    or not isfinite(new.scheduled_at + make_interval(mins => new.duration_minutes)) then
    raise exception 'El intervalo de la visita no es válido';
  end if;
  return new;
end;
$$;
revoke all on function velox_private.guard_appointment_duration() from public, anon, authenticated;
drop trigger if exists guard_appointment_duration on public.appointments;
create trigger guard_appointment_duration before insert or update on public.appointments
for each row execute function velox_private.guard_appointment_duration();

alter table velox_private.appointment_reservations add column if not exists reserved_during tstzrange;
update velox_private.appointment_reservations r
set reserved_during = tstzrange(a.scheduled_at, a.scheduled_at + make_interval(mins => a.duration_minutes), '[)')
from public.appointments a where a.id = r.appointment_id and r.reserved_during is null;
alter table velox_private.appointment_reservations alter column reserved_during set not null;
alter table velox_private.appointment_reservations drop constraint if exists appointment_reservations_interval_check;
alter table velox_private.appointment_reservations add constraint appointment_reservations_interval_check check (
  not isempty(reserved_during) and lower_inc(reserved_during) and not upper_inc(reserved_during)
  and isfinite(lower(reserved_during)) and isfinite(upper(reserved_during))
  and lower(reserved_during) = scheduled_at
);
alter table velox_private.appointment_reservations drop constraint if exists appointment_reservations_no_overlap;
alter table velox_private.appointment_reservations add constraint appointment_reservations_no_overlap
  exclude using gist (user_id with =, reserved_during with &&);

-- The 004 consent trigger creates/deletes both reservation rows in its own
-- transaction. Derive each range from that appointment's immutable explicit
-- duration. GiST, rather than a SELECT availability check, arbitrates conflicts
-- across users, roles, conversations and transaction snapshots. Adjacent [a,b)
-- and [b,c) are allowed without an assumed buffer.
create or replace function velox_private.set_appointment_reservation_interval()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  appointment public.appointments%rowtype;
begin
  select * into appointment from public.appointments where id = new.appointment_id;
  if not found or new.user_id not in (appointment.buyer_id, appointment.seller_id)
    or new.scheduled_at is distinct from appointment.scheduled_at then
    raise exception 'Reserva de visita inválida' using errcode = '42501';
  end if;
  new.reserved_during := tstzrange(appointment.scheduled_at,
    appointment.scheduled_at + make_interval(mins => appointment.duration_minutes), '[)');
  return new;
end;
$$;
revoke all on function velox_private.set_appointment_reservation_interval() from public, anon, authenticated;
drop trigger if exists set_appointment_reservation_interval on velox_private.appointment_reservations;
create trigger set_appointment_reservation_interval before insert or update on velox_private.appointment_reservations
for each row execute function velox_private.set_appointment_reservation_interval();

create table if not exists velox_private.appointment_proposal_requests (
  proposed_by uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  conversation_id uuid not null,
  scheduled_at timestamptz not null,
  duration_minutes integer not null,
  location text not null,
  -- A trusted deletion retains a tombstone so an old retry cannot recreate it.
  appointment_id uuid references public.appointments(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (proposed_by, request_id)
);
revoke all on velox_private.appointment_proposal_requests from public, anon, authenticated;

-- Revoke the old browser INSERT columns. New clients use the idempotent RPC;
-- deployment must coordinate this migration with the updated frontend.
revoke insert on public.appointments from anon, authenticated;
revoke insert (conversation_id, proposed_by, scheduled_at, location, duration_minutes) on public.appointments from authenticated;

create or replace function public.propose_appointment(
  target_conversation uuid,
  appointment_scheduled_at timestamptz,
  appointment_duration_minutes integer,
  appointment_location text,
  proposal_request_id uuid
)
returns public.appointments language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  prior velox_private.appointment_proposal_requests%rowtype;
  appointment public.appointments%rowtype;
  conversation public.conversations%rowtype;
  participant public.profiles%rowtype;
  participant_count integer := 0;
  clean_location text := regexp_replace(appointment_location, '^[[:space:]]+|[[:space:]]+$', '', 'g');
begin
  if caller is null then
    raise exception 'La cuenta o conversacion no permite proponer visitas' using errcode = '42501';
  end if;
  if proposal_request_id is null then raise exception 'Falta el identificador del intento de propuesta'; end if;
  if appointment_scheduled_at is null or not isfinite(appointment_scheduled_at) then
    raise exception 'Elegí una fecha y hora válida';
  end if;
  if appointment_duration_minutes is null or appointment_duration_minutes <= 0 then
    raise exception 'Indicá una duración explícita en minutos enteros positivos';
  end if;
  if nullif(clean_location, '') is null then raise exception 'Indicá un lugar para la visita'; end if;

  -- Serialize retries of one author/request. Hash collisions only add contention;
  -- the exact composite primary key below remains the integrity backstop. No
  -- profile lock upgrade is needed, avoiding opposite-party proposal deadlocks.
  perform pg_advisory_xact_lock(hashtextextended(caller::text || ':' || proposal_request_id::text, 0));
  -- Lock and inspect current authorization after any retry wait. This also keeps
  -- a known replay from bypassing a concurrent block using an earlier snapshot.
  select * into conversation from public.conversations where id = target_conversation for share;
  if not found or conversation.is_blocked or caller not in (conversation.buyer_id, conversation.seller_id) then
    raise exception 'La cuenta o conversacion no permite proponer visitas' using errcode = '42501';
  end if;
  for participant in select * from public.profiles
    where id in (conversation.buyer_id, conversation.seller_id) order by id for share loop
    participant_count := participant_count + 1;
    if participant.is_blocked then
      raise exception 'La cuenta o conversacion no permite proponer visitas' using errcode = '42501';
    end if;
  end loop;
  if participant_count <> 2 then raise exception 'Participantes de visita inválidos' using errcode = '42501'; end if;
  select * into prior from velox_private.appointment_proposal_requests
  where proposed_by = caller and request_id = proposal_request_id;
  if found then
    if prior.conversation_id is distinct from target_conversation
      or prior.scheduled_at is distinct from appointment_scheduled_at
      or prior.duration_minutes is distinct from appointment_duration_minutes
      or prior.location is distinct from clean_location then
      raise exception 'Este intento de propuesta ya se usó con otros datos';
    end if;
    select * into appointment from public.appointments where id = prior.appointment_id and proposed_by = caller;
    if not found then raise exception 'La visita de este intento fue eliminada. No se creó otra visita'; end if;
    -- A known successful retry returns the current row, even after its time has
    -- passed or its lifecycle state changed. It does not re-propose or reserve.
    return appointment;
  end if;

  insert into public.appointments(conversation_id, proposed_by, scheduled_at, duration_minutes, location)
  values (target_conversation, caller, appointment_scheduled_at, appointment_duration_minutes, clean_location)
  returning * into appointment;
  insert into velox_private.appointment_proposal_requests
    (proposed_by,request_id,conversation_id,scheduled_at,duration_minutes,location,appointment_id)
  values (caller,proposal_request_id,target_conversation,appointment_scheduled_at,appointment_duration_minutes,clean_location,appointment.id);
  return appointment;
end;
$$;
revoke all on function public.propose_appointment(uuid,timestamptz,integer,text,uuid) from public, anon;
grant execute on function public.propose_appointment(uuid,timestamptz,integer,text,uuid) to authenticated;

create or replace function public.transition_appointment(target_appointment uuid, expected_status text, next_status text)
returns public.appointments language plpgsql security definer set search_path = '' as $$
declare
  appointment public.appointments%rowtype;
begin
  select * into appointment from public.appointments
  where id = target_appointment and auth.uid() in (buyer_id, seller_id) for update;
  if not found then raise exception 'La visita no está disponible para esta cuenta' using errcode = '42501'; end if;
  if appointment.status is distinct from expected_status then
    raise exception 'La visita cambió. Actualizá la agenda antes de continuar.';
  end if;
  if next_status is null or next_status not in ('accepted', 'rejected', 'confirmed', 'cancelled') then
    raise exception 'Estado de visita inválido';
  end if;
  update public.appointments set status = next_status where id = appointment.id returning * into appointment;
  return appointment;
exception when unique_violation or exclusion_violation then
  raise exception 'El intervalo de la visita se superpone con otra reserva de uno de los participantes.';
end;
$$;
revoke all on function public.transition_appointment(uuid,text,text) from public, anon;
grant execute on function public.transition_appointment(uuid,text,text) to authenticated;

commit;
