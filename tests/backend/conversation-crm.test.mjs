import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { asUser, denied, ids, makeDatabase, root } from "./fixtures.mjs";

let db;
const otherConversation = "30000000-0000-0000-0000-000000000002";
const inboxFields = ["id", "vehicle_id", "buyer_id", "seller_id", "is_blocked", "is_reported", "created_at", "lead_status", "vehicle_brand", "vehicle_model", "counterparty_name"].sort();
const adminFields = ["id", "vehicle_id", "buyer_id", "seller_id", "is_blocked", "is_reported", "created_at", "lead_status", "lead_updated_at", "vehicle_brand", "vehicle_model", "vehicle_year", "vehicle_zone", "vehicle_status", "buyer_name", "seller_name"].sort();

before(async () => { db = await makeDatabase(); });
after(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback; reset role"); });

async function inbox() { return (await db.query("select * from public.get_my_conversations()")).rows; }
async function adminLeads() { return (await db.query("select * from public.get_admin_leads()")).rows; }
async function setStatus(status, id = ids.conversation) {
  return (await db.query("select * from public.set_lead_status($1,$2)", [id, status])).rows;
}

for (const [caller, counterparty] of [["buyer", "seller"], ["seller", "buyer"]]) {
  test(`${caller} inbox returns only own conversations with minimal counterparty/vehicle labels`, async () => {
    await db.query("insert into public.conversations(id,vehicle_id,buyer_id,seller_id) values ($1,$2,$3,$4)", [otherConversation, ids.otherCar, ids.mechanic, ids.stranger]);
    await asUser(db, ids[caller]);
    const rows = await inbox();
    assert.equal(rows.length, 1);
    assert.deepEqual(Object.keys(rows[0]).sort(), inboxFields);
    assert.equal(rows[0].id, ids.conversation);
    assert.equal(rows[0].counterparty_name, counterparty);
    assert.equal(rows[0].vehicle_brand, "Test");
    assert.equal(rows[0].vehicle_model, "Car");
    assert.equal(rows[0].lead_status, "new");
    assert.equal((await db.query("select * from public.profiles where id=$1", [ids[counterparty]])).rows.length, 0);
  });
}

test("inbox business label falls back through trimmed display name and a generic label", async () => {
  await db.query("update public.profiles set business_name='  Autos Demo  ' where id=$1", [ids.seller]);
  await asUser(db, ids.buyer);
  assert.equal((await inbox())[0].counterparty_name, "Autos Demo");
  await db.exec("reset role");
  await db.query("update public.profiles set business_name=' ',display_name=' ' where id=$1", [ids.seller]);
  await asUser(db, ids.buyer);
  assert.equal((await inbox())[0].counterparty_name, "Usuario");
});

test("existing blocked chats and paused vehicles remain visible to active participants", async () => {
  await db.query("update public.conversations set is_blocked=true,is_reported=true where id=$1", [ids.conversation]);
  await db.query("update public.vehicles set status='paused' where id=$1", [ids.car]);
  await asUser(db, ids.buyer);
  assert.equal((await inbox())[0].is_blocked, true);
  assert.equal((await inbox())[0].is_reported, true);
});

test("strangers and a nonparticipant admin cannot use inbox to browse other chats", async () => {
  for (const id of [ids.stranger, ids.admin, ids.mechanic]) {
    await asUser(db, id);
    assert.deepEqual(await inbox(), []);
  }
});

test("blocked and missing-profile callers cannot retrieve inbox or CRM metadata", async () => {
  await db.query("update public.profiles set is_blocked=true where id=$1", [ids.buyer]);
  for (const id of [ids.buyer, ids.blocked, "10000000-0000-0000-0000-000000000099"]) {
    await asUser(db, id);
    assert.deepEqual(await inbox(), []);
    assert.deepEqual(await adminLeads(), []);
    await denied(db, () => setStatus("interested"), assert);
  }
});

test("anon has no execute grant for inbox, admin CRM or status mutations", async () => {
  await asUser(db, null);
  await denied(db, () => inbox(), assert);
  await denied(db, () => adminLeads(), assert);
  await denied(db, () => setStatus("interested"), assert);
});

test("admin CRM exposes exact minimal metadata, never message bodies or phones", async () => {
  await db.query("insert into public.messages(conversation_id,sender_id,body) values ($1,$2,'PRIVATE_MESSAGE_SENTINEL')", [ids.conversation, ids.buyer]);
  await asUser(db, ids.admin);
  const rows = await adminLeads();
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]).sort(), adminFields);
  assert.equal(rows[0].buyer_name, "buyer");
  assert.equal(rows[0].seller_name, "seller");
  assert.equal(rows[0].vehicle_status, "active");
  assert.doesNotMatch(JSON.stringify(rows), /phone|PRIVATE_MESSAGE_SENTINEL|sender_id|body/);
  assert.equal((await db.query("select * from public.conversations")).rows.length, 0);
  assert.equal((await db.query("select * from public.messages")).rows.length, 0);
});

test("only an active admin can list all CRM metadata", async () => {
  for (const id of [ids.buyer, ids.seller, ids.mechanic, ids.stranger]) {
    await asUser(db, id);
    assert.deepEqual(await adminLeads(), []);
  }
  await db.exec("reset role");
  await db.query("update public.profiles set is_blocked=true where id=$1", [ids.admin]);
  await asUser(db, ids.admin);
  assert.deepEqual(await adminLeads(), []);
  await denied(db, () => setStatus("closed"), assert);
});

