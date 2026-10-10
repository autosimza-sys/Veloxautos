import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { asUser, denied, ids, makeDatabase, root } from "./fixtures.mjs";

let db;
before(async () => { db = await makeDatabase(); });
after(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback; reset role"); });
const future = "2099-10-03T15:00:00Z";
async function propose({ actor = ids.buyer, conversation = ids.conversation, when = future, location = "Punto acordado" } = {}) {
  await asUser(db, actor);
  // One minute is synthetic fixture input, never a product/default duration.
  return (await db.query("select * from public.propose_appointment($1,$2,1,$3,$4)",
    [conversation, when, location, randomUUID()])).rows[0];
}
async function transition(appointment, actor, next, expected = appointment.status) {
  await asUser(db, actor);
  return (await db.query("select * from public.transition_appointment($1,$2,$3)", [appointment.id, expected, next])).rows[0];
}
async function privileged(sql, params = []) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub','',true)");
  return db.query(sql, params);
}

for (const [name, when] of [["past", "2000-01-01T00:00:00Z"], ["infinite", "infinity"], ["negative infinite", "-infinity"]]) {
  test(`appointment rejects ${name} time in the database`, async () => {
    await asUser(db, ids.buyer);
    await denied(db, () => propose({ when }), assert);
  });
}
test("malformed timestamp is rejected by PostgreSQL", async () => {
  await asUser(db, ids.buyer);
  await assert.rejects(() => propose({ when: "not-a-date" }), error => error.code === "22007");
});
test("appointment rejects blank location", async () => {
  await denied(db, () => propose({ location: "   " }), assert);
});
test("proposal has immutable participants and zero confirmations", async () => {
  const appointment = await propose();
  assert.equal(appointment.buyer_id, ids.buyer);
  assert.equal(appointment.seller_id, ids.seller);
  assert.equal(appointment.status, "proposed");
  assert.equal(appointment.buyer_confirmed_at, null);
  assert.equal(appointment.seller_confirmed_at, null);
});
test("proposal author cannot accept or reject their own proposal", async () => {
  const appointment = await propose();
  await denied(db, () => transition(appointment, ids.buyer, "accepted"), assert);
  await denied(db, () => transition(appointment, ids.buyer, "rejected"), assert);
});
for (const author of [ids.buyer, ids.seller]) {
  test(`both parties must consent, including when ${author === ids.buyer ? "buyer" : "seller"} proposes`, async () => {
    const counterpart = author === ids.buyer ? ids.seller : ids.buyer;
    const appointment = await propose({ actor: author });
    const accepted = await transition(appointment, counterpart, "accepted");
    assert.equal(accepted.status, "accepted");
    assert.ok(accepted[counterpart === ids.buyer ? "buyer_confirmed_at" : "seller_confirmed_at"]);
    assert.equal(accepted[author === ids.buyer ? "buyer_confirmed_at" : "seller_confirmed_at"], null);
    await denied(db, () => transition(accepted, counterpart, "confirmed"), assert);
    const confirmed = await transition(accepted, author, "confirmed");
    assert.equal(confirmed.status, "confirmed");
    assert.ok(confirmed.buyer_confirmed_at && confirmed.seller_confirmed_at);
  });
}
test("only legal transitions are accepted and terminal states stay terminal", async () => {
  const proposed = await propose();
  await denied(db, () => transition(proposed, ids.seller, "confirmed"), assert);
  const rejected = await transition(proposed, ids.seller, "rejected");
  assert.equal(rejected.status, "rejected");
  for (const next of ["proposed", "accepted", "confirmed", "cancelled", "nonsense"]) {
    await denied(db, () => transition(rejected, ids.buyer, next), assert);
  }
});
for (const state of ["proposed", "accepted"]) {
  test(`elapsed ${state} visit cannot advance but can be closed`, async () => {
    let appointment = await propose();
    if (state === "accepted") appointment = await transition(appointment, ids.seller, "accepted");
    // Simulate elapsed wall time without waiting or changing the production clock.
    await privileged("alter table public.appointments disable trigger guard_appointment_integrity");
    await privileged("update public.appointments set scheduled_at='2000-01-01T00:00:00Z' where id=$1", [appointment.id]);
    await privileged("alter table public.appointments enable trigger guard_appointment_integrity");
    await denied(db, () => transition(appointment, state === "proposed" ? ids.seller : ids.buyer, state === "proposed" ? "accepted" : "confirmed"), assert);
    const closed = await transition(appointment, ids.seller, state === "proposed" ? "rejected" : "cancelled");
    assert.equal(closed.status, state === "proposed" ? "rejected" : "cancelled");
  });
}
test("stale expected status cannot overwrite a newer decision", async () => {
  const proposed = await propose();
  await transition(proposed, ids.seller, "accepted");
  await denied(db, () => transition(proposed, ids.buyer, "cancelled"), assert);
  assert.equal((await db.query("select status from public.appointments where id=$1", [proposed.id])).rows[0].status, "accepted");
});
for (const status of ["proposed", "accepted", "confirmed"]) {
  test(`either participant can cancel ${status} visit`, async () => {
    let appointment = await propose();
    if (status !== "proposed") appointment = await transition(appointment, ids.seller, "accepted");
    if (status === "confirmed") appointment = await transition(appointment, ids.buyer, "confirmed");
    const cancelled = await transition(appointment, ids.seller, "cancelled");
    assert.equal(cancelled.status, "cancelled");
  });
}
test("identity, scheduling and confirmation fields are not client mutable", async () => {
  const appointment = await propose();
  for (const field of ["id", "conversation_id", "proposed_by", "buyer_id", "seller_id", "scheduled_at", "duration_minutes", "location", "status", "buyer_confirmed_at", "seller_confirmed_at", "created_at", "updated_at"]) {
    await denied(db, () => db.query(`update public.appointments set ${field}=${field} where id=$1`, [appointment.id]), assert);
  }
  await denied(db, () => db.query("delete from public.appointments where id=$1", [appointment.id]), assert);
});
test("forged initial status, participants and confirmations cannot be inserted", async () => {
  await asUser(db, ids.buyer);
  for (const extra of ["status", "buyer_id", "seller_id", "buyer_confirmed_at", "seller_confirmed_at"]) {
    const value = extra === "status" ? "'confirmed'" : extra.endsWith("_at") ? "now()" : `'${ids.stranger}'`;
    await denied(db, () => db.query(`insert into public.appointments(conversation_id,proposed_by,scheduled_at,location,${extra}) values ($1,$2,$3,'Lugar',${value})`, [ids.conversation, ids.buyer, future]), assert);
  }
  await denied(db, () => db.query("insert into public.appointments(conversation_id,proposed_by,scheduled_at,location) values ($1,$2,$3,'Lugar')", [ids.conversation, ids.seller, future]), assert);
});
test("stranger and admin have no chat appointment access", async () => {
  const appointment = await propose();
  for (const actor of [ids.stranger, ids.admin]) {
    await asUser(db, actor);
    assert.equal((await db.query("select * from public.appointments")).rows.length, 0);
    await denied(db, () => propose({ actor }), assert);
    await denied(db, () => transition(appointment, actor, "accepted"), assert);
  }
});
test("anonymous clients cannot read, create or transition visits", async () => {
  const appointment = await propose();
  await asUser(db, null);
  await denied(db, () => db.query("select * from public.appointments"), assert);
  await denied(db, () => transition(appointment, null, "accepted"), assert);
});
for (const blocked of ["conversation", "buyer", "seller"]) {
  test(`blocked ${blocked} prevents proposing and agreeing visits`, async () => {
    const appointment = await propose();
    if (blocked === "conversation") await privileged("update public.conversations set is_blocked=true where id=$1", [ids.conversation]);
    else await privileged("update public.profiles set is_blocked=true where id=$1", [ids[blocked]]);
    await denied(db, () => propose(), assert);
    await denied(db, () => transition(appointment, ids.seller, "accepted"), assert);
    await denied(db, () => transition(appointment, ids.seller, "rejected"), assert);
    if (blocked !== "conversation") {
      await denied(db, () => transition(appointment, ids[blocked], "cancelled"), assert);
    }
  });
}
for (const blocked of ["conversation", "buyer", "seller"]) {
  test(`blocked ${blocked} still prevents confirming an accepted visit`, async () => {
    const proposed = await propose();
    const accepted = await transition(proposed, ids.seller, "accepted");
    if (blocked === "conversation") await privileged("update public.conversations set is_blocked=true where id=$1", [ids.conversation]);
    else await privileged("update public.profiles set is_blocked=true where id=$1", [ids[blocked]]);
    await denied(db, () => transition(accepted, ids.buyer, "confirmed"), assert);
    assert.equal((await privileged("select status from public.appointments where id=$1", [accepted.id])).rows[0].status, "accepted");
  });
}
test("an active member can cancel an unreserved proposal in a blocked conversation", async () => {
  const proposed = await propose();
  await privileged("update public.conversations set is_blocked=true where id=$1", [ids.conversation]);
  assert.equal((await transition(proposed, ids.buyer, "cancelled")).status, "cancelled");
  assert.equal((await privileged("select count(*)::int as count from velox_private.appointment_reservations")).rows[0].count, 0);
});
for (const blocked of ["conversation", "counterparty"]) {
  for (const state of ["accepted", "confirmed"]) {
    for (const caller of [ids.buyer, ids.seller]) {
      test(`active ${caller === ids.buyer ? "buyer" : "seller"} cancels ${state} visit after ${blocked} block and frees both reservations`, async () => {
        let appointment = await propose();
        appointment = await transition(appointment, ids.seller, "accepted");
        if (state === "confirmed") appointment = await transition(appointment, ids.buyer, "confirmed");
        const counterpart = caller === ids.buyer ? ids.seller : ids.buyer;
        if (blocked === "conversation") await privileged("update public.conversations set is_blocked=true where id=$1", [ids.conversation]);
        else await privileged("update public.profiles set is_blocked=true where id=$1", [counterpart]);
        assert.equal((await transition(appointment, caller, "cancelled")).status, "cancelled");
        assert.equal((await privileged("select count(*)::int as count from velox_private.appointment_reservations where appointment_id=$1", [appointment.id])).rows[0].count, 0);

        const otherConversation = "30000000-0000-0000-0000-000000000002";
        const otherBuyer = caller === ids.buyer ? ids.buyer : ids.stranger;
        const otherSeller = caller === ids.buyer ? ids.stranger : ids.seller;
        await privileged("update public.vehicles set owner_id=$1 where id=$2", [otherSeller, ids.otherCar]);
        await privileged("insert into public.conversations(id,vehicle_id,buyer_id,seller_id) values ($1,$2,$3,$4)", [otherConversation, ids.otherCar, otherBuyer, otherSeller]);
        const fresh = await propose({ actor: otherBuyer, conversation: otherConversation });
        assert.equal((await transition(fresh, otherSeller, "accepted")).status, "accepted");
      });
    }
  }
}
test("blocked caller cannot cancel a reserved visit even after conversation blocking", async () => {
  const appointment = await propose();
  const accepted = await transition(appointment, ids.seller, "accepted");
  await privileged("update public.profiles set is_blocked=true where id=$1", [ids.buyer]);
  await privileged("update public.conversations set is_blocked=true where id=$1", [ids.conversation]);
  await denied(db, () => transition(accepted, ids.buyer, "cancelled"), assert);
  assert.equal((await privileged("select count(*)::int as count from velox_private.appointment_reservations where appointment_id=$1", [appointment.id])).rows[0].count, 2);
});
for (const shared of ["buyer", "seller"]) {
  test(`same instant cannot reserve ${shared} twice, across conversations`, async () => {
    const conversation = "30000000-0000-0000-0000-000000000002";
    await privileged("insert into public.conversations(id,vehicle_id,buyer_id,seller_id) values ($1,$2,$3,$4)",
      [conversation, shared === "buyer" ? ids.otherCar : ids.car, shared === "buyer" ? ids.buyer : ids.stranger, shared === "buyer" ? ids.stranger : ids.seller]);
    const first = await propose();
    const otherBuyer = shared === "buyer" ? ids.buyer : ids.stranger;
    const otherSeller = shared === "buyer" ? ids.stranger : ids.seller;
    const second = await propose({ actor: otherBuyer, conversation });
    const accepted = await transition(first, ids.seller, "accepted");
    await denied(db, () => transition(second, otherSeller, "accepted"), assert);
    await transition(accepted, ids.buyer, "cancelled");
    assert.equal((await transition(second, otherSeller, "accepted")).status, "accepted");
  });
}
for (const initialRole of ["buyer", "seller"]) {
  test(`one person cannot reserve the same instant as ${initialRole} and the opposite role`, async () => {
    const conversation = "30000000-0000-0000-0000-000000000002";
    const otherBuyer = initialRole === "buyer" ? ids.stranger : ids.seller;
    const otherSeller = initialRole === "buyer" ? ids.buyer : ids.stranger;
    await privileged("update public.vehicles set owner_id=$1 where id=$2", [otherSeller, ids.otherCar]);
    await privileged("insert into public.conversations(id,vehicle_id,buyer_id,seller_id) values ($1,$2,$3,$4)", [conversation, ids.otherCar, otherBuyer, otherSeller]);
    const first = await propose();
    const second = await propose({ actor: otherBuyer, conversation, when: "2099-10-03T12:00:00-03:00" });
    const accepted = await transition(first, ids.seller, "accepted");
    const confirmed = await transition(accepted, ids.buyer, "confirmed");
    await denied(db, () => transition(second, otherSeller, "accepted"), assert);
    await asUser(db, otherSeller);
    const unchanged = (await db.query("select * from public.appointments where id=$1", [second.id])).rows[0];
    assert.equal(unchanged.status, "proposed");
    assert.equal(unchanged.buyer_confirmed_at, null);
    assert.equal(unchanged.seller_confirmed_at, null);
    await transition(confirmed, ids.seller, "cancelled");
    assert.equal((await transition(second, otherSeller, "accepted")).status, "accepted");
  });
}
test("adjacent one-minute synthetic visits stay valid without a buffer", async () => {
  const first = await propose();
  const second = await propose({ when: "2099-10-03T15:01:00Z" });
  await transition(first, ids.seller, "accepted");
  assert.equal((await transition(second, ids.seller, "accepted")).status, "accepted");
});
test("unique partial indexes are the final arbiter, independent of SELECT snapshots", async () => {
  const { rows } = await db.query("select indexname, indexdef from pg_indexes where tablename='appointments' and indexname like 'appointments_reserved_%'");
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.match(row.indexdef, /CREATE UNIQUE INDEX/);
    assert.match(row.indexdef, /scheduled_at/);
    assert.match(row.indexdef, /accepted/);
    assert.match(row.indexdef, /confirmed/);
  }
});
test("private reservations have a unique person/instant key and no client privileges", async () => {
  const unique = (await db.query("select indexdef from pg_indexes where schemaname='velox_private' and tablename='appointment_reservations'")).rows;
  assert.ok(unique.some(row => /CREATE UNIQUE INDEX/.test(row.indexdef) && /\(user_id, scheduled_at\)/.test(row.indexdef)));
  for (const actor of [ids.buyer, ids.admin, null]) {
    await asUser(db, actor);
    await denied(db, () => db.query("select * from velox_private.appointment_reservations"), assert);
    await denied(db, () => db.query("delete from velox_private.appointment_reservations"), assert);
    await denied(db, () => db.query("insert into velox_private.appointment_reservations(appointment_id,user_id,scheduled_at) values ($1,$2,$3)", [ids.conversation, ids.buyer, future]), assert);
  }
});
test("reservation lifecycle inserts two rows atomically and cancellation releases both", async () => {
  const first = await propose();
  const second = await propose();
  const accepted = await transition(first, ids.seller, "accepted");
  await denied(db, () => transition(second, ids.seller, "accepted"), assert);
  let reservations = (await privileged("select appointment_id,user_id from velox_private.appointment_reservations order by user_id")).rows;
  assert.deepEqual(reservations, [ids.seller, ids.buyer].map(user_id => ({ appointment_id: first.id, user_id })));
  const confirmed = await transition(accepted, ids.buyer, "confirmed");
  assert.equal((await privileged("select count(*)::int as count from velox_private.appointment_reservations")).rows[0].count, 2);
  await transition(confirmed, ids.buyer, "cancelled");
  reservations = (await privileged("select * from velox_private.appointment_reservations")).rows;
  assert.equal(reservations.length, 0);
  await transition(second, ids.seller, "accepted");
  assert.equal((await privileged("select count(*)::int as count from velox_private.appointment_reservations")).rows[0].count, 2);
});
test("same instant expressed with a different UTC offset still conflicts", async () => {
  const first = await propose();
  const second = await propose({ when: "2099-10-03T12:00:00-03:00" });
  await transition(first, ids.seller, "accepted");
  await denied(db, () => transition(second, ids.seller, "accepted"), assert);
});
test("failed reservation does not leave partial consent behind", async () => {
  const first = await propose();
  const second = await propose();
  await transition(first, ids.seller, "accepted");
  await denied(db, () => transition(second, ids.seller, "accepted"), assert);
  const current = (await db.query("select * from public.appointments where id=$1", [second.id])).rows[0];
  assert.equal(current.status, "proposed");
  assert.equal(current.buyer_confirmed_at, null);
  assert.equal(current.seller_confirmed_at, null);
});
test("blocked account cannot read appointment history", async () => {
  await propose();
  await privileged("update public.profiles set is_blocked=true where id=$1", [ids.buyer]);
  await asUser(db, ids.buyer);
  assert.equal((await db.query("select * from public.appointments")).rows.length, 0);
});
test("migration can be reapplied with confirmed visits without losing consent", async () => {
  const isolated = await makeDatabase();
  try {
    await isolated.exec("begin");
    await asUser(isolated, ids.buyer);
    const appointment = (await isolated.query("select * from public.propose_appointment($1,$2,1,'Lugar',$3)", [ids.conversation, future, randomUUID()])).rows[0];
    await asUser(isolated, ids.seller);
    await isolated.query("select * from public.transition_appointment($1,'proposed','accepted')", [appointment.id]);
    await asUser(isolated, ids.buyer);
    const confirmed = (await isolated.query("select * from public.transition_appointment($1,'accepted','confirmed')", [appointment.id])).rows[0];
    await isolated.exec("commit; reset role");
    await isolated.exec(await readFile(path.join(root, "supabase/migrations/202610030004_appointment_integrity.sql"), "utf8"));
    await isolated.exec(await readFile(path.join(root, "supabase/migrations/202610030008_appointment_intervals.sql"), "utf8"));
    const current = (await isolated.query("select * from public.appointments where id=$1", [appointment.id])).rows[0];
    assert.equal(current.status, "confirmed");
    assert.deepEqual(current.buyer_confirmed_at, confirmed.buyer_confirmed_at);
    assert.deepEqual(current.seller_confirmed_at, confirmed.seller_confirmed_at);
    assert.equal((await isolated.query("select count(*)::int as count from velox_private.appointment_reservations")).rows[0].count, 2);
  } finally { await isolated.close(); }
});
for (const legacyStatus of ["accepted", "confirmed"]) {
  test(`legacy ${legacyStatus} visits stop rollout without fabricating consent or erasing data`, async () => {
    const isolated = await makeDatabase({ legacy: true });
    try {
      await isolated.query("insert into public.appointments(conversation_id,proposed_by,scheduled_at,location,status) values ($1,$2,$3,'Lugar',$4)", [ids.conversation, ids.buyer, future, legacyStatus]);
      await assert.rejects(() => isolated.exec(awaitMigration), error => error.code === "P0001" && /legacy/.test(error.message));
      await isolated.exec("rollback");
      assert.equal((await isolated.query("select status from public.appointments")).rows[0].status, legacyStatus);
      const columns = (await isolated.query("select column_name from information_schema.columns where table_name='appointments'")).rows.map(row => row.column_name);
      assert.ok(!columns.includes("buyer_confirmed_at"), "transactional migration rollback preserves old schema");
    } finally { await isolated.close(); }
  });
}
const awaitMigration = await readFile(path.join(root, "supabase/migrations/202610030004_appointment_integrity.sql"), "utf8");
