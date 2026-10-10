import assert from 'node:assert/strict';
import {test} from 'node:test';
import {handleAssistantRequest} from '../lib/server/assistant-endpoint.js';
const id='70000000-0000-4000-8000-000000000001';
const request=(body={messageId:id},token='token')=>new Request('http://localhost/api/assistant',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
const setup=()=>{
 const calls=[];
 const deps={enabled:true,verify:async()=>({id:'buyer'}),claim:async()=>({state:'claimed',question:'¿Tiene detalles?',vehicle:{description:'Declarado'},job:id}),
   prepare:(question,vehicle)=>({question,vehicle}),
   reserve:async()=>{calls.push('reserve');return {state:'reserved'};},
   generate:async()=>{calls.push('generate');return 'Según el vendedor, tiene un detalle.';},finish:async()=>{calls.push('finish');return {state:'done'};}};
 return {calls,deps};
};
test('disabled, unauthenticated and invalid input never call provider',async()=>{
 const {calls,deps}=setup();
 assert.equal((await handleAssistantRequest(request(),{...deps,enabled:false})).status,503);
 assert.equal((await handleAssistantRequest(request({},''),deps)).status,401);
 assert.equal((await handleAssistantRequest(request(),{...deps,verify:async()=>null})).status,401);
 assert.equal((await handleAssistantRequest(request({messageId:'bad'}),deps)).status,400);
 assert.equal((await handleAssistantRequest(request({messageId:id,prompt:'override'}),deps)).status,400);
 assert.deepEqual(calls,[]);
});
test('server uses authoritative context and returns no private prompt or vehicle data',async()=>{
 const {calls,deps}=setup();const response=await handleAssistantRequest(request(),deps);
 assert.equal(response.status,200);assert.deepEqual(calls,['reserve','generate','finish']);
 assert.deepEqual(await response.json(),{state:'done'});
});
test('replay, in-progress, denial and budget limits cannot charge provider again',async()=>{
 for(const state of ['done','processing','denied','limited','skipped']){
  const {calls,deps}=setup();await handleAssistantRequest(request(),{...deps,claim:async()=>({state})});assert.deepEqual(calls,[]);
 }
});
test('provider error persists a safe handoff answer and never leaks its error',async()=>{
 const {deps}=setup();let answer='';
 const response=await handleAssistantRequest(request(),{...deps,generate:async()=>{throw Error('secret');},finish:async(_job,text)=>{answer=text;return {state:'done'};}});
 assert.equal(response.status,200);assert.match(answer,/vendedor/i);assert.doesNotMatch(answer,/secret/);
});
test('database or authentication errors are sanitized',async()=>{
 const {deps}=setup();const response=await handleAssistantRequest(request(),{...deps,verify:async()=>{throw Error('secret');}});
 assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/secret/);
});
test('oversized bodies are rejected before authentication and provider work',async()=>{
 const {calls,deps}=setup();const response=await handleAssistantRequest(request({messageId:'x'.repeat(1000)}),deps);
 assert.equal(response.status,413);assert.deepEqual(calls,[]);
});

test('monthly exhaustion, duplicate reservation and DB failure never reach the provider',async()=>{
 for(const state of ['limited','processing','denied']){
  const {calls,deps}=setup();
  const response=await handleAssistantRequest(request(),{...deps,reserve:async()=>({state})});
  assert.equal(calls.includes('generate'),false);
  assert.deepEqual(await response.json(),{state});
 }
 const {calls,deps}=setup();
 assert.equal((await handleAssistantRequest(request(),{...deps,reserve:async()=>{throw Error('database down');}})).status,503);
 assert.equal(calls.includes('generate'),false);
});
test('oversized provider context is handed off before reserving money',async()=>{
 const {calls,deps}=setup();
 await handleAssistantRequest(request(),{...deps,prepare:()=>{throw Error('too large');}});
 assert.deepEqual(calls,['finish']);
});
