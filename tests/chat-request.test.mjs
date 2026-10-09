import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
const { messageRequest, sendChatMessage } = await import('../features/chat/message-request.js');
const helperSource = await readFile(new URL('../features/chat/message-request.js', import.meta.url), 'utf8');
// tsx canonicalizes file URLs, including cache-busting query strings. A native
// data module gives this test a genuinely fresh memory scope, as a reload does.
const freshModule = () => import(`data:text/javascript;base64,${Buffer.from(helperSource).toString('base64')}#${crypto.randomUUID()}`);
const author = '10000000-0000-4000-8000-000000000001';
const conversation = '20000000-0000-4000-8000-000000000001';
const messageId = '30000000-0000-4000-8000-000000000001';
const automatedId = '30000000-0000-4000-8000-000000000002';
const draft = (extra = {}) => ({ userId: author, conversationId: conversation, body: '¿Sigue disponible?', ...extra });
function storageFixture() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
const confirmation = () => ({ data: { message_id: messageId, automated: true, automated_message_id: automatedId }, error: null, status: 200 });

test('identical pending intent across new callers reuses UUID without storing message text or identity', async () => {
  const storage = storageFixture();
  const first = await messageRequest(draft(), storage);
  const again = await messageRequest(draft({ body: '  ¿Sigue disponible?  ' }), storage);
  assert.equal(first.id, again.id);
  assert.match(first.id, /^[0-9a-f-]{36}$/);
  assert.equal(storage.values.size, 1);
  assert.ok([...storage.values].every(([key, value]) => !key.includes(author) && !key.includes(conversation) && !key.includes('disponible') && value === first.id));
});

test('browser reload recovers persisted request and confirmed same text gets a fresh UUID', async () => {
  const storage = storageFixture();
  const first = await messageRequest(draft(), storage);
  // A new module instance simulates losing all JavaScript memory after reload.
  const reloaded = await freshModule();
  assert.notEqual(reloaded.messageRequest, messageRequest);
  const retry = await reloaded.messageRequest(draft(), storage);
  assert.equal(retry.id, first.id);
  assert.equal(retry.complete(), true);
  assert.equal(storage.values.size, 0);
  assert.notEqual((await reloaded.messageRequest(draft(), storage)).id, first.id);
});

test('different author, conversation, or message text receives a separate request ID', async () => {
  const storage = storageFixture(); const first = await messageRequest(draft(), storage);
  for (const changed of [{ userId: 'other-author' }, { conversationId: 'other-conversation' }, { body: 'Otro mensaje' }]) {
    assert.notEqual((await messageRequest(draft(changed), storage)).id, first.id);
  }
});

test('successful authoritative reply retires the UUID and preserves original RPC result', async () => {
  const storage = storageFixture(); const calls = [];
  const client = { rpc: async (...args) => { calls.push(args); return confirmation(); } };
  const result = await sendChatMessage({ ...draft(), client, storage });
  assert.deepEqual(result.result, confirmation().data);
  assert.equal(result.storageCleared, true);
  assert.equal(calls[0][0], 'send_message_idempotent');
  assert.equal(calls[0][1].target_conversation, conversation);
  assert.equal(calls[0][1].message_body, '¿Sigue disponible?');
  assert.match(calls[0][1].message_request_id, /^[0-9a-f-]{36}$/);
  assert.equal(storage.values.size, 0);
  await sendChatMessage({ ...draft(), client, storage });
  assert.notEqual(calls[0][1].message_request_id, calls[1][1].message_request_id);
});

for (const failure of ['throw', 'status-zero', 'empty-confirmation', 'incomplete-confirmation', 'permission']) {
  test(`${failure} preserves request until an explicit authoritative retry`, async () => {
    const storage = storageFixture(); const calls = [];
    const client = { rpc: async (...args) => {
      calls.push(args);
      if (calls.length > 1) return confirmation();
      if (failure === 'throw') throw new TypeError('Failed to fetch');
      if (failure === 'status-zero') return { data: null, error: { code: '', message: 'TypeError: Failed to fetch' }, status: 0 };
      if (failure === 'empty-confirmation') return { data: null, error: null, status: 200 };
      if (failure === 'incomplete-confirmation') return { data: { message_id: messageId, automated: true }, error: null, status: 200 };
      return { data: null, error: { code: '42501', message: 'Denied' }, status: 403 };
    } };
    await assert.rejects(() => sendChatMessage({ ...draft(), client, storage }));
    assert.equal(calls.length, 1, 'no automatic retry');
    assert.equal(storage.values.size, 1);
    await sendChatMessage({ ...draft(), client, storage });
    assert.deepEqual(calls[0], calls[1]);
    assert.equal(storage.values.size, 0);
  });
}

