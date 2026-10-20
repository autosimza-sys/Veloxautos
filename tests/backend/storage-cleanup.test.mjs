import assert from 'node:assert/strict';
import {before,after,beforeEach,afterEach,test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {makeDatabase,asUser,denied,ids,root} from './fixtures.mjs';
let db;
const paths=Array.from({length:4},(_,i)=>ids.seller+'/cleanup/photo-'+i+'.jpg');
const media=paths.map((storage_path,sort_order)=>({storage_path,sort_order,media_type:'photo'}));
const payload={brand:'Synthetic',model:'Cleanup',version:'Base',year:2020,kilometers:1,price:100,zone:'Test'};
before(async()=>{
 db=await makeDatabase();
 await db.exec("alter table storage.objects add column created_at timestamptz default now(), add column updated_at timestamptz");
 await db.exec(await readFile(root+'/scripts/storage-cleanup-candidate.sql','utf8'));
});
after(async()=>{await db?.close();});
beforeEach(async()=>{
 await db.exec('begin');
 for(const path of paths)await db.query("insert into storage.objects(bucket_id,name,metadata,created_at)values('vehicle-media',$1,'{\"size\":100,\"mimetype\":\"image/jpeg\"}',now()-interval '14 days')",[path]);
});
afterEach(async()=>{await db.exec('rollback;reset role');});
async function preview(){await db.exec('set local role service_role');return (await db.query('select public.storage_cleanup_preview(7) result')).rows[0].result;}
async function claim(path=paths[0]){await db.exec('reset role');const id=(await db.query('select id from storage.objects where name=$1',[path])).rows[0].id;await db.exec('set local role service_role');return db.query("select public.claim_storage_cleanup($1,'vehicle-media',$2,7) result",[id,path]);}
test('preview only admits old, unreferenced, nonpending objects and never changes object count',async()=>{
 const before=(await db.query('select count(*)::int n from storage.objects')).rows[0].n;
 await db.query("update storage.objects set created_at=now() where name=$1",[paths[0]]);
 await db.query('insert into public.vehicle_media(vehicle_id,media_type,storage_path)values($1,$2,$3)',[ids.car,'photo',paths[1]]);
 await db.query("insert into velox_private.upload_reservations values($1,'vehicle-media',$2,100,'image/jpeg','pending',now()+interval '1 hour')",[ids.seller,paths[2]]);
 const plan=await preview();assert.deepEqual(plan.objects.map(o=>o.path),[paths[3]]);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from storage.objects')).rows[0].n,before);
});
test('draft and idempotency payload references are protected too',async()=>{
 await db.query('insert into public.publication_drafts(user_id,data)values($1,$2)',[ids.seller,{media:[{storage_path:paths[0]}]}]);
 assert.ok(!(await preview()).objects.some(o=>o.path===paths[0]));
});
test('publication before cleanup commits its references and makes later claim fail',async()=>{
 await asUser(db,ids.seller);
 await db.query('select public.publish_vehicle_with_credit($1,$2,$3)',[payload,media,crypto.randomUUID()]);
 await denied(db,()=>claim(),assert);
});
test('cleanup before publication rejects media linking and rolls vehicle/debit back',async()=>{
 await claim();await asUser(db,ids.seller);
 const used=(await db.query('select used from public.credit_balances where user_id=$1',[ids.seller])).rows[0].used;
 await denied(db,()=>db.query('select public.publish_vehicle_with_credit($1,$2,$3)',[payload,media,crypto.randomUUID()]),assert);
 assert.equal((await db.query('select used from public.credit_balances where user_id=$1',[ids.seller])).rows[0].used,used);
});
test('quarantine is idempotent, completion needs actual absence, paths cannot be reused',async()=>{
 assert.equal((await claim()).rows[0].result.state,'claimed');
 assert.equal((await claim()).rows[0].result.state,'claimed');
 await db.exec('reset role');
 const id=(await db.query('select id from storage.objects where name=$1',[paths[0]])).rows[0].id;
 await db.exec('set local role service_role');
 assert.equal((await db.query('select public.complete_storage_cleanup($1) result',[id])).rows[0].result.state,'pending');
 // Test-only metadata simulation of an acknowledged Storage API removal.
 await db.exec('reset role');await db.query('delete from storage.objects where id=$1',[id]);
 await db.exec('set local role service_role');
 assert.equal((await db.query('select public.complete_storage_cleanup($1) result',[id])).rows[0].result.state,'deleted');
 await db.exec('reset role');
 await denied(db,()=>db.query("insert into storage.objects(bucket_id,name)values('vehicle-media',$1)",[paths[0]]),assert);
});
test('browser accounts cannot preview, claim, complete, or read cleanup ledger',async()=>{
 await asUser(db,ids.seller);
 for(const query of ['select public.storage_cleanup_preview(7)','select public.complete_storage_cleanup(gen_random_uuid())','select * from velox_private.storage_cleanup_claims'])
 await denied(db,()=>db.query(query),assert);
});

test('recent modification and unknown creation date are retained even on an old path',async()=>{
 await db.query('update storage.objects set updated_at=now() where name=$1',[paths[0]]);
 await db.query('update storage.objects set created_at=null where name=$1',[paths[1]]);
 const plan=await preview();
 assert.ok(!plan.objects.some(o=>o.path===paths[0]||o.path===paths[1]));
 await denied(db,()=>claim(paths[0]),assert);
});

test('an owner avatar URL conservatively holds ambiguous files including encoded paths',async()=>{
 await db.query('update public.profiles set avatar_url=$1 where id=$2',['https://example.invalid/opaque%20avatar.jpg',ids.seller]);
 assert.equal((await preview()).objects.length,0);
 await denied(db,()=>claim(),assert);
});
