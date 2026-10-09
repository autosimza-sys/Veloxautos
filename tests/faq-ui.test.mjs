import assert from 'node:assert/strict';
import {afterEach,test} from 'node:test';
import React from 'react';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost'});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.React=React;
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {render,fireEvent,act,cleanup}=await import('@testing-library/react');
const {default:FaqBrowser}=await import('../features/faq/FaqBrowser.jsx');
const {default:SellerFaqPanel}=await import('../features/faq/SellerFaqPanel.jsx');
afterEach(cleanup);
test('FAQ searches aliases without accents, filters categories and selects without sending',()=>{
 const chosen=[];const view=render(React.createElement(FaqBrowser,{onChoose:q=>chosen.push(q)}));
 fireEvent.change(view.getByLabelText('Buscar una pregunta'),{target:{value:'distribucion'}});
 assert.match(view.container.textContent,/distribución/);assert.equal(chosen.length,0);
 fireEvent.click(view.getByRole('button',{name:'Usar esta pregunta'}));assert.equal(chosen.length,1);
 fireEvent.change(view.getByLabelText('Categoría de preguntas'),{target:{value:'c24'}});
 assert.match(view.container.textContent,/No encontramos/);
});
test('help never prints unresolved templates or company-specific loan promises',()=>{
 const view=render(React.createElement(FaqBrowser));
 assert.doesNotMatch(view.container.textContent,/\{listing|200\.000|1,5%|crédito aprobado/i);
 fireEvent.change(view.getByLabelText('Buscar una pregunta'),{target:{value:'promoción gratuita'}});
 assert.match(view.container.textContent,/90 días.*común/);
});
test('seller explicitly approves scope before saving, errors retain the draft',async()=>{
 const calls=[];const client={rpc:async(name,args)=>{calls.push({name,args});return name==='get_listing_faq_tasks'?{data:[{question_id:'c03.timing',question:'Distribución',revision:0,state:'pending',answer:null}]}:{error:{message:'failed'}};}};
 const view=render(React.createElement(SellerFaqPanel,{vehicleId:'car',client}));
 await act(async()=>fireEvent.click(view.getByRole('button',{name:'Preguntas pendientes del auto'})));
 fireEvent.change(view.getByLabelText('Respuesta declarada'),{target:{value:'Cambio a los 90000 km'}});
 assert.equal(view.getByRole('button',{name:'Guardar respuesta para esta unidad'}).disabled,true);
 fireEvent.click(view.getByLabelText(/Confirmo que es información/));
 await act(async()=>fireEvent.click(view.getByRole('button',{name:'Guardar respuesta para esta unidad'})));
 assert.match(view.container.textContent,/No se confirmó/);assert.equal(view.getByLabelText('Respuesta declarada').value,'Cambio a los 90000 km');
 assert.equal(calls[1].args.target_vehicle,'car');assert.equal(calls[1].args.expected_revision,0);
});
