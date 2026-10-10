import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { asUser, ids, makeDatabase } from './backend/fixtures.mjs';
import { sendChatMessage } from '../features/chat/message-request.js';

const helperSource = await readFile(new URL('../features/chat/message-request.js', import.meta.url), 'utf8');
const freshModule = () => import(`data:text/javascript;base64,${Buffer.from(helperSource).toString('base64')}#${crypto.randomUUID()}`);
let db;
before(async () => { db = await makeDatabase(); });
after(async () => { await db?.close(); });
beforeEach(async () => { await db.exec('begin'); await asUser(db, ids.buyer); });
afterEach(async () => { await db.exec('rollback; reset role'); });
function storageFixture() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
function databaseClient(failure) {
  const calls = [];
  return { calls, async rpc(name, args) {
    calls.push({ name, ...args });
    assert.equal(name, 'send_message_idempotent');
    const data = (await db.query('select public.send_message_idempotent($1,$2,$3) as result', [args.target_conversation, args.message_body, args.message_request_id])).rows[0].result;
    if (calls.length === 1 && failure === 'throw-after-commit') throw new TypeError('Failed to fetch after server accepted request');
    if (calls.length === 1 && failure === 'status-zero-after-commit') return { data: null, error: { code: '', message: 'Failed to fetch after commit' }, status: 0 };
    return { data, error: null, status: 200 };
  } };
}
const input = { userId: ids.buyer, conversationId: ids.conversation, body: '¿Cuántos kilómetros tiene?' };
const history = () => db.query('select id, body, sender_id, is_automated from public.messages where conversation_id=$1 order by created_at, id', [ids.conversation]);

for (const failure of ['throw-after-commit', 'status-zero-after-commit']) {
  test(`client→SQL ${failure}: explicit retry after reload keeps one human message and one automatic reply`, async () => {
    const storage = storageFixture(); const client = databaseClient(failure);
    await assert.rejects(() => sendChatMessage({ ...input, body: input.body.normalize("NFD"), client, storage }), error => /after (?:server accepted|commit)/.test(error.message));
    assert.equal(client.calls.length, 1);
    const originalHistory = (await history()).rows;
    assert.equal(originalHistory.length, 2);
    assert.equal(originalHistory.filter(row => row.is_automated).length, 1);
    assert.ok(originalHistory.find(row => row.is_automated).body.includes('12'));
    const reloaded = await freshModule();
    const confirmed = await reloaded.sendChatMessage({ ...input, client, storage });
    assert.equal(client.calls.length, 2);
    assert.deepEqual(client.calls[0], client.calls[1]);
    assert.deepEqual((await history()).rows, originalHistory);
    assert.equal(confirmed.result.message_id, originalHistory.find(row => !row.is_automated).id);
    assert.equal(confirmed.result.automated_message_id, originalHistory.find(row => row.is_automated).id);
    assert.equal(storage.values.size, 0);
    // The first attempt used NFD and the reload reconstructed NFC; both sent
    // the same canonical payload and UUID. After authoritative success,
    // identical text is a legitimate new intention.
    const next = await reloaded.sendChatMessage({ ...input, client, storage });
    assert.notEqual(client.calls[2].message_request_id, client.calls[1].message_request_id);
    assert.notEqual(next.result.message_id, confirmed.result.message_id);
    assert.equal((await history()).rows.length, 4);
  });
}

test('client→SQL logout/relogin retains pending UUID while another participant has a separate intention', async () => {
  const storage = storageFixture(); const client = databaseClient('throw-after-commit');
  await assert.rejects(() => sendChatMessage({ ...input, client, storage }), error => /after (?:server accepted|commit)/.test(error.message));
  await asUser(db, ids.seller);
  const seller = await sendChatMessage({ ...input, userId: ids.seller, client, storage });
  assert.equal(seller.result.automated, false);
  assert.notEqual(client.calls[1].message_request_id, client.calls[0].message_request_id);
  await asUser(db, ids.buyer);
  await sendChatMessage({ ...input, client, storage });
  assert.equal(client.calls[2].message_request_id, client.calls[0].message_request_id);
  assert.equal((await history()).rows.length, 3);
});
