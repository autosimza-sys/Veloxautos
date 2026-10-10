import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {before,after,beforeEach,afterEach,test} from 'node:test';
import {asUser,denied,ids,makeDatabase} from './fixtures.mjs';
let db,authority;
before(async()=>{db=await makeDatabase();});after(async()=>{await db?.close();});
beforeEach(async()=>{await db.exec('begin');await asUser(db,ids.seller);authority=(await db.query("select public.authorize_visit_window($1,'2099-10-03T15:00Z','2099-10-03T17:00Z',30,'PRIVATE MEETING','America/Argentina/Mendoza',true,$2) value",[ids.car,randomUUID()])).rows[0].value;await asUser(db,ids.buyer);});
afterEach(async()=>{await db.exec('rollback;reset role');});
const start='2099-10-03T15:00:00Z';
async function slots(conv=ids.conversation){return(await db.query('select public.get_available_visit_slots($1) value',[conv])).rows[0].value;}
async function book(o={}){const p={conversation:ids.conversation,authorization:authority.id,start,consent:true,request:randomUUID(),...o};return(await db.query('select public.book_authorized_visit($1,$2,$3,$4,$5) value',[p.conversation,p.authorization,p.start,p.consent,p.request])).rows[0].value;}
async function notices(){return(await db.query('select public.get_visit_notices() value')).rows[0].value;}
async function privileged(sql,args=[]){await db.exec('reset role');return db.query(sql,args);}
test('buyer sees bounded slots and explicitly confirms with seller authority; both people reserved and notified',async()=>{
 const credits=(await privileged('select count(*)::int n from public.credit_ledger')).rows[0].n;await asUser(db,ids.buyer);
 const available=await slots();assert.equal(available.length,4);assert.equal(available[0].authorization_id,authority.id);assert.equal(available[0].location,'PRIVATE MEETING');
 const visit=await book();assert.equal(visit.status,'confirmed');assert.equal(visit.confirmation_source,'seller_authorization');assert.equal(visit.buyer_id,ids.buyer);assert.equal(visit.seller_id,ids.seller);assert.equal(visit.seller_confirmed_at,authority.authorized_at);assert.ok(visit.buyer_confirmed_at);assert.equal(visit.duration_minutes,30);
 assert.equal((await slots()).length,3);let n=await notices();assert.equal(n.length,1);assert.equal(n[0].kind,'confirmed');assert.equal(n[0].appointment_id,visit.id);
 await asUser(db,ids.seller);n=await notices();assert.equal(n.length,1);assert.equal(n[0].buyer_name,'buyer');assert.equal(n[0].vehicle_title,'Test Car');assert.equal(n[0].location,'PRIVATE MEETING');assert.equal(n[0].read_at,null);
 assert.equal((await privileged('select count(*)::int n from velox_private.appointment_reservations')).rows[0].n,2);
 assert.equal((await db.query('select count(*)::int n from public.credit_ledger')).rows[0].n,credits);
});
for(const actor of [null,ids.seller,ids.stranger,ids.admin,ids.blocked])test(`outsider or non-buyer ${actor} cannot see slots or book`,async()=>{await asUser(db,actor);await denied(db,()=>slots(),assert);await denied(db,()=>book(),assert);});
test('explicit buyer consent and server slot alignment are required',async()=>{
 for(const o of [{consent:false},{consent:null},{request:null},{start:'infinity'},{start:null},{start:'2099-10-03T15:01Z'},{start:'2099-10-03T17:00Z'},{authorization:randomUUID()}])await denied(db,()=>book(o),assert);
 assert.equal((await slots()).length,4);assert.deepEqual(await notices(),[]);
});
test('revocation, inactive car, blocked conversation or participant reject stale offers',async()=>{
 for(const sql of ["update velox_private.visit_authorizations set revoked_at=clock_timestamp()","update public.vehicles set status='paused'","update public.conversations set is_blocked=true",`update public.profiles set is_blocked=true where id='${ids.seller}'`,`update public.profiles set is_blocked=true where id='${ids.buyer}'`]){
  await db.exec('savepoint stale');await privileged(sql);await asUser(db,ids.buyer);await denied(db,()=>book(),assert);await db.exec('rollback to savepoint stale');
 }
});
test('identical retry returns current visit without new notices or reservations; changed request rejected',async()=>{
 const request=randomUUID();const first=await book({request});assert.deepEqual(await book({request}),first);await denied(db,()=>book({request,start:'2099-10-03T15:30Z'}),assert);
 await asUser(db,ids.seller);await db.query('select public.revoke_visit_authorization($1)',[authority.id]);await asUser(db,ids.buyer);assert.deepEqual(await book({request}),first);
 await db.query("select public.transition_appointment($1,'confirmed','cancelled')",[first.id]);assert.equal((await book({request})).status,'cancelled');assert.equal((await notices()).length,2);
 assert.equal((await privileged('select count(*)::int n from velox_private.appointment_reservations')).rows[0].n,0);
});
test('competing buyer cannot book occupied interval and gets adjacent slot',async()=>{
 await book();const otherConversation=randomUUID();await privileged('insert into public.conversations(id,vehicle_id,buyer_id,seller_id) values ($1,$2,$3,$4)',[otherConversation,ids.car,ids.stranger,ids.seller]);await asUser(db,ids.stranger);
 assert.equal((await slots(otherConversation)).length,3);await denied(db,()=>book({conversation:otherConversation}),assert);assert.equal((await book({conversation:otherConversation,start:'2099-10-03T15:30Z'})).status,'confirmed');
});
test('cancel frees slot, notices are private and read acknowledgment is idempotent',async()=>{
 const first=await book();const mine=(await notices())[0];await asUser(db,ids.stranger);assert.deepEqual(await notices(),[]);await denied(db,()=>db.query('select public.read_visit_notice($1)',[mine.id]),assert);
 await asUser(db,ids.buyer);const read=(await db.query('select public.read_visit_notice($1) value',[mine.id])).rows[0].value;assert.ok(read.read_at);assert.deepEqual((await db.query('select public.read_visit_notice($1) value',[mine.id])).rows[0].value,read);
 await db.query("select public.transition_appointment($1,'confirmed','cancelled')",[first.id]);assert.equal((await slots()).length,4);assert.equal((await notices()).find(n=>n.kind==='confirmed').status,'cancelled');
 await denied(db,()=>db.query('select * from velox_private.visit_notices'),assert);await denied(db,()=>db.query('select * from velox_private.authorized_visit_requests'),assert);
});
test('ordinary proposal cannot use authorized shortcut or forged provenance',async()=>{
 const row=(await db.query("select to_jsonb(public.propose_appointment($1,$2,30,'manual',$3)) value",[ids.conversation,start,randomUUID()])).rows[0].value;
 await denied(db,()=>db.query("select public.transition_appointment($1,'proposed','confirmed')",[row.id]),assert);
 await privileged('select 1');await denied(db,()=>db.query("update public.appointments set confirmation_source='seller_authorization' where id=$1",[row.id]),assert);
});
test('new RPCs use empty search_path and no anonymous execution',async()=>{
 const rows=(await privileged("select p.proname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') anon from pg_proc p where p.proname in ('get_available_visit_slots','book_authorized_visit','get_visit_notices','read_visit_notice')")).rows;
 assert.equal(rows.length,4);for(const r of rows){assert.equal(r.prosecdef,true);assert.ok(r.proconfig.includes('search_path=""'));assert.equal(r.anon,false);}
});
test('a buyer busy as seller on another car is excluded from offered and booked intervals',async()=>{
 await privileged('update public.vehicles set owner_id=$1 where id=$2',[ids.buyer,ids.otherCar]);await db.query("update public.profiles set role='particular' where id=$1",[ids.buyer]);
 const otherConversation=randomUUID();await db.query('insert into public.conversations(id,vehicle_id,buyer_id,seller_id) values($1,$2,$3,$4)',[otherConversation,ids.otherCar,ids.stranger,ids.buyer]);
 await asUser(db,ids.buyer);const permission=(await db.query("select public.authorize_visit_window($1,'2099-10-03T15:00Z','2099-10-03T17:00Z',45,'Other place','UTC',true,$2) value",[ids.otherCar,randomUUID()])).rows[0].value;
 await asUser(db,ids.stranger);await book({conversation:otherConversation,authorization:permission.id});await asUser(db,ids.buyer);
 assert.equal((await slots()).length,2);await denied(db,()=>book(),assert);await denied(db,()=>book({start:'2099-10-03T15:30Z'}),assert);
 assert.equal((await book({start:'2099-10-03T16:00Z'})).status,'confirmed');
});
test('blocked owner cannot read notices; accidental table grant still cannot disclose notices',async()=>{
 await book();await privileged('grant usage on schema velox_private to authenticated');await db.exec('grant select on velox_private.visit_notices,velox_private.authorized_visit_requests to authenticated');
 await asUser(db,ids.stranger);assert.deepEqual((await db.query('select * from velox_private.visit_notices')).rows,[]);assert.deepEqual((await db.query('select * from velox_private.authorized_visit_requests')).rows,[]);
 await privileged('update public.profiles set is_blocked=true where id=$1',[ids.seller]);await asUser(db,ids.seller);await denied(db,()=>notices(),assert);
});
test('known successful retry after pause returns receipt and a new request cannot duplicate a booking',async()=>{
 const request=randomUUID();const visit=await book({request});await denied(db,()=>book(),assert);
 await privileged("update public.vehicles set status='paused' where id=$1",[ids.car]);await asUser(db,ids.buyer);assert.equal((await book({request})).id,visit.id);await denied(db,()=>book({start:'2099-10-03T15:30Z'}),assert);
 assert.equal((await notices()).length,1);
});
test('visit FAQs guide buyers to authorized slots without claiming the message itself books',async()=>{
 const rows=(await privileged("select answer from velox_private.faq_catalog where id in ('c19.request_visit','c19.today_tomorrow')")).rows;
 assert.equal(rows.length,2);for(const r of rows){assert.match(r.answer,/Ver horarios autorizados/);assert.match(r.answer,/este mensaje no reserva/i);}
});
