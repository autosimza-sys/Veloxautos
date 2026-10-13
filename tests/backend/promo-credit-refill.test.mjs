import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { asUser, denied, ids, makeDatabase } from './fixtures.mjs';

let db;
const payload = { brand: 'Test', model: 'Free credits', version: 'Base', year: 2020, kilometers: 100, price: 1000, zone: 'Mendoza' };
const media = Array.from({ length: 4 }, (_, i) => ({ media_type: 'photo', storage_path: `${ids.seller}/promo-refill-${i}.jpg`, sort_order: i }));
const quotas = { particular: 100, reseller: 100, agency: 100 };
before(async () => {
  db = await makeDatabase();
  await db.exec(await readFile(new URL('../../scripts/finalize-client-cutover.sql', import.meta.url), 'utf8'));
});
after(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('begin');
  for (const item of media) await db.query("insert into storage.objects(bucket_id,name,metadata) values('vehicle-media',$1,$2)", [item.storage_path, { mimetype: 'image/jpeg', size: 100 }]);
});
afterEach(async () => { await db.exec('rollback; reset role'); });
async function root(sql, params = []) { await db.exec('reset role'); return db.query(sql, params); }
async function configure(cost = 50, refill = true, revision = 0) {
  await asUser(db, ids.admin);
  return (await db.query('select public.configure_launch_credit_policy($1,$2,$3) p', [revision, cost, refill])).rows[0].p;
}
async function start(q = quotas, when = null) {
  await asUser(db, ids.admin);
  return (await db.query("select public.manage_launch_promotion('start',0,coalesce($1::timestamptz,clock_timestamp()-interval '1 second'),$2) p", [when, q])).rows[0].p;
}
async function publish(request = crypto.randomUUID(), files = media, actor = ids.seller, data = payload) {
  await asUser(db, actor);
  return (await db.query('select * from public.publish_vehicle_with_credit($1,$2,$3)', [data, files, request])).rows[0];
}
async function balance() { return (await root('select granted,used,granted-used as remaining,expires_at from public.credit_balances where user_id=$1', [ids.seller])).rows[0]; }
async function ledger(kind) { return (await root('select amount,kind,reference_id,note from public.credit_ledger where user_id=$1 and kind=$2 order by created_at,id', [ids.seller, kind])).rows; }

test('policy configuration is versioned and leaves campaign and historical balances inactive and unchanged', async () => {
  const before = await balance();
  const configured = await configure();
  assert.equal(configured.publication_cost, 50);
  assert.equal(configured.auto_refill, true);
  assert.equal(configured.policy_revision, 1);
  assert.equal(configured.revision, 0);
  assert.equal(configured.starts_at, null);
  assert.equal(configured.ends_at, null);
  assert.deepEqual(await balance(), before);
  const audit = (await root('select actor,previous_policy,new_policy from velox_private.launch_credit_policy_events')).rows;
  assert.equal(audit.length, 1);
  assert.equal(audit[0].actor, ids.admin);
  assert.equal(audit[0].previous_policy.publication_cost, 1);
  assert.equal(audit[0].new_policy.publication_cost, 50);
});

test('only an active admin configures policy; invalid values and stale revisions mutate nothing', async () => {
  for (const actor of [ids.buyer, ids.seller, ids.blocked, null]) {
    await asUser(db, actor);
    await denied(db, () => db.query('select public.configure_launch_credit_policy(0,50,true)'), assert);
  }
  await asUser(db, ids.admin);
  for (const [revision, cost, refill] of [[0, 0, true], [0, -1, true], [0, 1000001, true], [0, null, true], [0, 1, null], [null, 1, true], [1, 50, true]]) {
    await denied(db, () => db.query('select public.configure_launch_credit_policy($1,$2,$3)', [revision, cost, refill]), assert);
  }
  await configure();
  await denied(db, () => db.query('select public.configure_launch_credit_policy(0,10,false)'), assert);
  assert.equal((await root('select count(*)::int n from velox_private.launch_credit_policy_events')).rows[0].n, 1);
});

test('before activation the legacy cost remains one and configured refill is dormant', async () => {
  await configure();
  await publish();
  assert.equal((await balance()).used, 1);
  assert.deepEqual(await ledger('promo_refill'), []);
  await root('update public.credit_balances set used=granted where user_id=$1', [ids.seller]);
  await denied(db, () => publish(), assert);
  assert.deepEqual(await ledger('promo_refill'), []);
});

test('legacy defaults charge one per publication and do not refill even in an active campaign', async () => {
  await start({ particular: 1, reseller: 1, agency: 1 });
  await root('update public.credit_balances set granted=1,used=0 where user_id=$1', [ids.seller]);
  await publish();
  assert.equal((await balance()).remaining, 0);
  await denied(db, () => publish(), assert);
  assert.deepEqual(await ledger('promo_refill'), []);
});

