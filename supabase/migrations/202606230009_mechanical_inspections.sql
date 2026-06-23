create table if not exists public.mechanic_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  license_number text,
  specialties text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.inspection_requests (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  assigned_mechanic uuid references public.profiles(id) on delete set null,
  status text not null default 'requested'
    check (status in ('requested', 'assigned', 'in_progress', 'completed', 'observed', 'cancelled')),
  requested_at timestamptz not null default now(),
  scheduled_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.inspection_reports (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.inspection_requests(id) on delete cascade,
  mechanic_id uuid not null references public.profiles(id) on delete restrict,
  inspection_date date not null default current_date,
  odometer integer not null check (odometer >= 0),
  scores jsonb not null default '{}'::jsonb,
  observations text,
  result text not null check (result in ('approved', 'observed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inspection_media (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.inspection_reports(id) on delete cascade,
  kind text not null check (kind in ('dashboard', 'detail', 'video')),
  storage_path text not null,
  created_at timestamptz not null default now()
);

alter table public.mechanic_profiles enable row level security;
alter table public.inspection_requests enable row level security;
alter table public.inspection_reports enable row level security;
alter table public.inspection_media enable row level security;

create or replace function public.can_access_inspection(target_request uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.inspection_requests r
    where r.id = target_request
      and (
        r.requested_by = auth.uid()
        or r.assigned_mechanic = auth.uid()
        or public.is_admin()
      )
  );
$$;

create policy "mechanics_admin_or_self_read"
on public.mechanic_profiles for select to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy "mechanics_admin_manage"
on public.mechanic_profiles for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "inspection_requests_private_read"
on public.inspection_requests for select to authenticated
using (public.can_access_inspection(id));

create policy "inspection_requests_create"
on public.inspection_requests for insert to authenticated
with check (
  requested_by = auth.uid()
  and exists (
    select 1 from public.vehicles v
    where v.id = inspection_requests.vehicle_id
      and v.status = 'active'
  )
);

create policy "inspection_requests_admin_or_mechanic_update"
on public.inspection_requests for update to authenticated
using (public.is_admin() or assigned_mechanic = auth.uid())
with check (public.is_admin() or assigned_mechanic = auth.uid());

create policy "inspection_reports_private_read"
on public.inspection_reports for select to authenticated
using (public.can_access_inspection(request_id));

create policy "inspection_reports_assigned_insert"
on public.inspection_reports for insert to authenticated
with check (
  mechanic_id = auth.uid()
  and exists (
    select 1 from public.inspection_requests r
    where r.id = inspection_reports.request_id
      and r.assigned_mechanic = auth.uid()
  )
);

create policy "inspection_reports_mechanic_update"
on public.inspection_reports for update to authenticated
using (mechanic_id = auth.uid() or public.is_admin())
with check (mechanic_id = auth.uid() or public.is_admin());

create policy "inspection_media_private_read"
on public.inspection_media for select to authenticated
using (
  exists (
    select 1 from public.inspection_reports report
    where report.id = inspection_media.report_id
      and public.can_access_inspection(report.request_id)
  )
);

create policy "inspection_media_mechanic_insert"
on public.inspection_media for insert to authenticated
with check (
  exists (
    select 1 from public.inspection_reports report
    where report.id = inspection_media.report_id
      and report.mechanic_id = auth.uid()
  )
);

revoke all on public.mechanic_profiles, public.inspection_requests, public.inspection_reports, public.inspection_media from anon;
grant select on public.mechanic_profiles, public.inspection_requests, public.inspection_reports, public.inspection_media to authenticated;
grant insert on public.inspection_requests, public.inspection_reports, public.inspection_media to authenticated;
grant update on public.inspection_requests, public.inspection_reports to authenticated;

insert into storage.buckets (id, name, public)
values ('inspection-media', 'inspection-media', false)
on conflict (id) do update set public = false;

create policy "inspection_storage_mechanic_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'inspection-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "inspection_storage_private_read"
on storage.objects for select to authenticated
using (
  bucket_id = 'inspection-media'
  and exists (
    select 1 from public.inspection_media media
    join public.inspection_reports report on report.id = media.report_id
    where media.storage_path = name
      and public.can_access_inspection(report.request_id)
  )
);

create index if not exists inspection_requests_requester_idx
on public.inspection_requests (requested_by, requested_at desc);

create index if not exists inspection_requests_mechanic_idx
on public.inspection_requests (assigned_mechanic, status, requested_at desc);

create or replace function public.get_assigned_inspection_context()
returns table (
  request_id uuid,
  vehicle_id uuid,
  brand text,
  model text,
  version text,
  year integer,
  declared_kilometers integer,
  owner_name text,
  owner_phone text,
  request_status text,
  requested_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    v.id,
    v.brand,
    v.model,
    v.version,
    v.year,
    v.kilometers,
    owner.display_name,
    owner.phone,
    r.status,
    r.requested_at
  from public.inspection_requests r
  join public.vehicles v on v.id = r.vehicle_id
  join public.profiles owner on owner.id = v.owner_id
  where r.assigned_mechanic = auth.uid()
     or public.is_admin()
  order by r.requested_at desc;
$$;

revoke all on function public.get_assigned_inspection_context() from public;
grant execute on function public.get_assigned_inspection_context() to authenticated;
