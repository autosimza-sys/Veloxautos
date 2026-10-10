import assert from 'node:assert/strict';
import {test} from 'node:test';
import {requestAssistantReply} from '../features/chat/assistant-request.js';
test('AI request sends only confirmed message reference, never user-supplied vehicle context',async()=>{
 let seen;
 const result=await requestAssistantReply('message','token',async(url,options)=>{seen={url,...options};return Response.json({state:'done'});});
 assert.equal(result,'done');assert.equal(seen.url,'/api/assistant');
 assert.deepEqual(JSON.parse(seen.body),{messageId:'message'});assert.equal(seen.headers.Authorization,'Bearer token');
});
test('no token never calls server; errors leave the already sent human message intact',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error('offline');};
 assert.equal(await requestAssistantReply('message',null,fetcher),'unavailable');assert.equal(calls,0);
 assert.equal(await requestAssistantReply('message','token',fetcher),'unavailable');assert.equal(calls,1);
});
