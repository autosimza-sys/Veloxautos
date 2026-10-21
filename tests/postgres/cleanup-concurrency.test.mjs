import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {Client} from 'pg';
import {bootstrap,ids,root} from '../backend/fixtures.mjs';
const connectionString=process.env.VELOX_TEST_DATABASE_URL;
const url=new URL(connectionString||'http://invalid');
if(!['127.0.0.1','localhost'].includes(url.hostname)||url.pathname!=='/velox_ecc_isolated_cleanup')throw Error('Fresh loopback cleanup database required');
const connect=async()=>{const c=new Client({connectionString});await c.connect();return c;};
test('independent PostgreSQL connections serialize cleanup/publication/draft/avatar and bound AI reserves',async t=>{
 const admin=await connect(),seller=await connect(),operator=await connect();const workers=[];
 try{
  assert.equal((await admin.query("select count(*)::int n from pg_tables where schemaname in ('public','auth','storage','velox_private')")).rows[0].n,0);
  await admin.query(bootstrap);
  await admin.query(await readFile(root+'/supabase/schema.sql','utf8'));
  for(const file of (await readdir(root+'/supabase/migrations')).filter(p=>p.endsWith('.sql')).sort())await admin.query(await readFile(root+'/supabase/migrations/'+file,'utf8'));
  await admin.query('alter table storage.objects add column created_at timestamptz default now()');
  for(const [id,role] of [[ids.seller,'particular'],[ids.buyer,'registered']])await admin.query('insert into auth.users values($1,$2,$3)',[id,'synthetic@example.invalid',{display_name:'Synthetic',role}]);
  await seller.query('set role authenticated');await seller.query("select set_config('request.jwt.claim.sub',$1,false)",[ids.seller]);
  await operator.query('set role service_role');
  const payload={brand:'Synthetic',model:'Race',version:'Base',year:2020,kilometers:1,price:100,zone:'Test'};
  async function seed(prefix){
   const media=[],objects=[];
   for(let i=0;i<4;i++){
    const path=ids.seller+'/'+prefix+'/'+i+'.jpg';
    const row=(await admin.query("insert into storage.objects(bucket_id,name,metadata,created_at)values('vehicle-media',$1,'{\"size\":100,\"mimetype\":\"image/jpeg\"}',now()-interval '14 days')returning id",[path])).rows[0];
    media.push({media_type:'photo',storage_path:path,sort_order:i});objects.push({id:row.id,path});
   }
   return{media,objects};
  }
  const first=await seed('publish-first');
  await seller.query('begin');
  const car=(await seller.query('select to_jsonb(public.publish_vehicle_with_credit($1,$2,$3)) result',[payload,JSON.stringify(first.media),crypto.randomUUID()])).rows[0].result;
  const claim=operator.query("select public.claim_storage_cleanup($1,'vehicle-media',$2,7)",[first.objects[0].id,first.objects[0].path]).then(()=>({ok:true}),error=>({error}));
  await seller.query('commit');assert.equal((await claim).error?.code,'23514');
  const second=await seed('cleanup-first');
  await operator.query('begin');
  await operator.query("select public.claim_storage_cleanup($1,'vehicle-media',$2,7)",[second.objects[0].id,second.objects[0].path]);
  const publication=seller.query('select public.publish_vehicle_with_credit($1,$2,$3)',[payload,JSON.stringify(second.media),crypto.randomUUID()]).then(()=>({ok:true}),error=>({error}));
  await operator.query('commit');assert.equal((await publication).error?.code,'23514');
  assert.equal((await admin.query('select used from public.credit_balances where user_id=$1',[ids.seller])).rows[0].used,1);
  assert.equal((await admin.query('select count(*)::int n from public.vehicles')).rows[0].n,1);
  for(const kind of ['draft','avatar']){
   const before=await seed(kind+'-first');
   const addReference=path=>kind==='draft'
    ? seller.query('insert into public.publication_drafts(user_id,data)values($1,$2)',[ids.seller,{media:[{storage_path:path}]}])
    : seller.query('update public.profiles set avatar_url=$1 where id=$2',['https://example.invalid/'+path,ids.seller]);
   const clearReference=()=>kind==='draft'
    ? seller.query('delete from public.publication_drafts where user_id=$1',[ids.seller])
    : seller.query('update public.profiles set avatar_url=null where id=$1',[ids.seller]);
   // Reconcile the earlier failed publication claim so avatar changes are not
   // conservatively blocked by an unrelated in-flight cleanup.
   if(kind==='avatar'){
    await admin.query("delete from storage.objects where id in(select object_id from velox_private.storage_cleanup_claims where state='claimed')");
    const claims=(await admin.query("select object_id from velox_private.storage_cleanup_claims where state='claimed'")).rows;
    for(const c of claims)await operator.query('select public.complete_storage_cleanup($1)',[c.object_id]);
   }
   await seller.query('begin');await addReference(before.objects[0].path);
   const lateClaim=operator.query("select public.claim_storage_cleanup($1,'vehicle-media',$2,7)",[before.objects[0].id,before.objects[0].path]).then(()=>({ok:true}),error=>({error}));
   await seller.query('commit');assert.equal((await lateClaim).error?.code,'23514',kind+' first must protect its reference');
   await clearReference();
   const after=await seed('cleanup-before-'+kind);
   await operator.query('begin');
   await operator.query("select public.claim_storage_cleanup($1,'vehicle-media',$2,7)",[after.objects[0].id,after.objects[0].path]);
   const lateReference=addReference(after.objects[0].path).then(()=>({ok:true}),error=>({error}));
   await operator.query('commit');assert.equal((await lateReference).error?.code,'23514','claim first must reject '+kind);
  }
  // No provider is connected. Exercise the REAL persistent reservation function.
  const conversation=(await admin.query('insert into public.conversations(vehicle_id,buyer_id,seller_id)values($1,$2,$3)returning id',[car.id,ids.buyer,ids.seller])).rows[0].id;
  const jobs=[];
  for(let i=0;i<12;i++){
   const message=(await admin.query("insert into public.messages(conversation_id,sender_id,body,is_automated)values($1,$2,'Synthetic exception',false)returning id",[conversation,ids.buyer])).rows[0].id;
   await admin.query("insert into velox_private.ai_reply_jobs(message_id,author_id,state)values($1,$2,'processing')",[message,ids.buyer]);jobs.push(message);
   const c=await connect();workers.push(c);await c.query('set role service_role');
  }
  const reserved=await Promise.all(workers.map((c,i)=>c.query('select public.reserve_ai_reply_budget($1,$2,100000) result',[jobs[i],ids.buyer])));
  assert.equal(reserved.filter(r=>r.rows[0].result.state==='reserved').length,4);
  assert.equal(reserved.filter(r=>r.rows[0].result.state==='limited').length,8);
  assert.equal((await admin.query('select sum(reserved_micro_usd)::int total from velox_private.ai_budget_reservations')).rows[0].total,100000);
  const winner=reserved.findIndex(r=>r.rows[0].result.state==='reserved');
  assert.equal((await operator.query('select public.reserve_ai_reply_budget($1,$2,100000) result',[jobs[winner],ids.buyer])).rows[0].result.state,'processing');
  t.diagnostic('Six real cleanup/publication/draft/avatar transaction orderings PASS; 12 concurrent AI reservations: 4 reserved, 8 limited; duplicate cannot reserve again; provider calls=0');
 }finally{await Promise.all(workers.map(c=>c.end()));await seller.end();await operator.end();await admin.end();}
});
