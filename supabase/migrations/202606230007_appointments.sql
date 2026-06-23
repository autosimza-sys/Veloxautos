create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  proposed_by uuid not null references public.profiles(id) on delete cascade,
  scheduled_at timestamptz not null,
  location text not null,
  status text not null default 'proposed'
    check (status in ('proposed', 'accepted', 'rejected', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.appointments enable row level security;

create policy "appointments_members_read"
on public.appointments for select to authenticated
using (
  exists (
    select 1 from public.conversations c
    where c.id = appointments.conversation_id
      and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
  )
);

create policy "appointments_members_insert"
on public.appointments for insert to authenticated
with check (
  proposed_by = auth.uid()
  and exists (
    select 1 from public.conversations c
    where c.id = appointments.conversation_id
      and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
      and c.is_blocked = false
  )
);

create policy "appointments_members_update"
on public.appointments for update to authenticated
using (
  exists (
    select 1 from public.conversations c
    where c.id = appointments.conversation_id
      and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
  )
)
with check (
  exists (
    select 1 from public.conversations c
    where c.id = appointments.conversation_id
      and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
  )
);

revoke all on public.appointments from anon;
grant select, insert on public.appointments to authenticated;
grant update (status, location, scheduled_at, updated_at) on public.appointments to authenticated;

create index if not exists appointments_conversation_idx
on public.appointments (conversation_id, scheduled_at desc);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'appointments'
  ) then
    alter publication supabase_realtime add table public.appointments;
  end if;
end
$$;

