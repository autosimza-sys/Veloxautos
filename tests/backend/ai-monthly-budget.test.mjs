import assert from 'node:assert/strict';
import { before, after, beforeEach, afterEach, test } from 'node:test';
import { makeDatabase, asUser, ids, denied } from './fixtures.mjs';
let db;
const message = '81000000-0000-4000-8000-000000000001';
const second = '81000000-0000-4000-8000-000000000002';
before(async () => { db = await makeDatabase(); });
after(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('begin');
  for (const id of [message, second]) await db.query('insert into public.messages(id,conversation_id,sender_id,body) values($1,$2,$3,$4)',
    [id, ids.conversation, ids.buyer, 'Una pregunta imprevista']);
});
afterEach(async () => { await db.exec('rollback; reset role'); });
async function claim(id = message) {
  await db.exec('set local role service_role');
  return (await db.query('select public.claim_ai_reply($1,$2,100,100) as r', [id, ids.buyer])).rows[0].r;
}
async function reserve(id = message, limit = 10000000, actor = ids.buyer) {
  return (await db.query('select public.reserve_ai_reply_budget($1,$2,$3) as r', [id, actor, limit])).rows[0].r;
}
test('browser roles, including admin, cannot reserve, read or modify money ledger', async () => {
  for (const id of [null, ids.buyer, ids.seller, ids.admin]) {
    await asUser(db, id);
    await denied(db, () => reserve(), assert);
    await denied(db, () => db.query('select * from velox_private.ai_budget_reservations'), assert);
  }
});
test('reservation requires a valid claimed message and is issued once', async () => {
  await db.exec('set local role service_role');
  assert.equal((await reserve()).state, 'denied');
  assert.equal((await claim()).state, 'claimed');
  assert.equal((await reserve(message, 10000000, ids.stranger)).state, 'denied');
  assert.equal((await reserve()).state, 'reserved');
  assert.equal((await reserve()).state, 'processing');
  await denied(db, () => db.query('delete from velox_private.ai_budget_reservations'), assert);
});
test('monthly cap counts in-flight attempts; no reservation may cross it', async () => {
  await claim(); await claim(second);
  assert.equal((await reserve(message, 25000)).state, 'reserved');
  assert.equal((await reserve(second, 25000)).state, 'limited');
  assert.equal((await reserve(second, 50000)).state, 'reserved');
  await db.exec('reset role');
  assert.equal(Number((await db.query('select sum(reserved_micro_usd) as total from velox_private.ai_budget_reservations')).rows[0].total), 50000);
});
test('zero, invalid and over-authorized monthly budgets fail closed', async () => {
  await claim();
  for (const limit of [null, -1, 0, 24999, 10000001]) assert.equal((await reserve(message, limit)).state, 'limited');
});
test('prior UTC months do not consume this month; deletion never erases current spending', async () => {
  await claim(); await reserve(); await db.exec('reset role');
  await db.query("update velox_private.ai_budget_reservations set created_at=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC' - interval '1 second' where message_id=$1", [message]);
  await claim(second);
  assert.equal((await reserve(second, 25000)).state, 'reserved');
  await db.exec('reset role');
  await db.query('delete from public.messages where id=$1', [second]);
  assert.equal((await db.query('select count(*)::int as n from velox_private.ai_budget_reservations')).rows[0].n, 2);
});
test('seller disable or conversation block after claim prevents any reservation', async () => {
  await claim(); await db.exec('reset role');
  await db.query('update public.conversations set is_blocked=true where id=$1', [ids.conversation]);
  await db.exec('set local role service_role');
  assert.equal((await reserve()).state, 'denied');
});
test('known automatic answer is skipped without claiming an AI job', async () => {
  await db.exec('reset role');
  await db.query("insert into velox_private.message_requests(author_id,request_id,conversation_id,request_fingerprint,result) values($1,$2,$3,decode(repeat('00',32),'hex'),$4)", [ids.buyer, message, ids.conversation, { message_id: message, automated: true }]);
  assert.equal((await claim()).state, 'skipped');
});
