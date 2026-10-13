import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { asUser, ids, makeDatabase } from './fixtures.mjs';

let db;
before(async () => {
  db = await makeDatabase();
  await db.exec(await readFile(new URL('../../scripts/finalize-client-cutover.sql', import.meta.url), 'utf8'));
});
after(async () => { await db?.close(); });
beforeEach(async () => { await db.exec('begin'); });
afterEach(async () => { await db.exec('rollback; reset role'); });

const rpc = 'select public.send_message_idempotent($1,$2,$3) as result';
const waitMessage = /Esperá un momento antes de enviar más mensajes/;
async function privileged(sql, params = []) {
  await db.exec('reset role');
  return db.query(sql, params);
}
async function send({ actor = ids.buyer, conversation = ids.conversation, text = '¿Cuál es el precio?', request = crypto.randomUUID() } = {}) {
  await asUser(db, actor);
  return (await db.query(rpc, [conversation, text, request])).rows[0].result;
}
async function rejectsWithoutAborting(run, expected) {
  await db.exec('savepoint expected_rate_denial');
  try { await assert.rejects(run, expected); }
  finally { await db.exec('rollback to savepoint expected_rate_denial'); }
}
async function counts() {
  return (await privileged(`select
    (select count(*)::int from public.messages) as messages,
    (select count(*)::int from velox_private.message_requests) as requests`)).rows[0];
}
async function addConversation(buyer = ids.buyer) {
  const car = crypto.randomUUID();
  const conversation = crypto.randomUUID();
  await privileged(`insert into public.vehicles(id,owner_id,status,brand,model,version,year,kilometers,price,zone)
    values ($1,$2,'active','Test','Rate limit','Base',2020,100,1000,'Mendoza')`, [car, ids.seller]);
  await privileged('insert into public.conversations(id,vehicle_id,buyer_id,seller_id) values($1,$2,$3,$4)',
    [conversation, car, buyer, ids.seller]);
  return conversation;
}
async function fill(conversation, n, actor = ids.buyer, text = '¿Cuál es el precio?') {
  for (let i = 0; i < n; i++) await send({ conversation, actor, text });
}

test('ten FAQ requests per conversation are allowed; the eleventh leaves no message or request', async () => {
  await fill(ids.conversation, 10);
  const before = await counts();
  assert.deepEqual(before, { messages: 20, requests: 10 });
  await rejectsWithoutAborting(() => send(), error => error.code === 'P0001' && waitMessage.test(error.message));
  assert.deepEqual(await counts(), before);
});

test('the same author shares a thirty-message limit across all conversations', async () => {
  const second = await addConversation();
  const third = await addConversation();
  const fourth = await addConversation();
  await fill(ids.conversation, 10);
  await fill(second, 10);
  await fill(third, 10);
  const before = await counts();
  await rejectsWithoutAborting(() => send({ conversation: fourth }), error => error.code === 'P0001');
  assert.deepEqual(await counts(), before);
  const sellerReply = await send({ actor: ids.seller, text: 'Hola, soy el vendedor' });
  assert.equal(sellerReply.automated, false);
  const anotherBuyer = await addConversation(ids.mechanic);
  assert.ok((await send({ actor: ids.mechanic, conversation: anotherBuyer })).message_id);
});

test('human messages are limited too and generated FAQ replies do not count against their seller', async () => {
  await fill(ids.conversation, 10);
  await fill(ids.conversation, 10, ids.seller, 'Hola desde el vendedor');
  const before = await counts();
  await rejectsWithoutAborting(() => send({ actor: ids.seller, text: 'Otro mensaje' }), error => error.code === 'P0001');
  assert.deepEqual(await counts(), before);
  assert.equal(before.messages, 30);
});

