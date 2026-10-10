import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {createDemoSession} from '../features/demo/demo-session.js';

const now=()=>new Date('2030-10-10T12:00:00Z').getTime();
const make=()=>createDemoSession({now});
async function book(s,slot,key='request-1',consent=true){return s.buyer.rpc('book_authorized_visit',{target_conversation:s.conversation.id,target_authorization:slot.authorization_id,slot_start:slot.scheduled_at,buyer_consent:consent,booking_request_id:key});}
const slots=async s=>(await s.buyer.rpc('get_available_visit_slots',{target_conversation:s.conversation.id})).data;

test('demo begins empty, and example publication is fictional and supplies future seller-authorized slots',async()=>{
 const s=make();assert.equal(s.vehicle,null);assert.deepEqual(await slots(s),[]);
 s.useExample();assert.equal(s.vehicle.brand,'Toyota');assert.ok(s.vehicle.description.includes('ejemplo'));
 const list=await slots(s);assert.equal(list.length,4);assert.ok(Date.parse(list[0].scheduled_at)>now());assert.equal(list[0].duration_minutes,30);
});
test('booking requires explicit buyer consent and a current offered slot',async()=>{
 const s=make();s.useExample();const [slot]=await slots(s);
 assert.ok((await book(s,slot,'bad',false)).error);assert.ok((await book(s,{...slot,scheduled_at:'2030-10-11T18:15:00Z'})).error);
 assert.deepEqual((await s.seller.rpc('get_visit_notices')).data,[]);
});
test('one confirmed booking produces one private notice per role, and retry never duplicates',async()=>{
 const s=make();s.useExample();const [slot]=await slots(s),first=await book(s,slot);
 assert.equal(first.data.status,'confirmed');assert.equal(first.data.confirmation_source,'seller_authorization');
 assert.deepEqual(await book(s,slot),first);assert.equal((await slots(s)).length,3);
 assert.ok((await book(s,slot,'different')).error);
 const seller=(await s.seller.rpc('get_visit_notices')).data,buyer=(await s.buyer.rpc('get_visit_notices')).data;
 assert.equal(seller.length,1);assert.equal(buyer.length,1);assert.equal(seller[0].recipient_id,s.conversation.seller_id);
 assert.equal(buyer[0].recipient_id,s.conversation.buyer_id);assert.equal(seller[0].buyer_name,'Comprador de ejemplo');
 assert.ok((await s.buyer.rpc('read_visit_notice',{target_notice:seller[0].id})).error);
 assert.ok((await s.seller.rpc('read_visit_notice',{target_notice:seller[0].id})).data.read_at);
 assert.ok((await s.seller.rpc('read_visit_notice',{target_notice:seller[0].id})).data.read_at);
 assert.equal((await s.buyer.rpc('get_visit_notices')).data[0].read_at,null);
});
test('revoking authorization removes slots without cancelling an agreed demo visit',async()=>{
 const s=make();s.useExample();const [slot]=await slots(s);await book(s,slot);
 assert.ok((await s.buyer.rpc('revoke_visit_authorization',{target_authorization:slot.authorization_id})).error);
 assert.ok((await s.seller.rpc('revoke_visit_authorization',{target_authorization:slot.authorization_id})).data.revoked_at);
 assert.deepEqual(await slots(s),[]);assert.equal((await s.seller.rpc('get_visit_notices')).data[0].status,'confirmed');
 assert.deepEqual((await book(s,slot)).data.status,'confirmed');
});
test('stale, mismatched, unknown and other-role requests fail without live fallback',async()=>{
 const s=make();s.useExample();const [slot,other]=await slots(s);await book(s,slot);
 assert.ok((await book(s,other)).error);
 assert.ok((await s.buyer.rpc('get_available_visit_slots',{target_conversation:'other'})).error);
 assert.ok((await s.seller.rpc('book_authorized_visit',{})).error);
 assert.ok((await s.seller.rpc('execute_sql',{})).error);
 assert.ok((await s.seller.rpc('revoke_visit_authorization',{target_authorization:'other'})).error);
});
test('seller can add a valid future window, retry once, and cannot authorize overlaps or missing consent',async()=>{
 const s=make();s.useExample();
 const a={target_vehicle:s.vehicle.id,window_start:'2030-10-12T15:00:00Z',window_end:'2030-10-12T16:00:00Z',visit_minutes:30,meeting_location:'Punto de ejemplo',display_timezone:'America/Argentina/Mendoza',consent:true,request_id:'seller-request'};
 const result=await s.seller.rpc('authorize_visit_window',a);assert.ok(result.data.authorized_at);
 assert.deepEqual(await s.seller.rpc('authorize_visit_window',a),result);
 for(const changed of [{consent:false},{request_id:'overlap'},{display_timezone:'bad-zone'},{target_vehicle:'other'},{window_start:'2000-01-01T00:00Z'}])assert.ok((await s.seller.rpc('authorize_visit_window',{...a,...changed})).error);
 assert.equal((await s.seller.rpc('get_visit_authorizations',{target_vehicle:s.vehicle.id})).data.length,2);
});
test('sessions and snapshots are isolated; replacing a demo listing clears its visits',async()=>{
 const s=make(),other=make();s.useExample();other.useExample();
 assert.notEqual(s.conversation.id,other.conversation.id);const [slot]=await slots(s);await book(s,slot);
 const copy=(await s.seller.rpc('get_visit_notices')).data;copy[0].buyer_name='Changed';
 assert.equal((await s.seller.rpc('get_visit_notices')).data[0].buyer_name,'Comprador de ejemplo');
 assert.equal((await other.seller.rpc('get_visit_notices')).data.length,0);
 s.useExample();assert.equal((await s.seller.rpc('get_visit_notices')).data.length,0);
});
test('custom publication uses the actual required photo and auto-check rules',async()=>{
 const {createPublicationForm,PHOTO_GUIDE}=await import('../features/publication/publication-quality.js');
 const s=make(),form=createPublicationForm();assert.equal(s.publish({form,photoFiles:[]}),false);
 Object.assign(form,{brand:'Marca prueba',model:'Modelo prueba',version:'Base',year:'2020',kilometers:'40000',price:'12000000',zone:'Mendoza',description:'Unidad de prueba'});
 for(const key of Object.keys(form.checklist))form.checklist[key]='no revisado';
 const photoFiles=PHOTO_GUIDE.filter(x=>x.required).map(x=>({kind:x.id,file:{type:'image/png',size:100}}));
 assert.equal(s.publish({form,photoFiles}),true);assert.equal(s.vehicle.km,40000);assert.equal(s.vehicle.checklist.motor,'no revisado');
 assert.deepEqual(await slots(s),[]);form.checklist.motor='changed';assert.equal(s.vehicle.checklist.motor,'no revisado');
});
test('demo component graph cannot initialize Supabase or any network client',async()=>{
 const result=await build({entryPoints:['features/demo/DemoExperience.jsx'],bundle:true,write:false,metafile:true,platform:'browser',external:['react','react/jsx-runtime','next/link'],logLevel:'silent'});
 assert.equal(Object.keys(result.metafile.inputs).some(p=>/supabase|ai-provider|server\//i.test(p)),false,'Demo must remain entirely isolated from real services');
});
