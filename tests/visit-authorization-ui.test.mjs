import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import React from 'react';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost'});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.React=React;
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {render,fireEvent,act,cleanup}=await import('@testing-library/react');
const {default:Panel}=await import('../features/agenda/SellerVisitAuthorization.jsx');
const {validateVisitWindow,authorizationState,formatAuthorizationTime}=await import('../features/agenda/visit-authorization-model.js');
afterEach(cleanup);
const form={start:'2099-10-03T12:00',end:'2099-10-03T15:00',duration:'30',location:'Lugar privado',consent:true};
const fill=v=>{for(const [label,value]of [['Desde',form.start],['Hasta',form.end],['Duración de cada visita (minutos)',form.duration],['Lugar de encuentro',form.location]])fireEvent.change(v.getByLabelText(label,{exact:true}),{target:{value}});};
const row=(args={})=>({id:'auth-1',vehicle_id:'car',starts_at:'2099-10-03T15:00Z',ends_at:'2099-10-03T18:00Z',duration_minutes:30,location:'Lugar privado',timezone:'America/Argentina/Mendoza',authorized_at:'2026-10-09T15:00Z',revoked_at:null,consent_version:'visit-window-v1',...args});
function clientFixture(fail=false){const calls=[];let rows=[];return{calls,rpc:async(name,args)=>{calls.push({name,args});if(name==='get_visit_authorizations')return{data:rows};if(fail)return{error:{message:'synthetic failure'}};if(name==='authorize_visit_window'){const saved=row({starts_at:args.window_start,ends_at:args.window_end,location:args.meeting_location,request_id:args.request_id});rows=[saved];return{data:saved};}rows=rows.map(r=>({...r,revoked_at:'2026-10-09T16:00Z'}));return{data:rows[0]};}};}
async function open(client){const v=render(React.createElement(Panel,{vehicleId:'car',client}));await act(async()=>fireEvent.click(v.getByRole('button',{name:'Horarios del asistente'})));return v;}

test('no load until opened; explicit consent required and revoked on edits',async()=>{
 const client=clientFixture();const v=render(React.createElement(Panel,{vehicleId:'car',client}));assert.equal(client.calls.length,0);await act(async()=>fireEvent.click(v.getByRole('button',{name:'Horarios del asistente'})));fill(v);
 const consent=v.getByLabelText(/Autorizo al asistente/);assert.equal(consent.checked,false);assert.equal(v.getByRole('button',{name:'Autorizar horario'}).disabled,true);fireEvent.click(consent);assert.equal(v.getByRole('button',{name:'Autorizar horario'}).disabled,false);
 fireEvent.change(v.getByLabelText('Lugar de encuentro'),{target:{value:'Otro lugar'}});assert.equal(consent.checked,false);assert.equal(client.calls.length,1);
});
test('saving retains server evidence and explicit revocation does not imply cancelling visits',async()=>{
 const client=clientFixture();const v=await open(client);fill(v);fireEvent.click(v.getByLabelText(/Autorizo al asistente/));await act(async()=>fireEvent.click(v.getByRole('button',{name:'Autorizar horario'})));
 assert.equal(client.calls[1].name,'authorize_visit_window');assert.equal(client.calls[1].args.consent,true);assert.equal(client.calls[1].args.target_vehicle,'car');assert.match(client.calls[1].args.request_id,/^[0-9a-f-]{36}$/i);assert.match(v.container.textContent,/Autorización guardada/);
 await act(async()=>fireEvent.click(v.getByRole('button',{name:'Revocar autorización'})));assert.match(v.container.textContent,/Revocada/);assert.match(v.container.textContent,/no cancela visitas/i);
});
test('ambiguous failure retains draft and request ID on explicit retry',async()=>{
 const client=clientFixture(true);const v=await open(client);fill(v);fireEvent.click(v.getByLabelText(/Autorizo al asistente/));for(let i=0;i<2;i++)await act(async()=>fireEvent.click(v.getByRole('button',{name:'Autorizar horario'})));
 assert.equal(v.getByLabelText('Lugar de encuentro').value,form.location);assert.match(v.container.textContent,/No se confirmó/);assert.equal(client.calls[1].args.request_id,client.calls[2].args.request_id);
});
test('vehicle change discards private drafts and ignores old data',async()=>{
 let resolve;const client={rpc:()=>new Promise(r=>{resolve=r;})};const v=render(React.createElement(Panel,{vehicleId:'car',client}));await act(async()=>fireEvent.click(v.getByRole('button',{name:'Horarios del asistente'})));v.rerender(React.createElement(Panel,{vehicleId:'other',client}));await act(async()=>resolve({data:[row()]}));assert.doesNotMatch(v.container.textContent,/Lugar privado/);assert.equal(v.queryByLabelText('Lugar de encuentro'),null);
});
test('invalid windows cannot become authorized payloads',()=>{
 assert.equal(validateVisitWindow(form).error,undefined);
 for(const change of [{consent:false},{start:'2099-02-30T12:00'},{end:form.start},{end:'2099-10-05T12:00'},{start:'2020-01-01T00:00'},{duration:'0'},{duration:'181'},{duration:'1.5'},{location:' '},{location:'x'.repeat(301)}])assert.ok(validateVisitWindow({...form,...change}).error);
});

