import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { asUser, denied, ids, makeDatabase, root } from "./fixtures.mjs";

let db;
before(async () => { db = await makeDatabase({ legacy: process.env.VELOX_TEST_LEGACY === "1" }); });
after(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback; reset role"); });

test("anonymous catalog masks price/km and does not expose profile phones", async () => {
  await asUser(db, null);
  const { rows } = await db.query("select * from public.get_vehicle_catalog()");
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.price === null && row.kilometers === null));
  assert.equal((await db.query("select * from public.profiles")).rows.length, 0);
  assert.equal((await db.query("select * from public.vehicles")).rows.length, 0);
});

test("anonymous visitor can read linked active vehicle media, never paused media", async () => {
  await asUser(db, null);
  assert.equal((await db.query("select * from public.vehicle_media")).rows.length, 2);
  assert.equal((await db.query("select * from storage.objects where bucket_id='vehicle-media'")).rows.length, 2);
});

test("buyer sees registered catalog values but cannot directly select another owner's row", async () => {
  await asUser(db, ids.buyer);
  assert.equal((await db.query("select price from public.get_vehicle_catalog() limit 1")).rows[0].price, 1000000);
  assert.equal((await db.query("select * from public.vehicles")).rows.length, 0);
});

test("buyer can start a conversation about someone else's active vehicle", async () => {
  await asUser(db, ids.buyer);
  const result = await db.query(`insert into public.conversations(vehicle_id,buyer_id,seller_id)
    values ($1,$2,$3) returning id`, [ids.otherCar, ids.buyer, ids.stranger]);
  assert.equal(result.rows.length, 1);
});

test("buyer cannot create a conversation with a forged seller", async () => {
  await asUser(db, ids.buyer);
  await denied(db, () => db.query(`insert into public.conversations(vehicle_id,buyer_id,seller_id)
    values ($1,$2,$3)`, [ids.otherCar, ids.buyer, ids.seller]), assert);
});

test("buyer cannot create a conversation about a paused vehicle", async () => {
  await asUser(db, ids.buyer);
  await denied(db, () => db.query(`insert into public.conversations(vehicle_id,buyer_id,seller_id)
    values ($1,$2,$3)`, [ids.pausedCar, ids.buyer, ids.seller]), assert);
});

test("buyer can request inspection with no assignment on another owner's active vehicle", async () => {
  await asUser(db, ids.buyer);
  const result = await db.query(`insert into public.inspection_requests(vehicle_id,requested_by)
    values ($1,$2) returning assigned_mechanic,status`, [ids.otherCar, ids.buyer]);
  assert.deepEqual(result.rows, [{ assigned_mechanic: null, status: "requested" }]);
});

test("seller cannot self-assign an inspection or mint a professional report", async () => {
  await asUser(db, ids.seller);
  await denied(db, () => db.query(`insert into public.inspection_requests
    (vehicle_id,requested_by,assigned_mechanic,status) values ($1,$2,$2,'assigned')`, [ids.car, ids.seller]), assert);
});

test("assigned mechanic cannot retarget a request to another vehicle", async () => {
  await asUser(db, ids.mechanic);
  await denied(db, () => db.query("update public.inspection_requests set vehicle_id=$1 where id=$2", [ids.otherCar, ids.request]), assert);
});

test("assigned mechanic cannot change who requested inspection", async () => {
  await asUser(db, ids.mechanic);
  await denied(db, () => db.query("update public.inspection_requests set requested_by=$1 where id=$2", [ids.stranger, ids.request]), assert);
});

test("assigned mechanic cannot reassign their inspection", async () => {
  await asUser(db, ids.mechanic);
  await denied(db, () => db.query("update public.inspection_requests set assigned_mechanic=$1 where id=$2", [ids.stranger, ids.request]), assert);
});

test("admin can assign to an active mechanic but cannot assign a seller", async () => {
  const unassigned = "40000000-0000-4000-8000-000000000099";
  await db.query("insert into public.inspection_requests(id,vehicle_id,requested_by) values($1,$2,$3)", [unassigned,ids.car,ids.stranger]);
  await asUser(db, ids.admin);
  assert.equal((await db.query("update public.inspection_requests set assigned_mechanic=$1,status='assigned' where id=$2 returning id", [ids.mechanic, unassigned])).rows.length, 1);
  await denied(db, () => db.query("update public.inspection_requests set assigned_mechanic=$1 where id=$2", [ids.seller, unassigned]), assert);
});

test("only requester and assigned mechanic can read a private report and its stored files", async () => {
  for (const [id, expected] of [[ids.buyer, 1], [ids.mechanic, 1], [ids.seller, 0], [ids.stranger, 0], [null, 0]]) {
    await asUser(db, id);
    if (!id) {
      await denied(db, () => db.query("select * from public.inspection_reports"), assert);
    } else {
      assert.equal((await db.query("select * from public.inspection_reports")).rows.length, expected);
    }
    assert.equal((await db.query("select * from storage.objects where bucket_id='inspection-media'")).rows.length, expected);
  }
});

