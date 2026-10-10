-- Forward-only repair. Apply after the nine 20260623 migrations.
-- Review and test in staging before production. This file does not grant admins
-- access to private chats, alter credit allocations, or erase historical data.
begin;

create schema if not exists velox_private;
revoke all on schema velox_private from public;
grant usage on schema velox_private to anon, authenticated;

-- Policy subqueries normally inherit the caller's RLS. Small, boolean-only
-- definer helpers avoid opening vehicles/profiles to public SELECT.
create or replace function velox_private.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and not p.is_blocked
  );
$$;

create or replace function velox_private.is_active_mechanic(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = target and p.role = 'mechanic' and not p.is_blocked
      and not exists (
        select 1 from public.mechanic_profiles m where m.user_id = p.id and not m.active
      )
  );
$$;

create or replace function velox_private.is_public_vehicle(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.vehicles v join public.profiles p on p.id = v.owner_id
    where v.id = target and v.status = 'active' and not p.is_blocked
  );
$$;

create or replace function velox_private.owns_vehicle(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select velox_private.is_active_user() and exists (
    select 1 from public.vehicles v where v.id = target and v.owner_id = auth.uid()
  );
$$;

create or replace function velox_private.can_read_vehicle_media(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select velox_private.is_public_vehicle(target)
    or velox_private.owns_vehicle(target) or public.is_admin();
$$;

create or replace function velox_private.can_read_vehicle_object(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.vehicle_media m join public.vehicles v on v.id = m.vehicle_id
    where m.storage_path = object_name
      and split_part(object_name, '/', 1) = v.owner_id::text
      and velox_private.can_read_vehicle_media(v.id)
  );
$$;

create or replace function velox_private.can_attach_vehicle_media(target uuid, object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select velox_private.owns_vehicle(target)
    and split_part(object_name, '/', 1) = auth.uid()::text
    and exists (
      select 1 from storage.objects o where o.bucket_id = 'vehicle-media' and o.name = object_name
    );
$$;

create or replace function velox_private.can_start_conversation(target uuid, seller uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select velox_private.is_active_user() and auth.uid() <> seller
    and velox_private.is_public_vehicle(target) and exists (
      select 1 from public.vehicles v where v.id = target and v.owner_id = seller
    );
$$;

create or replace function velox_private.can_send_message(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select velox_private.is_active_user() and exists (
    select 1 from public.conversations c
    join public.profiles buyer on buyer.id = c.buyer_id
    join public.profiles seller on seller.id = c.seller_id
    where c.id = target and not c.is_blocked
      and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
      and not buyer.is_blocked and not seller.is_blocked
  );
$$;

drop policy if exists "media_read_active_owner_or_admin" on public.vehicle_media;
create policy "media_read_active_owner_or_admin" on public.vehicle_media
for select to anon, authenticated
using (velox_private.can_read_vehicle_media(vehicle_id));

drop policy if exists "media_insert_owner" on public.vehicle_media;
create policy "media_insert_owner" on public.vehicle_media for insert to authenticated
with check (velox_private.can_attach_vehicle_media(vehicle_id, storage_path));

drop policy if exists "vehicle_storage_read_linked_media" on storage.objects;
create policy "vehicle_storage_read_linked_media" on storage.objects
for select to anon, authenticated
using (bucket_id = 'vehicle-media' and (
  velox_private.can_read_vehicle_object(name)
  -- The uploader also needs access to unlinked files for failed-upload cleanup.
  or (velox_private.is_active_user() and (storage.foldername(name))[1] = auth.uid()::text)
));

-- Upload is still possible before the publication transaction, but only for an
-- unblocked seller's own folder. No new public bucket or anonymous write access.
drop policy if exists "vehicle_storage_insert_own_folder" on storage.objects;
create policy "vehicle_storage_insert_own_folder" on storage.objects for insert to authenticated
with check (
  bucket_id = 'vehicle-media' and (storage.foldername(name))[1] = auth.uid()::text
  and velox_private.is_active_user()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('particular','reseller','agency'))
);

drop policy if exists "conversations_buyer_insert" on public.conversations;
create policy "conversations_buyer_insert" on public.conversations for insert to authenticated
with check (buyer_id = auth.uid() and velox_private.can_start_conversation(vehicle_id, seller_id));

drop policy if exists "conversations_members_update" on public.conversations;
create policy "conversations_members_update" on public.conversations for update to authenticated
using (velox_private.is_active_user() and (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin()))
with check (velox_private.is_active_user() and (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin()));

create or replace function velox_private.guard_conversation_moderation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Current clients only block/report; they have no approved unblock workflow.
  -- A participant must not erase the other participant's safety decision.
  if auth.uid() is not null and not public.is_admin() then
    if (old.is_blocked and not new.is_blocked) or (old.is_reported and not new.is_reported) then
      raise exception 'Solo un administrador puede levantar un bloqueo o resolver una denuncia' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_conversation_moderation on public.conversations;
create trigger guard_conversation_moderation before update on public.conversations
for each row execute function velox_private.guard_conversation_moderation();

drop policy if exists "messages_members_insert" on public.messages;
create policy "messages_members_insert" on public.messages for insert to authenticated
with check (sender_id = auth.uid() and not is_automated and velox_private.can_send_message(conversation_id));

-- Automated attribution belongs exclusively to the definer RPC.
revoke insert on public.messages from authenticated;
grant insert (conversation_id, sender_id, body) on public.messages to authenticated;

-- Inspection identities are immutable through the browser. Requested rows must
-- start unassigned; only an administrator can subsequently choose a mechanic.
revoke insert, update on public.inspection_requests from authenticated;
grant insert (vehicle_id, requested_by) on public.inspection_requests to authenticated;
grant update (assigned_mechanic, status, scheduled_at, completed_at) on public.inspection_requests to authenticated;

drop policy if exists "inspection_requests_create" on public.inspection_requests;
create policy "inspection_requests_create" on public.inspection_requests for insert to authenticated
with check (
  requested_by = auth.uid() and velox_private.is_active_user()
  and velox_private.is_public_vehicle(vehicle_id)
  and assigned_mechanic is null and status = 'requested'
  and scheduled_at is null and completed_at is null
);

create or replace function public.can_access_inspection(target_request uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select velox_private.is_active_user() and exists (
    select 1 from public.inspection_requests r where r.id = target_request
      and (r.requested_by = auth.uid() or public.is_admin()
        or (r.assigned_mechanic = auth.uid() and velox_private.is_active_mechanic(auth.uid())))
  );
$$;
revoke all on function public.can_access_inspection(uuid) from public, anon;
grant execute on function public.can_access_inspection(uuid) to authenticated;

-- Use the row itself here: a STABLE helper looking this row up by ID cannot see
-- a just-inserted row during INSERT ... RETURNING in the same SQL command.
drop policy if exists "inspection_requests_private_read" on public.inspection_requests;
create policy "inspection_requests_private_read" on public.inspection_requests for select to authenticated
using (velox_private.is_active_user() and (
  requested_by = auth.uid() or public.is_admin()
  or (assigned_mechanic = auth.uid() and velox_private.is_active_mechanic(auth.uid()))
));

drop policy if exists "inspection_requests_admin_or_mechanic_update" on public.inspection_requests;
create policy "inspection_requests_admin_or_mechanic_update" on public.inspection_requests for update to authenticated
using (public.is_admin() or (assigned_mechanic = auth.uid() and velox_private.is_active_mechanic(auth.uid())))
with check (public.is_admin() or (assigned_mechanic = auth.uid() and velox_private.is_active_mechanic(auth.uid())));

create or replace function velox_private.guard_inspection_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Apply browser-only rules; trusted maintenance with no JWT still has its
  -- existing SQL access. Identity columns also lack client UPDATE privileges.
  if auth.uid() is not null then
    if new.vehicle_id is distinct from old.vehicle_id or new.requested_by is distinct from old.requested_by then
      raise exception 'La identidad de la solicitud no puede cambiar' using errcode = '42501';
    end if;
    if new.assigned_mechanic is distinct from old.assigned_mechanic then
      if not public.is_admin() then
        raise exception 'Solo un administrador puede asignar un mecanico' using errcode = '42501';
      end if;
      if new.assigned_mechanic is not null and not velox_private.is_active_mechanic(new.assigned_mechanic) then
        raise exception 'El mecanico debe tener un rol activo y habilitado' using errcode = '42501';
      end if;
    end if;
    if not public.is_admin() and new.status not in ('in_progress', 'completed', 'observed') then
      raise exception 'Estado de inspeccion no permitido para el mecanico' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_inspection_assignment on public.inspection_requests;
create trigger guard_inspection_assignment before update on public.inspection_requests
for each row execute function velox_private.guard_inspection_assignment();

create or replace function velox_private.can_write_inspection_report(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select velox_private.is_active_mechanic(auth.uid()) and exists (
    select 1 from public.inspection_requests r
    where r.id = target and r.assigned_mechanic = auth.uid()
      and r.status in ('assigned', 'in_progress', 'completed', 'observed')
  );
$$;

revoke update on public.inspection_reports from authenticated;
grant update (inspection_date, odometer, scores, observations, result, updated_at)
on public.inspection_reports to authenticated;

drop policy if exists "inspection_reports_assigned_insert" on public.inspection_reports;
create policy "inspection_reports_assigned_insert" on public.inspection_reports for insert to authenticated
with check (mechanic_id = auth.uid() and velox_private.can_write_inspection_report(request_id));

drop policy if exists "inspection_reports_mechanic_update" on public.inspection_reports;
create policy "inspection_reports_mechanic_update" on public.inspection_reports for update to authenticated
using (public.is_admin() or (mechanic_id = auth.uid() and velox_private.can_write_inspection_report(request_id)))
with check (public.is_admin() or (mechanic_id = auth.uid() and velox_private.can_write_inspection_report(request_id)));

create or replace function velox_private.can_upload_inspection_object(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select velox_private.is_active_mechanic(auth.uid())
    and split_part(object_name, '/', 1) = auth.uid()::text and exists (
      select 1 from public.inspection_reports report
      where report.mechanic_id = auth.uid()
        and report.request_id::text = split_part(object_name, '/', 2)
        and velox_private.can_write_inspection_report(report.request_id)
    );
$$;

create or replace function velox_private.can_attach_inspection_media(target uuid, object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select velox_private.can_upload_inspection_object(object_name) and exists (
    select 1 from public.inspection_reports report
    where report.id = target and report.mechanic_id = auth.uid()
      and report.request_id::text = split_part(object_name, '/', 2)
  ) and exists (
    select 1 from storage.objects o where o.bucket_id = 'inspection-media' and o.name = object_name
  );
$$;

drop policy if exists "inspection_media_mechanic_insert" on public.inspection_media;
create policy "inspection_media_mechanic_insert" on public.inspection_media for insert to authenticated
with check (velox_private.can_attach_inspection_media(report_id, storage_path));

drop policy if exists "inspection_storage_mechanic_insert" on storage.objects;
create policy "inspection_storage_mechanic_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'inspection-media' and velox_private.can_upload_inspection_object(name));

drop policy if exists "inspection_storage_private_read" on storage.objects;
create policy "inspection_storage_private_read" on storage.objects for select to authenticated
using (bucket_id = 'inspection-media' and (
  velox_private.can_upload_inspection_object(name)
  or exists (
    select 1 from public.inspection_media media
    join public.inspection_reports report on report.id = media.report_id
    where media.storage_path = name and public.can_access_inspection(report.request_id)
  )
));

create or replace function public.get_assigned_inspection_context()
returns table (
  request_id uuid, vehicle_id uuid, brand text, model text, version text, year integer,
  declared_kilometers integer, owner_name text, owner_phone text, request_status text, requested_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select r.id, v.id, v.brand, v.model, v.version, v.year, v.kilometers,
    owner.display_name, owner.phone, r.status, r.requested_at
  from public.inspection_requests r
  join public.vehicles v on v.id = r.vehicle_id
  join public.profiles owner on owner.id = v.owner_id
  where public.is_admin() or (
    r.assigned_mechanic = auth.uid() and velox_private.is_active_mechanic(auth.uid())
  )
  order by r.requested_at desc;
$$;
revoke all on function public.get_assigned_inspection_context() from public, anon;
grant execute on function public.get_assigned_inspection_context() to authenticated;

create or replace function public.send_message_with_assistant(target_conversation uuid, message_body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target public.conversations%rowtype;
  vehicle_record public.vehicles%rowtype;
  assistant_enabled boolean;
  normalized text;
  answer text;
  recognized boolean := true;
  sent_message public.messages%rowtype;
  automated_message public.messages%rowtype;
begin
  if nullif(trim(message_body), '') is null then raise exception 'Mensaje invalido'; end if;
  select * into target from public.conversations
  where id = target_conversation and (buyer_id = auth.uid() or seller_id = auth.uid())
  for update;
  if not velox_private.can_send_message(target_conversation) then
    raise exception 'La cuenta o conversacion no tiene permiso para enviar mensajes' using errcode = '42501';
  end if;
  insert into public.messages(conversation_id, sender_id, body)
  values (target.id, auth.uid(), trim(message_body)) returning * into sent_message;
  if auth.uid() <> target.buyer_id then
    return jsonb_build_object('message_id', sent_message.id, 'automated', false);
  end if;
  select * into vehicle_record from public.vehicles where id = target.vehicle_id;
  select coalesce(s.enabled, true) into assistant_enabled
  from (select 1) seed left join public.seller_assistant_settings s on s.user_id = target.seller_id;
  if not assistant_enabled then
    return jsonb_build_object('message_id', sent_message.id, 'automated', false);
  end if;
  normalized := lower(trim(message_body));
  if normalized like '%disponib%' then
    answer := case when vehicle_record.status = 'active'
      then 'La publicacion esta activa en Velox. El vendedor debe confirmar la disponibilidad actual.'
      else 'La publicacion no esta activa. Consulta al vendedor para confirmar su disponibilidad.' end;
  elsif normalized like '%permuta%' then
    answer := case when vehicle_record.accepts_trade
      then 'Si, el vendedor indico que acepta evaluar permutas.'
      else 'El vendedor indico que no acepta permutas por el momento.' end;
  elsif normalized like '%financ%' or normalized like '%cuota%' then
    answer := case when vehicle_record.accepts_financing
      then 'Si, la publicacion indica que puede conversar opciones de financiacion.'
      else 'La publicacion no ofrece financiacion actualmente.' end;
  elsif normalized like '%donde%' or normalized like '%ubic%' or normalized like '%zona%' then
    answer := 'El vehiculo esta en ' || vehicle_record.zone || '. ' ||
      coalesce('Se puede ver en ' || vehicle_record.view_location || '.', 'El punto exacto se coordina por este chat.');
  elsif normalized like '%horario%' or normalized like '%cuando%' or normalized like '%visita%' then
    answer := coalesce('Los horarios informados por el vendedor son: ' || vehicle_record.available_hours || '.',
      'El vendedor todavia no definio horarios. Podes proponer uno por este chat.');
  elsif normalized like '%kilometr%' or normalized like '% km%' then
    answer := 'La publicacion declara ' || trim(to_char(vehicle_record.kilometers, 'FM999G999G999')) || ' km.';
  elsif normalized like '%precio%' or normalized like '%vale%' then
    answer := 'El precio publicado es $' || trim(to_char(vehicle_record.price, 'FM999G999G999G999')) || '.';
  elsif normalized like '%estado%' or normalized like '%detalle%' or normalized like '%mecan%' then
    answer := coalesce(vehicle_record.description, 'El propietario completo una autorevision declarada en la publicacion.');
  else
    recognized := false;
  end if;
  if recognized then
    insert into public.messages(conversation_id, sender_id, body, is_automated)
    values (target.id, target.seller_id, answer, true) returning * into automated_message;
  end if;
  return jsonb_build_object('message_id', sent_message.id, 'automated', recognized,
    'automated_message_id', automated_message.id);
end;
$$;
revoke all on function public.send_message_with_assistant(uuid, text) from public, anon;
grant execute on function public.send_message_with_assistant(uuid, text) to authenticated;

-- Explicit grants support installations without legacy Supabase table defaults.
grant select on public.vehicle_media to anon, authenticated;
grant select, insert on public.conversations to authenticated;
grant select on public.messages to authenticated;
grant select on public.inspection_requests, public.inspection_reports, public.inspection_media to authenticated;
grant insert on public.inspection_reports, public.inspection_media to authenticated;

-- The helper schema must not be included in PostgREST's exposed schemas.
revoke all on all functions in schema velox_private from public;
grant execute on function velox_private.is_active_user(),
  velox_private.is_active_mechanic(uuid), velox_private.is_public_vehicle(uuid),
  velox_private.owns_vehicle(uuid), velox_private.can_read_vehicle_media(uuid),
  velox_private.can_read_vehicle_object(text), velox_private.can_attach_vehicle_media(uuid, text),
  velox_private.can_start_conversation(uuid, uuid), velox_private.can_send_message(uuid),
  velox_private.can_write_inspection_report(uuid), velox_private.can_upload_inspection_object(text),
  velox_private.can_attach_inspection_media(uuid, text)
to anon, authenticated;

commit;
