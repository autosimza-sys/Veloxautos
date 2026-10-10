-- Read-only staging audit. Run only with the project's explicit authorization.
-- One result set contains metadata and aggregate counts, never customer rows,
-- contact details, appointment locations, message bodies or object paths.
-- PASS is local to a check. REVIEW/NOT_INSTALLED are NOT readiness or permission
-- to deploy. Missing migration history is not permission to replay old setup:
-- 202606230001 changes account roles and historical migrations are not a baseline.
-- Unexpected SQL/permission/timeout errors mean the audit is INCOMPLETE, never PASS.
-- PostgreSQL can see only some PostgREST configuration. Dashboard/runtime exposure,
-- frontend cutover and signed-URL smoke tests always require independent review.
-- Fingerprints below describe local schema + ordered migrations through
-- 202610090006. A PostgreSQL deparser change may cause a conservative REVIEW.
-- Update fingerprints only after reviewing the corresponding source change.
begin transaction isolation level repeatable read read only;
set transaction read only;
set local search_path = pg_catalog;
set local row_security = off;
set local statement_timeout = '60s';
set local lock_timeout = '3s';

with
observer as (
  select oid, rolname, rolsuper, rolbypassrls from pg_roles where rolname = current_user
),
expected_relations(object_name) as (values
  ('public.profiles'), ('public.plans'), ('public.subscriptions'),
  ('public.vehicles'), ('public.vehicle_media'), ('public.favorite_vehicles'),
  ('public.orders'), ('public.conversations'), ('public.messages'), ('public.reports'),
  ('public.publication_drafts'), ('public.credit_balances'), ('public.credit_ledger'),
  ('public.credit_settings'), ('public.seller_assistant_settings'), ('public.appointments'),
  ('public.mechanic_profiles'), ('public.inspection_requests'), ('public.inspection_reports'),
  ('public.inspection_media'), ('public.publication_requests'),
  ('storage.objects'), ('storage.buckets'),
  ('velox_private.appointment_reservations'), ('velox_private.appointment_proposal_requests'),
  ('velox_private.message_requests'), ('public.launch_promotion'),
  ('velox_private.launch_promotion_events'), ('velox_private.ai_reply_jobs'), ('velox_private.faq_catalog'),
  ('velox_private.faq_requests'), ('velox_private.faq_answer_history'), ('velox_private.visit_authorizations'), ('velox_private.authorized_visit_requests'), ('velox_private.visit_notices')
),
relations as materialized (
  select c.*, n.nspname, n.nspname || '.' || c.relname as object_name,
    has_schema_privilege(n.oid, 'USAGE') and has_table_privilege(c.oid, 'SELECT')
    and (not c.relrowsecurity or o.rolsuper or o.rolbypassrls
      or (pg_has_role(c.relowner, 'USAGE') and not c.relforcerowsecurity))
    and c.relkind in ('r', 'p') as can_inspect_all_rows
  from pg_class c join pg_namespace n on n.oid = c.relnamespace cross join observer o
  where n.nspname in ('public','storage','velox_private','supabase_migrations')
    and c.relkind in ('r','p','v','m','f')
),
client_roles as (
  select oid, rolname, rolsuper, rolbypassrls, rolinherit from pg_roles where rolname in ('anon','authenticated')
),
-- POLICY_MANIFEST_START
expected_policies(object_name, fingerprint, optional) as (values
  ('public.launch_promotion.launch_read','1fdfb68c4f48648108951ae916e16390',false),
  ('public.appointments.appointments_members_insert','f0e06ba42fe3f20d84e2a6e5bdb94d2f',false),
  ('public.appointments.appointments_members_read','984bc3166f4ff68d20bb86e6f4467938',false),
  ('public.conversations.conversations_buyer_insert','b00aaa73f1639628f67287e240874a4c',false),
  ('public.conversations.conversations_members_read','44c1cb2ef9062dd20e849c5ce441057a',false),
  ('public.conversations.conversations_members_update','9f1bf375d05e2919dc10ead5b261051c',false),
  ('public.credit_balances.credit_balances_own_or_admin','b4f2c27e37d41bd9770149b09668e795',false),
  ('public.credit_ledger.credit_ledger_own_or_admin','b4f2c27e37d41bd9770149b09668e795',false),
  ('public.credit_settings.credit_settings_admin_manage','84a4d014eb1a8d67d11ba5bd780c7298',false),
  ('public.credit_settings.credit_settings_read_authenticated','c8eeeb4014aa81766cb47da33db97657',false),
  ('public.favorite_vehicles.favorites_own','a357ff7f79c42272b90a2088fb835c5e',false),
  ('public.inspection_media.inspection_media_mechanic_insert','c284c7121762a6401a4e99c2ca10c08d',false),
  ('public.inspection_media.inspection_media_private_read','7ec086faa48b732379873b52befeda40',false),
  ('public.inspection_reports.inspection_reports_assigned_insert','de1342055bdaa44722736ca57b1e5b9a',false),
  ('public.inspection_reports.inspection_reports_mechanic_update','986a8302af76b31ac814c7a44216bd94',false),
  ('public.inspection_reports.inspection_reports_private_read','2c279236d582eb0fb623b1a7d67984d9',false),
  ('public.inspection_requests.inspection_requests_admin_or_mechanic_update','5086c97d369c64fc118089b86cdd9db8',false),
  ('public.inspection_requests.inspection_requests_create','f66aa6b5e883fc440bfc8d0aec98f6f2',false),
  ('public.inspection_requests.inspection_requests_private_read','53a15739fc5a2087934762c218279c9b',false),
  ('public.mechanic_profiles.mechanics_admin_manage','84a4d014eb1a8d67d11ba5bd780c7298',false),
  ('public.mechanic_profiles.mechanics_admin_or_self_read','b4f2c27e37d41bd9770149b09668e795',false),
  ('public.messages.messages_members_insert','e9eb43f4ba510f4ec64f61ef178b1a59',false),
  ('public.messages.messages_members_mark_read','f46f60aaab90deb0ad6d12d6bb2167fd',false),
  ('public.messages.messages_members_read','5b9538878b13c22992a59972a8193d2a',false),
  ('public.orders.orders_admin_update','cd26977f815c280e744d617a9041cf14',false),
  ('public.orders.orders_insert_owner','ef0a62d862ac4747e3663c33f2da94b5',false),
  ('public.orders.orders_read_owner_or_admin','4e33a772d8156ec800fe3f17f4aef720',false),
  ('public.profiles.profiles_admin_read_all','5c750ffa47902bd1d2ecfbb795a459a5',true),
  ('public.profiles.profiles_insert_own_non_privileged','eca1384f40943683b89e928d639c1f92',false),
  ('public.profiles.profiles_own_read','494322b8356b79a27d2d7d4f5451d128',true),
  ('public.profiles.profiles_own_update','b3471df7f289f160e6d506c06f94dc3d',true),
  ('public.profiles.profiles_read_own_or_admin','0df643ecf1d88655eda1b4d1b9f1ac68',false),
  ('public.profiles.profiles_update_own_or_admin','0e3d200d751da6e0daf17489c6d93d65',false),
  ('public.publication_drafts.drafts_owner_delete','105ba614252ab603cc9f3c5b3ceaaa6e',false),
  ('public.publication_drafts.drafts_owner_insert','2eeba4d2f574f4dd000cb6fb539242a5',false),
  ('public.publication_drafts.drafts_owner_select','1e068adc6cc3e64c8fccc44ba07c5196',false),
  ('public.publication_drafts.drafts_owner_update','f3f6bfc539586fee8b38bb69367e723b',false),
  ('public.publication_requests.publication_requests_read_own','1e068adc6cc3e64c8fccc44ba07c5196',false),
  ('public.reports.reports_admin_read','8ca930d38fbc9d7227b4fc54fd4931c8',false),
  ('public.reports.reports_admin_update','cd26977f815c280e744d617a9041cf14',false),
  ('public.reports.reports_insert_own','7676e0d6879aefe0a0b507e5040a4831',false),
  ('public.reports.reports_read_own','18648b3624440e85d23bd22c2a867f40',false),
  ('public.seller_assistant_settings.assistant_settings_owner_insert','2eeba4d2f574f4dd000cb6fb539242a5',false),
  ('public.seller_assistant_settings.assistant_settings_owner_select','b4f2c27e37d41bd9770149b09668e795',false),
  ('public.seller_assistant_settings.assistant_settings_owner_update','68f6c24f966fe1cefd1c33c30ec5e2c6',false),
  ('public.vehicle_media.media_delete_owner_or_admin','ec427e2b9ee844e1cfce50f664f60372',false),
  ('public.vehicle_media.media_insert_owner','b51816d68f5368bfb1c303586c4a888d',false),
  ('public.vehicle_media.media_read_active_owner_or_admin','f2843b721e3cd9aef7bb4899e636489c',false),
  ('public.vehicles.vehicles_read_owner_or_admin','83e21e0db01da17228f9eb8fb2f01167',false),
  ('storage.objects.inspection_storage_mechanic_insert','a5997f931d1d5792b0775f76db40cbc2',false),
  ('storage.objects.inspection_storage_private_read','da479cda8a14da30b02409e614a01a5f',false),
  ('storage.objects.vehicle_storage_delete_own_folder','840a17635c82ff67eb30639da2481565',false),
  ('storage.objects.vehicle_storage_insert_own_folder','3a84b9599cc979ec4979e802a7030951',false),
  ('storage.objects.vehicle_storage_read_linked_media','38545cffaaa124b2cd60254dc2ab7039',false),
  ('storage.objects.vehicle_storage_update_own_folder','da8b77fd3310c5288e00419812f68605',false)
),
-- POLICY_MANIFEST_END
policies as materialized (
  select n.nspname || '.' || c.relname || '.' || p.polname as object_name,
    n.nspname, c.relname, p.polname, p.polpermissive,
    case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE'
      when 'd' then 'DELETE' else 'ALL' end as command,
    attrs.roles, pg_get_expr(p.polqual, p.polrelid) as using_expression,
    pg_get_expr(p.polwithcheck, p.polrelid) as check_expression,
    md5(jsonb_build_object('command',p.polcmd,'permissive',p.polpermissive,
      'roles',attrs.roles,'using',pg_get_expr(p.polqual,p.polrelid),
      'with_check',pg_get_expr(p.polwithcheck,p.polrelid))::text) as fingerprint
  from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
  cross join lateral (select jsonb_agg(case when r=0 then 'PUBLIC' else pg_get_userbyid(r) end order by
    case when r=0 then 'PUBLIC' else pg_get_userbyid(r) end) as roles from unnest(p.polroles) r) attrs
  where n.nspname in ('public','storage','velox_private')
),
-- FUNCTION_MANIFEST_START
expected_functions(object_name, fingerprint) as (values
  ('public.get_visit_notices()','88532b34a8b525119d87c59b13a5aab7'),
  ('public.read_visit_notice(uuid)','53b2aec096d8b4184baf973a41480143'),
  ('public.book_authorized_visit(uuid, uuid, timestamp with time zone, boolean, uuid)','b585b209403003dd03c18cba55240df1'),
  ('public.get_available_visit_slots(uuid)','8c8675c00529d360710fd65b1b7ad562'),
  ('velox_private.authorized_visit_slot(uuid, uuid, timestamp with time zone)','f78a2102e37bb28c029aae3e1944bfd3'),
  ('velox_private.visit_buyer_context(uuid)','1423d3036e3c78e758aa944ab7043596'),
  ('velox_private.notify_visit_change()','e74262f5f6234688b470dd36fb12ef0f'),
  ('velox_private.guard_visit_authorization()','e9622014f4646e8bec109775495f4753'),
  ('public.get_visit_authorizations(uuid)','cf50ca9177b85e0d5bd04c561c137ba6'),
  ('public.authorize_visit_window(uuid,timestamp with time zone,timestamp with time zone,integer,text,text,boolean,uuid)','955229676578bbccf83d4c831d2fbcbc'),
  ('public.revoke_visit_authorization(uuid)','760c1c191fe7bd3a54dacc66023a2d4c'),
  ('public.answer_listing_faq(uuid,text,text,text,integer)','a2fb56633e9d9d013c3c90634c1d7586'),
  ('velox_private.faq_match(text)','c3eaa1b47b6dd868dc325c2c680d51fa'),
  ('velox_private.faq_normalize(text)','ba5e705f8efc71caece14231872114e3'),
  ('public.get_listing_faq_tasks(uuid)','2d2c8444261bbe6c25958595a7db4c5d'),
  ('velox_private.resolve_faq(uuid,text)','5658eaf19d67b43485f750a6c1b19e27'),
  ('velox_private.apply_global_credit_expiry()','be029781c0d0bcc3e1e8244d2d456fc7'),
  ('public.finish_ai_reply(uuid,uuid,text)','210066210bd08cc653672c05a14f5f1e'),
  ('public.claim_ai_reply(uuid,uuid,integer,integer)','5159440ca6d48af80f60a362cc5871c9'),
  ('velox_private.guard_launch_publication()','f1b77a959001522c95abc9921561b843'),
  ('public.manage_launch_promotion(text,integer,timestamp with time zone,jsonb)','cb2f3ddd29bc704de3405ebbf4e00f5e'),
  ('public.can_access_inspection(uuid)','35cf47193a980ea85fc6b4b80f340ff6'),
  ('public.create_profile_for_new_user()','9ff724be469e62f391f2f7df364203f9'),
  ('public.create_vehicle_with_credit(jsonb)','2a399be8e120b80b700f5d2db66c78f9'),
  ('public.get_admin_leads()','ae1a919d80b67b5b4607ecbe8936f989'),
  ('public.get_assigned_inspection_context()','060c19fae0ce71d5def6f97be73d266a'),
  ('public.get_my_conversations()','399c79815b8360c44ce1b88c4a35689b'),
  ('public.get_vehicle_catalog()','cd19d2fe79cf1d4d1f2f2eb1e21047b0'),
  ('public.grant_initial_publication_credits()','6ee291ba9f0ac4fee5d3cb06ec4bc5b3'),
  ('public.is_admin()','5912b5b51118c447f1335275ad01cd99'),
  ('public.propose_appointment(uuid,timestamp with time zone,integer,text,uuid)','737e454adf18bac0b35f5bc013a9fa12'),
  ('public.publish_vehicle_with_credit(jsonb,jsonb,uuid)','f9988ad9eb746da2863d2538ba09ca2f'),
  ('public.request_inspection(uuid)','ab991c8d77704ad4026b62c49f4f4da8'),
  ('public.send_message_idempotent(uuid,text,uuid)','22dea9d581adee9611d60ad54e2eeebe'),
  ('public.send_message_with_assistant(uuid,text)','adc83724a521b4ca7f72c06b895c17ba'),
  ('public.set_lead_status(uuid,text)','7c0dd5b79da61c16b719d24cc147ad85'),
  ('public.set_vehicle_listing_status(uuid,text)','5b96bc5fc42ca82a0c6afb7fe16f2180'),
  ('public.submit_inspection_report(uuid,jsonb,jsonb)','03cafbbbe531d4e6aef257b838764d5d'),
  ('public.transition_appointment(uuid,text,text)','9882fb91efab0d06189cf8e6907352ca'),
  ('public.update_vehicle_listing(uuid,jsonb)','c5285cf3737b6118ecce1fe4d6301daf'),
  ('velox_private.can_attach_inspection_media(uuid,text)','ab784488838a7f355702608900b4e0e2'),
  ('velox_private.can_attach_vehicle_media(uuid,text)','604b3f73dcd4859eb60bf8173d08a18b'),
  ('velox_private.can_read_vehicle_media(uuid)','3b3fafd385003bd555e274f22b8acf92'),
  ('velox_private.can_read_vehicle_object(text)','1d0ab2387a4df5df2e13e9d989610402'),
  ('velox_private.can_send_message(uuid)','de092bda486401409a3be41892321cf1'),
  ('velox_private.can_start_conversation(uuid,uuid)','1fd24e4f56d03ce7bca8a986576db537'),
  ('velox_private.can_upload_inspection_object(text)','c29d867cfedd5c2a39fffef5607c5260'),
  ('velox_private.can_write_inspection_report(uuid)','11d875c345f1fb73fbc00078b3866118'),
  ('velox_private.guard_appointment_duration()','defe9e76fa9f2cf818c020811aba58ad'),
  ('velox_private.guard_appointment_integrity()','4c70930c7a57067e47cd3dc07dc3cea7'),
  ('velox_private.guard_conversation_moderation()','15b0299023ffee6b0536581613e98092'),
  ('velox_private.guard_inspection_assignment()','67b7e694149b09b4977a683e8a2aa780'),
  ('velox_private.guard_inspection_completion()','afb8a0a2d0f0fef0160f005d11705442'),
  ('velox_private.is_active_mechanic(uuid)','5a66f7f6723f9ec70f5d015126025fad'),
  ('velox_private.is_active_seller()','96c532bf7512615a8149c5d7bd47db27'),
  ('velox_private.is_active_user()','7b8b2f533bbd2cdb7189503ef2d8a2af'),
  ('velox_private.is_public_vehicle(uuid)','bbb9dbde44daef7be9cfcdbf034925e8'),
  ('velox_private.owns_vehicle(uuid)','eac6d93bfbd2707a41c5f4cdee697adc'),
  ('velox_private.set_appointment_reservation_interval()','a327abd5fd10bf1e652267e074662b08')
),
-- FUNCTION_MANIFEST_END
functions as materialized (
  select p.*, n.nspname, p.oid::regprocedure::text as object_name,
    pg_get_userbyid(p.proowner) as owner,
    (select substr(setting,13) from unnest(p.proconfig) setting where setting like 'search_path=%') as search_path,
    exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute,
    (select jsonb_object_agg(r.rolname,has_function_privilege(r.oid,p.oid,'EXECUTE')) from client_roles r) as client_execute,
    md5(pg_get_functiondef(p.oid)) as fingerprint,
    exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e') as extension_owned
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','velox_private') and p.prokind in ('f','p')
),
-- Function bodies are not enough: triggers must still exist, be enabled for
-- ordinary writes, fire at the reviewed timing/events, and call the right guard.
expected_triggers(table_name, trigger_name, function_name, definition) as (values
 ('public.appointments','notify_visit_change','velox_private.notify_visit_change()',
  'CREATE TRIGGER notify_visit_change AFTER UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION velox_private.notify_visit_change()'),
 ('velox_private.visit_authorizations','guard_visit_authorization','velox_private.guard_visit_authorization()',
  'CREATE TRIGGER guard_visit_authorization BEFORE UPDATE ON velox_private.visit_authorizations FOR EACH ROW EXECUTE FUNCTION velox_private.guard_visit_authorization()'),
 ('public.credit_balances','global_credit_expiry','velox_private.apply_global_credit_expiry()',
  'CREATE TRIGGER global_credit_expiry BEFORE INSERT ON public.credit_balances FOR EACH ROW EXECUTE FUNCTION velox_private.apply_global_credit_expiry()'),
 ('public.vehicles','guard_launch_publication','velox_private.guard_launch_publication()',
  'CREATE TRIGGER guard_launch_publication BEFORE INSERT ON public.vehicles FOR EACH ROW EXECUTE FUNCTION velox_private.guard_launch_publication()'),
 ('auth.users','create_profile_after_signup','public.create_profile_for_new_user()',
  'CREATE TRIGGER create_profile_after_signup AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.create_profile_for_new_user()'),
 ('public.profiles','profiles_grant_initial_credits','public.grant_initial_publication_credits()',
  'CREATE TRIGGER profiles_grant_initial_credits AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.grant_initial_publication_credits()'),
 ('public.appointments','guard_appointment_duration','velox_private.guard_appointment_duration()',
  'CREATE TRIGGER guard_appointment_duration BEFORE INSERT OR UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION velox_private.guard_appointment_duration()'),
 ('public.appointments','guard_appointment_integrity','velox_private.guard_appointment_integrity()',
  'CREATE TRIGGER guard_appointment_integrity BEFORE INSERT OR UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION velox_private.guard_appointment_integrity()'),
 ('public.conversations','guard_conversation_moderation','velox_private.guard_conversation_moderation()',
  'CREATE TRIGGER guard_conversation_moderation BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION velox_private.guard_conversation_moderation()'),
 ('public.inspection_requests','guard_inspection_assignment','velox_private.guard_inspection_assignment()',
  'CREATE TRIGGER guard_inspection_assignment BEFORE UPDATE ON public.inspection_requests FOR EACH ROW EXECUTE FUNCTION velox_private.guard_inspection_assignment()'),
 ('public.inspection_requests','guard_inspection_completion','velox_private.guard_inspection_completion()',
  'CREATE TRIGGER guard_inspection_completion BEFORE UPDATE ON public.inspection_requests FOR EACH ROW EXECUTE FUNCTION velox_private.guard_inspection_completion()'),
 ('velox_private.appointment_reservations','set_appointment_reservation_interval','velox_private.set_appointment_reservation_interval()',
  'CREATE TRIGGER set_appointment_reservation_interval BEFORE INSERT OR UPDATE ON velox_private.appointment_reservations FOR EACH ROW EXECUTE FUNCTION velox_private.set_appointment_reservation_interval()')
),
triggers as materialized (
 select n.nspname || '.' || c.relname as table_name,t.tgname as trigger_name,
   p.oid::regprocedure::text as function_name,t.tgenabled as enabled,
   pg_get_triggerdef(t.oid,true) as definition
 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
 join pg_proc p on p.oid=t.tgfoid
 where not t.tgisinternal and n.nspname in ('public','storage','velox_private','auth')
),
table_acl as (
  select r.object_name,r.nspname,r.relowner,a.*,
    case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee_name
  from relations r cross join lateral aclexplode(coalesce(r.relacl,acldefault('r',r.relowner))) a
  where r.nspname in ('public','storage','velox_private')
),
column_acl as (
  select r.object_name,r.nspname,col.attname,col.attnum,a.*,
    case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as grantee_name
  from relations r join pg_attribute col on col.attrelid=r.oid and col.attnum>0 and not col.attisdropped
  cross join lateral aclexplode(col.attacl) a
  where r.nspname in ('public','storage','velox_private')
),
effective_table_privileges as (
  select r.object_name,r.nspname,cr.rolname,privilege,
    has_table_privilege(cr.oid,r.oid,privilege) as allowed
  from relations r cross join client_roles cr cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege
  where r.nspname in ('public','storage','velox_private')
),
effective_column_privileges as (
  select r.object_name,r.nspname,col.attname,cr.rolname,privilege,
    has_column_privilege(cr.oid,r.oid,col.attnum,privilege) as allowed
  from relations r join pg_attribute col on col.attrelid=r.oid and col.attnum>0 and not col.attisdropped
  cross join client_roles cr cross join unnest(array['SELECT','INSERT','UPDATE','REFERENCES']) privilege
  where r.nspname in ('public','storage','velox_private')
),
-- Dynamic SQL consists exclusively of literal SELECT statements below. It is
-- executed only for ordinary tables with all prerequisites and full row access.
-- to_jsonb(row) lets optional *new* columns be absent on a legacy installation.
-- Only aggregate counts or explicitly whitelisted metadata leave these queries.
checks(check_name, prerequisites, sql) as (values
 ('historical_unverified_visits', '[{"table":"public.appointments","columns":["scheduled_at"]}]'::jsonb,
  $q$select count(*) as count from public.appointments a where coalesce(to_jsonb(a)->>'legacy_unverified','false')='true'$q$),
 ('visits_without_verifiable_consent', '[{"table":"public.appointments","columns":["status","proposed_by","scheduled_at"]}]'::jsonb,
  $q$select count(*) as count from public.appointments a where
    not (coalesce(to_jsonb(a)->>'legacy_unverified','false')='true'
      and (to_jsonb(a)->>'scheduled_at')::timestamptz < timestamptz '2026-10-03 00:00:00+00') and (
    (to_jsonb(a)->>'status'='accepted' and not coalesce(
      ((to_jsonb(a)->>'proposed_by'=to_jsonb(a)->>'buyer_id') and to_jsonb(a)->>'buyer_confirmed_at' is null and to_jsonb(a)->>'seller_confirmed_at' is not null)
      or ((to_jsonb(a)->>'proposed_by'=to_jsonb(a)->>'seller_id') and to_jsonb(a)->>'seller_confirmed_at' is null and to_jsonb(a)->>'buyer_confirmed_at' is not null),false))
    or (to_jsonb(a)->>'status'='confirmed' and (to_jsonb(a)->>'buyer_id' is null or to_jsonb(a)->>'seller_id' is null
      or to_jsonb(a)->>'buyer_confirmed_at' is null or to_jsonb(a)->>'seller_confirmed_at' is null)))$q$),
 ('active_visits_without_explicit_duration', '[{"table":"public.appointments","columns":["status","scheduled_at"]}]'::jsonb,
  $q$select count(*) as count from public.appointments a where to_jsonb(a)->>'status' in ('proposed','accepted','confirmed')
    and not (coalesce(to_jsonb(a)->>'legacy_unverified','false')='true'
      and (to_jsonb(a)->>'scheduled_at')::timestamptz < timestamptz '2026-10-03 00:00:00+00')
    and case when coalesce(to_jsonb(a)->>'duration_minutes','') ~ '^[0-9]+$'
      then (to_jsonb(a)->>'duration_minutes')::numeric <= 0 else true end$q$),
 ('reports_without_traceable_completion', '[{"table":"public.inspection_reports","columns":["id","request_id","result"]},{"table":"public.inspection_requests","columns":["id","status"]},{"table":"public.inspection_media","columns":["report_id","kind"]}]'::jsonb,
  $q$select count(*) as count from public.inspection_reports report
    left join public.inspection_requests request on request.id=report.request_id
    where request.id is null or request.status not in ('completed','observed') or to_jsonb(request)->>'completed_at' is null
      or (request.status='completed' and report.result is distinct from 'approved')
      or (request.status='observed' and report.result is distinct from 'observed')
      or not exists(select 1 from public.inspection_media media where media.report_id=report.id and media.kind='dashboard')$q$),
 ('duplicate_open_inspection_groups', '[{"table":"public.inspection_requests","columns":["requested_by","vehicle_id","status"]}]'::jsonb,
  $q$select count(*) as count from (select requested_by,vehicle_id from public.inspection_requests
    where status in ('requested','assigned','in_progress') group by requested_by,vehicle_id having count(*)>1) duplicate_groups$q$),
 ('inconsistent_credit_balances', '[{"table":"public.credit_balances","columns":["used","granted"]}]'::jsonb,
  $q$select count(*) as count from public.credit_balances b where
    case when coalesce(to_jsonb(b)->>'used','') ~ '^-?[0-9]+$' and coalesce(to_jsonb(b)->>'granted','') ~ '^-?[0-9]+$'
      then (to_jsonb(b)->>'used')::numeric<0 or (to_jsonb(b)->>'granted')::numeric<0
        or (to_jsonb(b)->>'used')::numeric>(to_jsonb(b)->>'granted')::numeric else true end$q$)
),
check_access as materialized (
 select checks.*,
   exists(select 1 from jsonb_array_elements(prerequisites) req where not exists(
     select 1 from relations r where r.object_name=req->>'table')) as missing_table,
   exists(select 1 from jsonb_array_elements(prerequisites) req join relations r on r.object_name=req->>'table'
     cross join lateral jsonb_array_elements_text(req->'columns') col where not exists (
       select 1 from pg_attribute a where a.attrelid=r.oid and a.attname=col and a.attnum>0 and not a.attisdropped)) as missing_column,
   exists(select 1 from jsonb_array_elements(prerequisites) req join relations r on r.object_name=req->>'table'
     where not r.can_inspect_all_rows) as limited_access
 from checks
),
check_results as materialized (
 select c.*, case when not missing_table and not missing_column and not limited_access
   then ((xpath('/table/row/count/text()',query_to_xml(sql,false,false,'')))[1]::text)::bigint end as count
 from check_access c
),
metadata_sources(object_name, sql) as (values
 ('storage.buckets', $q$select coalesce(jsonb_agg(jsonb_build_object('id',to_jsonb(b)->>'id','public',to_jsonb(b)->'public',
    'file_size_limit',to_jsonb(b)->'file_size_limit','allowed_mime_types',to_jsonb(b)->'allowed_mime_types') order by to_jsonb(b)->>'id'),'[]'::jsonb)::text as payload
    from storage.buckets b where to_jsonb(b)->>'id' in ('vehicle-media','inspection-media')$q$),
 ('supabase_migrations.schema_migrations', $q$select coalesce(jsonb_agg(to_jsonb(m)->>'version' order by to_jsonb(m)->>'version'),'[]'::jsonb)::text as payload from supabase_migrations.schema_migrations m$q$)
),
metadata_documents as materialized (
 select m.object_name,r.oid,r.can_inspect_all_rows,
   case when r.can_inspect_all_rows then query_to_xml(m.sql,false,false,'') end as document
 from metadata_sources m left join relations r using(object_name)
),
metadata_payloads as materialized (
 select m.*,x.payload::jsonb as payload from metadata_documents m
 left join lateral xmltable('/table/row' passing m.document columns payload text path 'payload') x on true
),
expected_versions(version) as (values
 ('202606230001'),('202606230002'),('202606230003'),('202606230004'),('202606230005'),
 ('202606230006'),('202606230007'),('202606230008'),('202606230009'),
 ('202610030001'),('202610030002'),('202610030003'),('202610030004'),('202610030005'),
 ('202610030006'),('202610030007'),('202610030008'),('202610030009'),('20261004040715'),('202610090001'),('202610090002'),('202610090003'),('202610090004'),('202610090005'),('202610090006')
),
bucket_rows as (
 select wanted.id,m.oid,m.can_inspect_all_rows,b.value as configuration
 from (values ('vehicle-media'),('inspection-media')) wanted(id)
 cross join (select * from metadata_payloads where object_name='storage.buckets') m
 left join lateral jsonb_array_elements(m.payload) b on b.value->>'id'=wanted.id
),
exposure_settings as (
 select 'session'::text as source, current_setting('pgrst.db_schemas',true) as value
 union all
 select 'database/role:' || coalesce(d.datname,'all') || '/' || coalesce(r.rolname,'all'), substr(config,18)
 from pg_db_role_setting s left join pg_database d on d.oid=s.setdatabase
 left join pg_roles r on r.oid=s.setrole cross join lateral unnest(s.setconfig) config
 where config like 'pgrst.db_schemas=%'
),
report(section,object_name,status,details) as (
 select 'context','read_only_audit','PASS',jsonb_build_object('database',current_database(),
   'postgres_version',current_setting('server_version'),'observer',current_user,
   'transaction_read_only',current_setting('transaction_read_only'),'scope','metadata and aggregate counts only')
 union all
 select 'roles',wanted.name,case when r.oid is null then 'NOT_INSTALLED'
   when r.rolsuper or r.rolbypassrls then 'BLOCKED' else 'PASS' end,
   jsonb_build_object('superuser',r.rolsuper,'bypass_rls',r.rolbypassrls,'inherits',r.rolinherit)
 from (values ('anon'),('authenticated')) wanted(name) left join client_roles r on r.rolname=wanted.name
 union all
 select 'role_memberships',r.rolname || ' -> ' || parent.rolname,
   case when parent.rolsuper or parent.rolbypassrls then 'BLOCKED' else 'REVIEW' end,
   jsonb_build_object('inherited',pg_has_role(r.oid,parent.oid,'USAGE'),'member_of',parent.rolname,
     'member_role_superuser',parent.rolsuper,'member_role_bypass_rls',parent.rolbypassrls)
 from client_roles r cross join pg_roles parent where r.oid<>parent.oid and pg_has_role(r.oid,parent.oid,'MEMBER')
 union all
 select 'relations',coalesce(e.object_name,r.object_name),
   case when r.oid is null then 'NOT_INSTALLED'
     when r.relkind in ('r','p') and (r.nspname='public' or r.object_name='storage.objects') and not r.relrowsecurity then 'BLOCKED'
     when r.relkind in ('v','m','f') or e.object_name is null then 'REVIEW' else 'PASS' end,
   jsonb_build_object('exists',r.oid is not null,'kind',r.relkind,'owner',pg_get_userbyid(r.relowner),
     'rls',r.relrowsecurity,'force_rls',r.relforcerowsecurity,'options',r.reloptions,
     'full_row_inspection',r.can_inspect_all_rows,'expected',e.object_name is not null,
     'note',case when r.nspname='velox_private' then 'Private-table grants and API exposure require separate checks.' end)
 from expected_relations e full join (select * from relations where nspname in ('public','storage','velox_private')) r using(object_name)
 union all
 select 'policies',coalesce(e.object_name,p.object_name),
   case when p.object_name is null then 'NOT_INSTALLED'
     when p.object_name in ('storage.objects.vehicle_media_public_read','storage.objects.vehicle_media_auth_upload',
       'public.messages.admin_select_messages','public.conversations.admin_select_conversations',
       'public.conversations.admin_update_conversations','public.vehicles.admin_update_vehicles') then 'BLOCKED'
     when e.optional or e.fingerprint is distinct from p.fingerprint then 'REVIEW' else 'PASS' end,
   jsonb_build_object('roles',p.roles,'command',p.command,'permissive',p.polpermissive,
     'using',p.using_expression,'with_check',p.check_expression,'fingerprint',p.fingerprint,
     'expected_fingerprint',e.fingerprint,'optional_observed_policy',coalesce(e.optional,false),
     'note','Permissive policies combine with OR. Matching names alone do not prove equivalence.')
 from expected_policies e full join policies p using(object_name)
 where p.object_name is not null or not e.optional
 union all
 select 'functions',coalesce(e.object_name,f.object_name),
   case when f.oid is null then 'NOT_INSTALLED'
     when f.prosecdef and (f.search_path is null or f.owner in ('anon','authenticated')) then 'BLOCKED'
     when f.proname='is_admin' and f.fingerprint is distinct from e.fingerprint then 'BLOCKED'
     when f.fingerprint is distinct from e.fingerprint or (f.prosecdef and f.public_execute)
       or (f.prosecdef and f.search_path <> '""') then 'REVIEW' else 'PASS' end,
   jsonb_build_object('owner',f.owner,'security_definer',f.prosecdef,'search_path',f.search_path,
     'settings',f.proconfig,'public_execute',f.public_execute,'client_execute',f.client_execute,
     'returns',case when f.oid is not null then pg_get_function_result(f.oid) end,
     'extension_owned',f.extension_owned,'definition_fingerprint',f.fingerprint,'expected_fingerprint',e.fingerprint)
 from expected_functions e full join functions f using(object_name)
 union all
 select 'triggers',coalesce(e.table_name,t.table_name) || '.' || coalesce(e.trigger_name,t.trigger_name),
   case when e.trigger_name is null then 'REVIEW'
     when t.trigger_name is null and not exists(select 1 from functions f where f.object_name=e.function_name) then 'NOT_INSTALLED'
     when t.trigger_name is null or t.enabled in ('D','R')
       or t.function_name is distinct from e.function_name or t.definition is distinct from e.definition then 'BLOCKED'
     when t.enabled is distinct from 'O' then 'REVIEW' else 'PASS' end,
   jsonb_build_object('table',coalesce(e.table_name,t.table_name),'function',t.function_name,
     'expected_function',e.function_name,'enabled',t.enabled,'definition',t.definition,
     'expected_definition',e.definition,'note','O=origin, D=disabled, R=replica only, A=always. Unknown triggers require review; matching function bodies do not prove trigger enforcement.')
 from expected_triggers e full join triggers t using(table_name,trigger_name)
 union all
 select 'trigger_execution_context','session_replication_role',
   case when current_setting('session_replication_role')='replica' then 'BLOCKED'
     when current_setting('session_replication_role')='origin' then 'PASS' else 'REVIEW' end,
   jsonb_build_object('value',current_setting('session_replication_role'),
     'note','This setting describes the auditing session only. Application writes must not bypass ordinary triggers.')
 union all
 select 'function_grants',f.object_name,'REVIEW',jsonb_build_object('grantee',
     case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
     'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable)
 from functions f cross join lateral aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
 union all
 select 'table_grants',object_name,
   case when grantee_name='PUBLIC' or (nspname='velox_private' and grantee_name in ('anon','authenticated')) then 'BLOCKED' else 'REVIEW' end,
   jsonb_build_object('grantee',grantee_name,'grantor',pg_get_userbyid(grantor),'privilege',privilege_type,'grantable',is_grantable)
 from table_acl
 union all
 select 'column_grants',object_name,
   case when grantee_name='PUBLIC' or (nspname='velox_private' and grantee_name in ('anon','authenticated')) then 'BLOCKED' else 'REVIEW' end,
   jsonb_build_object('column',attname,'grantee',grantee_name,'grantor',pg_get_userbyid(grantor),'privilege',privilege_type,'grantable',is_grantable)
 from column_acl
 union all
 select 'effective_table_grants',object_name,
   case when allowed and nspname='velox_private' then 'BLOCKED' when allowed then 'REVIEW' else 'PASS' end,
   jsonb_build_object('role',rolname,'privilege',privilege,'allowed',allowed,'includes_inheritance_and_public',true)
 from effective_table_privileges
 union all
 select 'effective_column_grants',object_name,
   case when allowed and nspname='velox_private' then 'BLOCKED' when allowed then 'REVIEW' else 'PASS' end,
   jsonb_build_object('column',attname,'role',rolname,'privilege',privilege,'allowed',allowed,'includes_table_inheritance_and_public',true)
 from effective_column_privileges
 union all
 select 'schema_grants',n.nspname,
   case when a.privilege_type='CREATE' and (a.grantee=0 or pg_get_userbyid(a.grantee) in ('anon','authenticated')) then 'BLOCKED' else 'REVIEW' end,
   jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
     'privilege',a.privilege_type,'grantor',pg_get_userbyid(a.grantor),'grantable',a.is_grantable)
 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
 where n.nspname in ('public','storage','velox_private')
 union all
 select 'default_grants',coalesce(n.nspname,'ALL_SCHEMAS') || ':' || d.defaclobjtype::text,'REVIEW',
   jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
     'privilege',a.privilege_type,'grantable',a.is_grantable,'note','Default grants apply to future objects; review with current object grants.')
 from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace cross join lateral aclexplode(d.defaclacl) a
 where n.nspname in ('public','storage','velox_private') or d.defaclnamespace=0
 union all
 select 'legacy',check_name,case when missing_table or missing_column then 'NOT_INSTALLED'
   when limited_access or count is null then 'REVIEW'
   when check_name='historical_unverified_visits' and count>0 then 'REVIEW'
   when count>0 then 'BLOCKED' else 'PASS' end,
   jsonb_build_object('count',count,'missing_table',missing_table,'missing_required_column',missing_column,
     'limited_access',limited_access,'note','Counts require full visibility. Never infer consent/duration, repair rows or expose customer records.')
 from check_results
 union all
 select 'buckets',id,case when oid is null then 'NOT_INSTALLED'
   when not can_inspect_all_rows then 'REVIEW' when configuration is null then 'NOT_INSTALLED'
   when configuration->>'public'='true' then 'BLOCKED'
   when configuration->>'public' is distinct from 'false' or configuration->>'file_size_limit' is null
     or jsonb_typeof(configuration->'allowed_mime_types') is distinct from 'array' then 'REVIEW'
   when case when configuration->>'file_size_limit' ~ '^[0-9]+$'
     then (configuration->>'file_size_limit')::numeric<=0 or (configuration->>'file_size_limit')::numeric>26214400 else true end then 'BLOCKED'
   when jsonb_array_length(configuration->'allowed_mime_types')=0 then 'BLOCKED'
   when exists(select 1 from jsonb_array_elements_text(configuration->'allowed_mime_types') mime
     where mime is null or mime not in ('image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime')) then 'BLOCKED'
   else 'PASS' end,
   jsonb_build_object('configuration',configuration,'full_row_inspection',can_inspect_all_rows,
     'max_allowed_bytes',26214400,'note','Private bucket required. Stricter limits allowed; image RPC limit remains 3 MiB. Review compatibility and signed URLs separately.')
 from bucket_rows
 union all
 select 'migration_history',m.object_name,case when m.oid is null then 'NOT_INSTALLED'
   when not m.can_inspect_all_rows or m.payload is null or exists(select 1 from jsonb_array_elements(m.payload) v where v='null'::jsonb) then 'REVIEW'
   when exists(select 1 from expected_versions e where not m.payload ? e.version) then 'NOT_INSTALLED'
   when exists(select 1 from jsonb_array_elements_text(m.payload) v where not exists(select 1 from expected_versions e where e.version=v)) then 'REVIEW' else 'PASS' end,
   jsonb_build_object('observed_versions',m.payload,'expected_versions',(select jsonb_agg(version order by version) from expected_versions),
     'note','History is evidence only, not proof of schema equivalence. Missing history requires a reviewed baseline, never replay historical setup or demote administrators.')
 from metadata_payloads m where m.object_name='supabase_migrations.schema_migrations'
 union all
 select 'api_exposure','velox_private',case when exists(select 1 from exposure_settings
   cross join lateral regexp_split_to_table(replace(coalesce(value,''),'"',''),',') exposed_schema
   where btrim(exposed_schema)='velox_private') then 'BLOCKED' else 'REVIEW' end,
   jsonb_build_object('schema_exists',exists(select 1 from pg_namespace where nspname='velox_private'),
     'inspectable_settings',(select jsonb_agg(jsonb_build_object('source',source,'value',value)) from exposure_settings where value is not null),
     'note','Confirm actual Data API exposed schemas in dashboard/runtime. No SQL setting or a setting excluding velox_private does not prove the active API is private.')
 union all
 select 'cutover',wanted.name,case when f.oid is null then 'NOT_INSTALLED'
   when (select count(*) from client_roles)<>2 then 'REVIEW'
   when f.public_execute or exists(select 1 from client_roles r where has_function_privilege(r.oid,f.oid,'EXECUTE')) then 'BLOCKED' else 'PASS' end,
   jsonb_build_object('public_execute',f.public_execute,'client_execute',f.client_execute,'note','Legacy endpoint must lose browser EXECUTE at the coordinated frontend cutover.')
 from (values ('public.create_vehicle_with_credit(jsonb)'),('public.send_message_with_assistant(uuid,text)')) wanted(name)
 left join functions f on f.object_name=wanted.name
 union all
 select 'cutover','public.messages.INSERT',case when not exists(select 1 from relations where object_name='public.messages') then 'NOT_INSTALLED'
   when (select count(*) from client_roles)<>2 then 'REVIEW'
   when exists(select 1 from effective_column_privileges where object_name='public.messages' and privilege='INSERT' and allowed)
     or exists(select 1 from table_acl where object_name='public.messages' and privilege_type='INSERT' and grantee=0)
     or exists(select 1 from column_acl where object_name='public.messages' and privilege_type='INSERT' and grantee=0) then 'BLOCKED' else 'PASS' end,
   jsonb_build_object('note','Check all column grants as well as table grants, PUBLIC and inherited client privileges.')
 union all
 select 'extensions','btree_gist',case when e.oid is not null then 'PASS' when a.name is not null then 'NOT_INSTALLED' else 'REVIEW' end,
   jsonb_build_object('installed_version',e.extversion,'available_version',a.default_version,
     'note','Availability does not prove permission to install. Read-only audit never installs extensions.')
 from (values (1)) seed(id) left join pg_extension e on e.extname='btree_gist' left join pg_available_extensions a on a.name='btree_gist'
 union all
 select 'columns','public.appointments.' || wanted.name,case when a.attname is null then 'NOT_INSTALLED' else 'PASS' end,
   jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid))
 from (values ('buyer_id'),('seller_id'),('buyer_confirmed_at'),('seller_confirmed_at'),('duration_minutes'),('legacy_unverified')) wanted(name)
 left join relations r on r.object_name='public.appointments'
 left join pg_attribute a on a.attrelid=r.oid and a.attname=wanted.name and a.attnum>0 and not a.attisdropped
 left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
)
select * from (
select section,object_name,status,details from report
union all
select 'summary','rollout',case when exists(select 1 from report where status='BLOCKED') then 'BLOCKED'
  when exists(select 1 from report where status='NOT_INSTALLED') then 'NOT_INSTALLED' else 'REVIEW' end,
  jsonb_build_object('status_counts',(select jsonb_object_agg(status,count) from (select status,count(*) from report group by status) counts),
    'note','This read-only audit never approves rollout. Resolve every blocker, missing installation and review item; verify runtime API exposure and frontend/storage cutover separately.')
) output
order by section,object_name,details::text;

rollback;
