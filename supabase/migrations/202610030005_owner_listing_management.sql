-- Basic owner listing management. No physical deletion, credit mutation, media
-- mutation, new publication or public-table SELECT is added by this migration.
begin;

create or replace function velox_private.is_active_seller()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid()
      and not p.is_blocked and p.role in ('particular','reseller','agency')
  );
$$;
revoke all on function velox_private.is_active_seller() from public, anon;
grant execute on function velox_private.is_active_seller() to authenticated;

-- Narrow functions are the only browser write entry points. In particular,
-- neither an owner nor an administrator can bypass validation or DELETE a row.
revoke insert, update, delete on public.vehicles from public, anon, authenticated;
grant select on public.vehicles to authenticated;
drop policy if exists "vehicles_update_owner_or_admin" on public.vehicles;
drop policy if exists "vehicles_delete_owner_or_admin" on public.vehicles;
drop policy if exists "vehicles_read_owner_or_admin" on public.vehicles;
create policy "vehicles_read_owner_or_admin" on public.vehicles for select to authenticated
using (public.is_admin() or (
  owner_id = auth.uid() and velox_private.is_active_seller()
));

create or replace function public.update_vehicle_listing(target_vehicle uuid, payload jsonb)
returns public.vehicles language plpgsql security definer set search_path = '' as $$
declare
  caller public.profiles%rowtype;
  vehicle public.vehicles%rowtype;
  merged jsonb;
  field text;
  field_number numeric;
begin
  -- Lock the profile before the vehicle, consistent with the publication RPC.
  -- A simultaneous block/role change cannot race this authorization check.
  select * into caller from public.profiles where id = auth.uid() for share;
  if caller.id is null or caller.is_blocked or caller.role not in ('particular','reseller','agency') then
    raise exception 'Tu cuenta no tiene permiso para editar publicaciones' using errcode = '42501';
  end if;
  select * into vehicle from public.vehicles
    where id = target_vehicle and owner_id = caller.id for update;
  if not found then
    raise exception 'No tenes permiso para gestionar esta publicacion' using errcode = '42501';
  end if;
  if jsonb_typeof(payload) is distinct from 'object' or payload = '{}'::jsonb then
    raise exception 'Datos de edicion invalidos';
  end if;
  for field in select jsonb_object_keys(payload) loop
    if field <> all(array['brand','model','version','year','kilometers','price','zone',
      'partial_plate','description','accepts_trade','accepts_financing','view_location','available_hours']) then
      raise exception 'El campo % no se puede editar', field using errcode = '42501';
    end if;
  end loop;
  merged := to_jsonb(vehicle) || payload;
  foreach field in array array['brand','model','version','zone'] loop
    if jsonb_typeof(merged->field) is distinct from 'string' or nullif(trim(merged->>field), '') is null then
      raise exception 'Completa el campo %', field;
    end if;
  end loop;
  -- Keep the same integer bounds as publish_vehicle_with_credit (002).
  foreach field in array array['year','kilometers','price'] loop
    if coalesce(trim(merged->>field), '') !~ '^[0-9]+$' then
      raise exception 'El campo % debe ser un numero entero', field;
    end if;
    field_number := trim(merged->>field)::numeric;
    if field_number > 2147483647
      or (field = 'year' and (field_number < 1886 or field_number > extract(year from current_date) + 1))
      or (field = 'price' and field_number < 1) then
      raise exception 'El campo % esta fuera de rango', field;
    end if;
  end loop;
  foreach field in array array['accepts_trade','accepts_financing'] loop
    if jsonb_typeof(merged->field) is distinct from 'boolean' then
      raise exception 'El campo % debe ser verdadero o falso', field;
    end if;
  end loop;
  foreach field in array array['partial_plate','description','view_location','available_hours'] loop
    if jsonb_typeof(merged->field) not in ('string','null') then
      raise exception 'El campo % debe ser texto', field;
    end if;
  end loop;
  update public.vehicles set
    brand = trim(merged->>'brand'), model = trim(merged->>'model'), version = trim(merged->>'version'),
    year = (merged->>'year')::integer, kilometers = (merged->>'kilometers')::integer,
    price = (merged->>'price')::integer, zone = trim(merged->>'zone'),
    partial_plate = nullif(trim(merged->>'partial_plate'), ''),
    description = nullif(trim(merged->>'description'), ''),
    accepts_trade = (merged->>'accepts_trade')::boolean,
    accepts_financing = (merged->>'accepts_financing')::boolean,
    view_location = nullif(trim(merged->>'view_location'), ''),
    available_hours = nullif(trim(merged->>'available_hours'), ''), updated_at = now()
    where id = vehicle.id returning * into vehicle;
  return vehicle;
end;
$$;
revoke all on function public.update_vehicle_listing(uuid, jsonb) from public, anon;
grant execute on function public.update_vehicle_listing(uuid, jsonb) to authenticated;

-- This narrow state RPC also replaces admin UPDATE/DELETE. A withdrawal is the
-- existing 'deleted' state, keeps all related records and can be reactivated.
create or replace function public.set_vehicle_listing_status(target_vehicle uuid, next_status text)
returns public.vehicles language plpgsql security definer set search_path = '' as $$
declare
  caller public.profiles%rowtype;
  vehicle public.vehicles%rowtype;
begin
  select * into caller from public.profiles where id = auth.uid() for share;
  if caller.id is null or caller.is_blocked or caller.role not in ('particular','reseller','agency','admin') then
    raise exception 'Tu cuenta no tiene permiso para gestionar publicaciones' using errcode = '42501';
  end if;
  select * into vehicle from public.vehicles where id = target_vehicle
    and (owner_id = caller.id or caller.role = 'admin') for update;
  if not found then
    raise exception 'No tenes permiso para gestionar esta publicacion' using errcode = '42501';
  end if;
  if next_status is null or next_status not in ('active','paused','deleted') then
    raise exception 'Estado de publicacion no permitido';
  end if;
  -- Do not allow a draft to become a free publication, including via a detour
  -- through 'deleted' or 'paused'. New publication stays on the credit RPC.
  if vehicle.status = 'draft' then
    raise exception 'Los borradores se publican mediante el flujo de publicacion con credito';
  end if;
  update public.vehicles set status = next_status::public.publication_status, updated_at = now()
    where id = vehicle.id returning * into vehicle;
  return vehicle;
end;
$$;
revoke all on function public.set_vehicle_listing_status(uuid, text) from public, anon;
grant execute on function public.set_vehicle_listing_status(uuid, text) to authenticated;

commit;
