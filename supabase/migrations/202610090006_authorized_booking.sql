-- Buyer acceptance consumes explicit seller authority; all effects are atomic.
begin;
alter table public.appointments add column confirmation_source text not null default 'manual'
  check (confirmation_source in ('manual','seller_authorization'));

create table velox_private.authorized_visit_requests (
  buyer_id uuid not null references public.profiles(id), request_id uuid not null,
  conversation_id uuid not null, authorization_id uuid not null references velox_private.visit_authorizations(id),
  scheduled_at timestamptz not null, appointment_id uuid unique references public.appointments(id) on delete set null,
  accepted_at timestamptz not null default clock_timestamp(),
  consent_version text not null default 'buyer-visit-v1' check (consent_version='buyer-visit-v1'),
  primary key (buyer_id,request_id)
);
create table velox_private.visit_notices (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  kind text not null check (kind in ('confirmed','cancelled')),
  created_at timestamptz not null default clock_timestamp(), read_at timestamptz,
  unique (recipient_id,appointment_id,kind)
);
create index visit_notices_recipient on velox_private.visit_notices(recipient_id,created_at desc);
alter table velox_private.authorized_visit_requests enable row level security;
alter table velox_private.visit_notices enable row level security;
revoke all on velox_private.authorized_visit_requests,velox_private.visit_notices from public,anon,authenticated;

-- Called only from definer RPCs. Locks serialize against blocking, ownership,
-- pausing and authority revocation (the latter locks the vehicle FOR UPDATE).
create function velox_private.visit_buyer_context(target_conversation uuid)
returns public.conversations language plpgsql security definer set search_path='' as $$
declare c public.conversations%rowtype; p public.profiles%rowtype; v public.vehicles%rowtype; n integer:=0;
begin
 select * into c from public.conversations where id=target_conversation for share;
 if c.id is null or auth.uid() is distinct from c.buyer_id or c.is_blocked then
  raise exception 'La conversación no permite coordinar esta visita' using errcode='42501'; end if;
 for p in select * from public.profiles where id in(c.buyer_id,c.seller_id) order by id for share loop
  n:=n+1;
  if p.is_blocked or (p.id=c.seller_id and p.role not in ('particular','reseller','agency')) then
   raise exception 'La cuenta no permite coordinar esta visita' using errcode='42501'; end if;
 end loop;
 if n<>2 then raise exception 'Participantes inválidos' using errcode='42501'; end if;
 select * into v from public.vehicles where id=c.vehicle_id for share;
 if v.id is null or v.owner_id<>c.seller_id or v.status<>'active' then
  raise exception 'La publicación no permite nuevas visitas' using errcode='42501'; end if;
 return c;
end; $$;
revoke all on function velox_private.visit_buyer_context(uuid) from public,anon,authenticated;

create function velox_private.authorized_visit_slot(target_conversation uuid,target_authorization uuid,slot_start timestamptz)
returns velox_private.visit_authorizations language plpgsql security definer set search_path='' as $$
declare c public.conversations%rowtype; a velox_private.visit_authorizations%rowtype;
begin
 c:=velox_private.visit_buyer_context(target_conversation);
 select * into a from velox_private.visit_authorizations where id=target_authorization for share;
 if a.id is null or a.owner_id<>c.seller_id or a.vehicle_id<>c.vehicle_id or a.revoked_at is not null
  or slot_start is null or not isfinite(slot_start) or slot_start<=clock_timestamp()
  or slot_start<a.starts_at or slot_start+make_interval(mins=>a.duration_minutes)>a.ends_at
  or mod(extract(epoch from (slot_start-a.starts_at)),a.duration_minutes*60)<>0 then
  raise exception 'El horario autorizado ya no está disponible' using errcode='42501'; end if;
 return a;
end; $$;
revoke all on function velox_private.authorized_visit_slot(uuid,uuid,timestamptz) from public,anon,authenticated;

