import assert from 'node:assert/strict';
import {test,afterEach} from 'node:test';
import React from 'react';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost'});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.React=React;
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
const {render,fireEvent,act,cleanup,waitFor}=await import('@testing-library/react');
const {default:Demo}=await import('../features/demo/DemoExperience.jsx');
afterEach(()=>{cleanup();window.sessionStorage.clear();});
async function click(v,name){await act(async()=>fireEvent.click(v.getByRole('button',{name,exact:true})));}
async function start(){const v=render(React.createElement(Demo));await click(v,'Empezar demostración');return v;}

test('demo shows boundaries, answers facts, requires consent and presents the seller notice',async()=>{
 const v=await start();assert.match(v.container.textContent,/IA generativa está apagada/);
 assert.equal(v.getByRole('button',{name:/02/}).disabled,true);
 await click(v,'Usar publicación de ejemplo');await click(v,'Continuar como comprador →');
 await click(v,'¿Cuántos kilómetros tiene?');assert.match(v.container.textContent,/declara 78.000 km/);
 fireEvent.change(v.getByLabelText('Tu pregunta sobre el vehículo'),{target:{value:'¿Tiene oblea de GNC?'}});
 await click(v,'Preguntar');assert.match(v.container.textContent,/No tengo ese dato/);
 await click(v,'Ver horarios autorizados');
 await act(async()=>fireEvent.click(v.getAllByRole('button',{name:/Elegir horario:/})[0]));
 assert.equal(v.getByRole('button',{name:'Confirmar esta visita'}).disabled,true);
 fireEvent.click(v.getByRole('checkbox'));await click(v,'Confirmar esta visita');
 await waitFor(()=>assert.match(v.container.textContent,/Visita confirmada/));
 await click(v,'Ver qué recibe el vendedor →');await waitFor(()=>v.getByText('Comprador: Comprador de ejemplo'));
 assert.match(v.container.textContent,/30 minutos/);assert.match(v.container.textContent,/Punto de encuentro de ejemplo/);
 await click(v,'Marcar como leído');assert.equal(v.queryByRole('button',{name:'Marcar como leído'}),null);
 await click(v,'Reiniciar demostración');assert.equal(v.getByRole('button',{name:/02/}).disabled,true);assert.doesNotMatch(v.container.textContent,/Comprador: Comprador/);
});
test('seller may inspect or revoke the sample permission, leaving no bookable slots',async()=>{
 const v=await start();await click(v,'Usar publicación de ejemplo');
 await click(v,'Horarios del asistente');await waitFor(()=>v.getByRole('button',{name:'Revocar autorización'}));
 await click(v,'Revocar autorización');await waitFor(()=>v.getByText('Revocada'));
 await click(v,'Continuar como comprador →');await click(v,'Ver horarios autorizados');
 assert.match(v.container.textContent,/No hay horarios libres autorizados/);
 await click(v,'Ver qué recibe el vendedor →');await waitFor(()=>v.getByText('Todavía no tenés avisos de visitas.'));
 await click(v,'Volver al comprador');assert.ok(v.getByText('Preguntá. Elegí un horario. Aceptá.'));
});
test('all seller profiles can open the real publication form without a live account',async()=>{
 const v=await start();for(const role of ['particular','reseller','agency']){
  fireEvent.change(v.getByLabelText('Tipo de vendedor'),{target:{value:role}});
  await click(v,'Probar formulario de publicación');assert.ok(v.getByLabelText('Marca'));
  assert.equal(v.queryByText('Crear cuenta o ingresar'),null);
  await click(v,'Probar formulario de publicación');
 }
});