test('an exact retry succeeds at both limits and a reused UUID with changed data still conflicts', async () => {
  const request = crypto.randomUUID();
  const first = await send({ request });
  await fill(ids.conversation, 9);
  for (let i = 0; i < 2; i++) await fill(await addConversation(), 10);
  const before = await counts();
  const windowBefore = (await privileged('select recent_messages from velox_private.message_rate_windows where author_id=$1', [ids.buyer])).rows[0];
  for (let i = 0; i < 12; i++) assert.deepEqual(await send({ request }), first);
  await rejectsWithoutAborting(() => send({ request, text: 'Cambio el texto' }), error => error.code === '23514');
  assert.deepEqual(await counts(), before);
  assert.deepEqual((await privileged('select recent_messages from velox_private.message_rate_windows where author_id=$1', [ids.buyer])).rows[0], windowBefore);
});

test('rolling window drops only old acceptances and trims state to recent messages', async () => {
  await fill(ids.conversation, 10);
  await privileged(`update velox_private.message_rate_windows set recent_messages = (
    select jsonb_agg(jsonb_set(e,'{accepted_at}',to_jsonb(clock_timestamp()-interval '61 seconds')))
    from jsonb_array_elements(recent_messages) e
  ) where author_id=$1`, [ids.buyer]);
  await send();
  const row = (await privileged('select jsonb_array_length(recent_messages) as n from velox_private.message_rate_windows where author_id=$1', [ids.buyer])).rows[0];
  assert.equal(row.n, 1);
  await fill(ids.conversation, 9);
  await rejectsWithoutAborting(() => send(), error => error.code === 'P0001');
});

test('failed downstream work rolls back the window and permits the same request after repair', async () => {
  await db.exec('reset role');
  await db.exec(`create function pg_temp.fail_message_insert() returns trigger language plpgsql as $$
    begin raise exception 'synthetic failure'; end $$;
    create trigger rate_test_failure before insert on public.messages
      for each row execute function pg_temp.fail_message_insert()`);
  const request = crypto.randomUUID();
  await rejectsWithoutAborting(() => send({ request }), /synthetic failure/);
  assert.deepEqual(await counts(), { messages: 0, requests: 0 });
  assert.equal((await privileged('select count(*)::int n from velox_private.message_rate_windows')).rows[0].n, 0);
  await privileged('drop trigger rate_test_failure on public.messages');
  assert.ok((await send({ request })).message_id);
});

test('invalid and unauthorized calls consume no quota and blocked users cannot replay a private result', async () => {
  for (const options of [{ text: ' ' }, { actor: ids.stranger }, { actor: ids.admin }, { actor: null }]) {
    await rejectsWithoutAborting(() => send(options), error => ['23514', '42501'].includes(error.code));
  }
  assert.equal((await privileged('select count(*)::int n from velox_private.message_rate_windows')).rows[0].n, 0);
  const request = crypto.randomUUID();
  await send({ request });
  await privileged('update public.profiles set is_blocked=true where id=$1', [ids.buyer]);
  await rejectsWithoutAborting(() => send({ request }), error => error.code === '42501');
  assert.equal((await privileged('select jsonb_array_length(recent_messages) n from velox_private.message_rate_windows where author_id=$1', [ids.buyer])).rows[0].n, 1);
});

test('private quota state is inaccessible and cutover prevents legacy or direct-insert bypasses', async () => {
  await send();
  for (const actor of [ids.buyer, ids.seller, ids.admin, null]) {
    await asUser(db, actor);
    await rejectsWithoutAborting(() => db.query('select * from velox_private.message_rate_windows'), error => error.code === '42501');
    await rejectsWithoutAborting(() => db.query('delete from velox_private.message_rate_windows'), error => error.code === '42501');
    await rejectsWithoutAborting(() => db.query('select public.send_message_with_assistant($1,$2)', [ids.conversation, 'Hola']), error => error.code === '42501');
    await rejectsWithoutAborting(() => db.query('insert into public.messages(conversation_id,sender_id,body) values($1,$2,$3)', [ids.conversation, actor || ids.buyer, 'Hola']), error => error.code === '42501');
  }
  await privileged('grant select,insert,update,delete on velox_private.message_rate_windows to authenticated');
  await asUser(db, ids.buyer);
  assert.deepEqual((await db.query('select * from velox_private.message_rate_windows')).rows, []);
  assert.deepEqual((await db.query('delete from velox_private.message_rate_windows returning author_id')).rows, []);
});