create function public.get_available_visit_slots(target_conversation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.conversations%rowtype; result jsonb;
begin
 c:=velox_private.visit_buyer_context(target_conversation);
 select coalesce(jsonb_agg(to_jsonb(s) order by s.scheduled_at),'[]'::jsonb) into result from (
  select a.id authorization_id,t.slot scheduled_at,a.duration_minutes,a.location,a.timezone
  from velox_private.visit_authorizations a
  cross join lateral generate_series(a.starts_at,a.ends_at-make_interval(mins=>a.duration_minutes),make_interval(mins=>a.duration_minutes)) t(slot)
  where a.vehicle_id=c.vehicle_id and a.owner_id=c.seller_id and a.revoked_at is null
   and a.ends_at>clock_timestamp() and t.slot>clock_timestamp()
   and not exists(select 1 from velox_private.appointment_reservations r
    where r.user_id in(c.buyer_id,c.seller_id)
     and r.reserved_during && tstzrange(t.slot,t.slot+make_interval(mins=>a.duration_minutes),'[)'))
  order by t.slot,a.id limit 60
 ) s;
 return result;
end; $$;
revoke all on function public.get_available_visit_slots(uuid) from public,anon;
grant execute on function public.get_available_visit_slots(uuid) to authenticated;

create function public.book_authorized_visit(target_conversation uuid,target_authorization uuid,
 slot_start timestamptz,buyer_consent boolean,booking_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.conversations%rowtype; a velox_private.visit_authorizations%rowtype;
 prior velox_private.authorized_visit_requests%rowtype; visit public.appointments%rowtype;
begin
 if auth.uid() is null or buyer_consent is distinct from true or booking_request_id is null then
  raise exception 'Confirmá tu aceptación de la visita' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||booking_request_id::text,49009006));
 -- A retry is a receipt lookup, not new authority. Never resurrect cancellation.
 select * into prior from velox_private.authorized_visit_requests where buyer_id=auth.uid() and request_id=booking_request_id;
 if found then
  if not velox_private.is_active_user() then raise exception 'Cuenta no disponible' using errcode='42501'; end if;
  if prior.conversation_id is distinct from target_conversation or prior.authorization_id is distinct from target_authorization
   or prior.scheduled_at is distinct from slot_start then raise exception 'Este intento ya se usó con otros datos'; end if;
  select * into visit from public.appointments where id=prior.appointment_id and buyer_id=auth.uid();
  if not found then raise exception 'La visita fue eliminada; no se creó otra'; end if;
  return to_jsonb(visit);
 end if;
 a:=velox_private.authorized_visit_slot(target_conversation,target_authorization,slot_start);
 select * into c from public.conversations where id=target_conversation;
 insert into public.appointments(conversation_id,proposed_by,scheduled_at,duration_minutes,location)
 values(c.id,auth.uid(),slot_start,a.duration_minutes,a.location) returning * into visit;
 insert into velox_private.authorized_visit_requests(buyer_id,request_id,conversation_id,authorization_id,scheduled_at,appointment_id)
 values(auth.uid(),booking_request_id,c.id,a.id,slot_start,visit.id);
 -- The trigger verifies the private evidence, supplies both consent timestamps
 -- and inserts both interval reservations. A conflict rolls back everything.
 update public.appointments set status='confirmed' where id=visit.id returning * into visit;
 return to_jsonb(visit);
exception when unique_violation or exclusion_violation then
 raise exception 'El horario ya está reservado. Actualizá los horarios disponibles.';
end; $$;
revoke all on function public.book_authorized_visit(uuid,uuid,timestamptz,boolean,uuid) from public,anon;
grant execute on function public.book_authorized_visit(uuid,uuid,timestamptz,boolean,uuid) to authenticated;

