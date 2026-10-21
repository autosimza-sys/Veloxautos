-- Compatible privacy-only repair for the current legacy catalog RPC.
-- Exact meeting location is never catalog data; blocked accounts get no price/km.
-- Keeps the original signature, ordering and unbounded legacy result count.
-- Does not install pagination, change campaign/credits, or authorize launch.
begin;
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
set search_path = ''
as $$
  select
    v.id,
    v.owner_id,
    v.brand,
    v.model,
    v.version,
    v.year,
    case when auth.uid() is not null and velox_private.is_active_user() then v.kilometers else null end,
    case when auth.uid() is not null and velox_private.is_active_user() then v.price else null end,
    v.zone,
    v.description,
    v.checklist,
    v.score,
    v.accepts_trade,
    v.accepts_financing,
    null::text,
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
commit;