test('queued distinct sends cannot exceed the limit in the single-connection PostgreSQL fixture', async () => {
  // PGlite queues calls on one connection. This verifies admission/results,
  // not independent PostgreSQL session contention; the deploy gate checks that.
  await db.exec('reset role');
  await db.exec(`create function pg_temp.try_rate_message(target uuid, request uuid) returns jsonb language plpgsql as $$
    begin return public.send_message_idempotent(target,'Hola',request);
    exception when raise_exception then return jsonb_build_object('denied',SQLERRM); end $$;
    grant execute on function pg_temp.try_rate_message(uuid,uuid) to authenticated`);
  await asUser(db, ids.buyer);
  const attempts = await Promise.all(Array.from({ length: 18 }, () => db.query('select pg_temp.try_rate_message($1,$2) r', [ids.conversation, crypto.randomUUID()])));
  assert.equal(attempts.filter(x => x.rows[0].r.message_id).length, 10);
  assert.equal(attempts.filter(x => waitMessage.test(x.rows[0].r.denied || '')).length, 8);
  assert.deepEqual(await counts(), { messages: 10, requests: 10 });
});

test('queued sends spread across conversations share the global author quota', async () => {
  const conversations = [ids.conversation, await addConversation(), await addConversation(), await addConversation()];
  await db.exec('reset role');
  await db.exec(`create function pg_temp.try_global_rate_message(target uuid, request uuid) returns jsonb language plpgsql as $$
    begin return public.send_message_idempotent(target,'Hola',request);
    exception when raise_exception then return jsonb_build_object('denied',SQLERRM); end $$;
    grant execute on function pg_temp.try_global_rate_message(uuid,uuid) to authenticated`);
  await asUser(db, ids.buyer);
  const attempts = await Promise.all(Array.from({ length: 36 }, (_, i) => db.query(
    'select pg_temp.try_global_rate_message($1,$2) r', [conversations[i % conversations.length], crypto.randomUUID()]
  )));
  assert.equal(attempts.filter(x => x.rows[0].r.message_id).length, 30);
  assert.equal(attempts.filter(x => waitMessage.test(x.rows[0].r.denied || '')).length, 6);
  assert.deepEqual(await counts(), { messages: 30, requests: 30 });
});

test('migration replay preserves quota, idempotent results and revoked legacy permissions', async () => {
  const isolated = await makeDatabase();
  try {
    await isolated.exec(await readFile(new URL('../../scripts/finalize-client-cutover.sql', import.meta.url), 'utf8'));
    await isolated.exec('begin');
    await asUser(isolated, ids.buyer);
    const request = crypto.randomUUID();
    const first = (await isolated.query(rpc, [ids.conversation, 'Hola', request])).rows[0].result;
    await isolated.exec('commit; reset role');
    await isolated.exec(await readFile(new URL('../../supabase/migrations/202610130001_message_rate_limit.sql', import.meta.url), 'utf8'));
    const state = (await isolated.query('select jsonb_array_length(recent_messages) n from velox_private.message_rate_windows where author_id=$1', [ids.buyer])).rows[0];
    assert.equal(state.n, 1);
    assert.equal((await isolated.query("select has_function_privilege('authenticated','public.send_message_with_assistant(uuid,text)','execute') allowed")).rows[0].allowed, false);
    await isolated.exec('begin');
    await asUser(isolated, ids.buyer);
    assert.deepEqual((await isolated.query(rpc, [ids.conversation, 'Hola', request])).rows[0].result, first);
    await isolated.exec('rollback; reset role');
  } finally { await isolated.close(); }
});
