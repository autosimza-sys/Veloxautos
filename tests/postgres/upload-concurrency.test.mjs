// Explicit opt-in: fresh local PostgreSQL database ONLY. Never a hosted URL.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,readdir} from 'node:fs/promises';
import {Client} from 'pg';
import {bootstrap,ids,root} from '../backend/fixtures.mjs';
const connectionString=process.env.VELOX_TEST_DATABASE_URL;
const url=new URL(connectionString || 'http://invalid');
if(!['127.0.0.1','localhost'].includes(url.hostname)||!/^\/velox_ecc_isolated(?:_[a-z0-9]+)?$/.test(url.pathname))throw Error('A fresh local velox_ecc_isolated database is required');
const connect=async()=>{const client=new Client({connectionString});await client.connect();return client;};
test('real independent PostgreSQL connections serialize quota admission and release/INSERT races',async t=>{
 const admin=await connect();const clients=[];
 try{
  assert.equal((await admin.query("select count(*)::int n from pg_tables where schemaname in ('public','auth','storage','velox_private')")).rows[0].n,0,'database must be empty');
  const platform = bootstrap.replace(/create role (anon|authenticated|service_role) ([^;]+);/g,
   (_,role,attributes)=>`do $$ begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role} ${attributes}; end if; end $$;`);
  await admin.query(platform);
  await admin.query(await readFile(`${root}/supabase/schema.sql`,'utf8'));
  for(const file of (await readdir(`${root}/supabase/migrations`)).filter(x=>x.endsWith('.sql')).sort())await admin.query(await readFile(`${root}/supabase/migrations/${file}`,'utf8'));
  await admin.query('insert into auth.users values($1,$2,$3)',[ids.seller,'isolated@example.invalid',{role:'particular',display_name:'Synthetic'}]);
  await admin.query('update velox_private.upload_limits set max_objects=4');
  for(let i=0;i<8;i++){const c=await connect();clients.push(c);await c.query('set role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,false)",[ids.seller]);}
  const reserve=(c,name)=>c.query("select public.reserve_vehicle_upload($1,100,'image/jpeg') result",[name]);
  const path=i=>`${ids.seller}/concurrent/${i}.jpg`;
  const results=await Promise.allSettled(clients.map((c,i)=>reserve(c,path(i))));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,4);
  assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='23514').length,4);
  assert.equal((await admin.query("select count(*)::int n from velox_private.upload_reservations where state='pending'")).rows[0].n,4);
  const winner=results.findIndex(r=>r.status==='fulfilled');const name=path(winner);
  const retries=await Promise.all(clients.map(c=>reserve(c,name)));
  assert.ok(retries.every(r=>r.rows[0].result.state==='reserved'));
  assert.equal((await admin.query('select attempts from velox_private.upload_windows')).rows[0].attempts,4);
  const upload=c=>c.query("insert into storage.objects(bucket_id,name,metadata) values('vehicle-media',$1,'{\"size\":100,\"mimetype\":\"image/jpeg\"}')",[name]);
  // Hold release's transaction open so the competing INSERT must wait.
  await clients[0].query('begin');
  await clients[0].query('select public.finish_vehicle_upload($1,true)',[name]);
  const late=upload(clients[1]).then(()=>({ok:true}),error=>({error}));
  await clients[0].query('commit');
  assert.equal((await late).error?.code,'23514');
  await reserve(clients[0],name);
  // Inverse order: INSERT commits first; release observes a consumed object.
  await clients[0].query('begin');await upload(clients[0]);
  const release=clients[1].query('select public.finish_vehicle_upload($1,true) result',[name]);
  await clients[0].query('commit');
  assert.equal((await release).rows[0].result.state,'consumed');
  assert.equal((await admin.query('select count(*)::int n from storage.objects')).rows[0].n,1);

  await admin.query(`insert into public.vehicles(owner_id,status,brand,model,version,year,kilometers,price,zone,created_at)
   select $1,'active','Synthetic','Load '||i,'Base',2020,i,1000000+i,'Mendoza','2026-01-01T00:00:00.123456Z' from generate_series(1,500) i`,[ids.seller]);
  await admin.query(`insert into public.vehicle_media(vehicle_id,media_type,storage_path,sort_order)
   select v.id,'photo',v.owner_id||'/bench/'||v.id||'/'||n||'.jpg',n from public.vehicles v cross join generate_series(0,3) n`);
  while(clients.length<20){const c=await connect();clients.push(c);await c.query('set role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,false)",[ids.seller]);}
  const latencies=[];let maxBytes=0;
  await Promise.all(clients.map(async c=>{
   let cursor=null;const seen=new Set();
   do{
    const started=performance.now();const result=(await c.query('select public.get_vehicle_catalog_page(24,$1,$2) result',[cursor,{}])).rows[0].result;
    latencies.push(performance.now()-started);maxBytes=Math.max(maxBytes,Buffer.byteLength(JSON.stringify(result)));
    assert.ok(result.items.length<=24);for(const item of result.items){assert.ok(!seen.has(item.id));seen.add(item.id);assert.equal(item.media.length,4);}
    cursor=result.next_cursor;
   }while(cursor);
   assert.equal(seen.size,500);
  }));
  latencies.sort((a,b)=>a-b);const p95=latencies[Math.ceil(latencies.length*.95)-1];
  assert.ok(p95<3000,`local database page p95 ${p95}ms`);
  t.diagnostic(JSON.stringify({postgres:admin.serverVersion,syntheticListings:500,sessions:20,pageSize:24,requests:latencies.length,p95DatabaseMs:p95,maxPayloadBytes:maxBytes,conditions:'loopback PostgreSQL; synthetic 4-photo metadata; no Storage signing/network or browser timing; no AI/email'}));
 }finally{await Promise.all(clients.map(c=>c.end()));await admin.end();}
});
