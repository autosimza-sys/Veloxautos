import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {before,after,beforeEach,afterEach,test} from 'node:test';
import {asUser,denied,ids,makeDatabase} from './fixtures.mjs';
let db;
before(async()=>{db=await makeDatabase();});after(async()=>{await db?.close();});
beforeEach(async()=>{await db.exec('begin');});afterEach(async()=>{await db.exec('rollback;reset role');});
const base={vehicle:ids.car,start:'2099-10-03T15:00:00Z',end:'2099-10-03T18:00:00Z',duration:30,location:'PRIVATE_VISIT_LOCATION',zone:'America/Argentina/Mendoza',consent:true};
async function create(overrides={}){const a={...base,request:randomUUID(),...overrides};return (await db.query('select public.authorize_visit_window($1,$2,$3,$4,$5,$6,$7,$8) value',[a.vehicle,a.start,a.end,a.duration,a.location,a.zone,a.consent,a.request])).rows[0].value;}
async function list(vehicle=ids.car){return (await db.query('select public.get_visit_authorizations($1) value',[vehicle])).rows[0].value;}
async function revoke(id){return (await db.query('select public.revoke_visit_authorization($1) value',[id])).rows[0].value;}
async function privileged(sql,args=[]){await db.exec('reset role');return db.query(sql,args);}

test('owner explicitly authorizes a dated private window without reserving, messaging or charging',async()=>{
 const before=(await db.query('select (select count(*) from public.appointments) visits,(select count(*) from public.messages) messages,(select count(*) from public.credit_ledger) credits')).rows;
 await asUser(db,ids.seller);const row=await create();assert.equal(row.vehicle_id,ids.car);assert.equal(row.location,base.location);assert.equal(row.duration_minutes,30);assert.equal(row.timezone,base.zone);assert.ok(row.authorized_at);assert.equal(row.revoked_at,null);assert.equal(row.consent_version,'visit-window-v1');assert.deepEqual(await list(),[row]);
 const saved=(await privileged('select * from velox_private.visit_authorizations where id=$1',[row.id])).rows[0];assert.equal(saved.owner_id,ids.seller);
 assert.deepEqual((await db.query('select (select count(*) from public.appointments) visits,(select count(*) from public.messages) messages,(select count(*) from public.credit_ledger) credits')).rows,before);
});
for(const actor of [null,ids.buyer,ids.stranger,ids.admin,ids.mechanic,ids.blocked])test(`actor ${actor||'anonymous'} cannot create or inspect another seller authorization`,async()=>{
 await asUser(db,ids.seller);await create();await asUser(db,actor);await denied(db,()=>create(),assert);await denied(db,()=>list(),assert);
});
test('false or omitted consent cannot authorize',async()=>{await asUser(db,ids.seller);for(const consent of [false,null])await denied(db,()=>create({consent}),assert);assert.deepEqual(await list(),[]);});
test('invalid dates, durations, location and timezone are rejected atomically',async()=>{
 await asUser(db,ids.seller);
 for(const value of [{start:null},{end:null},{start:'infinity'},{end:'infinity'},{start:'2020-01-01T00:00Z'},{end:base.start},{end:'2099-10-05T15:00Z'},{duration:null},{duration:0},{duration:-1},{duration:181},{location:' '},{location:'x'.repeat(301)},{zone:'Mars/Invented'},{zone:null},{request:null}])await denied(db,()=>create(value),assert);
 assert.deepEqual(await list(),[]);
});
test('same request returns same authority and cannot be changed or revive revoked consent',async()=>{
 await asUser(db,ids.seller);const request=randomUUID();const first=await create({request});assert.deepEqual(await create({request}),first);
 await denied(db,()=>create({request,location:'changed'}),assert);
 const revoked=await revoke(first.id);assert.ok(revoked.revoked_at);assert.equal((await create({request})).revoked_at,revoked.revoked_at);assert.deepEqual(await revoke(first.id),revoked);
 assert.equal((await list()).length,1);
});
test('overlapping or duplicate windows are rejected; adjacent windows and revoked replacement are allowed',async()=>{
 await asUser(db,ids.seller);const first=await create();for(const interval of [{},{start:'2099-10-03T17:00Z',end:'2099-10-03T19:00Z'},{start:'2099-10-03T14:00Z',end:'2099-10-03T16:00Z'}])await denied(db,()=>create(interval),assert);
 await create({start:base.end,end:'2099-10-03T19:00Z'});await revoke(first.id);const replacement=await create();assert.notEqual(replacement.id,first.id);
});
test('only owner revokes, the original agreement fields remain unchanged and browser table writes are closed',async()=>{
 await asUser(db,ids.seller);const first=await create();await asUser(db,ids.stranger);await denied(db,()=>revoke(first.id),assert);await asUser(db,ids.seller);const revoked=await revoke(first.id);
 for(const [key,value]of Object.entries(first))if(key!=='revoked_at')assert.deepEqual(revoked[key],value);
 await denied(db,()=>db.query('select * from velox_private.visit_authorizations'),assert);await denied(db,()=>db.query('delete from velox_private.visit_authorizations'),assert);
});
test('paused listing keeps owner read/revocation but refuses new authorization',async()=>{
 await asUser(db,ids.seller);const row=await create();await privileged("update public.vehicles set status='paused' where id=$1",[ids.car]);await asUser(db,ids.seller);assert.equal((await list()).length,1);await denied(db,()=>create({start:base.end,end:'2099-10-03T19:00Z'}),assert);assert.ok((await revoke(row.id)).revoked_at);
});
test('blocked seller cannot read, create or revoke',async()=>{
 await asUser(db,ids.seller);const row=await create();await privileged('update public.profiles set is_blocked=true where id=$1',[ids.seller]);await asUser(db,ids.seller);await denied(db,()=>list(),assert);await denied(db,()=>create(),assert);await denied(db,()=>revoke(row.id),assert);
});
test('private authorization table remains unreadable even after accidental client grants',async()=>{
 await asUser(db,ids.seller);await create();await privileged('grant usage on schema velox_private to authenticated');await db.exec('grant select on velox_private.visit_authorizations to authenticated');await asUser(db,ids.seller);assert.deepEqual((await db.query('select * from velox_private.visit_authorizations')).rows,[]);
});
test('RPCs retain empty search path and no anonymous or PUBLIC execution',async()=>{
 const rows=(await db.query("select p.proname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') anon from pg_proc p where p.proname in ('get_visit_authorizations','authorize_visit_window','revoke_visit_authorization')")).rows;
 assert.equal(rows.length,3);for(const r of rows){assert.equal(r.prosecdef,true);assert.ok(r.proconfig.includes('search_path=""'));assert.equal(r.anon,false);}
});