test('history labels revoked and expired authority and renders its recorded timezone',()=>{
 assert.equal(authorizationState(row()),'Autorizada');assert.equal(authorizationState(row({ends_at:'2000-01-01T00:00Z'})),'Vencida');assert.equal(authorizationState(row({revoked_at:'2026-10-09T16:00Z'})),'Revocada');
 assert.match(formatAuthorizationTime('2099-10-03T15:00Z','America/Argentina/Mendoza'),/12:00/);assert.match(formatAuthorizationTime('2099-10-03T15:00Z','Invented'),/no disponible/);
});
test('read errors fail closed and refresh recovers; foreign rows are never displayed',async()=>{
 let fail=true;const client={rpc:async()=>fail?{data:[row({vehicle_id:'other',location:'FOREIGN_LOCATION'})]}:{data:[]}};
 const v=await open(client);assert.match(v.container.textContent,/No pudimos consultar/);assert.doesNotMatch(v.container.textContent,/FOREIGN_LOCATION/);assert.equal(v.getByLabelText('Lugar de encuentro').closest('fieldset').disabled,true);
 fail=false;await act(async()=>fireEvent.click(v.getByRole('button',{name:'Actualizar horarios'})));assert.equal(v.getByLabelText('Lugar de encuentro').closest('fieldset').disabled,false);
});
test('a paused listing allows revocation but disables creation; failed revocation is not success',async()=>{
 const client={rpc:async(name)=>name==='get_visit_authorizations'?{data:[row()]}:{error:{message:'failed'}}};const v=render(React.createElement(Panel,{vehicleId:'car',client,listingActive:false}));
 await act(async()=>fireEvent.click(v.getByRole('button',{name:'Horarios del asistente'})));assert.equal(v.getByLabelText('Lugar de encuentro').closest('fieldset').disabled,true);
 await act(async()=>fireEvent.click(v.getByRole('button',{name:'Revocar autorización'})));assert.match(v.container.textContent,/No se confirmó la revocación/);assert.ok(v.getByText('Autorizada'));
});
test('one pending save rejects duplicate submits and an unmounted editor ignores completion',async()=>{
 let resolve;let savedCalls=0;const client={rpc:async(name,args)=>name==='get_visit_authorizations'?{data:[]}:(savedCalls++,new Promise(r=>{resolve=()=>r({data:row({request_id:args.request_id})});}))};
 const v=await open(client);fill(v);fireEvent.click(v.getByLabelText(/Autorizo al asistente/));const formElement=v.container.querySelector('form');await act(async()=>{fireEvent.submit(formElement);fireEvent.submit(formElement);});assert.equal(savedCalls,1);
 v.unmount();await act(async()=>resolve());
});
test('server replay of revoked request displays revocation instead of renewed authorization',async()=>{
 const client={rpc:async(name,args)=>name==='get_visit_authorizations'?{data:[]}:{data:row({request_id:args.request_id,revoked_at:'2026-10-09T16:00Z'})}};
 const v=await open(client);fill(v);fireEvent.click(v.getByLabelText(/Autorizo al asistente/));await act(async()=>fireEvent.click(v.getByRole('button',{name:'Autorizar horario'})));assert.match(v.container.textContent,/No se reactivó/);
});
