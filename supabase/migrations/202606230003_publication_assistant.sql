create table if not exists public.publication_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  current_step integer not null default 0 check (current_step between 0 and 6),
  data jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'discarded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.publication_drafts enable row level security;

drop policy if exists "drafts_owner_select" on public.publication_drafts;
create policy "drafts_owner_select"
on public.publication_drafts
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "drafts_owner_insert" on public.publication_drafts;
create policy "drafts_owner_insert"
on public.publication_drafts
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "drafts_owner_update" on public.publication_drafts;
create policy "drafts_owner_update"
on public.publication_drafts
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "drafts_owner_delete" on public.publication_drafts;
create policy "drafts_owner_delete"
on public.publication_drafts
for delete
to authenticated
using (user_id = auth.uid());

create index if not exists publication_drafts_user_status_idx
on public.publication_drafts (user_id, status, updated_at desc);

revoke all on table public.publication_drafts from anon;
grant select, insert, update, delete on table public.publication_drafts to authenticated;

