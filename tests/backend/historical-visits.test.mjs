import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {asUser,denied,ids,makeDatabase,root} from './fixtures.mjs';

test('pre-pilot history survives migrations without invented consent or duration and becomes immutable',async()=>{
 const db=await makeDatabase({legacy:true,productionDrift:true});
 try{
  // This fixture also seeds an unrelated, incomplete synthetic inspection.
  // Remove only that fixture so the visit migration can be exercised end to end.
  await db.exec('delete from public.inspection_media; delete from public.inspection_reports; delete from public.inspection_requests;');
  const original=(await db.query("insert into public.appointments(conversation_id,proposed_by,scheduled_at,location,status) values($1,$2,'2026-07-14T03:59:00Z','Lugar histórico','confirmed') returning *",[ids.conversation,ids.buyer])).rows[0];
  for(const file of (await readdir(path.join(root,'supabase/migrations'))).filter(f=>f.startsWith('202610')).sort())await db.exec(await readFile(path.join(root,'supabase/migrations',file),'utf8'));
  const saved=(await db.query('select * from public.appointments where id=$1',[original.id])).rows[0];
  for(const [key,value]of Object.entries(original))assert.deepEqual(saved[key],value,key+' was altered');
  assert.equal(saved.legacy_unverified,true);assert.equal(saved.duration_minutes,null);assert.equal(saved.buyer_confirmed_at,null);assert.equal(saved.seller_confirmed_at,null);
  assert.equal((await db.query('select count(*)::int as n from velox_private.appointment_reservations where appointment_id=$1',[original.id])).rows[0].n,0);
  await db.exec('begin');await asUser(db,ids.buyer);
  assert.equal((await db.query('select id from public.appointments where id=$1',[original.id])).rows.length,1);
  await denied(db,()=>db.query("select * from public.transition_appointment($1,'confirmed','cancelled')",[original.id]),assert);
  await denied(db,()=>db.query('update public.appointments set legacy_unverified=false where id=$1',[original.id]),assert);
  await asUser(db,ids.stranger);assert.equal((await db.query('select id from public.appointments where id=$1',[original.id])).rows.length,0);
  await db.exec('rollback');
  await db.exec('begin');await denied(db,()=>db.query('update public.appointments set legacy_unverified=false where id=$1',[original.id]),assert);await db.exec('rollback');
  // Even privileged insertion cannot manufacture a new historical exception.
  await db.exec('begin');await denied(db,()=>db.query("insert into public.appointments(conversation_id,proposed_by,buyer_id,seller_id,scheduled_at,location,status,legacy_unverified) values($1,$2,$2,$3,'2026-07-15T12:00:00Z','Falso','confirmed',true)",[ids.conversation,ids.buyer,ids.seller]),assert);await db.exec('rollback');
  const preflight=await db.exec(await readFile(path.join(root,'scripts/staging-preflight.sql'),'utf8'));
  const rows=preflight.find(r=>r.rows?.[0]?.section)?.rows||[];
  assert.equal(rows.find(r=>r.section==='legacy'&&r.object_name==='visits_without_verifiable_consent')?.status,'PASS');
  assert.equal(rows.find(r=>r.section==='legacy'&&r.object_name==='active_visits_without_explicit_duration')?.status,'PASS');
  const history=rows.find(r=>r.section==='legacy'&&r.object_name==='historical_unverified_visits');
  assert.equal(history?.status,'REVIEW');assert.equal(history?.details.count,1);
 }finally{await db.close();}
});
