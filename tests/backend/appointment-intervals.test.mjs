import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { asUser, denied, ids, makeDatabase, root } from "./fixtures.mjs";

let db;
before(async () => { db = await makeDatabase(); });
after(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback; reset role"); });
const start = "2099-10-03T15:00:00Z";
async function propose({ actor = ids.buyer, conversation = ids.conversation, when = start, duration = 30, location = "Lugar", request = randomUUID() } = {}) {
  await asUser(db, actor);
  return (await db.query("select * from public.propose_appointment($1,$2,$3,$4,$5)", [conversation, when, duration, location, request])).rows[0];
}
async function change(appointment, actor, next) {
  await asUser(db, actor);
  return (await db.query("select * from public.transition_appointment($1,$2,$3)", [appointment.id, appointment.status, next])).rows[0];
}
async function privileged(sql, params = []) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub','',true)");
  return db.query(sql, params);
}

test("proposals require explicit positive integral duration with no database default", async () => {
  for (const duration of [null, 0, -1]) await denied(db, () => propose({ duration }), assert);
  await db.exec("savepoint invalid_duration");
  await assert.rejects(() => propose({ duration: 1.5 }), error => error.code === "22P02");
  await db.exec("rollback to savepoint invalid_duration");
  const defaults = (await privileged("select column_default,is_nullable from information_schema.columns where table_schema='public' and table_name='appointments' and column_name='duration_minutes'")).rows;
  // Nullable only for already-closed legacy history; trigger/CHECK reject a
  // missing duration on new proposals and all active rows.
  assert.deepEqual(defaults, [{ column_default: null, is_nullable: "YES" }]);
});
for (const [name, when, duration] of [
  ["partial tail", "2099-10-03T15:20:00Z", 30],
  ["partial head", "2099-10-03T14:40:00Z", 30],
  ["inside", "2099-10-03T15:10:00Z", 5],
  ["containing", "2099-10-03T14:50:00Z", 60],
  ["same interval different offset", "2099-10-03T12:00:00-03:00", 30],
]) {
  test(`interval reservation rejects ${name} overlap without partial state`, async () => {
    const first = await propose();
    const second = await propose({ when, duration });
    await change(first, ids.seller, "accepted");
    await denied(db, () => change(second, ids.seller, "accepted"), assert);
    const unchanged = (await db.query("select * from public.appointments where id=$1", [second.id])).rows[0];
    assert.equal(unchanged.status, "proposed");
    assert.equal(unchanged.buyer_confirmed_at, null);
    assert.equal(unchanged.seller_confirmed_at, null);
    assert.equal((await privileged("select count(*)::int as count from velox_private.appointment_reservations")).rows[0].count, 2);
  });
}
for (const when of ["2099-10-03T14:30:00Z", "2099-10-03T15:30:00Z"]) {
  test(`semi-open adjacent interval ${when} is allowed`, async () => {
    const first = await propose();
    const adjacent = await propose({ when });
    await change(first, ids.seller, "accepted");
    assert.equal((await change(adjacent, ids.seller, "accepted")).status, "accepted");
  });
}
for (const role of ["buyer", "seller"]) {
  test(`partial overlap rejects one person crossing from ${role} to opposite role`, async () => {
    const otherConversation = "30000000-0000-0000-0000-000000000002";
    const buyer = role === "buyer" ? ids.stranger : ids.seller;
    const seller = role === "buyer" ? ids.buyer : ids.stranger;
    await privileged("update public.vehicles set owner_id=$1 where id=$2", [seller, ids.otherCar]);
    await privileged("insert into public.conversations(id,vehicle_id,buyer_id,seller_id) values($1,$2,$3,$4)", [otherConversation, ids.otherCar, buyer, seller]);
    const first = await propose();
    const other = await propose({ actor: buyer, conversation: otherConversation, when: "2099-10-03T15:29:00Z" });
    let reserved = await change(first, ids.seller, "accepted");
    reserved = await change(reserved, ids.buyer, "confirmed");
    await denied(db, () => change(other, seller, "accepted"), assert);
    await change(reserved, ids.buyer, "cancelled");
    assert.equal((await change(other, seller, "accepted")).status, "accepted");
  });
}
test("GiST exclusion uses user equality and range intersection, with half-open periods", async () => {
  const first = await propose();
  await change(first, ids.seller, "accepted");
  const { rows } = await privileged("select lower_inc(reserved_during) as inclusive_start,upper_inc(reserved_during) as inclusive_end,upper(reserved_during)-lower(reserved_during)=interval '30 minutes' as correct_duration from velox_private.appointment_reservations");
  assert.equal(rows.length, 2);
  assert.ok(rows.every(row => row.inclusive_start && !row.inclusive_end && row.correct_duration));
  const constraints = (await privileged("select pg_get_constraintdef(oid) as definition from pg_constraint where conname='appointment_reservations_no_overlap'")).rows;
  assert.match(constraints[0].definition, /EXCLUDE USING gist \(user_id WITH =, reserved_during WITH &&\)/);
});
test("retry uses the same appointment, including changed lifecycle state", async () => {
  const request = randomUUID();
  const first = await propose({ request });
  const accepted = await change(first, ids.seller, "accepted");
  const repeated = await propose({ request, location: "  Lugar  ", when: "2099-10-03T12:00:00-03:00" });
  assert.equal(repeated.id, first.id);
  assert.equal(repeated.status, accepted.status);
  const confirmed = await change(accepted, ids.buyer, "confirmed");
  assert.equal((await propose({ request })).status, "confirmed");
  await change(confirmed, ids.buyer, "cancelled");
  assert.equal((await propose({ request })).status, "cancelled");
  assert.equal((await db.query("select count(*)::int as count from public.appointments")).rows[0].count, 1);
  // Same content with a new explicit intention is not incorrectly deduplicated.
  assert.notEqual((await propose()).id, first.id);
});
test("a successful request remains idempotent across committed transactions", async () => {
  const isolated = await makeDatabase();
  const request = randomUUID();
  try {
    await isolated.exec("begin");
    await asUser(isolated, ids.buyer);
    const first = (await isolated.query("select * from public.propose_appointment($1,$2,45,'Lugar',$3)", [ids.conversation,start,request])).rows[0];
    await isolated.exec("commit; begin");
    await asUser(isolated, ids.buyer);
    const repeated = (await isolated.query("select * from public.propose_appointment($1,$2,45,'Lugar',$3)", [ids.conversation,start,request])).rows[0];
    assert.equal(repeated.id, first.id);
    assert.equal((await isolated.query("select count(*)::int as count from public.appointments")).rows[0].count, 1);
    await isolated.exec("commit");
  } finally { await isolated.close(); }
});
test("duration and interval reservation cannot be silently edited", async () => {
  const appointment = await propose();
  await privileged("select 1");
  await denied(db, () => db.query("update public.appointments set duration_minutes=60 where id=$1", [appointment.id]), assert);
});
test("missing request, empty location and impossible interval are rejected atomically", async () => {
  await denied(db, () => propose({ request: null }), assert);
  await denied(db, () => propose({ location: " \n\t " }), assert);
  await db.exec("savepoint overflowing_interval");
  await assert.rejects(() => propose({ when: "294276-12-01T00:00:00Z", duration: 2147483647 }), error => ["22008", "22015"].includes(error.code));
  await db.exec("rollback to savepoint overflowing_interval");
});
test("one request ID cannot be replayed with a changed payload", async () => {
  const request = randomUUID();
  await propose({ request });
  for (const changed of [{ duration: 31 }, { location: "Otro lugar" }, { when: "2099-10-03T15:01:00Z" }]) {
    await denied(db, () => propose({ request, ...changed }), assert);
  }
  const anotherConversation = "30000000-0000-0000-0000-000000000002";
  await privileged("insert into public.conversations(id,vehicle_id,buyer_id,seller_id) values($1,$2,$3,$4)",[anotherConversation,ids.otherCar,ids.buyer,ids.stranger]);
  await denied(db, () => propose({ request, conversation: anotherConversation }), assert);
  assert.equal((await db.query("select count(*)::int as count from public.appointments")).rows[0].count, 1);
});
test("request IDs are scoped by proposer, never by another account", async () => {
  const request = randomUUID();
  const buyer = await propose({ request });
  const seller = await propose({ request, actor: ids.seller });
  assert.notEqual(buyer.id, seller.id);
  assert.equal(seller.proposed_by, ids.seller);
});
test("private proposal requests and direct appointment inserts remain inaccessible", async () => {
  await propose();
  await denied(db, () => db.query("select * from velox_private.appointment_proposal_requests"), assert);
  await denied(db, () => db.query("insert into public.appointments(conversation_id,proposed_by,scheduled_at,duration_minutes,location) values($1,$2,$3,30,'Lugar')", [ids.conversation, ids.buyer, start]), assert);
  await denied(db, () => db.query("update public.appointments set duration_minutes=60"), assert);
});
for (const blocked of ["conversation", "buyer", "seller"]) {
  test(`new and replayed proposals stay forbidden with ${blocked} blocked`, async () => {
    const request = randomUUID();
    await propose({ request });
    if (blocked === "conversation") await privileged("update public.conversations set is_blocked=true where id=$1", [ids.conversation]);
    else await privileged("update public.profiles set is_blocked=true where id=$1", [ids[blocked]]);
    await denied(db, () => propose({ request }), assert);
    await denied(db, () => propose(), assert);
  });
}
test("failed request does not persist an idempotency claim or proposal", async () => {
  await denied(db, () => propose({ location: "   " }), assert);
  assert.equal((await privileged("select count(*)::int as count from velox_private.appointment_proposal_requests")).rows[0].count, 0);
  assert.equal((await privileged("select count(*)::int as count from public.appointments")).rows[0].count, 0);
});
test("retry after trusted deletion preserves a tombstone instead of recreating a visit", async () => {
  const request = randomUUID();
  const first = await propose({ request });
  await privileged("delete from public.appointments where id=$1", [first.id]);
  await denied(db, () => propose({ request }), assert);
  assert.equal((await privileged("select count(*)::int as count from public.appointments")).rows[0].count, 0);
});
test("anonymous, outsider and nonparticipant admin cannot propose or read proposal keys", async () => {
  for (const actor of [null, ids.stranger, ids.admin]) {
    await asUser(db, actor);
    await denied(db, () => propose({ actor }), assert);
    await denied(db, () => db.query("select * from velox_private.appointment_proposal_requests"), assert);
  }
});
test("migration refuses existing interval conflicts without changing visits or reservations", async () => {
  const isolated = await makeDatabase();
  try {
    await isolated.exec("begin");
    await asUser(isolated, ids.buyer);
    const first = (await isolated.query("select * from public.propose_appointment($1,$2,30,'Lugar',$3)", [ids.conversation,start,randomUUID()])).rows[0];
    const second = (await isolated.query("select * from public.propose_appointment($1,'2099-10-03T15:20:00Z',30,'Lugar',$2)", [ids.conversation,randomUUID()])).rows[0];
    await asUser(isolated, ids.seller);
    await isolated.query("select * from public.transition_appointment($1,'proposed','accepted')",[first.id]);
    await isolated.exec("reset role; alter table velox_private.appointment_reservations drop constraint appointment_reservations_no_overlap");
    await asUser(isolated, ids.seller);
    await isolated.query("select * from public.transition_appointment($1,'proposed','accepted')",[second.id]);
    await isolated.exec("commit; reset role");
    await assert.rejects(() => isolated.exec(intervalMigration), error => error.code === "23P01");
    await isolated.exec("rollback");
    assert.equal((await isolated.query("select count(*)::int as count from public.appointments where status='accepted'")).rows[0].count,2);
    assert.equal((await isolated.query("select count(*)::int as count from velox_private.appointment_reservations")).rows[0].count,4);
  } finally { await isolated.close(); }
});
test("closed legacy history migrates without inventing duration or reopening visits", async () => {
  const isolated = await makeDatabase({ legacy: true });
  try {
    for (const name of (await readdir(path.join(root,"supabase/migrations"))).filter(name => name.startsWith("20261003") && name < "202610030005").sort()) {
      await isolated.exec(await readFile(path.join(root,"supabase/migrations",name),"utf8"));
    }
    await isolated.exec("begin");
    for (const terminal of ["cancelled","rejected"]) {
      await asUser(isolated, ids.buyer);
      const visit = (await isolated.query("insert into public.appointments(conversation_id,proposed_by,scheduled_at,location) values($1,$2,$3,'Legacy') returning *", [ids.conversation,ids.buyer,start])).rows[0];
      await asUser(isolated, terminal === "cancelled" ? ids.buyer : ids.seller);
      await isolated.query("select * from public.transition_appointment($1,'proposed',$2)",[visit.id,terminal]);
    }
    await isolated.exec("commit; reset role");
    await isolated.exec(intervalMigration);
    const history = (await isolated.query("select status,duration_minutes from public.appointments order by status")).rows;
    assert.deepEqual(history,[{status:"cancelled",duration_minutes:null},{status:"rejected",duration_minutes:null}]);
    assert.equal((await isolated.query("select count(*)::int as count from velox_private.appointment_reservations")).rows[0].count,0);
    await isolated.exec("begin");
    await asUser(isolated, ids.buyer);
    await denied(isolated, () => isolated.query("select * from public.propose_appointment($1,$2,null,'Lugar',$3)",[ids.conversation,start,randomUUID()]),assert);
    await isolated.exec("rollback");
  } finally { await isolated.close(); }
});
test("legacy duration preflight aborts atomically without inventing minutes", async () => {
  const isolated = await makeDatabase({ legacy: true });
  try {
    for (const name of (await readdir(path.join(root,"supabase/migrations"))).filter(name => name.startsWith("20261003") && name < "202610030005").sort()) {
      await isolated.exec(await readFile(path.join(root,"supabase/migrations",name),"utf8"));
    }
    await isolated.exec("begin");
    await asUser(isolated, ids.buyer);
    await isolated.query("insert into public.appointments(conversation_id,proposed_by,scheduled_at,location) values($1,$2,$3,'Legacy')", [ids.conversation,ids.buyer,start]);
    await isolated.exec("commit; reset role");
    const migration = await readFile(path.join(root,"supabase/migrations/202610030008_appointment_intervals.sql"),"utf8");
    await assert.rejects(() => isolated.exec(migration), error => error.code === "P0001" && /duraci[oó]n|duration/i.test(error.message));
    await isolated.exec("rollback");
    assert.equal((await isolated.query("select count(*)::int as count from public.appointments")).rows[0].count,1);
    assert.equal((await isolated.query("select count(*)::int as count from information_schema.columns where table_schema='public' and table_name='appointments' and column_name='duration_minutes'")).rows[0].count,0);
  } finally { await isolated.close(); }
});

const intervalMigration = await readFile(path.join(root,"supabase/migrations/202610030008_appointment_intervals.sql"),"utf8");