for(const role of ['reseller','agency'])test(`${role} can authorize their own listing`,async()=>{
 await privileged('update public.profiles set role=$1 where id=$2',[role,ids.seller]);await asUser(db,ids.seller);assert.equal((await create()).vehicle_id,ids.car);
});
test('20 upcoming windows bound configuration while revoking releases capacity',async()=>{
 await asUser(db,ids.seller);let first;
 for(let i=1;i<=20;i++){const day=String(i).padStart(2,'0');const saved=await create({start:`2099-11-${day}T15:00Z`,end:`2099-11-${day}T16:00Z`});first ||=saved;}
 await denied(db,()=>create(),assert);await revoke(first.id);assert.ok((await create()).id);
});
test('authorization fields and revoked evidence cannot be rewritten by privileged updates',async()=>{
 await asUser(db,ids.seller);const row=await create();await privileged('select 1');await denied(db,()=>db.query("update velox_private.visit_authorizations set location='changed' where id=$1",[row.id]),assert);
 await asUser(db,ids.seller);await revoke(row.id);await privileged('select 1');await denied(db,()=>db.query('update velox_private.visit_authorizations set revoked_at=null where id=$1',[row.id]),assert);
});
test('same request UUID belongs to its owner and cannot migrate to another vehicle',async()=>{
 const request=randomUUID();await asUser(db,ids.seller);const first=await create({request});await denied(db,()=>create({request,vehicle:ids.pausedCar}),assert);
 await asUser(db,ids.stranger);const second=await create({request,vehicle:ids.otherCar});assert.notEqual(first.id,second.id);assert.equal((await list(ids.otherCar)).length,1);
});