test('a new publication deducts the configured amount and immediately refills an exhausted promotional balance', async () => {
  await configure();
  const promotion = await start();
  await publish();
  assert.equal((await balance()).remaining, 50);
  const second = await publish();
  const after = await balance();
  assert.equal(after.granted, 200);
  assert.equal(after.used, 100);
  assert.equal(after.remaining, 100);
  assert.equal(after.expires_at.toISOString(), new Date(promotion.ends_at).toISOString());
  assert.deepEqual((await ledger('publication')).map(x => x.amount), [-50, -50]);
  const refills = await ledger('promo_refill');
  assert.equal(refills.length, 1);
  assert.equal(refills[0].amount, 100);
  assert.equal(refills[0].reference_id, second.id);
  assert.match(refills[0].note, /pol[ií]tica 1/i);
});

test('insufficient balance preserves its remainder when adding the role quota before the debit', async () => {
  await configure(10);
  await start();
  await root('update public.credit_balances set used=95 where user_id=$1', [ids.seller]);
  await publish();
  const after = await balance();
  assert.equal(after.granted, 200);
  assert.equal(after.used, 105);
  assert.equal(after.remaining, 95);
  assert.deepEqual((await ledger('promo_refill')).map(x => x.amount), [100]);
});

test('reading a zero balance does not refill; a successful publication can refill it atomically', async () => {
  await configure(); await start();
  await root('update public.credit_balances set used=granted where user_id=$1', [ids.seller]);
  for (let i = 0; i < 3; i++) assert.equal((await balance()).remaining, 0);
  assert.deepEqual(await ledger('promo_refill'), []);
  await publish();
  assert.equal((await balance()).remaining, 50);
  assert.equal((await balance()).used, 150);
  assert.equal((await ledger('promo_refill')).length, 1);
});

test('retry after refill returns the same vehicle without a second debit or gift, even after promotion ends', async () => {
  await configure(); await start();
  await root('update public.credit_balances set used=50 where user_id=$1', [ids.seller]);
  const request = crypto.randomUUID();
  const first = await publish(request);
  const before = await balance();
  const creditsBefore = await ledger('promo_refill');
  assert.equal((await publish(request)).id, first.id);
  await root("update public.launch_promotion set starts_at=clock_timestamp()-interval '91 days',ends_at=clock_timestamp()-interval '1 day'");
  assert.equal((await publish(request)).id, first.id);
  assert.deepEqual(await balance(), before);
  assert.deepEqual(await ledger('promo_refill'), creditsBefore);
  await denied(db, () => publish(request, media, ids.seller, { ...payload, price: 2000 }), assert);
});

test('invalid media and downstream insertion failure roll back publication, debit, refill and request', async () => {
  await configure(); await start();
  await root('update public.credit_balances set used=granted where user_id=$1', [ids.seller]);
  const before = await balance();
  const request = crypto.randomUUID();
  await denied(db, () => publish(request, media.slice(0, 3)), assert);
  await db.exec('reset role');
  await db.exec(`create function pg_temp.reject_promo_media() returns trigger language plpgsql as $$begin raise exception 'synthetic media failure'; end$$;
    create trigger reject_promo_media before insert on public.vehicle_media for each row execute function pg_temp.reject_promo_media()`);
  await denied(db, () => publish(request), assert);
  assert.deepEqual(await balance(), before);
  assert.deepEqual(await ledger('publication'), []);
  assert.deepEqual(await ledger('promo_refill'), []);
  assert.equal((await root('select count(*)::int n from public.publication_requests')).rows[0].n, 0);
  await root('drop trigger reject_promo_media on public.vehicle_media');
  assert.ok((await publish(request)).id);
});

test('buyers and blocked sellers never receive a refill', async () => {
  await configure(); await start();
  await root('update public.credit_balances set used=granted where user_id=$1', [ids.seller]);
  await root('update public.credit_balances set granted=1000 where user_id=any($1::uuid[])', [[ids.buyer, ids.admin]]);
  for (const actor of [ids.buyer, ids.admin, null]) await denied(db, () => publish(crypto.randomUUID(), media, actor), assert);
  await root('update public.profiles set is_blocked=true where id=$1', [ids.seller]);
  await denied(db, () => publish(), assert);
  assert.deepEqual(await ledger('promo_refill'), []);
});

