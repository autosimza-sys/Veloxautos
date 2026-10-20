import {test} from 'node:test';
import assert from 'node:assert/strict';
import {storageCleanup} from '../lib/server/storage-cleanup.js';
const projectRef='qcllovwetaokurkkzkry', now=Date.parse('2026-10-20T12:00:00Z');
const object={object_id:'80000000-0000-4000-8000-000000000001',bucket:'vehicle-media',path:'10000000-0000-4000-8000-000000000001/old.jpg'};
const plan=()=>({generated_at:new Date(now).toISOString(),retention_days:7,objects:[object]});
test('default preview never invokes Storage remove or claims',async()=>{
 const calls=[];const client={supabaseUrl:'https://qcllovwetaokurkkzkry.supabase.co',rpc:async(name)=>{calls.push(name);return{data:plan()};},storage:{from(){throw Error('must not remove');}}};
 assert.equal((await storageCleanup({client,projectRef,now})).mode,'preview');assert.deepEqual(calls,['storage_cleanup_preview']);
});
test('claim is revalidated before API deletion and completion is required',async()=>{
 const calls=[];const client={supabaseUrl:'https://qcllovwetaokurkkzkry.supabase.co',rpc:async(name)=>{calls.push(name);return{data:{state:name==='claim_storage_cleanup'?'claimed':'deleted'}};},storage:{from:()=>({remove:async paths=>{calls.push(paths);return{};}})}};
 const summary=await storageCleanup({client,projectRef,now,approvedPlan:plan()});
 assert.equal(summary.deleted,1);assert.deepEqual(calls,['claim_storage_cleanup',[object.path],'complete_storage_cleanup']);
});
test('new reference, failed claim and stale approvals never remove',async()=>{
 let removals=0;const client={supabaseUrl:'https://qcllovwetaokurkkzkry.supabase.co',rpc:async()=>({error:{message:'PRIVATE'}}),storage:{from:()=>({remove:async()=>{removals++;return{};}})}};
 assert.equal((await storageCleanup({client,projectRef,now,approvedPlan:plan()})).skipped,1);
 await assert.rejects(storageCleanup({client,projectRef,now:now+900001,approvedPlan:plan()}));assert.equal(removals,0);
 await assert.rejects(storageCleanup({client,projectRef:'other',now}));assert.equal(removals,0);
});
test('uncertain delete retains quarantine and returns counters without paths or errors',async()=>{
 const client={supabaseUrl:'https://qcllovwetaokurkkzkry.supabase.co',rpc:async()=>({data:{state:'claimed'}}),storage:{from:()=>({remove:async()=>{throw Error('PRIVATE TOKEN');}})}};
 const summary=await storageCleanup({client,projectRef,now,approvedPlan:plan()});
 assert.equal(summary.needsReconcile,1);assert.doesNotMatch(JSON.stringify(summary),/old.jpg|PRIVATE|10000000/);
});
