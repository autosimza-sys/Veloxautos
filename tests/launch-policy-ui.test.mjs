import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import React from 'react';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', {url:'http://localhost/'});
globalThis.window=dom.window;globalThis.document=dom.window.document;
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.React=React;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {render,fireEvent,act,cleanup}=await import('@testing-library/react');
const {default:Panel}=await import('../features/admin/LaunchPromotionPanel.jsx');
afterEach(cleanup);
const flush=()=>act(()=>new Promise(resolve=>setTimeout(resolve,0)));
const policy={revision:0,policy_revision:4,starts_at:null,ends_at:null,quotas:null,publication_cost:1,
  publication_costs:{particular:70,reseller:60,agency:45},ai_response_cost_draft:null,auto_refill:false};
function setup(p=policy){const calls=[];let current={...p};const client={
  from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{...current}})})})}),
  rpc:async(name,args)=>{calls.push({name,args});return{data:{},error:null};},
};return{client,calls,update:p=>{current=p;}};}
test('editing only refill preserves the saved role tariffs and unset AI draft',async()=>{
  const api=setup();const view=render(React.createElement(Panel,{client:api.client}));await flush();
  assert.equal(view.getByLabelText('Créditos por publicación — Particular').value,'70');
  assert.equal(view.getByLabelText('Propuesta de créditos por respuesta de IA').value,'');
  fireEvent.click(view.getByRole('checkbox'));
  fireEvent.submit(view.getByRole('button',{name:'Guardar costo y recarga'}).closest('form'));await flush();
  assert.deepEqual(api.calls[0],{name:'configure_launch_role_credit_policy',args:{expected_policy_revision:4,
    role_publication_costs:{particular:70,reseller:60,agency:45},proposed_ai_response_cost:null,refill_enabled:true}});
});
test('policy refresh shows newly saved values instead of stale defaults',async()=>{
  const api=setup();const view=render(React.createElement(Panel,{client:api.client}));await flush();
  api.update({...policy,policy_revision:5,publication_costs:{particular:80,reseller:55,agency:35},ai_response_cost_draft:0,auto_refill:true});
  fireEvent.click(view.getByRole('button',{name:'Actualizar promoción'}));await flush();
  assert.equal(view.getByLabelText('Créditos por publicación — Particular').value,'80');
  assert.equal(view.getByLabelText('Propuesta de créditos por respuesta de IA').value,'0');
  assert.equal(view.getByRole('checkbox').checked,true);
});
