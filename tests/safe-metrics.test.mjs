import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recordAssistantOutcome} from '../lib/server/safe-metrics.js';
import {handleAssistantRequest} from '../lib/server/assistant-endpoint.js';
test('metrics allow only fixed names/states/counts and never stringify an error object',()=>{
 const out=[];const secret={token:'PRIVATE',toString(){throw Error('must not inspect');}};
 const metric=recordAssistantOutcome(secret,line=>out.push(line));
 assert.deepEqual(metric,{event:'velox.assistant.outcome',state:'unknown',count:1});
 assert.doesNotMatch(out[0],/PRIVATE|token/);
 assert.doesNotThrow(()=>recordAssistantOutcome('limited',()=>{throw Error('logger unavailable');}));
});
test('disabled and unauthorized requests are counted without sending headers to observers',async()=>{
 const seen=[];const request=new Request('http://localhost/api/assistant?private=PRIVATE',{method:'POST'});
 assert.equal((await handleAssistantRequest(request,{enabled:false,observe:s=>seen.push(s)})).status,503);
 assert.equal((await handleAssistantRequest(request,{enabled:true,observe:s=>seen.push(s)})).status,401);
 assert.deepEqual(seen,['unavailable','unauthorized']);assert.doesNotMatch(JSON.stringify(seen),/PRIVATE/);
 assert.equal((await handleAssistantRequest(request,{enabled:false,observe(){throw Error('PRIVATE');}})).status,503);
});
