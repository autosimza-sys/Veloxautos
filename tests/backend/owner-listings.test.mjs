import assert from 'node:assert/strict';
import { before, beforeEach, after, afterEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { asUser, denied, ids, makeDatabase, root } from './fixtures.mjs';

let db;
before(async () => { db = await makeDatabase(); });
after(async () => { await db?.close(); });
beforeEach(async () => { await db.exec('begin'); });
afterEach(async () => { await db.exec('rollback; reset role'); });
const edit = (payload, id = ids.car) => db.query('select * from public.update_vehicle_listing($1,$2)', [id, payload]);
const status = (value, id = ids.car) => db.query('select * from public.set_vehicle_listing_status($1,$2)', [id, value]);

test('owner edits whitelisted fields without changing identity, media or credit balance', async () => {
  const original = (await db.query('select * from public.vehicles where id=$1', [ids.car])).rows[0];
  await asUser(db, ids.seller);
  const updated = (await edit({ brand: ' Toyota ', price: '2500000', kilometers: 0, description: 'Editado', accepts_trade: true })).rows[0];
  assert.equal(updated.brand, 'Toyota');
  assert.equal(updated.price, 2500000);
  assert.equal(updated.kilometers, 0);
  assert.equal(updated.description, 'Editado');
  assert.equal(updated.accepts_trade, true);
  for (const field of ['id', 'owner_id', 'status', 'created_at', 'checklist', 'score']) assert.deepEqual(updated[field], original[field]);
  assert.equal((await db.query('select * from public.vehicle_media where vehicle_id=$1', [ids.car])).rows.length, 1);
  assert.equal((await db.query('select used from public.credit_balances where user_id=$1', [ids.seller])).rows[0].used, 0);
  assert.equal((await db.query("select * from public.credit_ledger where kind='publication'")).rows.length, 0);
});

test('pause, recoverable withdrawal and reactivation preserve vehicle, media and credits', async () => {
  await asUser(db, ids.seller);
  for (const value of ['paused', 'paused', 'active', 'deleted', 'deleted', 'active']) {
    assert.equal((await status(value)).rows[0].status, value);
  }
  assert.equal((await db.query('select * from public.vehicles where id=$1', [ids.car])).rows.length, 1);
  assert.equal((await db.query('select * from public.vehicle_media where vehicle_id=$1', [ids.car])).rows.length, 1);
  assert.equal((await db.query('select used from public.credit_balances where user_id=$1', [ids.seller])).rows[0].used, 0);
});

test('owner cannot directly update identity, bypass RPC validation or physically delete a vehicle', async () => {
  await asUser(db, ids.seller);
  for (const command of [
    "update public.vehicles set price=-1 where id=$1 returning id",
    "update public.vehicles set owner_id='10000000-0000-0000-0000-000000000003' where id=$1 returning id",
    'delete from public.vehicles where id=$1 returning id',
  ]) await denied(db, () => db.query(command, [ids.car]), assert);
  assert.equal((await db.query('select * from public.vehicles where id=$1', [ids.car])).rows[0].price, 1000000);
});

test('RPC does not let the caller change identity, status, checklist, media, score or unknown fields', async () => {
  await asUser(db, ids.seller);
  for (const field of ['id', 'owner_id', 'created_at', 'updated_at', 'status', 'score', 'checklist', 'vehicle_media', 'extra']) {
    await denied(db, () => edit({ [field]: 'ignored?' }), assert);
  }
});

test('publication-compatible required text and integer ranges are enforced atomically', async () => {
  await asUser(db, ids.seller);
  for (const changed of [
    { price: 0 }, { price: -1 }, { price: 2147483648 }, { price: '2.5' }, { price: true },
    { kilometers: -1 }, { kilometers: '1e3' }, { kilometers: null },
    { year: 1885 }, { year: new Date().getFullYear() + 2 }, { year: 2020.1 },
    { brand: ' ' }, { model: null }, { version: [] }, { zone: 4 },
    { accepts_trade: 'true' }, { accepts_financing: null }, { description: {} }, { partial_plate: 7 },
  ]) await denied(db, () => edit({ ...changed, description: 'Should roll back', ...(Object.hasOwn(changed, 'description') ? { description: changed.description } : {}) }), assert);
  assert.equal((await db.query('select price,description from public.vehicles where id=$1', [ids.car])).rows[0].price, 1000000);
});

test('empty, array and null update payloads are rejected', async () => {
  await asUser(db, ids.seller);
  for (const payload of [{}, [], null]) await denied(db, () => edit(payload), assert);
});

test('another seller, buyer, mechanic and anonymous cannot mutate another owner', async () => {
  for (const user of [ids.stranger, ids.buyer, ids.mechanic, null]) {
    await asUser(db, user);
    await denied(db, () => edit({ price: 1 }), assert);
    await denied(db, () => status('deleted'), assert);
  }
});

test('blocked seller and former seller cannot read or mutate their own listings', async () => {
  for (const changed of ["is_blocked=true", "role='registered'"]) {
    await db.exec('savepoint profile_state; reset role');
    await db.query(`update public.profiles set ${changed} where id=$1`, [ids.seller]);
    await asUser(db, ids.seller);
    assert.equal((await db.query('select * from public.vehicles')).rows.length, 0);
    await denied(db, () => edit({ price: 1 }), assert);
    await denied(db, () => status('paused'), assert);
    await db.exec('rollback to savepoint profile_state');
  }
});

test('owner list includes own inactive rows only; anonymous raw table access stays closed', async () => {
  await asUser(db, ids.seller);
  await status('deleted');
  assert.deepEqual((await db.query('select id from public.vehicles order by id')).rows.map(row => row.id), [ids.car, ids.pausedCar]);
  await asUser(db, ids.stranger);
  assert.deepEqual((await db.query('select id from public.vehicles')).rows.map(row => row.id), [ids.otherCar]);
  await asUser(db, null);
  assert.equal((await db.query('select * from public.vehicles')).rows.length, 0);
});

test('draft rows cannot be published or routed through withdrawal/reactivation without the credit RPC', async () => {
  await db.query("update public.vehicles set status='draft' where id=$1", [ids.car]);
  await asUser(db, ids.seller);
  for (const value of ['active', 'paused', 'deleted', 'draft', 'sold', null]) await denied(db, () => status(value), assert);
  assert.equal((await edit({ price: 1500000 })).rows[0].status, 'draft');
});

test('invalid status and missing target are rejected', async () => {
  await asUser(db, ids.seller);
  for (const value of ['draft', 'sold', '', null]) await denied(db, () => status(value), assert);
  const missing = '20000000-0000-0000-0000-000000000099';
  await denied(db, () => edit({ price: 1 }, missing), assert);
  await denied(db, () => status('active', missing), assert);
});

test('catalog immediately reflects price edits and hides paused/withdrawn listings', async () => {
  await asUser(db, ids.seller);
  await edit({ price: 2000000 });
  assert.equal((await db.query('select price from public.get_vehicle_catalog() where id=$1', [ids.car])).rows[0].price, 2000000);
  for (const value of ['paused', 'deleted']) {
    await status(value);
    assert.equal((await db.query('select id from public.get_vehicle_catalog() where id=$1', [ids.car])).rows.length, 0);
  }
  await status('active');
  assert.equal((await db.query('select id from public.get_vehicle_catalog() where id=$1', [ids.car])).rows.length, 1);
});

test('active admin moderation uses the status RPC without editing identity or deleting rows', async () => {
  await asUser(db, ids.admin);
  for (const value of ['paused', 'deleted', 'active']) assert.equal((await status(value, ids.otherCar)).rows[0].status, value);
  await denied(db, () => edit({ price: 1 }, ids.otherCar), assert);
  await denied(db, () => db.query('delete from public.vehicles where id=$1', [ids.otherCar]), assert);
  await denied(db, () => db.query("update public.vehicles set status='paused' where id=$1", [ids.otherCar]), assert);
  assert.equal((await db.query('select id from public.vehicles')).rows.length, 3);
});

test('owner migration is forward-only and reapplicable without losing listings', async () => {
  const sql = await readFile(path.join(root, 'supabase/migrations/202610030005_owner_listing_management.sql'), 'utf8');
  // Use the existing outer transaction; remove migration transaction wrappers.
  await db.exec(sql.replace(/^begin;\s*$/m, '').replace(/^commit;\s*$/m, ''));
  assert.equal((await db.query('select count(*)::int as total from public.vehicles')).rows[0].total, 3);
});

test('blocked administrator cannot use the status RPC or read owner rows', async () => {
  await db.query('update public.profiles set is_blocked=true where id=$1', [ids.admin]);
  await asUser(db, ids.admin);
  await denied(db, () => status('deleted'), assert);
  assert.equal((await db.query('select id from public.vehicles')).rows.length, 0);
});

test('editing a withdrawn listing does not accidentally reactivate it', async () => {
  await asUser(db, ids.seller);
  await status('deleted');
  assert.equal((await edit({ price: 2500000 })).rows[0].status, 'deleted');
  assert.equal((await db.query('select id from public.get_vehicle_catalog() where id=$1', [ids.car])).rows.length, 0);
});
