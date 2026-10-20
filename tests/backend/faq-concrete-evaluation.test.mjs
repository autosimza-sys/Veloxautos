import assert from 'node:assert/strict';
import {before,after,beforeEach,afterEach,test} from 'node:test';
import {makeDatabase,ids,asUser} from './fixtures.mjs';
let db;
before(async()=>{db=await makeDatabase();});after(async()=>{await db?.close();});
beforeEach(async()=>{await db.exec('begin');});afterEach(async()=>{await db.exec('rollback;reset role');});
async function ask(question){
 await asUser(db,ids.buyer);
 const r=(await db.query('select public.send_message_idempotent($1,$2,$3) result',[ids.conversation,question,crypto.randomUUID()])).rows[0].result;
 return r.automated?(await db.query('select body from public.messages where id=$1',[r.automated_message_id])).rows[0].body:null;
}
test('concrete synthetic price/km/trade facts are answered exactly without AI jobs',async()=>{
 await db.query('update public.vehicles set kilometers=54321,price=8765432,accepts_trade=true where id=$1',[ids.car]);
 const answer=await ask('¿Cuántos kilómetros tiene? ¿Cuánto vale? ¿Aceptás permuta?');
 assert.match(answer,/54[.,]?321/);assert.match(answer,/8[.,]?765[.,]?432/);assert.match(answer,/acepta permuta/i);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from velox_private.ai_reply_jobs')).rows[0].n,0);
});
test('missing, uncertain and owner-approved concrete facts remain three different outcomes',async t=>{
 const missing=await ask('¿Cuándo cambiaron la distribución?');assert.match(missing,/falta|informad/i);
 await asUser(db,ids.seller);await db.query('select public.answer_listing_faq($1,$2,$3,$4,$5)',[ids.car,'c03.timing','uncertain','Creo que fue a los 74000 km',0]);
 const uncertain=await ask('¿Cuándo cambiaron la distribución?');assert.match(uncertain,/inciert/i);
 await asUser(db,ids.seller);await db.query('select public.answer_listing_faq($1,$2,$3,$4,$5)',[ids.car,'c03.timing','known','Cambio declarado a los 74000 km',1]);
 const resolved=await ask('¿Cuándo cambiaron la distribución?');assert.match(resolved,/74000/);assert.match(resolved,/vendedor/i);
 await db.exec('reset role');
 const other=(await db.query('select velox_private.resolve_faq($1,$2) result',[ids.otherCar,'¿Cuándo cambiaron la distribución?'])).rows[0].result;
 assert.doesNotMatch(other,/74000/);assert.match(other,/Falta información/i);
 t.diagnostic('Synthetic evaluation states: missing=1, uncertain=1, owner-declared=1, cross-listing missing=1. Referrals are not resolved facts; no real seller facts or 197 historical gaps were filled.');
});
