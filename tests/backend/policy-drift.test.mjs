import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { asUser, denied, ids, makeDatabase, root } from "./fixtures.mjs";

const migration = "20261004040715_reconcile_policy_drift.sql";
async function reapply() {
  const sql = (await readFile(path.join(root, "supabase/migrations", migration), "utf8"))
    .replace(/^begin;$/m, "").replace(/^commit;$/m, "");
  return db.exec(sql);
}
let db;
before(async () => { db = await makeDatabase({ productionDrift: true }); });
after(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec("begin");
  await db.query("insert into public.messages(conversation_id,sender_id,body) values ($1,$2,'Synthetic private message')", [ids.conversation, ids.buyer]);
  await db.query("insert into storage.objects(bucket_id,name) values ('vehicle-media',$1)", [`${ids.seller}/unlinked-private.jpg`]);
});
afterEach(async () => { await db.exec("rollback; reset role"); });

test("drift: anonymous storage SELECT does not expose paused or unlinked files", async () => {
  await asUser(db, null);
  const rows = (await db.query("select name from storage.objects where bucket_id='vehicle-media' order by name")).rows;
  assert.deepEqual(rows.map(row => row.name).sort(), [`${ids.seller}/${ids.car}.jpg`, `${ids.stranger}/${ids.otherCar}.jpg`].sort());
});

test("drift: registered buyer cannot upload despite knowing their own folder", async () => {
  await asUser(db, ids.buyer);
  await denied(db, () => db.query("insert into storage.objects(bucket_id,name) values ('vehicle-media',$1)", [`${ids.buyer}/forbidden.jpg`]), assert);
});

test("drift: blocked seller cannot use the extra authenticated upload policy", async () => {
  await db.query("update public.profiles set is_blocked=true where id=$1", [ids.seller]);
  await asUser(db, ids.seller);
  await denied(db, () => db.query("insert into storage.objects(bucket_id,name) values ('vehicle-media',$1)", [`${ids.seller}/forbidden.jpg`]), assert);
});

test("drift: active seller can still upload only to their own folder", async () => {
  await asUser(db, ids.seller);
  await db.query("insert into storage.objects(bucket_id,name) values ('vehicle-media',$1)", [`${ids.seller}/allowed.jpg`]);
  await denied(db, () => db.query("insert into storage.objects(bucket_id,name) values ('vehicle-media',$1)", [`${ids.stranger}/forbidden.jpg`]), assert);
});

test("drift: administrator cannot SELECT another conversation or message body", async () => {
  await asUser(db, ids.admin);
  assert.equal((await db.query("select * from public.conversations")).rows.length, 0);
  assert.equal((await db.query("select * from public.messages")).rows.length, 0);
});

test("drift: participants retain chat history and administrator retains scoped CRM", async () => {
  await asUser(db, ids.buyer);
  assert.equal((await db.query("select * from public.conversations")).rows.length, 1);
  assert.equal((await db.query("select body from public.messages")).rows[0].body, "Synthetic private message");
  await asUser(db, ids.admin);
  const leads = (await db.query("select * from public.get_admin_leads()")).rows;
  assert.equal(leads.length, 1);
  assert.ok(!Object.hasOwn(leads[0], "body"));
  assert.equal((await db.query("select role from public.profiles where id=$1", [ids.admin])).rows[0].role, "admin");
});

test("drift: an administrator who is a participant retains only their own chat", async () => {
  await db.query("insert into public.conversations(id,vehicle_id,buyer_id,seller_id) values ('30000000-0000-0000-0000-000000000099',$1,$2,$3)", [ids.car, ids.admin, ids.seller]);
  await db.query("insert into public.messages(conversation_id,sender_id,body) values ('30000000-0000-0000-0000-000000000099',$1,'Own participant history')", [ids.seller]);
  await asUser(db, ids.admin);
  assert.equal((await db.query("select * from public.conversations")).rows.length, 1);
  assert.deepEqual((await db.query("select body from public.messages")).rows, [{ body: "Own participant history" }]);
});

test("drift: blocked administrator is not privileged through the overwritten helper", async () => {
  await db.query("update public.profiles set is_blocked=true where id=$1", [ids.admin]);
  await asUser(db, ids.admin);
  assert.equal((await db.query("select public.is_admin() as allowed")).rows[0].allowed, false);
  assert.deepEqual((await db.query("select * from public.get_admin_leads()")).rows, []);
  assert.equal((await db.query("select * from public.conversations")).rows.length, 0);
  assert.equal((await db.query("select * from public.messages")).rows.length, 0);
});

