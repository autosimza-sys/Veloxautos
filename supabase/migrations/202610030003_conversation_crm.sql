-- Participant inbox and metadata-only admin CRM. Apply after pilot fixes/atomic
-- publication; validate in staging before deployment. No private-message access
-- or profile/vehicle SELECT policies are added by this migration.
begin;

alter table public.conversations
  add column if not exists lead_status text not null default 'new',
  add column if not exists lead_updated_at timestamptz;

-- Backfill only rows without a lifecycle timestamp; replay never resets progress.
update public.conversations set lead_updated_at = created_at where lead_updated_at is null;
alter table public.conversations alter column lead_updated_at set default now();
alter table public.conversations alter column lead_updated_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.conversations'::regclass
      and conname = 'conversations_lead_status_check'
  ) then
    alter table public.conversations add constraint conversations_lead_status_check
      check (lead_status in ('new', 'interested', 'visit_scheduled', 'visited', 'closed', 'lost'));
  end if;
end;
$$;

-- New conversations always get server defaults. Existing participant SELECT and
-- monotonic block/report updates remain protected by their current RLS/trigger.
-- The lifecycle is only mutable through set_lead_status(), including for admins.
revoke insert, update on public.conversations from anon, authenticated;
grant insert (vehicle_id, buyer_id, seller_id) on public.conversations to authenticated;
grant update (is_reported, is_blocked) on public.conversations to authenticated;
revoke update (lead_status, lead_updated_at) on public.conversations from anon, authenticated;

create or replace function public.get_my_conversations()
returns table (
  id uuid, vehicle_id uuid, buyer_id uuid, seller_id uuid,
  is_blocked boolean, is_reported boolean, created_at timestamptz,
  lead_status text, vehicle_brand text, vehicle_model text, counterparty_name text
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.vehicle_id, c.buyer_id, c.seller_id,
    c.is_blocked, c.is_reported, c.created_at, c.lead_status, v.brand, v.model,
    coalesce(nullif(btrim(counterparty.business_name), ''),
      nullif(btrim(counterparty.display_name), ''), 'Usuario')
  from public.conversations c
  join public.vehicles v on v.id = c.vehicle_id
  join public.profiles counterparty on counterparty.id =
    case when c.buyer_id = auth.uid() then c.seller_id else c.buyer_id end
  where velox_private.is_active_user()
    and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
  order by c.created_at desc, c.id desc;
$$;
revoke all on function public.get_my_conversations() from public, anon;
grant execute on function public.get_my_conversations() to authenticated;

create or replace function public.get_admin_leads()
returns table (
  id uuid, vehicle_id uuid, buyer_id uuid, seller_id uuid,
  is_blocked boolean, is_reported boolean, created_at timestamptz,
  lead_status text, lead_updated_at timestamptz,
  vehicle_brand text, vehicle_model text, vehicle_year integer,
  vehicle_zone text, vehicle_status text, buyer_name text, seller_name text
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.vehicle_id, c.buyer_id, c.seller_id,
    c.is_blocked, c.is_reported, c.created_at, c.lead_status, c.lead_updated_at,
    v.brand, v.model, v.year, v.zone, v.status::text,
    coalesce(nullif(btrim(buyer.business_name), ''), nullif(btrim(buyer.display_name), ''), 'Comprador'),
    coalesce(nullif(btrim(seller.business_name), ''), nullif(btrim(seller.display_name), ''), 'Vendedor')
  from public.conversations c
  join public.vehicles v on v.id = c.vehicle_id
  join public.profiles buyer on buyer.id = c.buyer_id
  join public.profiles seller on seller.id = c.seller_id
  where public.is_admin()
  order by c.created_at desc, c.id desc;
$$;
revoke all on function public.get_admin_leads() from public, anon;
grant execute on function public.get_admin_leads() to authenticated;

create or replace function public.set_lead_status(target_conversation uuid, new_status text)
returns table (id uuid, lead_status text, lead_updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador activo puede cambiar el estado del lead' using errcode = '42501';
  end if;
  if new_status is null or new_status not in ('new', 'interested', 'visit_scheduled', 'visited', 'closed', 'lost') then
    raise exception 'Estado de lead invalido' using errcode = '23514';
  end if;
  return query
    update public.conversations c
    set lead_status = new_status,
      lead_updated_at = case when c.lead_status is distinct from new_status then now() else c.lead_updated_at end
    where c.id = target_conversation
    returning c.id, c.lead_status, c.lead_updated_at;
  if not found then
    raise exception 'No se pudo actualizar la conversacion' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.set_lead_status(uuid, text) from public, anon;
grant execute on function public.set_lead_status(uuid, text) to authenticated;

commit;
