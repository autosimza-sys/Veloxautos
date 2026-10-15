import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import React from 'react';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/'});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.React=React;
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {render,renderHook,act,fireEvent,cleanup,waitFor}=await import('@testing-library/react');
const {useInspections}=await import('../features/inspections/use-inspections.js');
const {default:InspectionSection}=await import('../features/inspections/InspectionSection.jsx');
afterEach(cleanup);
const flush=()=>act(()=>new Promise(resolve=>setTimeout(resolve,0)));
function fixture(){
 const requests=[{id:'request',vehicle_id:'vehicle',requested_by:'buyer'}];
 const reports=[{request_id:'request',inspection_media:[],observations:'private report'}];
 const client={from:table=>{
   const response=()=>({data:table==='inspection_requests'?requests:table==='inspection_reports'?reports:[]});
   const q={select:()=>q,eq:()=>q,in:()=>q,order:()=>q,then:(resolve,reject)=>Promise.resolve(response()).then(resolve,reject)};return q;
 },rpc:async()=>({data:[{request_id:'request',brand:'Test',model:'Auto',version:'Base',year:2020,request_status:'assigned',declared_kilometers:999,owner_name:'Synthetic'}]})};return client;
}
test('logout and role change immediately hide all cached private inspection records',async()=>{
 const client=fixture();
 const {result,rerender}=renderHook(props=>useInspections({...props,client}),{initialProps:{session:{user:{id:'buyer'}},profile:{role:'registered'}}});
 await flush();assert.equal(result.current.reports.request.observations,'private report');
 rerender({session:null,profile:null});assert.deepEqual(result.current.reports,{});assert.deepEqual(result.current.requests,[]);assert.deepEqual(result.current.assignments,[]);
});
test('network failure is actionable and not attributed to missing migrations',async()=>{
 const client=fixture();client.from=()=>({select:()=>({order:async()=>({error:{message:'offline'}})})});
 const {result}=renderHook(()=>useInspections({session:{user:{id:'buyer'}},profile:{role:'registered'},client}));
 await flush();assert.match(result.current.status,/conexión/);assert.doesNotMatch(result.current.status,/migraci/);
});
test('mechanic assignment opens explicit empty assessment, never copied seller odometer or approval',async()=>{
 const view=render(React.createElement(InspectionSection,{session:{user:{id:'mechanic'}},profile:{role:'mechanic'},client:fixture(),vehicle:null}));
 await flush();fireEvent.click(view.getByRole('button',{name:/Test Auto Base/}));
 assert.equal(view.getByLabelText('Kilometros verificados').value,'');
 assert.equal(view.getByLabelText('Resultado').value,'');
 for(const name of ['motor','caja','estructura','frenos','electronica','interior'])assert.equal(view.getByLabelText(name,{exact:true}).value,'');
});
test('pending submission prevents assignment switch; failed draft and files survive switching afterward',async()=>{
 const client=fixture();let finish;let sends=0;
 const assignments=[{request_id:'request',brand:'Test',model:'A',version:'Base',request_status:'assigned'},{request_id:'other',brand:'Test',model:'B',version:'Base',request_status:'assigned'}];
 client.rpc=async(name)=>name==='reserve_vehicle_upload'?{data:{state:'reserved'}}:name==='finish_vehicle_upload'?{data:{state:'consumed'}}:name==='get_assigned_inspection_context'?{data:assignments}:(sends++,await new Promise(resolve=>{finish=resolve;}));
 client.storage={from:()=>({upload:async()=>({})})};
 const view=render(React.createElement(InspectionSection,{session:{user:{id:'mechanic'}},profile:{role:'mechanic'},client,vehicle:null}));
 await flush();fireEvent.click(view.getByRole('button',{name:/Test A Base/}));
 fireEvent.change(view.getByLabelText('Fecha'),{target:{value:'2026-01-01'}});
 fireEvent.change(view.getByLabelText('Kilometros verificados'),{target:{value:'123'}});
 fireEvent.change(view.getByLabelText('Observaciones'),{target:{value:'Keep this assessment'}});
 for(const name of ['motor','caja','estructura','frenos','electronica','interior'])fireEvent.change(view.getByLabelText(name,{exact:true}),{target:{value:'5'}});
 fireEvent.change(view.getByLabelText('Resultado'),{target:{value:'observed'}});
 fireEvent.change(view.getByLabelText('Foto del tablero'),{target:{files:[new File(['dash'],'keep-dashboard.jpg',{type:'image/jpeg'})]}});
 fireEvent.submit(view.container.querySelector('.mechanicReport'));
 // File preparation is asynchronous; wait for the observable send, not 15ms.
 await waitFor(()=>assert.equal(sends,1));assert.equal(view.getByRole('button',{name:/Test B Base/}).disabled,true);
 await act(async()=>finish({error:{code:'',message:'offline'},status:0}));
 fireEvent.click(view.getByRole('button',{name:/Test A Base/}));assert.equal(view.getByLabelText('Kilometros verificados').value,'123');
 fireEvent.click(view.getByRole('button',{name:/Test B Base/}));fireEvent.click(view.getByRole('button',{name:/Test A Base/}));
 assert.equal(view.getByLabelText('Observaciones').value,'Keep this assessment');
 assert.equal(view.getByLabelText('Kilometros verificados').value,'123');assert.ok(view.getByText('Foto de tablero seleccionada: keep-dashboard.jpg'));
 assert.equal(view.getByLabelText('Foto del tablero').required,false);
 assert.equal(view.getByLabelText('Foto del tablero').validity.valueMissing,false);
});
test('refresh failure after request success is visible and cannot trigger a duplicate request',async()=>{
 let loads=0,calls=0;
 const client={from:()=>({select:()=>({order:async()=>++loads===1?{data:[]}:{error:{message:'offline'}}})}),rpc:async()=>{calls++;return{data:{id:'requested-once',vehicle_id:'vehicle',status:'requested'}};}};
 const {result}=renderHook(()=>useInspections({session:{user:{id:'buyer'}},profile:{role:'registered'},vehicle:{id:'vehicle'},client}));
 await flush();await act(()=>result.current.requestInspection());await flush();
 assert.equal(calls,1);assert.match(result.current.status,/conexión/);assert.ok(result.current.loadError);
 await act(()=>result.current.requestInspection());assert.equal(calls,1);
});
