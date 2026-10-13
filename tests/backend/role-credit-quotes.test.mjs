import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { asUser, denied, ids, makeDatabase } from './fixtures.mjs';

let db;
const proposed = { particular: 50, reseller: 40, agency: 30 };
const quotas = { particular: 100, reseller: 100, agency: 100 };
const payload = { brand: 'Test', model: 'Quoted credits', version: 'Base', year: 2020, kilometers: 100, price: 1000, zone: 'Mendoza' };
const files = owner => Array.from({ length: 4 }, (_, i) => ({ media_type: 'photo', storage_path: `${owner}/quoted-${i}.jpg`, sort_order: i }));
before(async () => {
  db = await makeDatabase();
  await db.exec(await readFile(new URL('../../scripts/finalize-client-cutover.sql', import.meta.url), 'utf8'));
});
after(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('begin');
  for (const owner of [ids.seller, ids.stranger]) for (const item of files(owner)) {
    await db.query("insert into storage.objects(bucket_id,name,metadata) values('vehicle-media',$1,$2)", [item.storage_path, { mimetype: 'image/jpeg', size: 100 }]);
  }
});
afterEach(async () => { await db.exec('rollback; reset role'); });
async function root(sql, params = []) { await db.exec('reset role'); return db.query(sql, params); }
async function configure(costs = proposed, ai = 1, refill = true, revision = 0) {
  await asUser(db, ids.admin);
  return (await db.query('select public.configure_launch_role_credit_policy($1,$2,$3,$4) p', [revision, costs, ai, refill])).rows[0].p;
}
async function start(q = quotas) {
  await asUser(db, ids.admin);
  return (await db.query("select public.manage_launch_promotion('start',0,clock_timestamp()-interval '1 second',$1) p", [q])).rows[0].p;
}
async function quote(actor = ids.seller) {
  await asUser(db, actor);
  return (await db.query('select public.get_publication_quote() q')).rows[0].q;
}
async function publish({ actor = ids.seller, request = crypto.randomUUID(), quoted, data = payload, media = files(actor) } = {}) {
  await asUser(db, actor);
  return (await db.query('select * from public.publish_vehicle_with_credit($1,$2,$3)', [quoted === undefined ? data : { ...data, publication_quote: quoted }, media, request])).rows[0];
}
async function used(actor = ids.seller) { return (await root('select used from public.credit_balances where user_id=$1', [actor])).rows[0].used; }

test('an explicit extension adds exactly ninety days rather than three calendar months', async () => {
  await start();
  await root("update public.launch_promotion set starts_at='3000-04-01T00:00:00Z',ends_at='3000-07-01T00:00:00Z'");
  await asUser(db, ids.admin);
  const p = (await db.query("select public.manage_launch_promotion('extend',1,null,null) p")).rows[0].p;
  assert.equal(Date.parse(p.ends_at) - Date.parse('3000-07-01T00:00:00Z'), 90 * 86400000);
});

test('draft role tariffs and the AI proposal are configurable without activating or moving credits', async () => {
  const before = (await root('select * from public.credit_balances order by user_id')).rows;
  const p = await configure();
  assert.equal(p.revision, 0); assert.equal(p.starts_at, null);
  assert.deepEqual(p.publication_costs, proposed);
  assert.equal(p.ai_response_cost_draft, 1);
  assert.equal(p.policy_revision, 1);
  assert.deepEqual((await root('select * from public.credit_balances order by user_id')).rows, before);
  assert.deepEqual(await quote(), { cost: 1, role: 'particular', campaign_revision: 0, policy_revision: 1 });
  const audit = (await root('select new_policy from velox_private.launch_credit_policy_events')).rows[0].new_policy;
  assert.deepEqual(audit.publication_costs, proposed);
  assert.equal(audit.ai_response_cost_draft, 1);
});

test('role policy accepts only complete positive integer role costs and a nonnegative AI draft', async () => {
  await asUser(db, ids.admin);
  for (const costs of [null, [], {}, { ...proposed, agency: 0 }, { ...proposed, agency: 1.5 }, { ...proposed, agency: 1000001 }, { ...proposed, agency: '30' }, { ...proposed, registered: 1 }]) {
    await denied(db, () => db.query('select public.configure_launch_role_credit_policy(0,$1,1,true)', [costs]), assert);
  }
  for (const ai of [-1, 1000001]) await denied(db, () => db.query('select public.configure_launch_role_credit_policy(0,$1,$2,true)', [proposed, ai]), assert);
  for (const actor of [ids.seller, ids.buyer, ids.admin, null]) {
    if (actor === ids.admin) await root('update public.profiles set is_blocked=true where id=$1', [actor]);
    await asUser(db, actor);
    await denied(db, () => db.query('select public.configure_launch_role_credit_policy(0,$1,1,true)', [proposed]), assert);
  }
});

test('a new publication uses its seller role tariff with atomic refill and no charge to the buyer', async () => {
  await configure(); await start();
  await root("update public.profiles set role='reseller' where id=$1", [ids.stranger]);
  const sellerQuote = await quote();
  assert.equal(sellerQuote.cost, 50);
  await publish({ quoted: sellerQuote });
  const resellerQuote = await quote(ids.stranger);
  assert.equal(resellerQuote.cost, 40);
  await publish({ actor: ids.stranger, quoted: resellerQuote });
  await root("update public.profiles set role='agency' where id=$1", [ids.stranger]);
  const agencyQuote = await quote(ids.stranger);
  assert.equal(agencyQuote.cost, 30);
  await publish({ actor: ids.stranger, quoted: agencyQuote });
  assert.equal(await used(), 50); assert.equal(await used(ids.stranger), 70);
  assert.equal(await used(ids.buyer), 0);
});

