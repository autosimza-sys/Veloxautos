import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { appointmentRequest } from '../features/agenda/appointment-request.js';

const draft = { userId: 'fixture-user', conversationId: 'fixture-chat', scheduledAt: '2099-10-03T12:00:00.000Z', durationMinutes: 60, location: 'Lugar privado' };
function storageFixture() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test('persistent proposal fingerprints recover the same UUID without storing raw payload or identity', async () => {
  const storage = storageFixture();
  const first = await appointmentRequest(draft, storage);
  const second = await appointmentRequest({ ...draft, location: ' Lugar privado ', durationMinutes: '60', scheduledAt: '2099-10-03T09:00:00-03:00' }, storage);
  assert.equal(second.id, first.id);
  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert.equal(storage.values.size, 1);
  const stored = JSON.stringify([...storage.values]);
  for (const privatePart of ['fixture-user', 'fixture-chat', '2099-10-03', 'Lugar privado']) assert.ok(!stored.includes(privatePart));
  assert.match([...storage.values.keys()][0], /^velox-appointment:[0-9a-f]{64}$/);
  assert.equal([...storage.values.values()][0], first.id);
});

test('changed author, conversation, time, duration or location creates a distinct proposal intent', async () => {
  const storage = storageFixture();
  const first = await appointmentRequest(draft, storage);
  for (const change of [{ userId: 'other' }, { conversationId: 'other' }, { scheduledAt: '2099-10-03T13:00:00Z' }, { durationMinutes: 61 }, { location: 'Otro lugar' }]) {
    assert.notEqual((await appointmentRequest({ ...draft, ...change }, storage)).id, first.id);
  }
  assert.equal(storage.values.size, 6);
});

test('known completion removes only its own request and allows a new intentional proposal', async () => {
  const storage = storageFixture();
  const first = await appointmentRequest(draft, storage);
  first.complete();
  assert.equal(storage.values.size, 0);
  assert.notEqual((await appointmentRequest(draft, storage)).id, first.id);
  first.complete();
  assert.equal(storage.values.size, 1, 'a delayed completion must not delete a newer intention');
});

test('unavailable, throwing, silently ineffective and corrupted storage stop safe preparation', async () => {
  for (const storage of [null, { getItem() { throw new Error('blocked'); } }, { getItem() { return null; }, setItem() {} }, { getItem() { return 'invalid-id'; } }]) {
    await assert.rejects(() => appointmentRequest(draft, storage), /almacenamiento|referencia/i);
  }
});

test('a past-time replay is allowed only for an already-persisted request', async () => {
  const storage = storageFixture();
  await assert.rejects(() => appointmentRequest(draft, storage, { createIfMissing: false }), /fecha|hora/i);
  const first = await appointmentRequest(draft, storage);
  assert.equal((await appointmentRequest(draft, storage, { createIfMissing: false })).id, first.id);
});

test('completion reports unsuccessful deletion and verifies successful local-reference cleanup', async () => {
  for (const mode of ['throw', 'silent']) {
    const storage = storageFixture();
    storage.removeItem = () => { if (mode === 'throw') throw new Error('blocked'); };
    const request = await appointmentRequest(draft, storage);
    assert.equal(request.complete(), false);
    assert.notEqual((await appointmentRequest(draft, storage)).id, request.id, 'a confirmed local intention must never be reused for a new one');
  }
  const storage = storageFixture();
  const request = await appointmentRequest(draft, storage);
  assert.equal(request.complete(), true);
  assert.equal(storage.values.size, 0);
});

test('a confirmed reference whose removal failed cannot cause a duplicate intentional action when replacement persistence fails', async () => {
  for (const mode of ['throw', 'silent']) {
    const storage = storageFixture();
    storage.removeItem = () => { if (mode === 'throw') throw new Error('remove blocked'); };
    const first = await appointmentRequest(draft, storage);
    assert.equal(first.complete(), false);
    storage.setItem = () => { throw new Error('replacement blocked'); };
    await assert.rejects(() => appointmentRequest(draft, storage), /almacenamiento|referencia/i);
  }
});

test('a fresh module after reload can conservatively recover a previously acknowledged UUID left in storage', async () => {
  const storage = storageFixture();
  storage.removeItem = () => {};
  const first = await appointmentRequest(draft, storage);
  assert.equal(first.complete(), false);
  // tsx normalizes query-string imports, so load the same standalone source in
  // an isolated ESM instance to model a true page reload with fresh memory.
  const source = await readFile(new URL('../features/agenda/appointment-request.js', import.meta.url), 'utf8');
  const fresh = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  assert.equal((await fresh.appointmentRequest(draft, storage)).id, first.id);
});
