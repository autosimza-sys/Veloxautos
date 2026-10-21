import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { ids, makeDatabase, root } from "./fixtures.mjs";

const preflight = await readFile(path.join(root, "scripts/staging-preflight.sql"), "utf8");
const cutover = await readFile(path.join(root, "scripts/finalize-client-cutover.sql"), "utf8");

async function report(db) {
  let statements;
  try { statements = await db.exec(preflight); }
  catch (error) { throw new Error(`Preflight ${error.code} at ${error.position}: ${error.message}`); }
  const result = statements.flatMap((statement) => statement.rows ?? []);
  assert.ok(result.length > 0);
  assert.ok(result.every((row) => ["PASS", "BLOCKED", "REVIEW", "NOT_INSTALLED"].includes(row.status)));
  return result;
}

test('phase-2 function fingerprints match LF source used by Git and Linux CI', async () => {
  const db=await makeDatabase();
  try {
    const source=(await readFile(path.join(root,'supabase/migrations/202610090006_authorized_booking.sql'),'utf8')).replaceAll('\r\n','\n');
    const definitions=source.match(/create(?: or replace)? function[\s\S]*?\$\$;/g);
    assert.equal(definitions.length,8);
    for(const definition of definitions)await db.exec(definition.replace(/^create function/,'create or replace function'));
    const rows=await report(db);
    for(const definition of definitions){
      const name=definition.match(/function ([^(]+)/)[1];
      const fn=rows.find(r=>r.section==='functions'&&r.object_name.startsWith(name+'('));
      assert.equal(fn?.status,'PASS',name);
    }
  } finally { await db.close(); }
});

function row(rows, section, name) {
  const match = rows.find((entry) => entry.section === section && entry.object_name === name);
  assert.ok(match, `${section}: ${name} must be reported`);
  return match;
}

test("preflight reports a missing installation without resolving nonexistent tables, roles or RPCs", async () => {
  const db = new PGlite();
  try {
    const rows = await report(db);
    assert.equal(row(rows, "relations", "public.appointments").status, "NOT_INSTALLED");
    assert.equal(row(rows, "legacy", "visits_without_verifiable_consent").status, "NOT_INSTALLED");
    assert.equal(row(rows, "migration_history", "supabase_migrations.schema_migrations").status, "NOT_INSTALLED");
    assert.notEqual(row(rows, "summary", "rollout").status, "PASS");
  } finally { await db.close(); }
});

test("legacy accepted and confirmed visits block without consent or duration columns and are never repaired", async () => {
  const db = await makeDatabase({ legacy: true, productionDrift: true });
  try {
    for (const status of ["accepted", "confirmed"]) {
      await db.query("insert into public.appointments(conversation_id,proposed_by,scheduled_at,location,status) values ($1,$2,'2099-10-03T15:00:00Z','PRIVATE_LOCATION_SENTINEL',$3)", [ids.conversation, ids.buyer, status]);
    }
    const before = (await db.query("select jsonb_agg(to_jsonb(a) order by a.id) as value from public.appointments a")).rows;
    const rows = await report(db);
    assert.equal(row(rows, "legacy", "visits_without_verifiable_consent").status, "BLOCKED");
    assert.equal(row(rows, "legacy", "visits_without_verifiable_consent").details.count, 2);
    assert.equal(row(rows, "legacy", "active_visits_without_explicit_duration").status, "BLOCKED");
    assert.equal(row(rows, "legacy", "active_visits_without_explicit_duration").details.count, 2);
    assert.equal(row(rows, "relations", "velox_private.appointment_reservations").status, "NOT_INSTALLED");
    assert.equal(row(rows, "functions", "public.is_admin()").status, "BLOCKED");
    for (const name of ["public.conversations.admin_update_conversations", "public.vehicles.admin_update_vehicles"]) {
      assert.equal(row(rows, "policies", name).status, "BLOCKED");
    }
    assert.equal(row(rows, "policies", "public.profiles.profiles_own_read").status, "REVIEW");
    assert.deepEqual((await db.query("select jsonb_agg(to_jsonb(a) order by a.id) as value from public.appointments a")).rows, before);
    assert.equal((await db.query("select count(*)::int as n from information_schema.columns where table_name='appointments' and column_name in ('duration_minutes','buyer_confirmed_at','seller_confirmed_at')")).rows[0].n, 0);
    const output = JSON.stringify(rows);
    for (const privateValue of [ids.buyer, ids.seller, ids.conversation, "PRIVATE_LOCATION_SENTINEL", "@example.invalid", "test-seller-phone"]) assert.ok(!output.includes(privateValue));
  } finally { await db.close(); }
});

test("preflight inventories every public table, policy definition, PUBLIC grant and column grant", async () => {
  const db = await makeDatabase();
  try {
    await db.exec(`create table public.extra_audit_table (id integer, secret text);
      grant select (secret) on public.extra_audit_table to public;
      create policy unexpected_any_authenticated on public.messages for select to authenticated using (true);`);
    const rows = await report(db);
    assert.equal(row(rows, "relations", "public.extra_audit_table").status, "BLOCKED");
    assert.equal(row(rows, "policies", "public.messages.unexpected_any_authenticated").status, "REVIEW");
    assert.ok(rows.some((entry) => entry.section === "column_grants" && entry.details.grantee === "PUBLIC" && entry.details.column === "secret"));
    assert.ok(rows.some((entry) => entry.section === "table_grants" && entry.details.grantee === "authenticated"));
    const policy = row(rows, "policies", "public.messages.messages_members_read");
    for (const key of ["roles", "command", "permissive", "using", "with_check"]) assert.ok(Object.hasOwn(policy.details, key));
    assert.equal(rows.filter((entry) => entry.section === "relations" && entry.object_name.startsWith("public.") && entry.details.exists).length,
      (await db.query("select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','f')")).rows[0].n);
  } finally { await db.close(); }
});

test("known dangerous additive policies block, including owner-folder uploads that lack seller or blocked checks", async () => {
  const db = await makeDatabase();
  try {
    await db.exec(`create policy vehicle_media_public_read on storage.objects for select to public using (bucket_id='vehicle-media');
      create policy vehicle_media_auth_upload on storage.objects for insert to authenticated with check (bucket_id='vehicle-media' and (storage.foldername(name))[1]=auth.uid()::text);
      create policy admin_select_messages on public.messages for select to authenticated using (public.is_admin());
      create policy admin_select_conversations on public.conversations for select to authenticated using (public.is_admin());`);
    const rows = await report(db);
    for (const name of ["storage.objects.vehicle_media_public_read", "storage.objects.vehicle_media_auth_upload", "public.messages.admin_select_messages", "public.conversations.admin_select_conversations"]) {
      assert.equal(row(rows, "policies", name).status, "BLOCKED");
    }
  } finally { await db.close(); }
});

test("same-name policy drift and unsafe function settings remain visible", async () => {
  const db = await makeDatabase();
  try {
    await db.exec(`alter policy messages_members_read on public.messages using (true);
      create function public.unexpected_definer() returns boolean language sql security definer as $$ select true $$;`);
    const rows = await report(db);
    assert.equal(row(rows, "policies", "public.messages.messages_members_read").status, "REVIEW");
    const fn = row(rows, "functions", "public.unexpected_definer()");
    assert.equal(fn.status, "BLOCKED");
    assert.equal(fn.details.public_execute, true);
    assert.equal(fn.details.search_path, null);
    assert.ok(fn.details.owner);
    assert.ok(fn.details.definition_fingerprint);
  } finally { await db.close(); }
});

test("final schema and cutover have inspectable legacy and RPC gates without claiming rollout readiness", async () => {
  const db = await makeDatabase({ productionDrift: true });
  try {
    await db.exec(cutover);
    const rows = await report(db);
    assert.equal(row(rows, "legacy", "visits_without_verifiable_consent").status, "PASS");
    assert.equal(row(rows, "legacy", "active_visits_without_explicit_duration").status, "PASS");
    assert.equal(row(rows, "cutover", "public.create_vehicle_with_credit(jsonb)").status, "PASS");
    assert.equal(row(rows, "cutover", "public.send_message_with_assistant(uuid,text)").status, "PASS");
    assert.equal(row(rows, "cutover", "public.messages.INSERT").status, "PASS");
    assert.equal(row(rows, "functions", "public.is_admin()").status, "PASS");
    assert.equal(row(rows, "functions", "public.send_message_idempotent(uuid,text,uuid)").status, "PASS", "reviewed rate-limiter body matches hosted and migrated source");
    assert.equal(row(rows, "functions", "public.get_vehicle_catalog()").status, "PASS", "legacy privacy projection must match the full replacement");
    assert.equal(row(rows, "buckets", "vehicle-media").status, "PASS");
    assert.equal(row(rows, "buckets", "inspection-media").status, "PASS");
    const requiredPolicies = rows.filter((entry) => entry.section === "policies" && !entry.details.optional_observed_policy);
    assert.ok(requiredPolicies.length > 40);
    assert.deepEqual(requiredPolicies.filter((entry) => entry.status !== "PASS").map(entry=>entry.object_name), []);
    for (const name of ["public.claim_ai_reply(uuid,uuid,integer,integer)", "public.finish_ai_reply(uuid,uuid,text)", "public.manage_launch_promotion(text,integer,timestamp with time zone,jsonb)", "public.configure_launch_credit_policy(integer,integer,boolean)", "public.configure_launch_role_credit_policy(integer,jsonb,integer,boolean)", "public.get_publication_quote()", "public.publish_vehicle_with_credit(jsonb,jsonb,uuid)", "public.create_vehicle_with_credit(jsonb)", "velox_private.apply_global_credit_expiry()", "velox_private.guard_launch_publication()"]) {
      assert.equal(row(rows, "functions", name).status, "PASS", name);
    }
    assert.equal(row(rows, "api_exposure", "velox_private").status, "REVIEW");
    assert.notEqual(row(rows, "summary", "rollout").status, "PASS");
  } finally { await db.close(); }
});

test('preflight detects restored mutable storage policies and disabled content guard',async()=>{
  const db=await makeDatabase();
  try {
    const before=await report(db);
    assert.equal(row(before,'functions','velox_private.guard_vehicle_content()').status,'PASS');
    assert.equal(row(before,'triggers','public.vehicles.guard_vehicle_content').status,'PASS');
    await db.exec(`create policy vehicle_storage_update_own_folder on storage.objects for update to authenticated using (true);
      create policy vehicle_storage_delete_own_folder on storage.objects for delete to authenticated using (true);
      alter table public.vehicles disable trigger guard_vehicle_content;`);
    const after=await report(db);
    for(const name of ['vehicle_storage_update_own_folder','vehicle_storage_delete_own_folder'])
      assert.equal(row(after,'policies','storage.objects.'+name).status,'BLOCKED');
    assert.equal(row(after,'triggers','public.vehicles.guard_vehicle_content').status,'BLOCKED');
  }finally{await db.close();}
});

test('normal migration path installs cleanup guards; preflight rejects grant and trigger drift',async()=>{
  const db=await makeDatabase();
  try{
    const before=await report(db);
    for(const name of ['public.claim_storage_cleanup(uuid,text,text,integer)','public.complete_storage_cleanup(uuid)','public.storage_cleanup_preview(integer)','public.reserve_vehicle_upload(text,bigint,text,text)','velox_private.cleanup_old_enough(jsonb,integer)','velox_private.storage_path_referenced(text)','velox_private.guard_cleanup_avatar_reference()','velox_private.guard_cleanup_payload_reference()','velox_private.guard_cleanup_media_link()','velox_private.guard_cleanup_object()'])
      assert.equal(row(before,'functions',name).status,'PASS',name);
    for(const name of ['public.vehicle_media.guard_cleanup_media','public.inspection_media.guard_cleanup_media','public.publication_drafts.guard_cleanup_payload','public.publication_requests.guard_cleanup_payload','public.profiles.guard_cleanup_avatar','storage.objects.a_guard_cleanup_object'])
      assert.equal(row(before,'triggers',name).status,'PASS',name);
    for(const name of ['public.storage_cleanup_preview(integer)','public.claim_storage_cleanup(uuid,text,text,integer)','public.complete_storage_cleanup(uuid)'])
      assert.equal(row(before,'cleanup_access',name).status,'PASS',name);
    await db.exec('grant execute on function public.claim_storage_cleanup(uuid,text,text,integer) to authenticated; alter table public.publication_drafts disable trigger guard_cleanup_payload; alter table velox_private.storage_cleanup_claims disable row level security;');
    const after=await report(db);
    assert.equal(row(after,'cleanup_access','public.claim_storage_cleanup(uuid,text,text,integer)').status,'BLOCKED');
    assert.equal(row(after,'triggers','public.publication_drafts.guard_cleanup_payload').status,'BLOCKED');
    assert.equal(row(after,'relations','velox_private.storage_cleanup_claims').status,'BLOCKED');
  }finally{await db.close();}
});

test("required missing columns and removed RPCs are explicit and do not abort other checks", async () => {
  const db = await makeDatabase({ legacy: true });
  try {
    await db.exec("alter table public.inspection_media rename column kind to legacy_kind; drop function public.send_message_with_assistant(uuid,text)");
    const rows = await report(db);
    assert.equal(row(rows, "legacy", "reports_without_traceable_completion").status, "NOT_INSTALLED");
    assert.equal(row(rows, "legacy", "reports_without_traceable_completion").details.missing_required_column, true);
    assert.equal(row(rows, "cutover", "public.send_message_with_assistant(uuid,text)").status, "NOT_INSTALLED");
    assert.equal(row(rows, "legacy", "inconsistent_credit_balances").status, "PASS");
  } finally { await db.close(); }
});

test("bucket metadata absence never passes, and public, oversized or unrestricted MIME configurations block", async () => {
  const db = await makeDatabase({ legacy: true });
  try {
    await db.exec("alter table storage.buckets drop column file_size_limit; alter table storage.buckets drop column allowed_mime_types; update storage.buckets set public=false");
    const missing = await report(db);
    assert.equal(row(missing, "buckets", "vehicle-media").status, "REVIEW");
    await db.exec("alter table storage.buckets add column file_size_limit bigint; alter table storage.buckets add column allowed_mime_types text[]; update storage.buckets set public=true,file_size_limit=26214400,allowed_mime_types=array['image/jpeg']");
    assert.equal(row(await report(db), "buckets", "vehicle-media").status, "BLOCKED");
    await db.exec("update storage.buckets set public=false,file_size_limit=26214401");
    assert.equal(row(await report(db), "buckets", "vehicle-media").status, "BLOCKED");
    await db.exec("update storage.buckets set file_size_limit=26214400,allowed_mime_types=array['image/*']");
    assert.equal(row(await report(db), "buckets", "vehicle-media").status, "BLOCKED");
    await db.exec("update storage.buckets set allowed_mime_types=array[null]::text[]");
    assert.equal(row(await report(db), "buckets", "vehicle-media").status, "BLOCKED");
    await db.exec("update storage.buckets set file_size_limit=3145728,allowed_mime_types=array['image/jpeg']");
    assert.equal(row(await report(db), "buckets", "vehicle-media").status, "PASS");
  } finally { await db.close(); }
});

test("all application triggers include signup, credits, guards and reservation interval wiring", async () => {
  const db = await makeDatabase();
  try {
    const rows = await report(db);
    const names = [
      "auth.users.create_profile_after_signup",
      "public.profiles.profiles_grant_initial_credits",
      "public.appointments.guard_appointment_duration",
      "public.appointments.guard_appointment_integrity",
      "public.conversations.guard_conversation_moderation",
      "public.inspection_requests.guard_inspection_assignment",
      "public.inspection_requests.guard_inspection_completion",
      "velox_private.appointment_reservations.set_appointment_reservation_interval",
    ];
    for (const name of names) {
      const trigger = row(rows, "triggers", name);
      assert.equal(trigger.status, "PASS");
      assert.equal(trigger.details.enabled, "O");
      assert.match(trigger.details.definition, /EXECUTE FUNCTION/);
      assert.ok(trigger.details.function);
      assert.ok(trigger.details.table);
    }
  } finally { await db.close(); }
});

test("missing, disabled or rewired critical triggers block while unknown triggers require review", async () => {
  const db = await makeDatabase();
  try {
    await db.exec(`drop trigger guard_appointment_integrity on public.appointments;
      alter table public.appointments disable trigger guard_appointment_duration;
      drop trigger profiles_grant_initial_credits on public.profiles;
      create trigger profiles_grant_initial_credits after insert on public.profiles for each row execute function public.create_profile_for_new_user();
      create trigger unknown_visit_trigger before update on public.appointments for each row execute function velox_private.guard_appointment_duration();`);
    const rows = await report(db);
    for (const name of ["public.appointments.guard_appointment_integrity", "public.appointments.guard_appointment_duration", "public.profiles.profiles_grant_initial_credits"]) {
      assert.equal(row(rows, "triggers", name).status, "BLOCKED");
    }
    assert.equal(row(rows, "triggers", "public.appointments.unknown_visit_trigger").status, "REVIEW");
    assert.equal(row(rows, "functions", "velox_private.guard_appointment_integrity()").status, "PASS", "function existence alone cannot establish trigger enforcement");
  } finally { await db.close(); }
});

test("visible private API exposure blocks and transaction-local settings are restored", async () => {
  const db = await makeDatabase();
  try {
    await db.exec(`set pgrst.db_schemas='public, "velox_private" '; set search_path=public; set row_security=on`);
    const rows = await report(db);
    assert.equal(row(rows, "api_exposure", "velox_private").status, "BLOCKED");
    assert.equal(row(rows, "context", "read_only_audit").details.transaction_read_only, "on");
    assert.equal((await db.query("show search_path")).rows[0].search_path, "public");
    assert.equal((await db.query("show row_security")).rows[0].row_security, "on");
    assert.equal((await db.query("show transaction_read_only")).rows[0].transaction_read_only, "off");
  } finally { await db.close(); }
});

test("limited reviewers cannot mistake RLS-filtered counts or unavailable settings for clean data", async () => {
  const db = await makeDatabase();
  try {
    await db.exec("revoke select on storage.buckets from authenticated; set role authenticated");
    const rows = await report(db);
    assert.equal(row(rows, "legacy", "visits_without_verifiable_consent").status, "REVIEW");
    assert.equal(row(rows, "legacy", "visits_without_verifiable_consent").details.count, null);
    assert.equal(row(rows, "buckets", "vehicle-media").status, "REVIEW");
    assert.notEqual(row(rows, "summary", "rollout").status, "PASS");
  } finally { await db.close(); }
});

test('upload admission and paged catalog are fingerprinted and a disabled admission guard blocks rollout',async()=>{
 const db=await makeDatabase();
 try{
  const before=await report(db);
  for(const name of ['public.reserve_vehicle_upload(text,bigint,text,text)','public.finish_vehicle_upload(text,boolean,text)','velox_private.consume_vehicle_upload()','public.get_vehicle_catalog_page(integer,jsonb,jsonb)'])
   assert.equal(row(before,'functions',name).status,'PASS',name);
  assert.equal(row(before,'triggers','storage.objects.consume_vehicle_upload').status,'PASS');
  await db.exec('alter table storage.objects disable trigger consume_vehicle_upload');
  assert.equal(row(await report(db),'triggers','storage.objects.consume_vehicle_upload').status,'BLOCKED');
 }finally{await db.close();}
});
