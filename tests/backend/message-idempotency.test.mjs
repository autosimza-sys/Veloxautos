import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { asUser, denied, ids, makeDatabase, root } from "./fixtures.mjs";

let db;
before(async () => { db = await makeDatabase(); });
after(async () => { await db?.close(); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback; reset role"); });

const requestId = "70000000-0000-0000-0000-000000000001";
const nextRequestId = "70000000-0000-0000-0000-000000000002";
const otherConversation = "30000000-0000-0000-0000-000000000002";
const body = "¿Sigue disponible?";
const rpc = "select public.send_message_idempotent($1,$2,$3) as result";
const migration = path.join(root, "supabase/migrations/202610030007_message_idempotency.sql");

async function send({ actor = ids.buyer, conversation = ids.conversation, text = body, request = requestId } = {}) {
  await asUser(db, actor);
  return (await db.query(rpc, [conversation, text, request])).rows[0].result;
}
async function privileged(sql, params = []) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub','',true)");
  return db.query(sql, params);
}
async function counts() {
  const result = await privileged(`select
    (select count(*)::int from public.messages) as messages,
    (select count(*)::int from public.messages where is_automated) as automated,
    (select count(*)::int from velox_private.message_requests) as requests`);
  return result.rows[0];
}
async function addConversation(buyer = ids.buyer, seller = ids.stranger) {
  await privileged("insert into public.conversations(id,vehicle_id,buyer_id,seller_id) values ($1,$2,$3,$4)",
    [otherConversation, ids.otherCar, buyer, seller]);
}

test("identical retries return the exact original JSON and create only one message and one assistant reply", async () => {
  const first = await send();
  assert.equal(first.automated, true);
  assert.ok(first.message_id && first.automated_message_id);
  for (let attempt = 0; attempt < 5; attempt += 1) assert.deepEqual(await send(), first);
  assert.deepEqual(await counts(), { messages: 2, automated: 1, requests: 1 });
  const messages = (await privileged("select id,sender_id,body,is_automated from public.messages order by is_automated")).rows;
  assert.deepEqual(messages[0], { id: first.message_id, sender_id: ids.buyer, body, is_automated: false });
  assert.equal(messages[1].id, first.automated_message_id);
  assert.equal(messages[1].sender_id, ids.seller);
  assert.equal(messages[1].is_automated, true);
});

test("surrounding spaces normalize exactly as the legacy sender without ignoring case or interior spaces", async () => {
  const first = await send({ text: `  ${body}  ` });
  assert.deepEqual(await send({ text: body }), first);
  for (const text of [body.toUpperCase(), "¿Sigue  disponible?", "\t" + body]) {
    await denied(db, () => send({ text }), assert);
  }
  assert.deepEqual(await counts(), { messages: 2, automated: 1, requests: 1 });
});

test("same author's request UUID rejects a changed body without emitting another message", async () => {
  await send();
  await denied(db, () => send({ text: "Quiero conocer el precio" }), assert);
  assert.deepEqual(await counts(), { messages: 2, automated: 1, requests: 1 });
});

test("same author's request UUID rejects a different authorized conversation", async () => {
  await addConversation();
  const first = await send();
  await denied(db, () => send({ conversation: otherConversation }), assert);
  assert.deepEqual(await send(), first);
  assert.deepEqual(await counts(), { messages: 2, automated: 1, requests: 1 });
});

test("a fresh UUID is a new intent even for the same author, conversation and text", async () => {
  const first = await send();
  const second = await send({ request: nextRequestId });
  assert.notEqual(second.message_id, first.message_id);
  assert.notEqual(second.automated_message_id, first.automated_message_id);
  assert.deepEqual(await counts(), { messages: 4, automated: 2, requests: 2 });
});

test("both participants can use the same UUID without receiving each other's response", async () => {
  const buyerResult = await send();
  const sellerResult = await send({ actor: ids.seller });
  assert.deepEqual(Object.keys(sellerResult).sort(), ["automated", "message_id"]);
  assert.equal(sellerResult.automated, false);
  assert.notEqual(sellerResult.message_id, buyerResult.message_id);
  assert.deepEqual(await send({ actor: ids.seller }), sellerResult);
  assert.deepEqual(await send(), buyerResult);
  assert.deepEqual(await counts(), { messages: 3, automated: 1, requests: 2 });
});

test("unrelated authors using the same UUID in separate chats cannot cross private results", async () => {
  await addConversation(ids.mechanic);
  const first = await send();
  const second = await send({ actor: ids.mechanic, conversation: otherConversation });
  assert.notEqual(second.message_id, first.message_id);
  assert.notEqual(second.automated_message_id, first.automated_message_id);
  assert.deepEqual(await send({ actor: ids.mechanic, conversation: otherConversation }), second);
  await denied(db, () => send({ actor: ids.mechanic }), assert);
  assert.deepEqual(await counts(), { messages: 4, automated: 2, requests: 2 });
});

test("unrecognized messages preserve the legacy null assistant ID on retry", async () => {
  const first = await send({ text: "Hola" });
  assert.deepEqual(first, { message_id: first.message_id, automated: false, automated_message_id: null });
  assert.deepEqual(await send({ text: "Hola" }), first);
  assert.deepEqual(await counts(), { messages: 1, automated: 0, requests: 1 });
});

test("a retry does not rerun the assistant after settings or vehicle facts change", async () => {
  await privileged("insert into public.seller_assistant_settings(user_id,enabled) values ($1,false)", [ids.seller]);
  const first = await send();
  assert.deepEqual(first, { message_id: first.message_id, automated: false });
  await privileged("update public.seller_assistant_settings set enabled=true where user_id=$1", [ids.seller]);
  await privileged("update public.vehicles set status='paused' where id=$1", [ids.car]);
  assert.deepEqual(await send(), first);
  assert.deepEqual(await counts(), { messages: 1, automated: 0, requests: 1 });
});

for (const [text, expected] of [
  ["¿Cuántos kilómetros tiene?", /12[,.]345 km/],
  ["¿Dónde se puede ver?", /Mendoza/],
  ["¿Cuándo se puede visitar?", /horarios|proponer uno/i],
]) {
  test(`Spanish accents preserve the specific assistant intent: ${text}`, async () => {
    const first = await send({ text });
    assert.equal(first.automated, true);
    const reply = (await privileged("select body from public.messages where id=$1", [first.automated_message_id])).rows[0].body;
    assert.match(reply, expected);
    assert.doesNotMatch(reply, /disponibilidad/);
    assert.deepEqual(await send({ text }), first);
    assert.deepEqual(await counts(), { messages: 2, automated: 1, requests: 1 });
  });
}

test("unknown noise is not an availability question and does not fabricate an assistant response", async () => {
  const result = await send({ text: "asdf ¿ñú? xyz" });
  assert.equal(result.automated, false);
  assert.equal(result.automated_message_id, null);
  assert.deepEqual(await counts(), { messages: 1, automated: 0, requests: 1 });
});

test("legacy RPC retains its send guard and uses the same accent-insensitive intent matching", async () => {
  await asUser(db, ids.buyer);
  const result = (await db.query("select public.send_message_with_assistant($1,$2) as result", [ids.conversation, "¿Cuántos kilómetros tiene?"])).rows[0].result;
  assert.equal(result.automated, true);
  assert.match((await db.query("select body from public.messages where id=$1", [result.automated_message_id])).rows[0].body, /12[,.]345 km/);
  await privileged("update public.profiles set is_blocked=true where id=$1", [ids.buyer]);
  await asUser(db, ids.buyer);
  await denied(db, () => db.query("select public.send_message_with_assistant($1,$2)", [ids.conversation, body]), assert);
  assert.deepEqual(await counts(), { messages: 2, automated: 1, requests: 0 });
});

for (const [name, options] of [
  ["missing UUID", { request: null }], ["missing conversation", { conversation: null }],
  ["empty body", { text: "" }], ["blank body", { text: "   " }], ["null body", { text: null }],
]) {
  test(`${name} is rejected without messages or a consumed request`, async () => {
    await denied(db, () => send(options), assert);
    assert.deepEqual(await counts(), { messages: 0, automated: 0, requests: 0 });
  });
}

test("malformed UUID is rejected by PostgreSQL before the RPC can mutate anything", async () => {
  await asUser(db, ids.buyer);
  await db.exec("savepoint malformed_uuid");
  await assert.rejects(() => db.query(rpc, [ids.conversation, body, "not-a-uuid"]), error => error.code === "22P02");
  await db.exec("rollback to savepoint malformed_uuid");
  assert.deepEqual(await counts(), { messages: 0, automated: 0, requests: 0 });
});

for (const [name, actor] of [
  ["anonymous", null], ["stranger", ids.stranger], ["admin", ids.admin],
  ["blocked outsider", ids.blocked], ["missing profile", "10000000-0000-0000-0000-000000000099"],
]) {
  test(`${name} cannot send or recover a participant's private result`, async () => {
    await send();
    await denied(db, () => send({ actor }), assert);
    await denied(db, () => send({ actor, request: nextRequestId }), assert);
    assert.deepEqual(await counts(), { messages: 2, automated: 1, requests: 1 });
  });
}

test("authenticated role without a JWT user cannot call the definer RPC", async () => {
  await db.exec("set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub','',true)");
  await denied(db, () => db.query(rpc, [ids.conversation, body, requestId]), assert);
  assert.deepEqual(await counts(), { messages: 0, automated: 0, requests: 0 });
});

for (const blocked of ["conversation", "buyer", "seller"]) {
  test(`blocked ${blocked} denies both new messages and private replay results`, async () => {
    await send();
    if (blocked === "conversation") await privileged("update public.conversations set is_blocked=true where id=$1", [ids.conversation]);
    else await privileged("update public.profiles set is_blocked=true where id=$1", [ids[blocked]]);
    for (const actor of [ids.buyer, ids.seller]) {
      await denied(db, () => send({ actor }), assert);
      await denied(db, () => send({ actor, request: nextRequestId }), assert);
    }
    assert.deepEqual(await counts(), { messages: 2, automated: 1, requests: 1 });
  });
}

test("revoking participation denies the original author's replay before exposing the ledger", async () => {
  await send();
  await privileged("update public.conversations set buyer_id=$1 where id=$2", [ids.stranger, ids.conversation]);
  await denied(db, () => send(), assert);
  await denied(db, () => send({ request: nextRequestId }), assert);
  assert.deepEqual(await counts(), { messages: 2, automated: 1, requests: 1 });
});

test("a deleted conversation's request remains bound to that conversation and cannot be repurposed", async () => {
  await addConversation();
  await send();
  await privileged("delete from public.conversations where id=$1", [ids.conversation]);
  await denied(db, () => send(), assert);
  await denied(db, () => send({ conversation: otherConversation }), assert);
  assert.deepEqual(await counts(), { messages: 0, automated: 0, requests: 1 });
});

test("assistant failure rolls back the human message and ledger, and the same UUID can then succeed", async () => {
  await privileged(`create function public.fail_test_assistant_message() returns trigger language plpgsql as $$
    begin if new.is_automated then raise exception 'Synthetic assistant failure' using errcode='23514'; end if; return new; end $$`);
  await privileged("create trigger fail_test_assistant_message before insert on public.messages for each row execute function public.fail_test_assistant_message()");
  await denied(db, () => send(), assert);
  assert.deepEqual(await counts(), { messages: 0, automated: 0, requests: 0 });
  await privileged("drop trigger fail_test_assistant_message on public.messages");
  const first = await send();
  assert.deepEqual(await send(), first);
  assert.deepEqual(await counts(), { messages: 2, automated: 1, requests: 1 });
});

test("ledger failure rolls back both generated messages instead of leaving an untracked send", async () => {
  await privileged(`create function public.fail_test_message_request() returns trigger language plpgsql as $$
    begin raise exception 'Synthetic request ledger failure' using errcode='23514'; end $$`);
  await privileged("create trigger fail_test_message_request before insert on velox_private.message_requests for each row execute function public.fail_test_message_request()");
  await denied(db, () => send(), assert);
  assert.deepEqual(await counts(), { messages: 0, automated: 0, requests: 0 });
  await privileged("drop trigger fail_test_message_request on velox_private.message_requests");
  assert.equal((await send()).automated, true);
  assert.deepEqual(await counts(), { messages: 2, automated: 1, requests: 1 });
});

test("an enclosing transaction rollback rolls back messages and request together", async () => {
  await db.exec("savepoint send_transaction");
  const rolledBack = await send();
  await db.exec("rollback to savepoint send_transaction");
  assert.deepEqual(await counts(), { messages: 0, automated: 0, requests: 0 });
  const committed = await send();
  assert.notEqual(committed.message_id, rolledBack.message_id);
  assert.deepEqual(await counts(), { messages: 2, automated: 1, requests: 1 });
});

test("request ledger is unavailable for any browser actor to read or mutate, including its author and admin", async () => {
  await send();
  for (const actor of [ids.buyer, ids.seller, ids.stranger, ids.admin, ids.blocked, null]) {
    await asUser(db, actor);
    for (const sql of [
      "select * from velox_private.message_requests",
      "delete from velox_private.message_requests",
      "update velox_private.message_requests set result='{}'::jsonb",
      `insert into velox_private.message_requests(author_id,request_id,conversation_id,request_fingerprint,result)
        values ('${ids.buyer}','${nextRequestId}','${ids.conversation}',decode(repeat('00',32),'hex'),'{}')`,
    ]) await denied(db, () => db.query(sql), assert);
  }
  assert.deepEqual(await counts(), { messages: 2, automated: 1, requests: 1 });
});

test("ledger RLS is fail-closed even if a future migration accidentally grants table access", async () => {
  await send();
  await privileged("grant select,insert,update,delete on velox_private.message_requests to authenticated,anon");
  for (const actor of [ids.buyer, ids.admin, null]) {
    await asUser(db, actor);
    assert.equal((await db.query("select * from velox_private.message_requests")).rows.length, 0);
    assert.equal((await db.query("delete from velox_private.message_requests returning request_id")).rows.length, 0);
    assert.equal((await db.query("update velox_private.message_requests set result='{}'::jsonb returning request_id")).rows.length, 0);
  }
  assert.deepEqual(await counts(), { messages: 2, automated: 1, requests: 1 });
});

test("new RPC does not broaden admin or outsider SELECT access to chats or message bodies", async () => {
  await send();
  for (const actor of [ids.stranger, ids.admin]) {
    await asUser(db, actor);
    assert.equal((await db.query("select * from public.messages")).rows.length, 0);
    assert.equal((await db.query("select * from public.conversations")).rows.length, 0);
  }
});

test("definer uses an empty search path, restricted EXECUTE and a per-author/request transaction lock", async () => {
  const { rows: [definition] } = await privileged(`select p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) as body,
    has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
    has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
    from pg_proc p where p.oid='public.send_message_idempotent(uuid,text,uuid)'::regprocedure`);
  assert.equal(definition.prosecdef, true);
  assert.deepEqual(definition.proconfig, ['search_path=""']);
  assert.equal(definition.anon_execute, false);
  assert.equal(definition.authenticated_execute, true);
  assert.match(definition.body, /pg_advisory_xact_lock/);
  assert.match(definition.body, /hashtextextended\(caller::text \|\| ':' \|\| message_request_id::text/);
  assert.match(definition.body, /for update/i);
});

test("queued duplicate calls remain idempotent on the local single-connection PostgreSQL fixture", async () => {
  // PGlite serializes these calls. Separate-session contention still requires the
  // staging PostgreSQL gate; this test deliberately does not claim to cover it.
  await asUser(db, ids.buyer);
  const results = await Promise.all(Array.from({ length: 12 }, () => db.query(rpc, [ids.conversation, body, requestId])));
  for (const result of results) assert.deepEqual(result.rows[0].result, results[0].rows[0].result);
  assert.deepEqual(await counts(), { messages: 2, automated: 1, requests: 1 });
});

test("wrapper still works after the coordinated legacy RPC and direct INSERT revocation", async () => {
  await privileged("revoke execute on function public.send_message_with_assistant(uuid,text) from authenticated");
  await privileged("revoke insert (conversation_id,sender_id,body) on public.messages from authenticated");
  await asUser(db, ids.buyer);
  await denied(db, () => db.query("select public.send_message_with_assistant($1,$2)", [ids.conversation, body]), assert);
  await denied(db, () => db.query("insert into public.messages(conversation_id,sender_id,body) values ($1,$2,$3)", [ids.conversation, ids.buyer, body]), assert);
  const first = await send();
  assert.deepEqual(await send(), first);
  assert.deepEqual(await counts(), { messages: 2, automated: 1, requests: 1 });
});

test("migration replay preserves existing request/results and does not reopen legacy permissions", async () => {
  const isolated = await makeDatabase();
  try {
    await isolated.exec("begin");
    await asUser(isolated, ids.buyer);
    const first = (await isolated.query(rpc, [ids.conversation, body, requestId])).rows[0].result;
    await isolated.exec("commit; reset role");
    await isolated.exec("revoke execute on function public.send_message_with_assistant(uuid,text) from authenticated");
    await isolated.exec("revoke insert (conversation_id,sender_id,body) on public.messages from authenticated");
    await isolated.exec(await readFile(migration, "utf8"));
    assert.equal((await isolated.query("select count(*)::int as count from velox_private.message_requests")).rows[0].count, 1);
    await isolated.exec("begin");
    await asUser(isolated, ids.buyer);
    assert.deepEqual((await isolated.query(rpc, [ids.conversation, body, requestId])).rows[0].result, first);
    await denied(isolated, () => isolated.query("select public.send_message_with_assistant($1,$2)", [ids.conversation, body]), assert);
    await denied(isolated, () => isolated.query("insert into public.messages(conversation_id,sender_id,body) values ($1,$2,$3)", [ids.conversation, ids.buyer, body]), assert);
    await denied(isolated, () => isolated.query("select * from velox_private.message_requests"), assert);
    assert.equal((await isolated.query("select count(*)::int as count from public.messages")).rows[0].count, 2);
    await isolated.exec("rollback; reset role");
  } finally {
    await isolated.close();
  }
});

for (const [nfc, expected] of [
  ["¿Cuántos kilómetros tiene?", /12[,.]345 km/],
  ["¿Dónde se puede ver?", /Mendoza/],
  ["¿Cuándo se puede visitar?", /horarios|proponer uno/i],
]) {
  test(`legacy recognizes decomposed NFD accents: ${nfc}`, async () => {
    const nfd = nfc.normalize("NFD");
    assert.notEqual(nfc, nfd);
    await asUser(db, ids.buyer);
    const result = (await db.query("select public.send_message_with_assistant($1,$2) as result", [ids.conversation, nfd])).rows[0].result;
    assert.equal(result.automated, true);
    const reply = (await db.query("select body from public.messages where id=$1", [result.automated_message_id])).rows[0].body;
    assert.match(reply, expected);
    assert.doesNotMatch(reply, /disponibilidad/);
  });
}

test("idempotent wrapper canonicalizes NFC before fingerprint and body persistence", async () => {
  const nfc = "¿Cuántos kilómetros tiene?";
  const nfd = nfc.normalize("NFD");
  const first = await send({ text: nfd });
  assert.equal(first.automated, true);
  assert.deepEqual(await send({ text: nfc }), first);
  assert.deepEqual(await send({ text: `  ${nfd}  ` }), first);
  const stored = (await privileged("select body from public.messages where id=$1", [first.message_id])).rows[0].body;
  assert.equal(stored, nfc);
  await denied(db, () => send({ text: nfc.replace("kilómetros", "kilometros") }), assert);
  assert.deepEqual(await counts(), { messages: 2, automated: 1, requests: 1 });
});

test("assistant reply always sorts after its human question without depending on random UUIDs", async () => {
  const sent = await send();
  const ordered = (await privileged(`select assistant.created_at > human.created_at as ordered
    from messages assistant join messages human on human.id=$1 where assistant.id=$2`, [sent.message_id,sent.automated_message_id])).rows[0].ordered;
  assert.equal(ordered,true);
  const next = await send({request:nextRequestId});
  assert.equal((await privileged(`select newer.created_at > previous.created_at as ordered
    from messages newer join messages previous on previous.id=$1 where newer.id=$2`, [sent.automated_message_id,next.message_id])).rows[0].ordered,true);
});
