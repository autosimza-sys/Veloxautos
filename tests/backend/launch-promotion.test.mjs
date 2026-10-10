import assert from 'node:assert/strict';
import { before, after, beforeEach, afterEach, test } from 'node:test';
import { makeDatabase, asUser, ids, denied } from './fixtures.mjs';
let db;
before(async () => { db = await makeDatabase(); });
after(async () => { await db?.close(); });
beforeEach(async () => { await db.exec('begin'); });
afterEach(async () => { await db.exec('rollback; reset role'); });
const quotas = { particular: 13, reseller: 53, agency: 203 };
async function start(when = new Date().toISOString()) {
  return db.query("select public.manage_launch_promotion('start',0,$1,$2) as result", [when, quotas]);
}
test('only an active administrator can start or extend the global launch', async () => {
  for (const id of [ids.seller, ids.buyer, ids.blocked, null]) {
    await asUser(db, id);
    await denied(db, () => start(), assert);
  }
  await asUser(db, ids.admin);
  const r = await start();
  assert.equal(r.rows[0].result.revision, 1);
});
test('all sellers and later signups share the global end date; start preserves used credits', async () => {
  await db.query('update public.credit_balances set used=3 where user_id=$1', [ids.seller]);
  await asUser(db, ids.admin);
  const result = (await start()).rows[0].result;
  assert.equal(Date.parse(result.ends_at) - Date.parse(result.starts_at), 90 * 86400000);
  await db.exec('reset role');
  const newcomer = '90000000-0000-0000-0000-000000000001';
  await db.query('insert into auth.users values ($1,$2,$3)', [newcomer,'new@example.invalid',{ role:'agency' }]);
  const rows = (await db.query('select * from public.credit_balances where user_id=any($1::uuid[]) order by user_id', [[ids.seller,newcomer]])).rows;
  assert.equal(rows[0].used,3);
  assert.equal(rows[0].granted-rows[0].used,13);
  assert.equal(rows[1].granted,203);
  assert.equal(rows[0].expires_at.toISOString(), rows[1].expires_at.toISOString());
});
test('extension changes the common deadline without resetting usage or gifting again; stale replay rejected', async () => {
  await asUser(db, ids.admin); await start();
  const before = (await db.query('select * from public.credit_balances where user_id=$1',[ids.seller])).rows[0];
  const count = (await db.query('select count(*)::int n from public.credit_ledger')).rows[0].n;
  const extended = (await db.query("select public.manage_launch_promotion('extend',1,null,null) as r")).rows[0].r;
  assert.equal(extended.revision,2);
  const balance=(await db.query('select * from public.credit_balances where user_id=$1',[ids.seller])).rows[0];
  assert.ok(balance.expires_at > before.expires_at);
  assert.equal(balance.used,before.used); assert.equal(balance.granted,before.granted);
  assert.equal((await db.query('select count(*)::int n from public.credit_ledger')).rows[0].n,count);
  await denied(db,()=>db.query("select public.manage_launch_promotion('extend',1,null,null)"),assert);
});
test('launch cannot be restarted and neither direct edits nor automatic paid mode are allowed',async()=>{
  await asUser(db,ids.admin); await start();
  await denied(db,()=>start(),assert);
  await denied(db,()=>db.query("update public.launch_promotion set revision=0"),assert);
  await denied(db,()=>db.query("select public.manage_launch_promotion('paid',1,null,null)"),assert);
});
test('invalid quantities and past launch dates are rejected without any changes',async()=>{
  await asUser(db,ids.admin);
  for(const q of [{}, {...quotas,agency:-1}, {...quotas,agency:1.5}, {...quotas,agency:1000001}]) {
    await denied(db,()=>db.query("select public.manage_launch_promotion('start',0,now(),$1)",[q]),assert);
  }
  await denied(db,()=>start('2000-01-01T00:00:00Z'),assert);
});
test('scheduled launch blocks insertion before start and expiration never enables billing',async()=>{
  await asUser(db,ids.admin); await start(new Date(Date.now()+86400000).toISOString());
  await db.exec('reset role');
  await denied(db,()=>db.query(`insert into public.vehicles(owner_id,brand,model,version,year,kilometers,price,zone)
    values ($1,'Test','Future','Base',2020,1,1000,'Mendoza')`,[ids.seller]),assert);
  await db.query("update public.launch_promotion set starts_at=now()-interval '91 days',ends_at=now()-interval '1 day'");
  await denied(db,()=>db.query(`insert into public.vehicles(owner_id,brand,model,version,year,kilometers,price,zone)
    values ($1,'Test','Expired','Base',2020,1,1000,'Mendoza')`,[ids.seller]),assert);
});