test("drift: both media buckets are private with a finite ingest limit and MIME allowlist", async () => {
  const rows = (await db.query("select id,public,file_size_limit,allowed_mime_types from storage.buckets order by id")).rows;
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.public, false);
    assert.equal(Number(row.file_size_limit), 25 * 1024 * 1024);
    assert.deepEqual(row.allowed_mime_types, ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime"]);
  }
});

test("drift: reapplication preserves stricter bucket limits and unrelated policies", async () => {
  await db.exec("create policy unrelated_storage_review on storage.objects for select to authenticated using (bucket_id='unrelated-test-bucket');");
  await db.query("update storage.buckets set file_size_limit=$1,allowed_mime_types=$2 where id='vehicle-media'", [1024, ["image/jpeg"]]);
  const roles = (await db.query("select id,role from public.profiles order by id")).rows;
  await reapply();
  const bucket = (await db.query("select public,file_size_limit,allowed_mime_types from storage.buckets where id='vehicle-media'")).rows[0];
  assert.equal(bucket.public, false);
  assert.equal(Number(bucket.file_size_limit), 1024);
  assert.deepEqual(bucket.allowed_mime_types, ["image/jpeg"]);
  assert.equal((await db.query("select 1 from pg_policies where policyname='unrelated_storage_review'")).rows.length, 1);
  assert.deepEqual((await db.query("select id,role from public.profiles order by id")).rows, roles);
});

test("drift: an existing image wildcard narrows to supported images without adding video", async () => {
  await db.query("update storage.buckets set allowed_mime_types=$1 where id='vehicle-media'", [["image/*"]]);
  await reapply();
  assert.deepEqual((await db.query("select allowed_mime_types from storage.buckets where id='vehicle-media'")).rows[0].allowed_mime_types, ["image/jpeg", "image/png", "image/webp"]);
});

test("drift: incompatible existing ingest settings block instead of silently widening", async () => {
  await db.query("update storage.buckets set public=true,allowed_mime_types=$1 where id='vehicle-media'", [["application/pdf"]]);
  await denied(db, () => reapply(), assert);
  const row = (await db.query("select public,allowed_mime_types from storage.buckets where id='vehicle-media'")).rows[0];
  assert.equal(row.public, true);
  assert.deepEqual(row.allowed_mime_types, ["application/pdf"]);
});

test("drift: absent buckets stop the delta and unrelated bucket settings stay unchanged", async () => {
  await db.query("insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('unrelated-test-bucket','Other',true,null,null)");
  await reapply();
  assert.deepEqual((await db.query("select public,file_size_limit,allowed_mime_types from storage.buckets where id='unrelated-test-bucket'")).rows[0], { public: true, file_size_limit: null, allowed_mime_types: null });
  await db.exec("delete from storage.objects where bucket_id='inspection-media'; delete from storage.buckets where id='inspection-media'");
  await denied(db, () => reapply(), assert);
});

test("drift: only six explicitly superseded policies are removed", async () => {
  const policies = (await db.query("select policyname from pg_policies")).rows.map(row => row.policyname);
  for (const name of ["vehicle_media_public_read", "vehicle_media_auth_upload", "admin_select_messages", "admin_select_conversations", "admin_update_conversations", "admin_update_vehicles"]) assert.ok(!policies.includes(name), name);
  for (const name of ["profiles_admin_read_all", "profiles_own_read", "profiles_own_update", "vehicle_storage_read_linked_media", "vehicle_storage_insert_own_folder"]) assert.ok(policies.includes(name), name);
});

test("drift: is_admin uses a fixed empty search_path and keeps the expected callable ACL", async () => {
  const { rows: [row] } = await db.query("select proconfig from pg_proc where oid='public.is_admin()'::regprocedure");
  assert.deepEqual(row.proconfig, ['search_path=""']);
  for (const user of [null, ids.buyer, ids.admin]) {
    await asUser(db, user);
    assert.equal((await db.query("select public.is_admin() as allowed")).rows[0].allowed, user === ids.admin);
  }
});

test("fresh installation: historical plan defaults never allow browser reads or writes", async () => {
  for (const user of [null, ids.buyer, ids.admin]) {
    await asUser(db, user);
    assert.deepEqual((await db.query("select * from public.plans")).rows, []);
    assert.deepEqual((await db.query("update public.plans set monthly_price=1 returning id")).rows, []);
    await denied(db, () => db.query("insert into public.plans(id,name) values ('forged','Unapproved')"), assert);
  }
});
