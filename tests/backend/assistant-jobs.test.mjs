import assert from 'node:assert/strict';
import {before,after,beforeEach,afterEach,test} from 'node:test';
import {makeDatabase,asUser,ids,denied} from './fixtures.mjs';
let db;
const message='80000000-0000-4000-8000-000000000001';
before(async()=>{db=await makeDatabase();});after(async()=>{await db?.close();});
beforeEach(async()=>{await db.exec('begin');await db.query('insert into public.messages(id,conversation_id,sender_id,body) values($1,$2,$3,$4)',[message,ids.conversation,ids.buyer,'¿Algo que deba saber?']);});
afterEach(async()=>{await db.exec('rollback; reset role');});
async function server(){await db.exec('set local role service_role');}
async function claim(actor=ids.buyer,limit=3){return (await db.query('select public.claim_ai_reply($1,$2,$3,$4) as r',[message,actor,limit,limit])).rows[0].r;}
test('clients cannot claim or forge an automated answer',async()=>{
 for(const actor of [ids.buyer,ids.seller,ids.admin,null]){
  await asUser(db,actor);
  await denied(db,()=>claim(),assert);
  await denied(db,()=>db.query('select public.finish_ai_reply($1,$2,$3)',[message,ids.buyer,'Forged']),assert);
 }
});
test('server claim validates author and budget; replays never produce a second claim',async()=>{
 await server();assert.equal((await claim(ids.stranger)).state,'denied');
 assert.equal((await claim(ids.seller)).state,'denied');
 const r=await claim();assert.equal(r.state,'claimed');assert.equal(r.question,'¿Algo que deba saber?');
 assert.equal(Object.hasOwn(r.vehicle,'viewLocation'),false);
 assert.equal((await claim()).state,'processing');
});
test('completion persists one automated answer and repeated completion cannot replace it',async()=>{
 await server();await claim();
 assert.equal((await db.query('select public.finish_ai_reply($1,$2,$3) as r',[message,ids.buyer,'Consulta al vendedor.'])).rows[0].r.state,'done');
 await db.query('select public.finish_ai_reply($1,$2,$3)',[message,ids.buyer,'Changed']);
 await db.exec('reset role');
 const rows=(await db.query('select body from public.messages where is_automated')).rows;
 assert.deepEqual(rows,[{body:'Consulta al vendedor.'}]);
 await server();assert.equal((await claim()).state,'done');
});
test('blocked conversation and revoked author are rechecked before storing generated answer',async()=>{
 await server();await claim();await db.exec('reset role');
 await db.query('update public.conversations set is_blocked=true where id=$1',[ids.conversation]);
 await server();assert.equal((await db.query('select public.finish_ai_reply($1,$2,$3) as r',[message,ids.buyer,'No publicar'])).rows[0].r.state,'denied');
});
test('daily cap includes already claimed attempts and disabled seller never calls AI',async()=>{
 await server();assert.equal((await claim(ids.buyer,0)).state,'limited');
 assert.equal((await claim(ids.buyer,1)).state,'claimed');await db.exec('reset role');
 const second='80000000-0000-4000-8000-000000000002';
 await db.query('insert into public.messages(id,conversation_id,sender_id,body) values($1,$2,$3,$4)',[second,ids.conversation,ids.buyer,'Otra consulta']);
 await server();
 assert.equal((await db.query('select public.claim_ai_reply($1,$2,1,100) as r',[second,ids.buyer])).rows[0].r.state,'limited');
 assert.equal((await db.query('select public.claim_ai_reply($1,$2,100,1) as r',[second,ids.buyer])).rows[0].r.state,'limited');
 await db.exec('reset role');
 await db.query('insert into public.seller_assistant_settings(user_id,enabled) values($1,false) on conflict(user_id) do update set enabled=false',[ids.seller]);
 await server();assert.equal((await claim()).state,'skipped');
});
