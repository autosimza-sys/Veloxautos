-- VELOX security hardening
-- Apply after the original schema.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'::public.user_role
      and is_blocked = false
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- No production admin exists yet. Remove any role obtained through the old
-- self-service selector. Future admins must be promoted manually by a trusted
-- server-side migration.
update public.profiles
set role = 'registered'::public.user_role
where role = 'admin'::public.user_role;

drop policy if exists "profiles_read_all" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_read_own_or_admin"
on public.profiles
for select
using (id = auth.uid() or public.is_admin());

create policy "profiles_insert_own_non_privileged"
on public.profiles
for insert
with check (
  id = auth.uid()
  and role in (
    'registered'::public.user_role,
    'particular'::public.user_role,
    'reseller'::public.user_role,
    'agency'::public.user_role
  )
);

create policy "profiles_update_own_or_admin"
on public.profiles
for update
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

revoke update on public.profiles from authenticated;
grant update (display_name, phone, business_name, avatar_url) on public.profiles to authenticated;

drop policy if exists "vehicles_read_public" on public.vehicles;
drop policy if exists "vehicles_insert_own" on public.vehicles;
drop policy if exists "vehicles_update_own" on public.vehicles;

create policy "vehicles_read_owner_or_admin"
on public.vehicles
for select
using (owner_id = auth.uid() or public.is_admin());

create policy "vehicles_insert_owner"
on public.vehicles
for insert
with check (
  owner_id = auth.uid()
  and exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_blocked = false
      and role in (
        'particular'::public.user_role,
        'reseller'::public.user_role,
        'agency'::public.user_role
      )
  )
);

create policy "vehicles_update_owner_or_admin"
on public.vehicles
for update
using (owner_id = auth.uid() or public.is_admin())
with check (owner_id = auth.uid() or public.is_admin());

create policy "vehicles_delete_owner_or_admin"
on public.vehicles
for delete
using (owner_id = auth.uid() or public.is_admin());

drop policy if exists "media_read_public" on public.vehicle_media;
drop policy if exists "media_owner_insert" on public.vehicle_media;

create policy "media_read_active_owner_or_admin"
on public.vehicle_media
for select
using (
  exists (
    select 1
    from public.vehicles
    where vehicles.id = vehicle_media.vehicle_id
      and (
        vehicles.status = 'active'::public.publication_status
        or vehicles.owner_id = auth.uid()
        or public.is_admin()
      )
  )
);

create policy "media_insert_owner"
on public.vehicle_media
for insert
with check (
  exists (
    select 1
    from public.vehicles
    where vehicles.id = vehicle_media.vehicle_id
      and vehicles.owner_id = auth.uid()
  )
);