test('integral JSON decimal tariffs are normalized before later quote and launch casts', async () => {
  await asUser(db, ids.admin);
  const p = (await db.query(`select public.configure_launch_role_credit_policy(0,'{"particular":50.0,"reseller":40.0,"agency":30.0}',1,true) p`)).rows[0].p;
  assert.deepEqual(p.publication_costs, proposed);
  await start();
  const current = await quote();
  assert.equal(current.cost, 50);
  await publish({ quoted: current });
  assert.equal(await used(), 50);
});

test('launch validates each role quota against that roles price and freezes both draft policies', async () => {
  await configure();
  await denied(db, () => start({ particular: 50, reseller: 39, agency: 30 }), assert);
  await start({ particular: 50, reseller: 40, agency: 30 });
  await denied(db, () => configure(proposed, 2, true, 1), assert);
  await asUser(db, ids.admin);
  await denied(db, () => db.query('select public.configure_launch_credit_policy(1,5,true)'), assert);
});

test('the uniform policy API clears a role override explicitly and preserves the separate AI proposal', async () => {
  await configure(); await asUser(db, ids.admin);
  const p = (await db.query('select public.configure_launch_credit_policy(1,20,false) p')).rows[0].p;
  assert.equal(p.publication_costs, null);
  assert.equal(p.publication_cost, 20);
  assert.equal(p.ai_response_cost_draft, 1);
  await start();
  assert.equal((await quote()).cost, 20);
});

test('a stale quote from before launch or role change never debits a different tariff', async () => {
  await configure(); const draftQuote = await quote(); await start();
  await denied(db, () => publish({ quoted: draftQuote }), assert);
  const oldRoleQuote = await quote();
  await root("update public.profiles set role='agency' where id=$1", [ids.seller]);
  await denied(db, () => publish({ quoted: oldRoleQuote }), assert);
  assert.equal(await used(), 0);
  await publish({ quoted: await quote() });
  assert.equal(await used(), 30);
});

test('an active campaign rejects missing and forged quotes while legacy default clients still work before launch', async () => {
  await publish(); assert.equal(await used(), 1);
  await configure(); await start();
  await denied(db, () => publish(), assert);
  const current = await quote();
  for (const forged of [{ ...current, cost: 1 }, { ...current, role: 'agency' }, { ...current, policy_revision: 0 }, { ...current, campaign_revision: 0 }, { ...current, surprise: true }]) {
    await denied(db, () => publish({ quoted: forged }), assert);
  }
  assert.equal(await used(), 1);
});

test('exact request retries ignore renewed quote metadata but preserve the vehicle intent', async () => {
  await configure(); await start();
  const request = crypto.randomUUID();
  const originalQuote = await quote();
  const original = await publish({ request, quoted: originalQuote });
  await asUser(db, ids.admin);
  await db.query("select public.manage_launch_promotion('extend',1,null,null)");
  const refreshed = await quote();
  assert.equal(refreshed.campaign_revision, 2);
  await denied(db, () => publish({ quoted: originalQuote }), assert);
  assert.equal((await publish({ request, quoted: refreshed })).id, original.id);
  assert.equal((await publish({ request })).id, original.id);
  assert.equal(await used(), 50);
  await denied(db, () => publish({ request, quoted: refreshed, data: { ...payload, price: 2 } }), assert);
  const saved = (await root('select request_payload from public.publication_requests where request_id=$1', [request])).rows[0].request_payload;
  assert.equal(Object.hasOwn(saved, 'publication_quote'), false);
});

test('quotes are seller-only reads that cannot refill, start a campaign, or disclose other balances', async () => {
  await configure(); await start();
  await root('update public.credit_balances set used=granted where user_id=$1', [ids.seller]);
  const before = (await root('select * from public.credit_balances where user_id=$1', [ids.seller])).rows;
  for (let i = 0; i < 3; i++) await quote();
  assert.deepEqual((await root('select * from public.credit_balances where user_id=$1', [ids.seller])).rows, before);
  for (const actor of [ids.buyer, ids.admin, ids.blocked, null]) await denied(db, () => quote(actor), assert);
});

test('a draft AI price never charges for generated or fallback messages in the current lifecycle', async () => {
  await configure(); await start();
  const before = (await root('select * from public.credit_balances order by user_id')).rows;
  const message = crypto.randomUUID();
  await root('insert into public.messages(id,conversation_id,sender_id,body) values($1,$2,$3,$4)', [message, ids.conversation, ids.buyer, 'Consulta fuera de las FAQ']);
  await db.exec('set local role service_role');
  assert.equal((await db.query('select public.claim_ai_reply($1,$2,10,10) r', [message, ids.buyer])).rows[0].r.state, 'claimed');
  assert.equal((await db.query('select public.finish_ai_reply($1,$2,$3) r', [message, ids.buyer, 'El vendedor debe confirmar ese dato.'])).rows[0].r.state, 'done');
  await db.query('select public.finish_ai_reply($1,$2,$3)', [message, ids.buyer, 'Intento duplicado']);
  assert.deepEqual((await root('select * from public.credit_balances order by user_id')).rows, before);
  assert.equal((await root("select count(*)::int n from public.credit_ledger where kind not in ('initial_grant','admin_adjustment')")).rows[0].n, 0);
});
