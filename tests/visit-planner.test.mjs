import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import React from 'react';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost'});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.React=React;
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {render,fireEvent,act,cleanup}=await import('@testing-library/react');
const {default:VisitPlanner}=await import('../features/agenda/VisitPlanner.jsx');
afterEach(cleanup);
test('free text prepares an editable proposal and still needs explicit submission',async()=>{
 const calls=[];const view=render(React.createElement(VisitPlanner,{onPropose:async data=>{calls.push(data);return true;},onClose:()=>{}}));
 fireEvent.change(view.getByLabelText('Escribí tu propuesta de visita'),{target:{value:'01/01/2099 a las 14:30 durante 30 minutos en Lugar sintético'}});
 fireEvent.click(view.getByRole('button',{name:'Preparar propuesta desde el texto'}));
 assert.equal(calls.length,0);assert.match(view.container.textContent,/Lugar sintético/);
 await act(async()=>fireEvent.click(view.getByRole('button',{name:'Enviar propuesta'})));
 assert.deepEqual(calls,[{scheduledAt:'2099-01-01T14:30',durationMinutes:'30',location:'Lugar sintético'}]);
});
test('free text asks for missing details instead of inventing a duration',()=>{
 const view=render(React.createElement(VisitPlanner,{onPropose:async()=>{throw Error('Must not submit');},onClose:()=>{}}));
 fireEvent.change(view.getByLabelText('Escribí tu propuesta de visita'),{target:{value:'01/01/2099 a las 14:30'}});
 fireEvent.click(view.getByRole('button',{name:'Preparar propuesta desde el texto'}));
 assert.equal(view.getByLabelText('Minutos para la visita').value,'');
 assert.match(view.container.textContent,/faltan datos/i);
});
async function fill(view){
 fireEvent.change(view.getByLabelText('Fecha y hora de la visita'),{target:{value:'2099-01-01T14:30'}});
 fireEvent.click(view.getByRole('button',{name:'Siguiente'}));
 fireEvent.change(view.getByLabelText('Minutos para la visita'),{target:{value:'30'}});
 fireEvent.click(view.getByRole('button',{name:'Siguiente'}));
 fireEvent.change(view.getByLabelText('Lugar de encuentro'),{target:{value:'Lugar sintético'}});
 fireEvent.click(view.getByRole('button',{name:'Revisar propuesta'}));
}
test('assistant collects explicit details and cannot propose before the user confirms the summary',async()=>{
 const calls=[];const view=render(React.createElement(VisitPlanner,{onPropose:async data=>{calls.push(data);return true;},onClose:()=>{}}));
 await fill(view);assert.equal(calls.length,0);assert.match(view.container.textContent,/otra persona debe aceptar/);
 await act(async()=>fireEvent.click(view.getByRole('button',{name:'Enviar propuesta'})));
 assert.deepEqual(calls,[{scheduledAt:'2099-01-01T14:30',durationMinutes:'30',location:'Lugar sintético'}]);
});
test('failed proposal preserves the reviewed details and duplicate clicks are single-flight',async()=>{
 let resolve;let calls=0;const waiting=new Promise(r=>{resolve=r;});
 const view=render(React.createElement(VisitPlanner,{onPropose:()=>{calls++;return waiting;},onClose:()=>{}}));
 await fill(view);fireEvent.click(view.getByRole('button',{name:'Enviar propuesta'}));
 assert.equal(view.getByRole('button',{name:'Enviando…'}).disabled,true);assert.equal(calls,1);
 await act(async()=>resolve(false));assert.match(view.container.textContent,/Lugar sintético/);
 assert.ok(view.getByRole('button',{name:'Enviar propuesta'}));
});