test('future, expired and individually expired campaigns do not refill or publish', async () => {
  await configure();
  await start(quotas, new Date(Date.now() + 86400000).toISOString());
  await root('update public.credit_balances set used=granted where user_id=$1', [ids.seller]);
  await denied(db, () => publish(), assert);
  await root("update public.launch_promotion set starts_at=clock_timestamp()-interval '91 days',ends_at=clock_timestamp()-interval '1 microsecond'");
  await denied(db, () => publish(), assert);
  await root("update public.launch_promotion set starts_at=clock_timestamp()-interval '1 day',ends_at=clock_timestamp()+interval '1 day'");
  await root("update public.credit_balances set expires_at=clock_timestamp()-interval '1 microsecond' where user_id=$1", [ids.seller]);
  await denied(db, () => publish(), assert);
  assert.deepEqual(await ledger('promo_refill'), []);
});

test('wall-clock expiration is enforced even in a transaction that started while the campaign was open', async () => {
  await configure(); await start();
  await root('update public.credit_balances set used=granted where user_id=$1', [ids.seller]);
  // The test transaction began before this future deadline. now() stays old;
  // clock_timestamp advances, so a later send must be denied without refill.
  await root("update public.launch_promotion set starts_at=now()-interval '1 minute',ends_at=clock_timestamp()+interval '20 milliseconds'");
  await root('select pg_sleep(0.05)');
  await denied(db, () => publish(), assert);
  assert.deepEqual(await ledger('promo_refill'), []);
});

test('start validates refill quotas and freezes the policy without resetting either version counter', async () => {
  await configure();
  await denied(db, () => start({ ...quotas, reseller: 49 }), assert);
  assert.equal((await root('select revision from public.launch_promotion')).rows[0].revision, 0);
  const promotion = await start();
  assert.equal(promotion.revision, 1);
  assert.equal(promotion.policy_revision, 1);
  await denied(db, () => configure(10, true, 1), assert);
  const before = await balance();
  await asUser(db, ids.admin);
  await db.query("select public.manage_launch_promotion('extend',1,null,null)");
  const after = await balance();
  assert.equal(after.granted, before.granted);
  assert.equal(after.used, before.used);
  assert.ok(after.expires_at > before.expires_at);
  await denied(db, () => configure(10, true, 1), assert);
});

test('later signups get coherent role quotas and the same deadline without a fresh ninety-day term', async () => {
  await configure(); const promotion = await start({ particular: 100, reseller: 200, agency: 300 });
  for (const [role, amount] of [['particular', 100], ['reseller', 200], ['agency', 300]]) {
    const id = crypto.randomUUID();
    await root('insert into auth.users values($1,$2,$3)', [id, `${role}@example.invalid`, { role }]);
    const b = (await root('select granted,used,expires_at from public.credit_balances where user_id=$1', [id])).rows[0];
    assert.equal(b.granted, amount); assert.equal(b.used, 0);
    assert.equal(b.expires_at.toISOString(), new Date(promotion.ends_at).toISOString());
  }
});

test('queued identical publication requests refill and debit once', async () => {
  await configure(); await start();
  await root('update public.credit_balances set used=50 where user_id=$1', [ids.seller]);
  await asUser(db, ids.seller);
  const request = crypto.randomUUID();
  // Single-connection PGlite checks idempotent results; native PostgreSQL
  // sessions are a separate deployment gate for lock contention.
  const results = await Promise.all(Array.from({ length: 8 }, () => db.query('select * from public.publish_vehicle_with_credit($1,$2,$3)', [payload, media, request])));
  for (const result of results) assert.equal(result.rows[0].id, results[0].rows[0].id);
  assert.equal((await balance()).used, 100);
  assert.equal((await balance()).remaining, 100);
  assert.equal((await ledger('promo_refill')).length, 1);
  assert.equal((await ledger('publication')).length, 1);
});

test('clients cannot change, refill or inspect other sellers credits through the new policy API', async () => {
  await configure(); await start();
  await asUser(db, ids.seller);
  await denied(db, () => db.query('update public.launch_promotion set auto_refill=false'), assert);
  await denied(db, () => db.query('update public.credit_balances set granted=10000 where user_id=$1', [ids.seller]), assert);
  await denied(db, () => db.query("insert into public.credit_ledger(user_id,amount,kind)values($1,100,'promo_refill')", [ids.seller]), assert);
  await denied(db, () => db.query('select * from velox_private.launch_credit_policy_events'), assert);
  assert.equal((await db.query('select * from public.credit_balances where user_id=$1', [ids.stranger])).rows.length, 0);
  await denied(db, () => db.query('select public.create_vehicle_with_credit($1)', [payload]), assert);
});

