-- Appointment consent and exact-instant reservation integrity.
-- Apply only after staging review, with the matching RPC-aware frontend.
-- There is deliberately no assumed visit duration: only equal instants conflict.
begin;

alter table public.appointments
  add column if not exists buyer_id uuid references public.profiles(id) on delete cascade,
  add column if not exists seller_id uuid references public.profiles(id) on delete cascade,
  add column if not exists buyer_confirmed_at timestamptz,
  add column if not exists seller_confirmed_at timestamptz,
  add column if not exists legacy_unverified boolean not null default false;

-- Participants are a server-owned snapshot of the immutable conversation identity.
update public.appointments a set buyer_id = c.buyer_id, seller_id = c.seller_id
from public.conversations c
where c.id = a.conversation_id and (a.buyer_id is null or a.seller_id is null);

-- Preserve pre-pilot history, including its original status and timestamps.
-- The fixed cutoff predates this security release; it does not slide with time.
-- An immutable flag records missing evidence, never completion or cancellation.
update public.appointments a set legacy_unverified = true
where not legacy_unverified and scheduled_at < timestamptz '2026-10-03 00:00:00+00'
  and status in ('proposed','accepted','confirmed')
  and (buyer_confirmed_at is null or seller_confirmed_at is null
    or to_jsonb(a)->>'duration_minutes' is null);

-- More recent/future visits still require explicit review/reconfirmation.
do $$
begin
  if exists (
    select 1 from public.appointments a where not a.legacy_unverified and (
      (a.status = 'accepted' and not (
        (a.proposed_by = a.buyer_id and a.buyer_confirmed_at is null and a.seller_confirmed_at is not null)
        or (a.proposed_by = a.seller_id and a.seller_confirmed_at is null and a.buyer_confirmed_at is not null)
      )) or (a.status = 'confirmed' and (a.buyer_confirmed_at is null or a.seller_confirmed_at is null)))
  ) then
    raise exception 'Hay visitas aceptadas o confirmadas legacy sin consentimiento verificable. Revisar y reconfirmar antes de aplicar esta migracion';
  end if;
end;
$$;

alter table public.appointments alter column buyer_id set not null, alter column seller_id set not null;
alter table public.appointments drop constraint if exists appointments_identity_check;
alter table public.appointments add constraint appointments_identity_check
  check (buyer_id <> seller_id and proposed_by in (buyer_id, seller_id));
alter table public.appointments drop constraint if exists appointments_values_check;
alter table public.appointments add constraint appointments_values_check
  check (isfinite(scheduled_at) and nullif(btrim(location), '') is not null);
alter table public.appointments drop constraint if exists appointments_legacy_cutoff_check;
alter table public.appointments add constraint appointments_legacy_cutoff_check
  check (not legacy_unverified or scheduled_at < timestamptz '2026-10-03 00:00:00+00');
alter table public.appointments drop constraint if exists appointments_consent_check;
alter table public.appointments add constraint appointments_consent_check check (
  legacy_unverified
  or (status = 'proposed' and buyer_confirmed_at is null and seller_confirmed_at is null)
  or (status = 'accepted' and (
    (proposed_by = buyer_id and buyer_confirmed_at is null and seller_confirmed_at is not null)
    or (proposed_by = seller_id and seller_confirmed_at is null and buyer_confirmed_at is not null)
  ))
  or (status = 'confirmed' and buyer_confirmed_at is not null and seller_confirmed_at is not null)
  or status in ('rejected', 'cancelled')
);

-- UNIQUE constraints arbitrate concurrent transactions even if both callers saw
-- an empty slot. A SELECT-then-UPDATE availability check alone is insufficient.
-- Existing conflicts intentionally stop the migration instead of deleting rows.
drop index if exists public.appointments_reserved_buyer_instant;
create unique index appointments_reserved_buyer_instant
  on public.appointments (buyer_id, scheduled_at) where status in ('accepted', 'confirmed') and not legacy_unverified;
drop index if exists public.appointments_reserved_seller_instant;
create unique index appointments_reserved_seller_instant
  on public.appointments (seller_id, scheduled_at) where status in ('accepted', 'confirmed') and not legacy_unverified;

-- One reservation per person, regardless of their role in each conversation.
-- The two role-specific indexes above are additional guards; this UNIQUE key is
-- the cross-role/concurrent arbiter. No client can read or mutate this table.
create table if not exists velox_private.appointment_reservations (
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  scheduled_at timestamptz not null,
  primary key (appointment_id, user_id),
  unique (user_id, scheduled_at)
);
revoke all on velox_private.appointment_reservations from public, anon, authenticated;

-- Reapply safely without inventing consent. Conflicting existing reservations,
-- including cross-role conflicts, stop the transactional migration for review.
insert into velox_private.appointment_reservations (appointment_id, user_id, scheduled_at)
select a.id, attendee.user_id, a.scheduled_at
from public.appointments a
cross join lateral (values (a.buyer_id), (a.seller_id)) attendee(user_id)
where a.status in ('accepted', 'confirmed') and not a.legacy_unverified
order by attendee.user_id, a.scheduled_at, a.id
on conflict (appointment_id, user_id) do nothing;

create or replace function velox_private.guard_appointment_integrity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  conversation public.conversations%rowtype;
  participant public.profiles%rowtype;
  participant_count integer := 0;
  caller uuid := auth.uid();
  cancellation boolean := false;