create or replace function velox_private.guard_appointment_integrity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  conversation public.conversations%rowtype;
  participant public.profiles%rowtype;
  participant_count integer := 0;
  caller uuid := auth.uid();
  cancellation boolean := false;
  authority velox_private.visit_authorizations%rowtype;
  booking velox_private.authorized_visit_requests%rowtype;
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
      or new.buyer_confirmed_at is not null or new.seller_confirmed_at is not null
      or new.confirmation_source <> 'manual' then
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
      or new.confirmation_source is distinct from old.confirmation_source
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
    if old.status = 'proposed' and new.status = 'confirmed' and caller = new.buyer_id then
      select * into booking from velox_private.authorized_visit_requests
      where appointment_id=new.id and buyer_id=caller and conversation_id=new.conversation_id
        and scheduled_at=new.scheduled_at;
      if not found then raise exception 'Falta autorización verificable del vendedor' using errcode='42501'; end if;
      authority:=velox_private.authorized_visit_slot(new.conversation_id,booking.authorization_id,new.scheduled_at);
      if new.duration_minutes<>authority.duration_minutes or new.location<>authority.location then
        raise exception 'La visita no coincide con la autorización' using errcode='42501'; end if;
      new.buyer_confirmed_at:=booking.accepted_at;
      new.seller_confirmed_at:=authority.authorized_at;
      new.confirmation_source:='seller_authorization';
    elsif old.status = 'proposed' and new.status in ('accepted', 'rejected') and caller <> old.proposed_by then
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
    if old.status = 'proposed' and new.status in ('accepted','confirmed') then
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


create function velox_private.notify_visit_change()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not new.legacy_unverified and old.status is distinct from new.status
  and (new.status='confirmed' or (new.status='cancelled' and old.status='confirmed')) then
  insert into velox_private.visit_notices(recipient_id,appointment_id,kind)
  values(new.buyer_id,new.id,new.status),(new.seller_id,new.id,new.status)
  on conflict(recipient_id,appointment_id,kind) do nothing;
 end if;
 return new;
end; $$;
revoke all on function velox_private.notify_visit_change() from public,anon,authenticated;
create trigger notify_visit_change after update on public.appointments for each row execute function velox_private.notify_visit_change();

create function public.get_visit_notices()
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not velox_private.is_active_user() then raise exception 'Ingresá para consultar los avisos' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc,n.id),'[]'::jsonb) into result from (
  select notice.*,a.conversation_id,a.status,a.scheduled_at,a.duration_minutes,a.location,
   concat_ws(' ',v.brand,v.model) vehicle_title,p.display_name buyer_name,
   coalesce(w.timezone,'UTC') timezone
  from velox_private.visit_notices notice join public.appointments a on a.id=notice.appointment_id
  join public.conversations c on c.id=a.conversation_id join public.vehicles v on v.id=c.vehicle_id
  join public.profiles p on p.id=a.buyer_id
  left join velox_private.authorized_visit_requests r on r.appointment_id=a.id
  left join velox_private.visit_authorizations w on w.id=r.authorization_id
  where notice.recipient_id=auth.uid() order by notice.created_at desc,notice.id limit 100
 ) n;
 return result;
end; $$;
create function public.read_visit_notice(target_notice uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare n velox_private.visit_notices%rowtype;
begin
 if not velox_private.is_active_user() then raise exception 'Ingresá para consultar los avisos' using errcode='42501'; end if;
 update velox_private.visit_notices set read_at=coalesce(read_at,clock_timestamp())
 where id=target_notice and recipient_id=auth.uid() returning * into n;
 if not found then raise exception 'Aviso no disponible' using errcode='42501'; end if;
 return to_jsonb(n);
end; $$;
revoke all on function public.get_visit_notices(),public.read_visit_notice(uuid) from public,anon;
grant execute on function public.get_visit_notices(),public.read_visit_notice(uuid) to authenticated;

-- Keep deterministic FAQ guidance aligned with the booking surface.
update velox_private.faq_catalog set answer='Usá Ver horarios autorizados para elegir un turno libre. Revisá fecha, duración y lugar y confirmá tu asistencia; el vendedor ya autorizó esos turnos. Si no hay horarios, podés enviar una propuesta desde Coordinar visita. Este mensaje no reserva una visita.' where id='c19.request_visit';
update velox_private.faq_catalog set answer='En Ver horarios autorizados podés consultar si hay turnos libres para hoy o mañana. La visita se confirma cuando elegís un horario y aceptás los datos. Si no hay turnos, enviá una propuesta desde Coordinar visita. Este mensaje no reserva una visita.' where id='c19.today_tomorrow';
commit;