test("mechanic context exposes the assigned owner's phone only to active mechanic/admin", async () => {
  await asUser(db, ids.mechanic);
  assert.equal((await db.query("select * from public.get_assigned_inspection_context()")).rows[0].owner_phone, "test-seller-phone");
  await asUser(db, ids.seller);
  assert.equal((await db.query("select * from public.get_assigned_inspection_context()")).rows.length, 0);
});

test("revoking mechanic role removes legacy assignment access and phone disclosure", async () => {
  await db.query("update public.profiles set role='registered' where id=$1", [ids.mechanic]);
  await asUser(db, ids.mechanic);
  assert.equal((await db.query("select * from public.get_assigned_inspection_context()")).rows.length, 0);
  assert.equal((await db.query("select * from public.inspection_reports")).rows.length, 0);
});

test("published report is immutable through direct writes and cannot move to another request", async () => {
  await asUser(db, ids.mechanic);
  await denied(db, () => db.query("update public.inspection_reports set observations='Revisado' where id=$1 returning id", [ids.report]), assert);
  await denied(db, () => db.query("update public.inspection_reports set request_id=request_id where id=$1", [ids.report]), assert);
});

test("inspection upload requires an active assigned mechanic and the request path", async () => {
  await asUser(db, ids.seller);
  await denied(db, () => db.query("insert into storage.objects(bucket_id,name) values ('inspection-media',$1)", [`${ids.seller}/${ids.request}/fake.jpg`]), assert);
  await asUser(db, ids.mechanic);
  await db.query("select public.reserve_vehicle_upload($1,100,'image/jpeg','inspection-media')",[`${ids.mechanic}/${ids.request}/extra.jpg`]);
  assert.equal((await db.query("insert into storage.objects(bucket_id,name,metadata) values ('inspection-media',$1,'{\"size\":100,\"mimetype\":\"image/jpeg\"}') returning id", [`${ids.mechanic}/${ids.request}/extra.jpg`])).rows.length, 1);
  await denied(db, () => db.query("insert into storage.objects(bucket_id,name) values ('inspection-media',$1)", [`${ids.mechanic}/unassigned/extra.jpg`]), assert);
});

test("a seller cannot attach another seller's storage path to their own vehicle", async () => {
  await asUser(db, ids.seller);
  await denied(db, () => db.query("insert into public.vehicle_media(vehicle_id,media_type,storage_path) values ($1,'photo',$2)", [ids.car, `${ids.stranger}/${ids.otherCar}.jpg`]), assert);
});

test("a chat member cannot mark a manual message as an automated response", async () => {
  await asUser(db, ids.buyer);
  await denied(db, () => db.query("insert into public.messages(conversation_id,sender_id,body,is_automated) values ($1,$2,'fake',true)", [ids.conversation, ids.buyer]), assert);
});

test("a blocked account cannot use the definer message RPC", async () => {
  await db.query("update public.profiles set is_blocked=true where id=$1", [ids.buyer]);
  await asUser(db, ids.buyer);
  await denied(db, () => db.query("select public.send_message_with_assistant($1,'Hola')", [ids.conversation]), assert);
});

test("assistant never claims a paused vehicle is available", async () => {
  await db.query("update public.vehicles set status='paused' where id=$1", [ids.car]);
  await asUser(db, ids.buyer);
  await db.query("select public.send_message_with_assistant($1,'Esta disponible?')", [ids.conversation]);
  const { rows } = await db.query("select body from public.messages where is_automated");
  assert.equal(rows.length, 1);
  assert.doesNotMatch(rows[0].body, /^Si,/);
  assert.match(rows[0].body, /no esta activa|no est[aá] disponible|confirmar/i);
});

test("assistant does not treat 'sigue haciendo ruidos' as an availability question", async () => {
  await asUser(db, ids.buyer);
  const { rows } = await db.query("select public.send_message_with_assistant($1,'Sigue haciendo ruidos?') as result", [ids.conversation]);
  assert.equal(rows[0].result.automated, false);
});

test("normal buyer message and automated answer remain attributed separately", async () => {
  await asUser(db, ids.buyer);
  await db.query("select public.send_message_with_assistant($1,'Cual es el precio?')", [ids.conversation]);
  const { rows } = await db.query("select sender_id,is_automated from public.messages order by is_automated");
  assert.deepEqual(rows, [{ sender_id: ids.buyer, is_automated: false }, { sender_id: ids.seller, is_automated: true }]);
});

test("a chat member cannot undo another member's block or clear a report", async () => {
  await db.query("update public.conversations set is_blocked=true,is_reported=true where id=$1", [ids.conversation]);
  await asUser(db, ids.buyer);
  await denied(db, () => db.query("update public.conversations set is_blocked=false where id=$1", [ids.conversation]), assert);
  await denied(db, () => db.query("update public.conversations set is_reported=false where id=$1", [ids.conversation]), assert);
});

