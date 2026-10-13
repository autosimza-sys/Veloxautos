import assert from 'node:assert/strict';
import {before,after,beforeEach,afterEach,test} from 'node:test';
import {asUser,denied,ids,makeDatabase} from './fixtures.mjs';
import catalog from '../../features/faq/catalog.json' with {type:'json'};
let db;
before(async()=>{db=await makeDatabase();});after(async()=>{await db?.close();});
beforeEach(async()=>{await db.exec('begin');});afterEach(async()=>{await db.exec('rollback; reset role');});
async function ask(text){await asUser(db,ids.buyer); const r=(await db.query('select public.send_message_idempotent($1,$2,$3) as r',[ids.conversation,text,crypto.randomUUID()])).rows[0].r; return r.automated?(await db.query('select body from public.messages where id=$1',[r.automated_message_id])).rows[0].body:null;}

test('credit help distinguishes free refills from deadline extensions and never starts payment', async () => {
 for (const id of ['c24.credit_allowance','c24.what_spends','c24.balance','c24.exhausted']) {
  const item=catalog.items.find(entry=>entry.id===id);
  const answer=await ask(item.question);
  assert.ok(answer.includes(item.answer),id);
  assert.doesNotMatch(answer,/10[.,]?000 pesos|\$|100 créditos|50 créditos/,id);
 }
 const exhausted=await ask(catalog.items.find(item=>item.id==='c24.exhausted').question);
 assert.match(exhausted,/Si la recarga gratuita está habilitada/);
 assert.match(exhausted,/no cambia la fecha final/);
 await db.exec('reset role');
 assert.equal((await db.query('select count(*)::int n from velox_private.faq_requests')).rows[0].n,0);
});
test('one message answers availability, mileage and trade without model calls',async()=>{
 const answer=await ask('¿Sigue disponible, cuántos kilómetros tiene y tomás un Gol?');
 assert.match(answer,/activa/i);assert.match(answer,/12[.,]?345/);assert.match(answer,/no acepta permuta/i);
});
test('maintenance timing never becomes a visit and only records a missing fact once',async()=>{
 for(let i=0;i<2;i++)assert.match(await ask('¿Cuándo cambiaron la distribución?'),/falta|informad/i);
 await db.exec('reset role');
 assert.equal((await db.query('select count(*)::int n from velox_private.faq_requests')).rows[0].n,1);
});
test('public location never discloses the exact private meeting address',async()=>{
 await db.query("update public.vehicles set view_location='PRIVATE_ADDRESS_SENTINEL' where id=$1",[ids.car]);
 const a=await ask('¿En qué zona está el auto?'); assert.match(a,/Mendoza/);assert.ok(!a.includes('PRIVATE_ADDRESS_SENTINEL'));
});
test('buyer facts and negations do not become vehicle facts or sales offers',async()=>{
 assert.equal(await ask('Mi auto tiene 70000 km y no acepto permuta'),null);
});
test('unmatched part is acknowledged alongside the known answer',async()=>{
 const a=await ask('¿Sigue disponible? ¿Podés llevarlo al taller de mi primo?');
 assert.match(a,/activa/i);assert.match(a,/resto|otra parte|demás/i);
});
test('only owner can answer reusable listing facts, without exposing private customer data',async()=>{
 await ask('¿Cuándo cambiaron la distribución?');
 for(const actor of [ids.buyer,ids.stranger,ids.admin,null]){
  await asUser(db,actor);await denied(db,()=>db.query('select public.answer_listing_faq($1,$2,$3,$4,$5)',[ids.car,'c03.timing','known','Cambiada a los 90000 km',0]),assert);
 }
 await asUser(db,ids.seller);
 const tasks=(await db.query('select public.get_listing_faq_tasks($1) as r',[ids.car])).rows[0].r;
 assert.equal(tasks[0].question_id,'c03.timing');assert.ok(!JSON.stringify(tasks).includes(ids.buyer));
 await db.query('select public.answer_listing_faq($1,$2,$3,$4,$5)',[ids.car,'c03.timing','known','Cambiada a los 90000 km',0]);
 assert.match(await ask('¿Cuándo cambiaron la distribución?'),/vendedor.*90000/i);
 await asUser(db,ids.seller);
 await denied(db,()=>db.query('select public.answer_listing_faq($1,$2,$3,$4,$5)',[ids.car,'c03.timing','known','Sobrescribir',0]),assert);
 await denied(db,()=>db.query('select public.answer_listing_faq($1,$2,$3,$4,$5)',[ids.car,'c20.payment_verified','known','Pagado',0]),assert);
});
test('uncertain and unknown declarations stay uncertain and cannot certify condition',async()=>{
 await ask('¿Cuándo cambiaron la distribución?');await asUser(db,ids.seller);
 await db.query('select public.answer_listing_faq($1,$2,$3,$4,$5)',[ids.car,'c03.timing','uncertain','Creo que el dueño anterior la cambió',0]);
 assert.match(await ask('¿Cuándo cambiaron la distribución?'),/inciert/i);
});
test('draft commercial templates never become universal payment or loan promises',async()=>{
 for(const q of ['¿Se puede tramitar sólo con DNI?','¿Ya recibieron mi transferencia?','¿Tiene garantía y qué cubre?']){
  const a=await ask(q);assert.ok(a);assert.doesNotMatch(a,/200\.000|1,5%|15 y 30|\{[a-z]/);assert.match(a,/confirm|inform|habilitad|revis/i);
 }
});
test('disabled assistant and blocked conversations cannot create reusable questions',async()=>{
 await db.query('insert into public.seller_assistant_settings(user_id,enabled) values($1,false)',[ids.seller]);
 assert.equal(await ask('¿Cuándo cambiaron la distribución?'),null);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from velox_private.faq_requests')).rows[0].n,0);
 await db.query('update public.conversations set is_blocked=true where id=$1',[ids.conversation]);
 await asUser(db,ids.buyer);await denied(db,()=>ask('¿Cuánto vale?'),assert);
});
test('all canonical questions produce reviewed answers or explicit missing data, never draft variables',async()=>{
 for(let i=0;i<catalog.items.length;i++){
  // This suite evaluates 240 FAQ answers, not a burst from one live buyer.
  // Simulate elapsed minutes between batches; rate boundaries have their own
  // backend suite and remain enforced through the same public send RPC here.
  if(i>0&&i%10===0){
   await db.exec('reset role');
   await db.query(`update velox_private.message_rate_windows set recent_messages=(
    select jsonb_agg(jsonb_set(e,'{accepted_at}',to_jsonb(clock_timestamp()-interval '61 seconds')))
    from jsonb_array_elements(recent_messages) e) where author_id=$1`,[ids.buyer]);
  }
  const item=catalog.items[i];const a=await ask(item.question);assert.ok(a,item.id);assert.doesNotMatch(a,/\{(?:listing|seller|vehicle|quote|platform)\./,item.id);
 }
});
test('reusable declarations stay on their listing and history records revisions privately',async()=>{
 await ask('¿Cuándo cambiaron la distribución?');await asUser(db,ids.seller);
 await db.query('select public.answer_listing_faq($1,$2,$3,$4,$5)',[ids.car,'c03.timing','known','Declaración anterior',0]);
 await db.query('select public.answer_listing_faq($1,$2,$3,$4,$5)',[ids.car,'c03.timing','unknown','',1]);
 await denied(db,()=>db.query('select * from velox_private.faq_answer_history'),assert);
 await db.exec('reset role');
 assert.equal((await db.query('select count(*)::int n from velox_private.faq_answer_history')).rows[0].n,2);
 const answer=(await db.query('select velox_private.resolve_faq($1,$2) a',[ids.otherCar,'¿Cuándo cambiaron la distribución?'])).rows[0].a;
 assert.doesNotMatch(answer,/Declaración anterior/);assert.match(answer,/Falta información/);
});
test('zero mileage is not missing, excessive fragments are bounded and no provider job follows a rule answer',async()=>{
 await db.query('update public.vehicles set kilometers=0 where id=$1',[ids.car]);
 assert.match(await ask('¿Cuántos kilómetros tiene?'),/0 km/);
 assert.match(await ask('precio?'.repeat(50)),/divid|menos preguntas/i);
 await db.exec('reset role');
 const message=(await db.query('select id from public.messages where not is_automated order by created_at limit 1')).rows[0].id;
 await db.exec('set local role service_role');
 assert.equal((await db.query('select public.claim_ai_reply($1,$2,10,10) r',[message,ids.buyer])).rows[0].r.state,'skipped');
});
test('compound clauses preserve internal conjunctions without treating buyer facts as listing questions',async()=>{
 assert.equal(await ask('Mi auto es 2010 y tiene GNC instalado'),null);
 assert.equal(await ask('¿Tomás un crédito con DNI?'),null);
 const answer=await ask('¿Qué motor y cilindrada tiene? ¿Cuánto vale?');
 assert.match(answer,/motor y cilindrada/);assert.match(answer,/ARS/);
 await db.exec('reset role');
 const rows=(await db.query('select question_id from velox_private.faq_requests')).rows;
 assert.deepEqual(rows,[{question_id:'c02.engine'}]);
});
