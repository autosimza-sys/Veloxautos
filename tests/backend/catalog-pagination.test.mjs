import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {asUser,ids,makeDatabase,denied} from './fixtures.mjs';
import {readFile} from 'node:fs/promises';
const privacyHotfix=await readFile(new URL('../../scripts/hotfix-legacy-catalog-privacy.sql',import.meta.url),'utf8');
const historicalSchema=await readFile(new URL('../../supabase/migrations/202606230001_security_hardening.sql',import.meta.url),'utf8');
const historicalCatalog=historicalSchema.match(/create or replace function public\.get_vehicle_catalog\(\)[\s\S]*?\$\$;/)[0];
let db;
before(async()=>{
 db=await makeDatabase();
 await db.query(`insert into public.vehicles(owner_id,status,brand,model,version,year,kilometers,price,zone,created_at)
 select $1,'active',case when i<=400 then 'Synthetic' else 'RemoteBrand' end,'Page '||i,'Base',2020,i,1000000+i,'Mendoza','2026-01-01T00:00:00.123456Z' from generate_series(1,500) i`,[ids.seller]);
});
after(async()=>{await db?.close();});
const page=async(cursor=null,filters={},size=24)=>(await db.query('select public.get_vehicle_catalog_page($1,$2,$3) result',[size,cursor,filters])).rows[0].result;
test('500 tied-timestamp synthetic listings traverse without duplicate/skip and pages stop at 24',async()=>{
 let cursor=null;const seen=new Set();
 do{const result=await page(cursor);assert.ok(result.items.length<=24);
 for(const item of result.items){assert.ok(!seen.has(item.id));seen.add(item.id);assert.equal(item.price,null);assert.equal(item.kilometers,null);assert.equal(item.view_location,null);}
 cursor=result.next_cursor;
 }while(cursor);
 assert.equal(seen.size,502);assert.ok(!seen.has(ids.pausedCar));
});
test('filters are applied before pagination and facets include brands outside the first page',async()=>{
 const first=await page();assert.ok(first.brands.includes('RemoteBrand'));
 const filtered=await page(null,{brand:'RemoteBrand',search:'Page',year:2020});
 assert.equal(filtered.items.length,24);assert.ok(filtered.items.every(v=>v.brand==='RemoteBrand'));
 assert.equal((await page(null,{search:'%'})).items.length,0,'search is literal, not a wildcard');
});
test('guest cannot use hidden price/km as an oracle; authenticated range queries respect visibility',async()=>{
 await db.exec('begin');await asUser(db,null);
 await denied(db,()=>page(null,{minPrice:1}),assert);
 await denied(db,()=>page(null,{maxKm:10}),assert);
 await asUser(db,ids.buyer);
 const result=await page(null,{minKm:499,maxKm:500,minPrice:1000499,maxPrice:1000500});
 assert.equal(result.items.length,2);assert.ok(result.items.every(v=>v.kilometers>=499&&v.price>=1000499));
 await db.exec('rollback;reset role');
});
test('blocked owners and paused listings disappear, and malformed/unbounded queries are rejected',async()=>{
 await db.exec('begin');await db.query('update public.profiles set is_blocked=true where id=$1',[ids.seller]);
 const result=await page();assert.equal(result.items.length,1);assert.equal(result.items[0].id,ids.otherCar);
 for(const size of [0,25,null])await denied(db,()=>page(null,{},size),assert);
 for(const filter of [{private:'no'},{search:'x'.repeat(121)},{year:'2020'},{minKm:-1}])await denied(db,()=>page(null,filter),assert);
 await denied(db,()=>page({id:ids.car}),assert);
 await db.exec('rollback;reset role');
});
test('newer insertion between cursor pages does not shift older pages or duplicate results',async()=>{
 const first=await page();await db.exec('begin');
 await db.query("insert into public.vehicles(owner_id,status,brand,model,version,year,kilometers,price,zone)values($1,'active','New','After page','Base',2020,0,1,'Test')",[ids.seller]);
 const second=await page(first.next_cursor);assert.ok(second.items.every(v=>!first.items.some(x=>x.id===v.id)));assert.ok(second.items.every(v=>v.model!=='After page'));
 await db.exec('rollback');
});

test('legacy catalog also hides exact location and blocked-account price/km after normal migrations',async()=>{
 await db.exec('begin');
 try{
  await db.query("update public.vehicles set view_location='PRIVATE_MEETING_SENTINEL' where id=$1",[ids.car]);
  for(const actor of [null,ids.blocked,ids.buyer]){
   await asUser(db,actor);
   const rows=(await db.query('select * from public.get_vehicle_catalog()')).rows;
   assert.equal(rows.length,24);
   assert.ok(rows.every(v=>v.view_location===null));
   assert.ok(!JSON.stringify(rows).includes('PRIVATE_MEETING_SENTINEL'));
   if(actor!==ids.buyer)assert.ok(rows.every(v=>v.price===null&&v.kilometers===null));
   else assert.ok(rows.every(v=>v.price!==null&&v.kilometers!==null));
  }
 }finally{await db.exec('rollback;reset role');}
});

test('privacy-only hotfix repairs the observed legacy projection without pagination or data changes',async()=>{
 const isolated=await makeDatabase();
 try{
  // This is the historical definition observed in hosted metadata, with its
  // CRLF/LF-insensitive body preserved; no customer data is imported.
  await isolated.exec(historicalCatalog);
  await isolated.query("update public.vehicles set view_location='PRIVATE_MEETING_SENTINEL' where id=$1",[ids.car]);
  await isolated.query("insert into public.vehicles(owner_id,status,brand,model,version,year,kilometers,price,zone) select $1,'active','Synthetic','Hotfix '||i,'Base',2020,1,100,'Test' from generate_series(1,30)i",[ids.seller]);
  assert.equal((await isolated.query('select view_location from public.get_vehicle_catalog() where id=$1',[ids.car])).rows[0].view_location,'PRIVATE_MEETING_SENTINEL','regression fixture must expose the old leak');
  await isolated.exec('begin');await asUser(isolated,ids.blocked);
  assert.equal((await isolated.query('select price from public.get_vehicle_catalog() where id=$1',[ids.car])).rows[0].price,1000000,'historical RPC also exposes price to a blocked account');
  await isolated.exec('rollback;reset role');
  const before=(await isolated.query('select jsonb_agg(to_jsonb(v) order by id) data from public.vehicles v')).rows[0].data;
  await isolated.exec(privacyHotfix); // Test the exact deployable file.
  await isolated.exec('begin');
  for(const actor of [null,ids.blocked,ids.buyer]){
   await asUser(isolated,actor);
   const rows=(await isolated.query('select * from public.get_vehicle_catalog()')).rows;
   assert.equal(rows.length,32,'existing legacy clients retain the complete result count');
   assert.ok(rows.every(v=>v.view_location===null));
   assert.ok(rows.every(v=>actor===ids.buyer?v.price!==null&&v.kilometers!==null:v.price===null&&v.kilometers===null));
  }
  await isolated.exec('rollback;reset role');
  assert.deepEqual((await isolated.query('select jsonb_agg(to_jsonb(v) order by id) data from public.vehicles v')).rows[0].data,before);
 }finally{await isolated.close();}
});
