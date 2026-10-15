import assert from 'node:assert/strict';
import {before,after,beforeEach,afterEach,test} from 'node:test';
import {asUser,ids,makeDatabase,denied} from './fixtures.mjs';
let db;
const path = `${ids.seller}/quota/file.jpg`;
const reserve = (name=path, bytes=100, mime='image/jpeg') => db.query('select public.reserve_vehicle_upload($1,$2,$3) as result',[name,bytes,mime]);
const finish = (release=false,name=path) => db.query('select public.finish_vehicle_upload($1,$2) as result',[name,release]);
const insert = (size=100,mimetype='image/jpeg',name=path) => db.query("insert into storage.objects(bucket_id,name,metadata) values('vehicle-media',$1,$2)",[name,{size,mimetype}]);
before(async()=>{db=await makeDatabase();});
after(async()=>{await db?.close();});
beforeEach(async()=>{await db.exec('begin');});
afterEach(async()=>{await db.exec('rollback; reset role');});
test('reserve, consume and confirm are idempotent and immutable retries do not charge admission twice',async()=>{
 await asUser(db,ids.seller);
 assert.equal((await reserve()).rows[0].result.state,'reserved');
 assert.equal((await reserve()).rows[0].result.state,'reserved');
 await insert();
 assert.equal((await finish()).rows[0].result.state,'consumed');
 assert.equal((await reserve()).rows[0].result.state,'consumed');
 assert.equal((await finish(true)).rows[0].result.state,'consumed');
 await denied(db,()=>reserve(path,101),assert);
 await db.exec('reset role');
 assert.equal((await db.query('select attempts from velox_private.upload_windows where owner_id=$1',[ids.seller])).rows[0].attempts,1);
});
test('raw upload, mismatched size/MIME and expired reservation fail before object commit',async()=>{
 await asUser(db,ids.seller);
 await denied(db,()=>insert(),assert);
 await reserve();
 await denied(db,()=>insert(101),assert);
 await denied(db,()=>insert(100,'video/mp4'),assert);
 await db.exec('reset role');
 await db.query("update velox_private.upload_reservations set expires_at=now()-interval '1 second'");
 await asUser(db,ids.seller);
 await denied(db,()=>insert(),assert);
});
test('release is repeatable and blocks a late upload; rearm uses another frequency attempt',async()=>{
 await asUser(db,ids.seller); await reserve();
 assert.equal((await finish(true)).rows[0].result.state,'released');
 assert.equal((await finish(true)).rows[0].result.state,'released');
 await denied(db,()=>insert(),assert);
 await reserve(); await insert();
 await db.exec('reset role');
 assert.equal((await db.query('select attempts from velox_private.upload_windows where owner_id=$1',[ids.seller])).rows[0].attempts,2);
});
test('stored legacy bytes and pending bytes share a hard quota; releasing restores only pending capacity',async()=>{
 await db.query('update velox_private.upload_limits set max_bytes=52428900'); // two unknown legacy objects = 50 MiB
 await asUser(db,ids.seller); await reserve();
 await denied(db,()=>reserve(`${ids.seller}/quota/next.jpg`,1),assert);
 await finish(true); await reserve(`${ids.seller}/quota/next.jpg`,100);
});
test('count includes pending reservations and linked/legacy objects',async()=>{
 await db.query('update velox_private.upload_limits set max_objects=4');
 await asUser(db,ids.seller); await reserve(); await reserve(`${ids.seller}/quota/second.jpg`);
 await denied(db,()=>reserve(`${ids.seller}/quota/third.jpg`),assert);
});
test('frequency cannot be reset by releasing or changing paths',async()=>{
 await db.query('update velox_private.upload_limits set hourly_attempts=4');
 await asUser(db,ids.seller);
 for(let i=0;i<4;i++){const name=`${ids.seller}/quota/${i}.jpg`;await reserve(name);await finish(true,name);}
 await denied(db,()=>reserve(),assert);
});
test('buyer, blocked, anonymous, foreign path and private-table writes are denied',async()=>{
 for(const actor of [ids.buyer,ids.blocked,null]){await asUser(db,actor);await denied(db,()=>reserve(),assert);}
 await asUser(db,ids.seller);
 await denied(db,()=>reserve(`${ids.stranger}/quota/file.jpg`),assert);
 await denied(db,()=>db.query('select * from velox_private.upload_limits'),assert);
 for(const [size,mime] of [[0,'image/jpeg'],[26214401,'image/jpeg'],[100,'text/plain']])await denied(db,()=>reserve(path,size,mime),assert);
});
test('failed object transaction rolls admission consumption back and retry remains usable',async()=>{
 await asUser(db,ids.seller);await reserve();
 await db.exec('savepoint simulated_storage_failure');await insert();await db.exec('rollback to simulated_storage_failure');
 assert.equal((await reserve()).rows[0].result.state,'reserved');await insert();
 assert.equal((await finish()).rows[0].result.state,'consumed');
});
test('inspection files use the same owner quota and still require assigned-mechanic Storage RLS',async()=>{
 const name=`${ids.mechanic}/${ids.request}/quota.jpg`;
 await asUser(db,ids.mechanic);
 await db.query("select public.reserve_vehicle_upload($1,100,'image/jpeg','inspection-media')",[name]);
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('inspection-media',$1,'{\"size\":100,\"mimetype\":\"image/jpeg\"}')",[name]);
 assert.equal((await db.query("select public.finish_vehicle_upload($1,false,'inspection-media') result",[name])).rows[0].result.state,'consumed');
 const unassigned=`${ids.mechanic}/unassigned/quota.jpg`;
 await db.query("select public.reserve_vehicle_upload($1,100,'image/jpeg','inspection-media')",[unassigned]);
 await denied(db,()=>db.query("insert into storage.objects(bucket_id,name,metadata) values('inspection-media',$1,'{\"size\":100,\"mimetype\":\"image/jpeg\"}')",[unassigned]),assert);
});
