import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/'});
globalThis.window=dom.window;globalThis.document=dom.window.document;
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {renderHook,act,cleanup}=await import('@testing-library/react');
const {useCredits}=await import('../features/credits/use-credits.js');
afterEach(cleanup);
const flush=()=>act(()=>new Promise(r=>setTimeout(r,0)));
function fakeClient(result){return{from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>result})})})};}
test('expired credits are unavailable despite unused allocation',async()=>{
 const client=fakeClient({data:{granted:10,used:2,expires_at:'2000-01-01T00:00:00Z'}});
 const {result}=renderHook(()=>useCredits({user:{id:'a'}},client));await flush();
 assert.equal(result.current.balance.remaining,0);assert.equal(result.current.balance.expired,true);
});
test('sign-out clears old balance immediately',async()=>{
 const client=fakeClient({data:{granted:10,used:2,expires_at:'2100-01-01T00:00:00Z'}});
 const {result,rerender}=renderHook(({session})=>useCredits(session,client),{initialProps:{session:{user:{id:'a'}}}});await flush();
 assert.equal(result.current.balance.remaining,8);rerender({session:null});assert.equal(result.current.balance,null);
});
test('backend failure is not misreported as a pending migration',async()=>{
 const client=fakeClient({error:{message:'Failed to fetch'}});
 const {result}=renderHook(()=>useCredits({user:{id:'a'}},client));await flush();
 assert.equal(result.current.balance,null);assert.match(result.current.status,/consultar|conexión/i);assert.doesNotMatch(result.current.status,/migraci/i);
});