test('a larger historical allowance survives launch unchanged and is spent using the new policy', async () => {
  await root('update public.credit_balances set granted=250,used=50 where user_id=$1', [ids.seller]);
  await configure(); await start();
  assert.deepEqual({ ...await balance(), expires_at: null }, { granted: 250, used: 50, remaining: 200, expires_at: null });
  await publish();
  assert.equal((await balance()).remaining, 150);
  assert.equal((await balance()).granted, 250);
  assert.deepEqual(await ledger('promo_refill'), []);
});

test('disabled auto-refill rejects an insufficient balance without gifting or discarding the remainder', async () => {
  await configure(10, false); await start();
  await root('update public.credit_balances set used=95 where user_id=$1', [ids.seller]);
  const before = await balance();
  await denied(db, () => publish(), assert);
  assert.deepEqual(await balance(), before);
  assert.deepEqual(await ledger('promo_refill'), []);
});

test('a legacy publication retry keeps its original cost after a draft policy change and launch', async () => {
  const request = crypto.randomUUID();
  const original = await publish(request);
  await configure(); await start();
  const before = await balance();
  assert.equal((await publish(request)).id, original.id);
  assert.deepEqual(await balance(), before);
  assert.deepEqual((await ledger('publication')).map(x => x.amount), [-1]);
  assert.deepEqual(await ledger('promo_refill'), []);
});

test('zero balance with a one-publication lot receives only the two required grants and retry adds none', async () => {
  await configure(100); await start();
  await root('update public.credit_balances set used=100 where user_id=$1', [ids.seller]);
  const request = crypto.randomUUID();
  const vehicle = await publish(request);
  assert.equal((await balance()).granted, 300);
  assert.equal((await balance()).used, 200);
  assert.equal((await balance()).remaining, 100);
  assert.deepEqual((await ledger('promo_refill')).map(x => [x.amount, x.reference_id]), [[100, vehicle.id], [100, vehicle.id]]);
  await publish(request);
  assert.equal((await ledger('promo_refill')).length, 2);
});

test('an explicit extension reopens a common expired term without regranting until use', async () => {
  await configure(); await start();
  await root('update public.credit_balances set used=granted where user_id=$1', [ids.seller]);
  await root("update public.launch_promotion set starts_at=clock_timestamp()-interval '91 days',ends_at=clock_timestamp()-interval '1 day'");
  await root("update public.credit_balances set expires_at=clock_timestamp()-interval '1 day' where user_id=$1", [ids.seller]);
  await asUser(db, ids.admin);
  const extended = (await db.query("select public.manage_launch_promotion('extend',1,null,null) p")).rows[0].p;
  assert.equal((await balance()).remaining, 0);
  assert.deepEqual(await ledger('promo_refill'), []);
  await publish();
  assert.equal((await balance()).remaining, 50);
  assert.equal((await balance()).expires_at.toISOString(), new Date(extended.ends_at).toISOString());
});

test('migration replay retains balances, refill history and both policy revisions', async () => {
  const isolated = await makeDatabase();
  try {
    await isolated.exec('begin');
    for (const item of media) await isolated.query("insert into storage.objects(bucket_id,name,metadata) values('vehicle-media',$1,$2)", [item.storage_path, { mimetype: 'image/jpeg', size: 100 }]);
    await asUser(isolated, ids.admin);
    await isolated.query('select public.configure_launch_credit_policy(0,10,true)');
    await isolated.query("select public.manage_launch_promotion('start',0,clock_timestamp()-interval '1 second',$1)", [quotas]);
    await isolated.exec('reset role');
    await isolated.query('update public.credit_balances set used=95 where user_id=$1', [ids.seller]);
    await asUser(isolated, ids.seller);
    await isolated.query('select * from public.publish_vehicle_with_credit($1,$2,$3)', [payload, media, crypto.randomUUID()]);
    await isolated.exec('commit; reset role');
    const before = (await isolated.query('select * from public.credit_balances order by user_id')).rows;
    const promoBefore = (await isolated.query('select * from public.launch_promotion')).rows;
    const refillsBefore = (await isolated.query("select * from public.credit_ledger where kind='promo_refill' order by id")).rows;
    assert.equal(refillsBefore.length, 1);
    await isolated.exec(await readFile(new URL('../../supabase/migrations/202610130002_promotional_credit_refill.sql', import.meta.url), 'utf8'));
    assert.deepEqual((await isolated.query('select * from public.credit_balances order by user_id')).rows, before);
    assert.deepEqual((await isolated.query('select * from public.launch_promotion')).rows, promoBefore);
    assert.deepEqual((await isolated.query("select * from public.credit_ledger where kind='promo_refill' order by id")).rows, refillsBefore);
    assert.equal((await isolated.query('select count(*)::int n from velox_private.launch_credit_policy_events')).rows[0].n, 1);
  } finally { await isolated.close(); }
});
