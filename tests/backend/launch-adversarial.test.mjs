import assert from 'node:assert/strict';
import {before,after,beforeEach,afterEach,test} from 'node:test';
import {asUser,ids,makeDatabase,denied} from './fixtures.mjs';
let db;
before(async()=>{db=await makeDatabase({productionDrift:true});});
after(async()=>{await db?.close();});
beforeEach(async()=>{await db.exec('begin');});
afterEach(async()=>{await db.exec('rollback; reset role');});
for(const checklist of [{motor:{x:1}},{motor:['bueno']},{motor:true},{motor:'x'.repeat(121)},{certificado:'aprobado'}]) {
 test(`server rejects unsafe checklist ${JSON.stringify(checklist).slice(0,50)}`,async()=>{
  await denied(db,()=>db.query('update public.vehicles set checklist=$1 where id=$2',[checklist,ids.car]),assert);
 });
}
for(const [field,limit] of [['brand',80],['model',120],['version',160],['zone',200],['description',4000],['view_location',300],['available_hours',500],['partial_plate',20]]) {
 test(`seller cannot persist oversized ${field}`,async()=>{
  await asUser(db,ids.seller);
  await denied(db,()=>db.query('select public.update_vehicle_listing($1,$2)',[ids.car,{[field]:'x'.repeat(limit+1)}]),assert);
 });
}
test('normal data and partial historical checklists remain supported',async()=>{
 await db.query("update public.vehicles set checklist=$1 where id=$2",[{motor:'bueno',caja:'no revisado'},ids.car]);
 await asUser(db,ids.seller);
 const v=(await db.query('select * from public.update_vehicle_listing($1,$2)',[ids.car,{description:'Declaracion del vendedor',view_location:'Lugar acordado'}])).rows[0];
 assert.equal(v.description,'Declaracion del vendedor');
});
test('browser cannot overwrite or remove linked immutable media',async()=>{
 await asUser(db,ids.seller);
 assert.equal((await db.query("update storage.objects set metadata=$1 where name=$2 returning id",[{size:25000000,mimetype:'image/jpeg'},`${ids.seller}/${ids.car}.jpg`])).rows.length,0);
 assert.equal((await db.query('delete from storage.objects where name=$1 returning id',[`${ids.seller}/${ids.car}.jpg`])).rows.length,0);
});
test('payment records cannot be manufactured by a browser account',async()=>{
 await asUser(db,ids.seller);
 await denied(db,()=>db.query("insert into public.orders(user_id,kind,amount) values($1,'publication',-1)",[ids.seller]),assert);
});
test('blocked user cannot create a server draft',async()=>{
 await asUser(db,ids.blocked);
 await denied(db,()=>db.query('insert into public.publication_drafts(user_id,data) values($1,$2)',[ids.blocked,{brand:'Test'}]),assert);
});
test('active seller can save one bounded draft, not a large arbitrary document',async()=>{
 await asUser(db,ids.seller);
 assert.equal((await db.query('insert into public.publication_drafts(user_id,data) values($1,$2) returning id',[ids.seller,{brand:'Test'}])).rows.length,1);
 await denied(db,()=>db.query('insert into public.publication_drafts(user_id,data) values($1,$2)',[ids.seller,{description:'x'.repeat(70000)}]),assert);
});
test('oversized ignored publication keys roll back the car, debit and request record',async()=>{
 const media=[];
 for(let i=0;i<4;i++){
  const name=`${ids.seller}/bounded-${i}.jpg`;
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('vehicle-media',$1,$2)",[name,{size:100,mimetype:'image/jpeg'}]);
  media.push({media_type:'photo',storage_path:name,sort_order:i});
 }
 await asUser(db,ids.seller);
 const balance=(await db.query('select used from public.credit_balances where user_id=$1',[ids.seller])).rows[0].used;
 await denied(db,()=>db.query('select public.publish_vehicle_with_credit($1,$2,$3)',[
  {brand:'Test',model:'OversizedExtra',version:'Base',year:2020,kilometers:1,price:100,zone:'Mendoza',ignored:'x'.repeat(40000)},media,crypto.randomUUID(),
 ]),assert);
 assert.equal((await db.query('select used from public.credit_balances where user_id=$1',[ids.seller])).rows[0].used,balance);
 assert.equal((await db.query("select * from public.vehicles where model='OversizedExtra'")).rows.length,0);
});