test('storage denial or corrupted pending UUID fails closed before a network request', async () => {
  let calls = 0;
  const client = { rpc: async () => { calls++; return confirmation(); } };
  for (const storage of [null, { getItem() { throw new Error('SecurityError'); } }, { getItem: () => null, setItem() { throw new Error('QuotaExceededError'); } }, { getItem: () => 'corrupted-uuid' }]) {
    await assert.rejects(() => sendChatMessage({ ...draft(), client, storage }), error => error.code === 'CHAT_REQUEST_STORAGE');
  }
  assert.equal(calls, 0);
});

test('late completion cannot erase a newer request stored for the same text', async () => {
  const storage = storageFixture();
  const old = await messageRequest(draft(), storage);
  old.complete();
  const next = await messageRequest(draft(), storage);
  old.complete();
  assert.equal((await messageRequest(draft(), storage)).id, next.id);
});

test('confirmed send is still reported successful if storage cleanup becomes unavailable', async () => {
  const storage = storageFixture(); const calls = [];
  const client = { rpc: async (...args) => { calls.push(args); storage.removeItem = () => { throw new Error('SecurityError'); }; return confirmation(); } };
  const result = await sendChatMessage({ ...draft(), client, storage });
  assert.equal(result.result.message_id, messageId);
  assert.equal(result.storageCleared, false);
  // In the same runtime, a confirmed UUID is never reused for a new message.
  const next = await messageRequest(draft(), storage);
  assert.notEqual(next.id, calls[0][1].message_request_id);
});

test('navigation or identity change during preparation prevents dispatch', async () => {
  const storage = storageFixture(); let calls = 0;
  const client = { rpc: async () => { calls++; return confirmation(); } };
  await assert.rejects(() => sendChatMessage({ ...draft(), client, storage, isCurrent: () => false }), error => error.code === 'CHAT_SCOPE_CHANGED');
  assert.equal(calls, 0);
});

test('reload after acknowledgement but failed cleanup retries the old UUID instead of duplicating', async () => {
  const storage = storageFixture(); const calls = [];
  const remove = storage.removeItem;
  storage.removeItem = () => { throw new Error('SecurityError'); };
  const client = { rpc: async (...args) => { calls.push(args); return confirmation(); } };
  const first = await sendChatMessage({ ...draft(), client, storage });
  assert.equal(first.storageCleared, false);
  // After losing the runtime's acknowledgement memory, persisted UUID is still
  // safe: a retry acknowledges the original message rather than making a new one.
  const reloaded = await freshModule();
  storage.removeItem = remove;
  const retried = await reloaded.sendChatMessage({ ...draft(), client, storage });
  assert.equal(retried.storageCleared, true);
  assert.equal(calls[0][1].message_request_id, calls[1][1].message_request_id);
  await reloaded.sendChatMessage({ ...draft(), client, storage });
  assert.notEqual(calls[1][1].message_request_id, calls[2][1].message_request_id);
});

test('NFD and NFC text recover the same intention and send the same canonical body', async () => {
  const storage = storageFixture();
  const nfc = '¿Dónde está y cuántos kilómetros tiene?';
  const nfd = nfc.normalize('NFD');
  assert.notEqual(nfc, nfd);
  const first = await messageRequest(draft({ body: nfd }), storage);
  const next = await messageRequest(draft({ body: nfc }), storage);
  assert.equal(next.id, first.id);
  const calls = [];
  const client = { rpc: async (...args) => { calls.push(args); return confirmation(); } };
  await sendChatMessage({ ...draft({ body: nfd }), client, storage });
  assert.equal(calls[0][1].message_body, nfc);
  assert.equal(calls[0][1].message_request_id, first.id);
});
