-- Observed policy/function drift; schema definitions only. No customer data or credentials.
-- Applied after historical migrations and before candidate migrations in synthetic tests.

-- This lifecycle column/constraint also predates the candidate CRM migration in
-- the observed schema. Its existing state must remain compatible with that RPC.
alter table public.conversations add column if not exists lead_status text not null default 'new';
alter table public.conversations add constraint conversations_lead_status_check
  check (lead_status in ('new','interested','visit_scheduled','visited','closed','lost'));

create policy "admin_select_conversations" on "public"."conversations" as PERMISSIVE for SELECT to "authenticated"
using ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::user_role));

create policy "admin_update_conversations" on "public"."conversations" as PERMISSIVE for UPDATE to "authenticated"
using ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::user_role));

create policy "admin_select_messages" on "public"."messages" as PERMISSIVE for SELECT to "authenticated"
using ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::user_role));

create policy "profiles_admin_read_all" on "public"."profiles" as PERMISSIVE for SELECT to "authenticated"
using (is_admin());

create policy "profiles_own_read" on "public"."profiles" as PERMISSIVE for SELECT to "authenticated"
using ((id = auth.uid()));

create policy "profiles_own_update" on "public"."profiles" as PERMISSIVE for UPDATE to "authenticated"
using ((id = auth.uid()));

create policy "admin_update_vehicles" on "public"."vehicles" as PERMISSIVE for UPDATE to "authenticated"
using ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = auth.uid())) = 'admin'::user_role));

create policy "vehicle_media_auth_upload" on "storage"."objects" as PERMISSIVE for INSERT to "authenticated"
with check (((bucket_id = 'vehicle-media'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

create policy "vehicle_media_public_read" on "storage"."objects" as PERMISSIVE for SELECT to public
using ((bucket_id = 'vehicle-media'::text));

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$function$;

update storage.buckets set public=true, file_size_limit=null, allowed_mime_types=null where id='vehicle-media';