create policy "media_delete_owner_or_admin"
on public.vehicle_media
for delete
using (
  exists (
    select 1
    from public.vehicles
    where vehicles.id = vehicle_media.vehicle_id
      and (vehicles.owner_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "orders_own_read" on public.orders;
drop policy if exists "orders_own_insert" on public.orders;

create policy "orders_read_owner_or_admin"
on public.orders
for select
using (user_id = auth.uid() or public.is_admin());

create policy "orders_insert_owner"
on public.orders
for insert
with check (user_id = auth.uid());

create policy "orders_admin_update"
on public.orders
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "conversations_buyer_insert" on public.conversations;

create policy "conversations_buyer_insert"
on public.conversations
for insert
with check (
  buyer_id = auth.uid()
  and buyer_id <> seller_id
  and exists (
    select 1
    from public.vehicles
    where vehicles.id = conversations.vehicle_id
      and vehicles.owner_id = conversations.seller_id
      and vehicles.status = 'active'::public.publication_status
  )
);

create policy "conversations_members_update"
on public.conversations
for update
using (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin())
with check (buyer_id = auth.uid() or seller_id = auth.uid() or public.is_admin());

create policy "reports_admin_read"
on public.reports
for select
using (reporter_id = auth.uid() or public.is_admin());

create policy "reports_admin_update"
on public.reports
for update
using (public.is_admin())
with check (public.is_admin());

create or replace function public.get_vehicle_catalog()
returns table (
  id uuid,
  owner_id uuid,
  brand text,
  model text,
  version text,
  year integer,
  kilometers integer,
  price integer,
  zone text,
  description text,
  checklist jsonb,
  score numeric,
  accepts_trade boolean,
  accepts_financing boolean,
  view_location text,
  available_hours text,
  seller_name text,
  seller_type public.user_role,
  media jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.id,
    v.owner_id,
    v.brand,
    v.model,
    v.version,
    v.year,
    case when auth.uid() is null then null else v.kilometers end,
    case when auth.uid() is null then null else v.price end,
    v.zone,
    v.description,
    v.checklist,
    v.score,
    v.accepts_trade,
    v.accepts_financing,
    v.view_location,
    v.available_hours,
    coalesce(nullif(p.business_name, ''), p.display_name),
    p.role,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'storage_path', vm.storage_path,
            'media_type', vm.media_type,
            'sort_order', vm.sort_order
          )
          order by vm.sort_order
        )
        from public.vehicle_media vm
        where vm.vehicle_id = v.id
      ),
      '[]'::jsonb
    ),
    v.created_at
  from public.vehicles v
  join public.profiles p on p.id = v.owner_id
  where v.status = 'active'::public.publication_status
    and p.is_blocked = false
  order by v.created_at desc;
$$;

revoke all on function public.get_vehicle_catalog() from public;
grant execute on function public.get_vehicle_catalog() to anon, authenticated;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role public.user_role;
begin
  requested_role := case new.raw_user_meta_data->>'role'
    when 'particular' then 'particular'::public.user_role
    when 'reseller' then 'reseller'::public.user_role
    when 'agency' then 'agency'::public.user_role
    else 'registered'::public.user_role
  end;

  insert into public.profiles (id, display_name, phone, role, business_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.email),
    new.raw_user_meta_data->>'phone',
    requested_role,
    new.raw_user_meta_data->>'business_name'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

insert into storage.buckets (id, name, public)
values ('vehicle-media', 'vehicle-media', false)
on conflict (id) do update set public = false;

update public.vehicle_media
set storage_path = split_part(storage_path, '/vehicle-media/', 2)
where storage_path like '%/storage/v1/object/public/vehicle-media/%';

drop policy if exists "vehicle_media_public_read" on storage.objects;
drop policy if exists "vehicle_media_auth_insert" on storage.objects;
drop policy if exists "vehicle_media_owner_update" on storage.objects;
drop policy if exists "vehicle_media_owner_delete" on storage.objects;
drop policy if exists "vehicle_storage_read_linked_media" on storage.objects;
drop policy if exists "vehicle_storage_insert_own_folder" on storage.objects;
drop policy if exists "vehicle_storage_update_own_folder" on storage.objects;
drop policy if exists "vehicle_storage_delete_own_folder" on storage.objects;

create policy "vehicle_storage_read_linked_media"
on storage.objects
for select
using (
  bucket_id = 'vehicle-media'
  and exists (
    select 1
    from public.vehicle_media vm
    join public.vehicles v on v.id = vm.vehicle_id
    where vm.storage_path = storage.objects.name
      and (
        v.status = 'active'::public.publication_status
        or v.owner_id = auth.uid()
        or public.is_admin()
      )
  )
);

create policy "vehicle_storage_insert_own_folder"
on storage.objects
for insert
with check (
  bucket_id = 'vehicle-media'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "vehicle_storage_update_own_folder"
on storage.objects
for update
using (
  bucket_id = 'vehicle-media'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'vehicle-media'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "vehicle_storage_delete_own_folder"
on storage.objects
for delete
using (
  bucket_id = 'vehicle-media'
  and (
    auth.uid()::text = (storage.foldername(name))[1]
    or public.is_admin()
  )
);
