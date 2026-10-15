import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import React from 'react';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { render, renderHook, fireEvent, act, cleanup } = await import('@testing-library/react');
const { useVehicleCatalog } = await import('../features/vehicles/use-vehicle-catalog.js');
const { mapVehicleFromDb, fetchVehicleCatalog } = await import('../features/vehicles/vehicle-api.js');
const { default: CatalogSection } = await import('../features/vehicles/CatalogSection.jsx');
afterEach(cleanup);
const flush = () => act(() => new Promise(resolve => setTimeout(resolve, 0)));

test('missing Supabase reports a controlled error', async () => {
  await assert.rejects(fetchVehicleCatalog(), /conexión/);
});
test('empty and failed catalogs never return demo stock', async () => {
  for (const loadCatalog of [async () => [], async () => { throw new Error('offline'); }]) {
    const { result, unmount } = renderHook(() => useVehicleCatalog({ loadCatalog }));
    await flush();
    assert.deepEqual(result.current.catalogVehicles, []);
    assert.equal(result.current.selectedVehicle, null);
    assert.equal(result.current.isLoading, false);
    unmount();
  }
});
test('logout clears price-bearing cache immediately and stale authenticated response is ignored', async () => {
  const resolvers = [];
  const loadCatalog = () => new Promise(resolve => resolvers.push(resolve));
  const { result, rerender } = renderHook(({ session }) => useVehicleCatalog({ session, loadCatalog }), {
    initialProps: { session: { access_token: 'signed-in' } },
  });
  await act(async () => resolvers.shift()([{ id: 'one', price: 50, km: 600 }]));
  assert.equal(result.current.selectedVehicle.price, 50);
  act(() => result.current.refresh());
  rerender({ session: null });
  assert.deepEqual(result.current.catalogVehicles, []);
  const stale = resolvers.shift();
  const guest = resolvers.shift();
  await act(async () => stale([{ id: 'private', price: 100 }]));
  assert.deepEqual(result.current.catalogVehicles, []);
  await act(async () => guest([{ id: 'one', price: null, km: null }]));
  assert.equal(result.current.selectedVehicle.price, null);
});
test('missing photos use honest placeholder and unknown fields stay unknown', () => {
  const mapped = mapVehicleFromDb({ id: 'one', brand: 'Test', model: 'Auto' });
  assert.equal(mapped.image, '/vehicle-placeholder.svg');
  assert.equal(mapped.acceptsTrade, undefined);
  assert.equal(mapped.acceptsFinancing, undefined);
  assert.equal(mapped.status, undefined);
});
test('catalog distinguishes empty results from outage and offers retry', () => {
  let retries = 0;
  const props = { vehicles: [], onRetry: () => retries++, onSelect() {}, canSeePrice: false };
  const view = render(React.createElement(CatalogSection, props));
  assert.ok(view.getByText('Todavía no hay vehículos publicados.'));
  view.rerender(React.createElement(CatalogSection, { ...props, catalogStatus: 'No pudimos cargar el catálogo.' }));
  assert.ok(view.getByText('No pudimos cargar el catálogo.'));
  fireEvent.click(view.getByText('Reintentar'));
  assert.equal(retries, 1);
});
test('catalog signs all 80 photos in one storage request and preserves order', async () => {
  let calls = 0;
  const rows = Array.from({length:20},(_,i)=>({id:String(i),media:Array.from({length:4},(_,j)=>({media_type:'photo',sort_order:j,storage_path:`owner/${i}/${j}.jpg`}))}));
  const client = { rpc: async()=>({data:{items:rows}}),storage:{from:()=>({createSignedUrls:async paths=>{calls++;return{data:paths.map(path=>({path,signedUrl:`https://example.invalid/${path}`}))};}})} };
  const catalog = await fetchVehicleCatalog(client);
  assert.equal(calls,1);
  assert.equal(catalog.length,20);
  assert.equal(catalog[19].image,'https://example.invalid/owner/19/0.jpg');
  assert.equal(catalog[19].status,'active');
});
test('same publication retry keeps request ID, committed publication stays successful if credit refresh fails', async () => {
  const calls=[];
  const createPublication=async args=>{calls.push(args);if(calls.length===1)throw new Error('timeout');return{id:'created'};};
  const loadCatalog=async()=>[];
  const onPublished=async()=>{throw new Error('credits offline');};
  const {result}=renderHook(()=>useVehicleCatalog({createPublication,loadCatalog,onPublished,session:{user:{id:'owner'},access_token:'token'},profile:{id:'owner'}}));
  await flush();
  const request={form:{brand:'Test'},photoFiles:[{kind:'front',file:new File(['front'],'front.jpg',{type:'image/jpeg'})}]};
  let first,second;
  await act(async()=>{first=await result.current.publishVehicle(request);});
  await act(async()=>{second=await result.current.publishVehicle(request);});
  assert.equal(first,false);assert.equal(second,true);
  assert.equal(calls[0].requestId,calls[1].requestId);
  assert.match(result.current.publishStatus,/activa/);
});
test('server pagination resets cursor on filters and discards stale page responses',async()=>{
 const calls=[];const loadCatalog=query=>new Promise(resolve=>calls.push({query,resolve}));
 const {result}=renderHook(()=>useVehicleCatalog({loadCatalog}));
 await act(async()=>calls[0].resolve({vehicles:[{id:'first'}],nextCursor:{id:'cursor',created_at:'synthetic'}}));
 act(()=>result.current.nextPage());assert.deepEqual(calls[1].query.cursor,{id:'cursor',created_at:'synthetic'});
 act(()=>result.current.setFilters({brand:'Other'}));assert.equal(calls[2].query.cursor,null);assert.deepEqual(calls[2].query.filters,{brand:'Other'});
 await act(async()=>calls[1].resolve({vehicles:[{id:'stale'}]}));assert.equal(result.current.catalogVehicles.length,0);
 await act(async()=>calls[2].resolve({vehicles:[{id:'filtered'}],nextCursor:null}));assert.equal(result.current.catalogVehicles[0].id,'filtered');assert.equal(result.current.hasPreviousPage,false);
});
test('page fetch requests bounded server retrieval and signs only its current media',async()=>{
 const calls=[];const signed=[];const cursor={id:'last',created_at:'2026-01-01'};
 const client={rpc:async(name,payload)=>{calls.push({name,payload});return{data:{items:[{id:'page-two',media:[{storage_path:'owner/only.jpg',media_type:'photo',sort_order:0}]}],next_cursor:null}};},storage:{from:()=>({createSignedUrls:async paths=>{signed.push(...paths);return{data:[]};}})}};
 const {fetchVehicleCatalogPage}=await import('../features/vehicles/vehicle-api.js');
 await fetchVehicleCatalogPage({cursor,filters:{brand:'Test'}},client);
 assert.deepEqual(calls,[{name:'get_vehicle_catalog_page',payload:{page_size:24,after_cursor:cursor,filters:{brand:'Test'}}}]);assert.deepEqual(signed,['owner/only.jpg']);
});
test('empty server-filtered page never claims that no stock has been published',()=>{
 const view=render(React.createElement(CatalogSection,{vehicles:[],onSelect(){},onFiltersChange(){},canSeePrice:false}));
 fireEvent.change(view.getByRole('textbox',{name:'Buscar vehículos'}),{target:{value:'No match'}});
 assert.equal(view.queryByText('Todavía no hay vehículos publicados.'),null);
 assert.ok(view.getByText('No encontramos vehículos con esos filtros.'));
});
