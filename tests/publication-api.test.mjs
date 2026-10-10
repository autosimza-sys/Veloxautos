import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createVehiclePublication } from '../features/vehicles/vehicle-api.js';
import { createPublicationForm } from '../features/publication/publication-quality.js';
const form = { ...createPublicationForm(), brand:'Test', model:'Auto', version:'Base', year:2020, kilometers:0, price:100, zone:'Mendoza',
  checklist:Object.fromEntries(Object.keys(createPublicationForm().checklist).map(key=>[key,'no revisado'])),
};
const photos = ['front','right','left','interior'].map(kind=>({kind,file:new File([kind],`${kind}.jpg`,{type:'image/jpeg'})}));
const requestId='00000000-0000-4000-8000-000000000001';
function fakeClient() {
  const uploads=[]; const rpcs=[];
  const client={uploads,rpcs,
    storage:{from:()=>({
      upload:async(path,file,options)=>{uploads.push({path,file,options});return{error:null};},
      createSignedUrls:async(paths)=>({data:paths.map(path=>({path,signedUrl:`https://example.invalid/${path}`})),error:null}),
      createSignedUrl:async(path)=>({data:{signedUrl:`https://example.invalid/${path}`},error:null}),
      remove:async()=>{throw new Error('must not delete staging after ambiguous RPC');},
    })},
    rpc:async(name,payload)=>{rpcs.push({name,payload});return{data:{id:'created',...payload.payload,owner_id:'owner',status:'active'},error:null};},
    from:()=>{throw new Error('publication and media must use one transactional RPC');},
  }; return client;
}
function args(client){return{form,photoFiles:photos,profile:{role:'particular'},user:{id:'owner'},requestId,client};}
test('publication writes metadata and credit through one RPC and deterministic content paths',async()=>{
  const client=fakeClient();
  const result=await createVehiclePublication(args(client));
  assert.equal(result.id,'created');
  assert.equal(client.rpcs.length,1);
  assert.equal(client.rpcs[0].name,'publish_vehicle_with_credit');
  assert.equal(client.rpcs[0].payload.publication_request_id,requestId);
  assert.equal(client.rpcs[0].payload.media_payload.length,4);
  assert.ok(client.uploads.every(item=>item.path.startsWith(`owner/${requestId}/`)&&item.options.upsert===false));
});
test('lost RPC response preserves files; retry uses identical request, payload and paths',async()=>{
  const client=fakeClient(); const original=client.rpc; let attempts=0;
  client.rpc=async(...args)=>{const result=await original(...args);if(++attempts===1)throw new Error('Network disconnected');return result;};
  await assert.rejects(createVehiclePublication(args(client)),/conexión|confirmar|Network/);
  const result=await createVehiclePublication(args(client));
  assert.equal(result.id,'created');
  assert.deepEqual(client.rpcs[0],client.rpcs[1]);
  assert.deepEqual(client.uploads.slice(0,4).map(x=>x.path),client.uploads.slice(4).map(x=>x.path));
});
test('known upload duplicates are safe retry and are never overwritten',async()=>{
  const client=fakeClient();
  client.storage.from=()=>({upload:async()=>({error:{statusCode:'409',message:'Already exists'}}),createSignedUrls:async()=>({data:[],error:null})});
  const result=await createVehiclePublication(args(client));
  assert.equal(result.id,'created');
});
test('publication rejects incomplete input before any uploads',async()=>{
  const client=fakeClient();
  await assert.rejects(createVehiclePublication({...args(client),form:{...form,price:-1}}),/datos|revis/i);
  assert.equal(client.uploads.length,0);
  assert.equal(client.rpcs.length,0);
});
test('photo URL failure after successful commit does not invite duplicate publication',async()=>{
  const client=fakeClient();
  const original=client.storage.from;
  client.storage.from=()=>({...original(),createSignedUrls:async()=>{throw new Error('offline');},createSignedUrl:async()=>{throw new Error('offline');}});
  const result=await createVehiclePublication(args(client));
  assert.equal(result.id,'created');
  assert.equal(result.image,'/vehicle-placeholder.svg');
});
test('Supabase 400 Duplicate is retriable but unrelated 400 errors are rejected',async()=>{
  for(const error of [{statusCode:'400',error:'Duplicate',message:'The resource already exists'}, {statusCode:'400',message:'Asset Already Exists'}]){
    const client=fakeClient();
    client.storage.from=()=>({upload:async()=>({error}),createSignedUrls:async()=>({data:[]})});
    assert.equal((await createVehiclePublication(args(client))).id,'created');
  }
  const client=fakeClient();
  client.storage.from=()=>({upload:async()=>({error:{statusCode:'400',message:'Invalid file'}})});
  await assert.rejects(createVehiclePublication(args(client)),/subir/);
  assert.equal(client.rpcs.length,0);
});
test('Supabase transport errors resolved as status zero offer safe retry guidance',async()=>{
  const client=fakeClient();
  client.rpc=async()=>({data:null,error:{code:'',message:'TypeError: Failed to fetch'},status:0});
  await assert.rejects(createVehiclePublication(args(client)),/reintentá sin cambiar los datos/);
});
test('reselecting identical photos in another order preserves transactional media payload',async()=>{
  const client=fakeClient();
  await createVehiclePublication(args(client));
  await createVehiclePublication({...args(client),photoFiles:[...photos].reverse()});
  assert.deepEqual(client.rpcs[0],client.rpcs[1]);
});
