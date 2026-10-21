begin;
create index vehicles_catalog_cursor on public.vehicles(created_at desc,id desc) where status='active';
create function public.get_vehicle_catalog_page(page_size integer default 24, after_cursor jsonb default null, filters jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare cursor_time timestamptz; cursor_id uuid; can_view boolean:=auth.uid() is not null and velox_private.is_active_user();
 field text; value jsonb; result jsonb;
begin
 if page_size is null or page_size not between 1 and 24 or jsonb_typeof(filters) is distinct from 'object' or octet_length(filters::text)>1024 then raise exception 'Invalid catalog query' using errcode='23514'; end if;
 for field,value in select * from jsonb_each(filters) loop
  if field in ('search','brand') then
   if jsonb_typeof(value)<>'string' or length(value#>>'{}')>120 then raise exception 'Invalid catalog text' using errcode='23514'; end if;
  elsif field in ('year','minPrice','maxPrice','minKm','maxKm') then
   if jsonb_typeof(value)<>'number' or (value#>>'{}') !~ '^[0-9]{1,10}$' or (value#>>'{}')::bigint>2147483647 then raise exception 'Invalid catalog range' using errcode='23514'; end if;
   if field<>'year' and not can_view then raise exception 'Sign in to filter private fields' using errcode='42501'; end if;
  else raise exception 'Unknown catalog filter' using errcode='23514'; end if;
 end loop;
 if after_cursor is not null then
  if jsonb_typeof(after_cursor)<>'object' or octet_length(after_cursor::text)>256 or not(after_cursor ? 'created_at' and after_cursor ? 'id') or (select count(*) from jsonb_object_keys(after_cursor))<>2 then raise exception 'Invalid catalog cursor' using errcode='23514'; end if;
  cursor_time:=(after_cursor->>'created_at')::timestamptz; cursor_id:=(after_cursor->>'id')::uuid;
  if cursor_time is null or cursor_id is null or not isfinite(cursor_time) then raise exception 'Invalid catalog cursor' using errcode='23514'; end if;
 end if;
 with visible as not materialized (
  select v.* , coalesce(nullif(p.business_name,''),p.display_name) seller_name,p.role seller_type
  from public.vehicles v join public.profiles p on p.id=v.owner_id
  where v.status='active' and not p.is_blocked
 ), matched as not materialized (
  select v.* from visible v where
  (not(filters ? 'search') or position(lower(trim(filters->>'search')) in lower(concat_ws(' ',v.brand,v.model,v.version,v.zone,v.year)))>0)
  and (not(filters ? 'brand') or v.brand=filters->>'brand')
  and (not(filters ? 'year') or v.year=(filters->>'year')::integer)
  and (not(filters ? 'minPrice') or v.price>=(filters->>'minPrice')::integer)
  and (not(filters ? 'maxPrice') or v.price<=(filters->>'maxPrice')::integer)
  and (not(filters ? 'minKm') or v.kilometers>=(filters->>'minKm')::integer)
  and (not(filters ? 'maxKm') or v.kilometers<=(filters->>'maxKm')::integer)
 ), keys as materialized (
  select id,created_at from matched
  where cursor_time is null or (created_at,id)<(cursor_time,cursor_id)
  order by created_at desc,id desc limit page_size+1
 ), page as materialized (
  select v.* from matched v join keys k using(id,created_at)
  order by v.created_at desc,v.id desc limit page_size
 ), items as (
  select jsonb_build_object('id',v.id,'owner_id',v.owner_id,'brand',v.brand,'model',v.model,'version',v.version,'year',v.year,
   'kilometers',case when can_view then v.kilometers else null end,'price',case when can_view then v.price else null end,
   'zone',v.zone,'description',v.description,'checklist',v.checklist,'score',v.score,'accepts_trade',v.accepts_trade,
   'accepts_financing',v.accepts_financing,'view_location',null,'available_hours',v.available_hours,
   'seller_name',v.seller_name,'seller_type',v.seller_type,'created_at',v.created_at,
   'media',coalesce((select jsonb_agg(jsonb_build_object('storage_path',m.storage_path,'media_type',m.media_type,'sort_order',m.sort_order) order by m.sort_order)
     from public.vehicle_media m where m.vehicle_id=v.id),'[]'::jsonb)) data,v.created_at,v.id from page v
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(data order by created_at desc,id desc) from items),'[]'::jsonb),
 'next_cursor',case when (select count(*) from keys)>page_size then (select jsonb_build_object('created_at',created_at,'id',id) from page order by created_at,id limit 1) else null end,
 'brands',coalesce((select jsonb_agg(brand order by brand) from (select distinct brand from visible order by brand limit 200) b),'[]'::jsonb),
 'years',coalesce((select jsonb_agg(year order by year desc) from (select distinct year from visible order by year desc limit 200) y),'[]'::jsonb)) into result;
 return result;
end $$;
revoke all on function public.get_vehicle_catalog_page(integer,jsonb,jsonb) from public;
grant execute on function public.get_vehicle_catalog_page(integer,jsonb,jsonb) to anon,authenticated;
-- Keep legacy callers compatible while replacing the entire unsafe projection.
-- Rewriting only ORDER/LIMIT would retain a hosted exact-location leak.
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
  order by v.created_at desc, v.id desc limit 24;
$$;
revoke all on function public.get_vehicle_catalog() from public;
grant execute on function public.get_vehicle_catalog() to anon, authenticated;
commit;
