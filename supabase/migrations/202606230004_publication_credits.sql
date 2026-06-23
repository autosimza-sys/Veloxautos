create table if not exists public.credit_settings (
  role public.user_role primary key,
  initial_credits integer not null check (initial_credits >= 0),
  validity_days integer not null default 90 check (validity_days > 0),
  updated_at timestamptz not null default now()
);

insert into public.credit_settings (role, initial_credits, validity_days)
values
  ('registered', 0, 90),
  ('particular', 10, 90),
  ('reseller', 50, 90),
  ('agency', 200, 90)
on conflict (role) do update
set initial_credits = excluded.initial_credits,
    validity_days = excluded.validity_days;

create table if not exists public.credit_balances (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  granted integer not null default 0 check (granted >= 0),
  used integer not null default 0 check (used >= 0 and used <= granted),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,
  kind text not null check (kind in ('initial_grant', 'purchase', 'publication', 'admin_adjustment', 'expiration')),
  reference_id uuid,
  note text,
  created_at timestamptz not null default now()
);

alter table public.credit_settings enable row level security;
alter table public.credit_balances enable row level security;
alter table public.credit_ledger enable row level security;

create policy "credit_settings_read_authenticated"
on public.credit_settings for select to authenticated using (true);

create policy "credit_settings_admin_manage"
on public.credit_settings for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "credit_balances_own_or_admin"
on public.credit_balances for select to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy "credit_ledger_own_or_admin"
on public.credit_ledger for select to authenticated
using (user_id = auth.uid() or public.is_admin());

revoke all on public.credit_settings, public.credit_balances, public.credit_ledger from anon;
revoke insert, update, delete on public.credit_balances, public.credit_ledger from authenticated;
grant select on public.credit_settings, public.credit_balances, public.credit_ledger to authenticated;

create or replace function public.grant_initial_publication_credits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  setting_record public.credit_settings%rowtype;
begin
  select * into setting_record
  from public.credit_settings
  where role = new.role;

  if setting_record.role is null then
    return new;
  end if;

  insert into public.credit_balances (user_id, granted, used, expires_at)
  values (
    new.id,
    setting_record.initial_credits,
    0,
    now() + make_interval(days => setting_record.validity_days)
  )
  on conflict (user_id) do nothing;

  if setting_record.initial_credits > 0 then
    insert into public.credit_ledger (user_id, amount, kind, note)
    values (new.id, setting_record.initial_credits, 'initial_grant', 'Creditos iniciales por tipo de cuenta');
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_grant_initial_credits on public.profiles;
create trigger profiles_grant_initial_credits
after insert on public.profiles
for each row execute function public.grant_initial_publication_credits();

insert into public.credit_balances (user_id, granted, used, expires_at)
select
  p.id,
  coalesce(s.initial_credits, 0),
  0,
  now() + make_interval(days => coalesce(s.validity_days, 90))
from public.profiles p
left join public.credit_settings s on s.role = p.role
on conflict (user_id) do nothing;

insert into public.credit_ledger (user_id, amount, kind, note)
select b.user_id, b.granted, 'initial_grant', 'Migracion inicial de creditos'
from public.credit_balances b
where b.granted > 0
  and not exists (
    select 1 from public.credit_ledger l
    where l.user_id = b.user_id and l.kind = 'initial_grant'
  );

create or replace function public.create_vehicle_with_credit(payload jsonb)
returns public.vehicles
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile public.profiles%rowtype;
  current_balance public.credit_balances%rowtype;
  created_vehicle public.vehicles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesion';
  end if;

  select * into current_profile
  from public.profiles
  where id = auth.uid()
  for update;

  if current_profile.is_blocked
    or current_profile.role not in ('particular', 'reseller', 'agency') then
    raise exception 'Tu cuenta no tiene permiso para publicar';
  end if;

  select * into current_balance
  from public.credit_balances
  where user_id = auth.uid()
  for update;

  if current_balance.user_id is null
    or current_balance.expires_at <= now()
    or current_balance.used >= current_balance.granted then
    raise exception 'No tenes creditos de publicacion disponibles';
  end if;

  insert into public.vehicles (
    owner_id, status, brand, model, version, year, kilometers, price, zone,
    partial_plate, description, checklist, score, accepts_trade,
    accepts_financing, view_location, available_hours
  )
  values (
    auth.uid(),
    'active',
    trim(payload->>'brand'),
    trim(payload->>'model'),
    trim(payload->>'version'),
    (payload->>'year')::integer,
    (payload->>'kilometers')::integer,
    (payload->>'price')::integer,
    trim(payload->>'zone'),
    nullif(trim(payload->>'partial_plate'), ''),
    nullif(trim(payload->>'description'), ''),
    coalesce(payload->'checklist', '{}'::jsonb),
    greatest(1, least(10, coalesce((payload->>'score')::numeric, 1))),
    coalesce((payload->>'accepts_trade')::boolean, false),
    coalesce((payload->>'accepts_financing')::boolean, false),
    nullif(trim(payload->>'view_location'), ''),
    nullif(trim(payload->>'available_hours'), '')
  )
  returning * into created_vehicle;

  update public.credit_balances
  set used = used + 1, updated_at = now()
  where user_id = auth.uid();

  insert into public.credit_ledger (user_id, amount, kind, reference_id, note)
  values (auth.uid(), -1, 'publication', created_vehicle.id, 'Publicacion de vehiculo');

  return created_vehicle;
end;
$$;

revoke all on function public.create_vehicle_with_credit(jsonb) from public;
grant execute on function public.create_vehicle_with_credit(jsonb) to authenticated;

drop policy if exists "vehicles_insert_owner" on public.vehicles;
revoke insert on public.vehicles from authenticated;

