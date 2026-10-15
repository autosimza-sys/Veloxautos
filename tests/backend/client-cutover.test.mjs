import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {makeDatabase,asUser,ids,denied} from './fixtures.mjs';
test('explicit cutover closes old message and publication entrypoints while new RPCs remain usable',async()=>{
 const db=await makeDatabase();try{
  await db.exec(await readFile(new URL('../../scripts/finalize-client-cutover.sql',import.meta.url),'utf8'));
  await db.exec('begin');await asUser(db,ids.buyer);
  await denied(db,()=>db.query('select send_message_with_assistant($1,$2)',[ids.conversation,'Hola']),assert);
  await denied(db,()=>db.query('insert into messages(conversation_id,sender_id,body)values($1,$2,$3)',[ids.conversation,ids.buyer,'Hola']),assert);
  const request='60000000-0000-4000-8000-000000000001';
  const first=(await db.query('select send_message_idempotent($1,$2,$3) result',[ids.conversation,'Hola',request])).rows[0].result;
  const replay=(await db.query('select send_message_idempotent($1,$2,$3) result',[ids.conversation,'Hola',request])).rows[0].result;
  assert.equal(first.message_id,replay.message_id);
  await asUser(db,ids.seller);
  await denied(db,()=>db.query("select create_vehicle_with_credit('{}'::jsonb)"),assert);
  const permissions=(await db.query("select has_function_privilege('authenticated','public.publish_vehicle_with_credit(jsonb,jsonb,uuid)','execute') allowed")).rows[0];
  assert.equal(permissions.allowed,true);
  const media=[];
  for(let i=0;i<4;i++){
    const path=`${ids.seller}/cutover-fixture-${i}.jpg`;
    await db.query("select public.reserve_vehicle_upload($1,100,'image/jpeg')",[path]);
    await db.query("insert into storage.objects(bucket_id,name,metadata)values('vehicle-media',$1,$2)",[path,{mimetype:'image/jpeg',size:100}]);
    media.push({media_type:'photo',storage_path:path,sort_order:i});
  }
  const publication=(await db.query('select * from publish_vehicle_with_credit($1,$2,$3)',[
    {brand:'Synthetic',model:'Cutover',version:'Base',year:2020,kilometers:0,price:100,zone:'Test'},
    media,'60000000-0000-4000-8000-000000000002',
  ])).rows[0];
  assert.equal(publication.owner_id,ids.seller);
  assert.equal((await db.query('select count(*)::int count from vehicle_media where vehicle_id=$1',[publication.id])).rows[0].count,4);
  await db.exec('rollback');
 }finally{await db.close();}
});