begin
  if new.legacy_unverified or (tg_op = 'UPDATE' and old.legacy_unverified) then
    raise exception 'Este registro histórico conserva un acuerdo no verificado y es sólo de consulta' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    cancellation := new.status = 'cancelled' and old.status in ('proposed', 'accepted', 'confirmed');
  end if;
  -- Share locks serialize against conversation/profile blocking. Read the locked
  -- values themselves rather than an earlier availability/authorization snapshot.
  select * into conversation from public.conversations where id = new.conversation_id for share;
  if caller is null or conversation.id is null or (conversation.is_blocked and not cancellation)
    or caller not in (conversation.buyer_id, conversation.seller_id) then
    raise exception 'La cuenta o conversacion no permite coordinar visitas' using errcode = '42501';
  end if;
  for participant in select * from public.profiles
    where id in (conversation.buyer_id, conversation.seller_id) order by id for share loop
    participant_count := participant_count + 1;
    -- An active participant must retain a safe exit when the conversation or
    -- counterpart is blocked. The blocked caller never receives this exception.
    if participant.is_blocked and (participant.id = caller or not cancellation) then
      raise exception 'La cuenta o conversacion no permite coordinar visitas' using errcode = '42501';
    end if;
  end loop;
  if participant_count <> 2 then raise exception 'Participantes de visita invalidos' using errcode = '42501'; end if;

  if tg_op = 'INSERT' then
    if new.proposed_by is distinct from caller or new.status <> 'proposed'
      or new.buyer_confirmed_at is not null or new.seller_confirmed_at is not null then
      raise exception 'La visita debe comenzar como propuesta del usuario actual' using errcode = '42501';
    end if;
    new.buyer_id := conversation.buyer_id;
    new.seller_id := conversation.seller_id;
    new.location := btrim(new.location);
    if not isfinite(new.scheduled_at) or new.scheduled_at <= clock_timestamp() then
      raise exception 'Elegí una fecha y hora futura válida';
    end if;
    new.created_at := clock_timestamp();
  else
    if new.id is distinct from old.id or new.conversation_id is distinct from old.conversation_id
      or new.proposed_by is distinct from old.proposed_by
      or new.buyer_id is distinct from old.buyer_id or new.seller_id is distinct from old.seller_id
      or new.scheduled_at is distinct from old.scheduled_at or new.location is distinct from old.location
      or new.created_at is distinct from old.created_at
      or new.buyer_confirmed_at is distinct from old.buyer_confirmed_at
      or new.seller_confirmed_at is distinct from old.seller_confirmed_at then
      raise exception 'La identidad, el horario, el lugar y los consentimientos de la visita no pueden editarse' using errcode = '42501';
    end if;
    if new.buyer_id <> conversation.buyer_id or new.seller_id <> conversation.seller_id then
      raise exception 'La identidad de la conversacion cambio; revisar la visita' using errcode = '42501';
    end if;
    if new.status in ('accepted', 'confirmed') and new.scheduled_at <= clock_timestamp() then
      raise exception 'El horario ya pasó. Cancelá la visita y proponé uno nuevo';
    end if;
    if old.status = 'proposed' and new.status in ('accepted', 'rejected') and caller <> old.proposed_by then
      if new.status = 'accepted' then
        if caller = new.buyer_id then new.buyer_confirmed_at := clock_timestamp();
        else new.seller_confirmed_at := clock_timestamp(); end if;
      end if;
    elsif old.status = 'accepted' and new.status = 'confirmed' and caller = old.proposed_by then
      if caller = new.buyer_id then new.buyer_confirmed_at := clock_timestamp();
      else new.seller_confirmed_at := clock_timestamp(); end if;
    elsif old.status in ('proposed', 'accepted', 'confirmed') and new.status = 'cancelled' then
      -- Keep consent timestamps as audit history after cancellation.
      null;
    else
      raise exception 'Ese cambio de estado no está permitido para esta visita';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'proposed' and new.status = 'accepted' then
      -- Insert both people in deterministic order. A conflicting person/instant
      -- aborts the entire transition, including any first reservation row and
      -- the consent timestamp. UNIQUE remains safe across SQL snapshots.
      insert into velox_private.appointment_reservations (appointment_id, user_id, scheduled_at)
      select new.id, attendee.user_id, new.scheduled_at
      from (values (new.buyer_id), (new.seller_id)) attendee(user_id)
      order by attendee.user_id;
    elsif new.status = 'cancelled' then
      delete from velox_private.appointment_reservations where appointment_id = new.id;
    end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function velox_private.guard_appointment_integrity() from public, anon, authenticated;
drop trigger if exists guard_appointment_integrity on public.appointments;
create trigger guard_appointment_integrity before insert or update on public.appointments
for each row execute function velox_private.guard_appointment_integrity();

-- Remove table-level AND legacy column-level writes; revoking a table privilege
-- alone does not remove privileges previously granted on individual columns.
revoke all on public.appointments from anon, authenticated;
revoke update (status, location, scheduled_at, updated_at) on public.appointments from authenticated;
grant select on public.appointments to authenticated;
grant insert (conversation_id, proposed_by, scheduled_at, location) on public.appointments to authenticated;

drop policy if exists "appointments_members_read" on public.appointments;
create policy "appointments_members_read" on public.appointments for select to authenticated
using (velox_private.is_active_user() and auth.uid() in (buyer_id, seller_id));
drop policy if exists "appointments_members_insert" on public.appointments;
create policy "appointments_members_insert" on public.appointments for insert to authenticated
with check (proposed_by = auth.uid() and velox_private.can_send_message(conversation_id));
drop policy if exists "appointments_members_update" on public.appointments;

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
exception when unique_violation then
  raise exception 'Ese horario ya está reservado para el comprador o el vendedor.';
end;
$$;
revoke all on function public.transition_appointment(uuid, text, text) from public, anon;
grant execute on function public.transition_appointment(uuid, text, text) to authenticated;

commit;