test("role revocation immediately removes CRM read and write access", async () => {
  await asUser(db, ids.admin);
  assert.equal((await adminLeads()).length, 1);
  await db.exec("reset role");
  await db.query("update public.profiles set role='registered' where id=$1", [ids.admin]);
  await asUser(db, ids.admin);
  assert.deepEqual(await adminLeads(), []);
  await denied(db, () => setStatus("closed"), assert);
});

test("admin can move each lead state via narrow RPC without altering identity or flags", async () => {
  await asUser(db, ids.admin);
  for (const status of ["new", "interested", "visit_scheduled", "visited", "closed", "lost"]) {
    const rows = await setStatus(status);
    assert.deepEqual(Object.keys(rows[0]).sort(), ["id", "lead_status", "lead_updated_at"]);
    assert.equal(rows[0].id, ids.conversation);
    assert.equal(rows[0].lead_status, status);
    assert.ok(rows[0].lead_updated_at);
    const lead = (await adminLeads())[0];
    assert.equal(lead.buyer_id, ids.buyer);
    assert.equal(lead.seller_id, ids.seller);
    assert.equal(lead.vehicle_id, ids.car);
    assert.equal(lead.is_blocked, false);
    assert.equal(lead.is_reported, false);
  }
  await asUser(db, ids.buyer);
  assert.equal((await inbox())[0].lead_status, "lost");
});

test("participants, other sellers and mechanics cannot set lead status", async () => {
  for (const id of [ids.buyer, ids.seller, ids.stranger, ids.mechanic]) {
    await asUser(db, id);
    await denied(db, () => setStatus("closed"), assert);
    await denied(db, () => db.query("update public.conversations set lead_status='closed' where id=$1", [ids.conversation]), assert);
  }
});

test("invalid and null statuses fail atomically; missing conversation does not claim success", async () => {
  await asUser(db, ids.admin);
  for (const status of [null, "", "NEW", "unknown", "closed; drop table profiles"]) {
    await denied(db, () => setStatus(status), assert);
    assert.equal((await adminLeads())[0].lead_status, "new");
  }
  await denied(db, () => setStatus("closed", otherConversation), assert);
  await denied(db, () => setStatus("closed", null), assert);
});

test("status timestamp records changes and is preserved for identical retries", async () => {
  await asUser(db, ids.admin);
  const first = (await setStatus("interested"))[0];
  const retry = (await setStatus("interested"))[0];
  assert.deepEqual(retry, first);
});

test("even admin browser grants cannot directly rewrite conversation identity or lifecycle", async () => {
  for (const id of [ids.buyer, ids.seller, ids.admin]) {
    await asUser(db, id);
    for (const assignment of ["buyer_id=seller_id", "seller_id=buyer_id", "vehicle_id=vehicle_id", "id=id", "created_at=now()", "lead_updated_at=now()", "lead_status='closed'"]) {
      await denied(db, () => db.query(`update public.conversations set ${assignment} where id=$1`, [ids.conversation]), assert);
    }
  }
});

test("buyer creation defaults lead status and rejects injected state, timestamps or flags", async () => {
  await asUser(db, ids.buyer);
  for (const [column, value] of [["lead_status", "'closed'"], ["lead_updated_at", "now()"], ["created_at", "now()"], ["is_blocked", "true"], ["is_reported", "true"], ["id", `'${otherConversation}'`]]) {
    await denied(db, () => db.query(`insert into public.conversations(vehicle_id,buyer_id,seller_id,${column}) values ($1,$2,$3,${value})`, [ids.otherCar, ids.buyer, ids.stranger]), assert);
  }
  const result = await db.query("insert into public.conversations(vehicle_id,buyer_id,seller_id) values ($1,$2,$3) returning lead_status,lead_updated_at", [ids.otherCar, ids.buyer, ids.stranger]);
  assert.equal(result.rows[0].lead_status, "new");
  assert.ok(result.rows[0].lead_updated_at);
});

test("database check constraint rejects out-of-contract statuses even for trusted SQL", async () => {
  await denied(db, () => db.query("update public.conversations set lead_status='unknown'"), assert);
});

test("CRM migration is replay-safe and preserves lead progress and messages", async () => {
  const isolated = await makeDatabase();
  try {
    await isolated.query("update public.conversations set lead_status='visited',lead_updated_at='2026-09-30T00:00:00Z' where id=$1", [ids.conversation]);
    await isolated.query("insert into public.messages(conversation_id,sender_id,body) values ($1,$2,'Preserved')", [ids.conversation, ids.buyer]);
    await isolated.exec(await readFile(path.join(root, "supabase/migrations/202610030003_conversation_crm.sql"), "utf8"));
    const row = (await isolated.query("select lead_status,lead_updated_at from public.conversations where id=$1", [ids.conversation])).rows[0];
    assert.equal(row.lead_status, "visited");
    assert.equal(row.lead_updated_at.toISOString(), "2026-09-30T00:00:00.000Z");
    assert.equal((await isolated.query("select body from public.messages")).rows[0].body, "Preserved");
    assert.equal((await isolated.query("select count(*)::int as count from public.vehicles")).rows[0].count, 3);
  } finally { await isolated.close(); }
});
