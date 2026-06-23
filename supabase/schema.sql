-- VELOX MVP Fase 1
-- Ejecutar en Supabase SQL Editor.

create type public.user_role as enum (
  'registered',
  'particular',
  'reseller',
  'agency',
  'admin'
);

create type public.payment_status as enum (
  'pending',
  'approved',
  'rejected'
);

create type public.publication_status as enum (
  'draft',
  'active',
  'paused',
  'deleted'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'registered',
  display_name text not null,
  phone text,
  business_name text,
  avatar_url text,
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plans (
  id text primary key,
  name text not null,
  monthly_price integer not null default 0,
  included_vehicles integer not null default 0,
  extra_vehicle_price integer not null default 1000
);

insert into public.plans (id, name, monthly_price, included_vehicles, extra_vehicle_price)
values
  ('particular', 'Particular', 0, 1, 1000),
  ('reseller', 'Revendedor', 10000, 3, 1000),
  ('agency', 'Agencia', 20000, 10, 1000)
on conflict (id) do nothing;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id text not null references public.plans(id),
  status text not null default 'active',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  status public.publication_status not null default 'draft',
  brand text not null,
  model text not null,
  version text not null,
  year integer not null,
  kilometers integer not null,
  price integer not null,
  zone text not null,
  partial_plate text,
  description text,
  checklist jsonb not null default '{}'::jsonb,
  score numeric(3,1) not null default 1.0,
  accepts_trade boolean not null default false,
  accepts_financing boolean not null default false,
  view_location text,
  available_hours text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vehicle_media (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  media_type text not null check (media_type in ('photo', 'video')),
  storage_path text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.favorite_vehicles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, vehicle_id)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('publication', 'subscription', 'extra_vehicle')),
  amount integer not null,
  status public.payment_status not null default 'pending',
  mp_link text,
  notes text,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  is_reported boolean not null default false,
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (vehicle_id, buyer_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  reason text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_media enable row level security;
alter table public.favorite_vehicles enable row level security;
alter table public.orders enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;

create policy "profiles_read_all" on public.profiles for select using (true);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

create policy "vehicles_read_public" on public.vehicles for select using (status in ('active', 'paused') or owner_id = auth.uid());
create policy "vehicles_insert_own" on public.vehicles for insert with check (owner_id = auth.uid());
create policy "vehicles_update_own" on public.vehicles for update using (owner_id = auth.uid());

create policy "media_read_public" on public.vehicle_media for select using (true);
create policy "media_owner_insert" on public.vehicle_media for insert with check (
  exists (
    select 1 from public.vehicles
    where vehicles.id = vehicle_media.vehicle_id
    and vehicles.owner_id = auth.uid()
  )
);

create policy "favorites_own" on public.favorite_vehicles for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "orders_own_read" on public.orders for select using (user_id = auth.uid());
create policy "orders_own_insert" on public.orders for insert with check (user_id = auth.uid());

create policy "conversations_members_read" on public.conversations for select using (buyer_id = auth.uid() or seller_id = auth.uid());
create policy "conversations_buyer_insert" on public.conversations for insert with check (buyer_id = auth.uid());

create policy "messages_members_read" on public.messages for select using (
  exists (
    select 1 from public.conversations
    where conversations.id = messages.conversation_id
    and (conversations.buyer_id = auth.uid() or conversations.seller_id = auth.uid())
  )
);
create policy "messages_members_insert" on public.messages for insert with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.conversations
    where conversations.id = messages.conversation_id
    and (conversations.buyer_id = auth.uid() or conversations.seller_id = auth.uid())
  )
);

create policy "reports_insert_own" on public.reports for insert with check (reporter_id = auth.uid());
create policy "reports_read_own" on public.reports for select using (reporter_id = auth.uid());

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, phone, role, business_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.email),
    new.raw_user_meta_data->>'phone',
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'registered'::public.user_role),
    new.raw_user_meta_data->>'business_name'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists create_profile_after_signup on auth.users;

create trigger create_profile_after_signup
after insert on auth.users
for each row execute function public.create_profile_for_new_user();