test("a blocked account cannot edit conversation moderation flags", async () => {
  await db.query("update public.profiles set is_blocked=true where id=$1", [ids.buyer]);
  await asUser(db, ids.buyer);
  assert.equal((await db.query("update public.conversations set is_blocked=true where id=$1 returning id", [ids.conversation])).rows.length, 0);
});

test("unlinked upload cleanup is reserved to maintenance so it cannot race publication", async () => {
  await asUser(db, ids.seller);
  const objectName = `${ids.seller}/not-linked-yet.jpg`;
  await db.query("select public.reserve_vehicle_upload($1,100,'image/jpeg')",[objectName]);
  await db.query("insert into storage.objects(bucket_id,name,metadata) values ('vehicle-media',$1,'{\"size\":100,\"mimetype\":\"image/jpeg\"}') returning id", [objectName]);
  assert.equal((await db.query("delete from storage.objects where bucket_id='vehicle-media' and name=$1 returning id", [objectName])).rows.length, 0);
});

test("a nonmechanic cannot insert a report for an existing assignment", async () => {
  await asUser(db, ids.seller);
  await denied(db, () => db.query(`insert into public.inspection_reports(request_id,mechanic_id,odometer,result)
    values ($1,$2,12345,'approved')`, [ids.request, ids.seller]), assert);
});

test("profile role and blocked status cannot be changed by the account owner", async () => {
  await asUser(db, ids.seller);
  await denied(db, () => db.query("update public.profiles set role='admin' where id=$1", [ids.seller]), assert);
  await denied(db, () => db.query("update public.profiles set is_blocked=false where id=$1", [ids.seller]), assert);
});

test("signup metadata cannot grant admin or mechanic role", async () => {
  for (const role of ["admin", "mechanic"]) {
    const id = `60000000-0000-0000-0000-00000000000${role === "admin" ? "1" : "2"}`;
    await db.query("insert into auth.users values ($1,$2,$3)", [id, `${role}@example.invalid`, { role }]);
    assert.equal((await db.query("select role from public.profiles where id=$1", [id])).rows[0].role, "registered");
  }
});

test("anonymous clients cannot execute private inspection context or message RPCs", async () => {
  await asUser(db, null);
  await denied(db, () => db.query("select * from public.get_assigned_inspection_context()"), assert);
  await denied(db, () => db.query("select public.send_message_with_assistant($1,'Hola')", [ids.conversation]), assert);
});

test("failed vehicle creation does not consume a credit", async () => {
  await asUser(db, ids.seller);
  const beforeBalance = (await db.query("select used from public.credit_balances where user_id=$1", [ids.seller])).rows[0].used;
  await db.exec("savepoint invalid_vehicle");
  await assert.rejects(() => db.query("select * from public.create_vehicle_with_credit('{}')"), (error) => error.code === "23502");
  await db.exec("rollback to savepoint invalid_vehicle");
  assert.equal((await db.query("select used from public.credit_balances where user_id=$1", [ids.seller])).rows[0].used, beforeBalance);
});

test("last credit is consumed once and another publication is rejected", async () => {
  await db.query("update public.credit_balances set used=granted-1 where user_id=$1", [ids.seller]);
  await asUser(db, ids.seller);
  const payload = { brand: "Test", model: "Last", version: "Base", year: 2020, kilometers: 100, price: 1000000, zone: "Mendoza" };
  await db.query("select * from public.create_vehicle_with_credit($1)", [payload]);
  await denied(db, () => db.query("select * from public.create_vehicle_with_credit($1)", [payload]), assert);
  const balance = (await db.query("select used,granted from public.credit_balances where user_id=$1", [ids.seller])).rows[0];
  assert.equal(balance.used, balance.granted);
  assert.equal((await db.query("select * from public.credit_ledger where user_id=$1 and kind='publication'", [ids.seller])).rows.length, 1);
});

test("expired credits reject publishing without changing the ledger", async () => {
  await db.query("update public.credit_balances set expires_at=now()-interval '1 day' where user_id=$1", [ids.seller]);
  await asUser(db, ids.seller);
  await denied(db, () => db.query("select * from public.create_vehicle_with_credit('{}')"), assert);
  assert.equal((await db.query("select * from public.credit_ledger where user_id=$1 and kind='publication'", [ids.seller])).rows.length, 0);
});

test("repair migration can be reapplied without deleting vehicle or inspection data", { skip: process.env.VELOX_TEST_LEGACY === "1" }, async () => {
  const isolated = await makeDatabase();
  try {
    await isolated.exec(await readFile(path.join(root, "supabase/migrations/202610030001_pilot_security_fixes.sql"), "utf8"));
    assert.equal((await isolated.query("select count(*)::int as count from public.vehicles")).rows[0].count, 3);
    assert.equal((await isolated.query("select count(*)::int as count from public.inspection_reports")).rows[0].count, 1);
  } finally {
    await isolated.close();
  }
});
