import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeDatabase,asUser,ids,denied} from './fixtures.mjs';
let db;
before(async()=>{db=await makeDatabase();});
after(async()=>{await db?.close();});
const request='40000000-0000-4000-8000-000000000020';
const payload={inspection_date:'2026-01-01',odometer:12345,scores:{motor:5,caja:6,estructura:7,frenos:8,electronica:9,interior:10},observations:'Synthetic fixture',result:'observed'};
const path=`${ids.mechanic}/${request}/dashboard-fixture.jpg`;
const media=[{kind:'dashboard',storage_path:path}];
async function seed(){
 await db.exec('begin');
 await db.query("insert into inspection_requests(id,vehicle_id,requested_by,assigned_mechanic,status)values($1,$2,$3,$4,'assigned')",[request,ids.otherCar,ids.buyer,ids.mechanic]);
 await db.query("insert into storage.objects(bucket_id,name,metadata)values('inspection-media',$1,$2)",[path,{mimetype:'image/jpeg',size:100}]);
}
async function submit(p=payload,m=media){return db.query('select * from submit_inspection_report($1,$2,$3)',[request,p,m]);}
test('assigned mechanic can stage own file before a report exists; requester cannot read it',async()=>{
 await seed();try{
  await asUser(db,ids.mechanic);
  assert.equal((await db.query('select velox_private.can_upload_inspection_object($1) allowed',[path])).rows[0].allowed,true);
  await asUser(db,ids.buyer);
  assert.equal((await db.query('select * from storage.objects where name=$1',[path])).rows.length,0);
 }finally{await db.exec('rollback');}
});
test('report, media and completed state commit together and identical retry returns original',async()=>{
 await seed();try{
  await asUser(db,ids.mechanic);
  const first=(await submit()).rows[0]; const second=(await submit()).rows[0];
  assert.equal(first.id,second.id);
  assert.equal((await db.query('select * from inspection_media where report_id=$1',[first.id])).rows.length,1);
  assert.equal((await db.query('select status from inspection_requests where id=$1',[request])).rows[0].status,'observed');
  await asUser(db,ids.buyer);
  assert.equal((await db.query('select * from inspection_reports where request_id=$1',[request])).rows.length,1);
 }finally{await db.exec('rollback');}
});
test('missing dashboard or file prevents report and completion',async()=>{
 await seed();try{
  await asUser(db,ids.mechanic);
  await denied(db,()=>submit(payload,[]),assert);
  await denied(db,()=>submit(payload,[{kind:'dashboard',storage_path:`${ids.mechanic}/${request}/missing.jpg`}]),assert);
  assert.equal((await db.query('select * from inspection_reports where request_id=$1',[request])).rows.length,0);
  assert.equal((await db.query('select status from inspection_requests where id=$1',[request])).rows[0].status,'assigned');
 }finally{await db.exec('rollback');}
});
test('nonmechanic, other mechanic, malformed scores and final rewrite are denied',async()=>{
 await seed();try{
  await asUser(db,ids.buyer);await denied(db,()=>submit(),assert);
  await asUser(db,ids.stranger);await denied(db,()=>submit(),assert);
  await asUser(db,ids.mechanic);await denied(db,()=>submit({...payload,scores:{motor:7}}),assert);
  await denied(db,()=>submit({...payload,odometer:-1}),assert);
  await submit();await denied(db,()=>submit({...payload,result:'approved'}),assert);
 }finally{await db.exec('rollback');}
});
test('file-link failure rolls back report insert and request completion',async()=>{
 await seed();try{
  await db.exec("create function public.test_fail_report_media() returns trigger language plpgsql as $$begin raise exception 'fixture failure';end$$;create trigger test_fail_report_media before insert on inspection_media for each row execute function public.test_fail_report_media();");
  await asUser(db,ids.mechanic);await denied(db,()=>submit(),assert);
  assert.equal((await db.query('select * from inspection_reports where request_id=$1',[request])).rows.length,0);
  assert.equal((await db.query('select status from inspection_requests where id=$1',[request])).rows[0].status,'assigned');
 }finally{await db.exec('rollback');}
});
test('a finalized report cannot be reopened, reassigned or lose its completion timestamp',async()=>{
 await seed();try{
  await asUser(db,ids.mechanic);const first=(await submit()).rows[0];
  await denied(db,()=>db.query("update inspection_requests set status='in_progress',completed_at=null where id=$1",[request]),assert);
  await denied(db,()=>db.query("update inspection_requests set completed_at=null where id=$1",[request]),assert);
  const second=(await submit()).rows[0];assert.equal(first.id,second.id);
  const row=(await db.query('select status,completed_at from inspection_requests where id=$1',[request])).rows[0];
  assert.equal(row.status,'observed');assert.ok(row.completed_at);
  await asUser(db,ids.admin);
  await denied(db,()=>db.query("update inspection_requests set assigned_mechanic=null where id=$1",[request]),assert);
 }finally{await db.exec('rollback');}
});
test('rollout preflight refuses legacy partial reports without altering them',async()=>{
 const isolated=await makeDatabase();
 try{
  const sql=await readFile(new URL('../../supabase/migrations/202610030006_inspection_submission.sql',import.meta.url),'utf8');
  await assert.rejects(isolated.exec(sql),/legacy incompletos/);
  await isolated.exec('rollback');
  assert.equal((await isolated.query('select status from inspection_requests where id=$1',[ids.request])).rows[0].status,'assigned');
  assert.equal((await isolated.query('select count(*)::int count from inspection_reports')).rows[0].count,1);
 }finally{await isolated.close();}
});
test('requesting the same active inspection returns one request and is private',async()=>{
 await db.exec('begin');try{
  await asUser(db,ids.buyer);
  const first=(await db.query('select * from request_inspection($1)',[ids.car])).rows[0];
  const second=(await db.query('select * from request_inspection($1)',[ids.car])).rows[0];
  assert.equal(first.id,second.id);assert.equal(first.id,ids.request);
  await asUser(db,ids.blocked);await denied(db,()=>db.query('select * from request_inspection($1)',[ids.car]),assert);
 }finally{await db.exec('rollback');}
});
