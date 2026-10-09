-- Reconcile reviewed policy/function drift without replaying historical setup.
-- Apply after the candidate migrations, in a coordinated frontend/storage cutover.
-- This delta does not modify account roles, customer rows, visit consent or files.
-- Any other policy/grant drift must be reviewed by the read-only preflight first.
begin;

-- The historical setup migration also demotes administrators. Never replay it
-- to restore this helper: preserve roles and restore only the active-admin check.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'::public.user_role and not p.is_blocked
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- The observed installation already protects this legacy configuration table.
-- Fresh installs from the original schema must not inherit broad browser grants
-- without RLS. The application does not use direct plans reads or writes; no new
-- policy or browser permission is added here.
alter table public.plans enable row level security;

-- These exact, observed names add permissive OR branches around the reviewed
-- policies. Keep unrelated policies intact; never drop policies by a wildcard.
drop policy if exists "vehicle_media_public_read" on storage.objects;
drop policy if exists "vehicle_media_auth_upload" on storage.objects;
drop policy if exists "admin_select_messages" on public.messages;
drop policy if exists "admin_select_conversations" on public.conversations;
drop policy if exists "admin_update_conversations" on public.conversations;
drop policy if exists "admin_update_vehicles" on public.vehicles;

-- The existing active-owner media policies and narrow administrator RPCs stay
-- in force. Admin CRM exposes its declared metadata only, not all chat bodies.
-- The three redundant profile policies observed in staging are deliberately
-- preserved; their grants and expressions still require preflight review.

-- Storage public URLs bypass row policies. Closing RLS alone cannot make an
-- already-public bucket private. The matching client uses signed URLs.
-- A shared bucket can express only one size ceiling: 25 MiB accommodates video;
-- the publication/inspection RPCs retain the stricter 3 MiB photo validation.
-- Existing stricter ingest settings are never widened on first apply or replay.
update storage.buckets b
set public = false,
    file_size_limit = least(coalesce(b.file_size_limit, 25 * 1024 * 1024), 25 * 1024 * 1024),
    allowed_mime_types = array(
      select mime from unnest(array[
        'image/jpeg', 'image/png', 'image/webp',
        'video/mp4', 'video/webm', 'video/quicktime'
      ]::text[]) with ordinality as approved(mime, position)
      where b.allowed_mime_types is null or exists (
        select 1 from unnest(b.allowed_mime_types) as configured(pattern)
        where lower(pattern) = mime or lower(pattern) in ('*', '*/*')
          or (right(lower(pattern), 2) = '/*'
            and split_part(mime, '/', 1) = split_part(lower(pattern), '/', 1))
      )
      order by position
    )
where b.id in ('vehicle-media', 'inspection-media');

-- Do not manufacture a missing bucket or silently accept an unusable legacy
-- setting. Inventory/ingest compatibility must be reviewed before the release.
do $$
begin
  if (select count(*) from storage.buckets where id in ('vehicle-media', 'inspection-media')) <> 2 then
    raise exception 'Faltan buckets de medios requeridos. Revisar Storage antes de aplicar el corte de seguridad';
  end if;
  if exists (select 1 from storage.buckets where id in ('vehicle-media', 'inspection-media')
      and (file_size_limit <= 0 or cardinality(allowed_mime_types) = 0)) then
    raise exception 'La configuracion previa de medios no es compatible. Revisar limites y tipos sin ampliar permisos automaticamente';
  end if;
end;
$$;

commit;
