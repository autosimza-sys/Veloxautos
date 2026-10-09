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
const { default: OwnerListings } = await import('../features/vehicles/OwnerListings.jsx');
const { useOwnerListings, fetchOwnerListings, updateOwnerListing } = await import('../features/vehicles/use-owner-listings.js');
afterEach(cleanup);
const flush = () => act(() => new Promise(resolve => setTimeout(resolve, 0)));
const session = { user: { id: 'owner' }, access_token: 'owner-token' };
const profile = { id: 'owner', role: 'particular', is_blocked: false };
const row = { id: 'car', owner_id: 'owner', status: 'active', brand: 'Toyota', model: 'Corolla', version: 'XEI', year: 2020, kilometers: 12345, price: 20000000, zone: 'Mendoza', description: 'Original', accepts_trade: false, accepts_financing: false };
function mockClient(initial = [row]) {
  let rows = initial.map(item => ({ ...item }));
  const calls = [];
  const client = {
    from(table) {
      calls.push(['from', table]);
      return { select(columns) {
        calls.push(['select', columns]);
        return { eq(field, value) {
          calls.push(['eq', field, value]);
          return { order: async () => ({ data: rows.filter(item => item[field] === value), error: null }) };
        } };
      } };
    },
    rpc: async (name, args) => {
      calls.push(['rpc', name, args]);
      const current = rows.find(item => item.id === args.target_vehicle);
      const updated = { ...current, ...(args.payload || { status: args.next_status }) };
      rows = rows.map(item => item.id === updated.id ? updated : item);
      return { data: updated, error: null };
    },
  };
  return { client, calls };
}
const props = client => ({ session, profile, client });

test('owner fetch explicitly filters owner and never calls public catalog', async () => {
  const { client, calls } = mockClient([row, { ...row, id: 'foreign', owner_id: 'someone' }]);
  const rows = await fetchOwnerListings({ userId: 'owner', client });
  assert.equal(rows.length, 1);
  assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'owner_id' && call[2] === 'owner'));
  assert.equal(calls.some(call => call[0] === 'rpc'), false);
});

test('missing connection and missing owner fail closed', async () => {
  await assert.rejects(fetchOwnerListings({ userId: 'owner', client: null }), /conexión/i);
  await assert.rejects(fetchOwnerListings({ client: mockClient().client }), /sesión/i);
});

test('signed-out, blocked, non-seller and mismatched profiles never query listings', async () => {
  const { client, calls } = mockClient();
  for (const override of [{ session: null }, { profile: { ...profile, is_blocked: true } }, { profile: { ...profile, role: 'registered' } }, { profile: { ...profile, id: 'foreign' } }]) {
    const view = render(React.createElement(OwnerListings, { ...props(client), ...override }));
    await flush();
    assert.equal(view.queryByText(/Corolla/), null);
    view.unmount();
  }
  assert.deepEqual(calls, []);
});

test('empty owner list is honest and a failed load has a working retry', async () => {
  const { client } = mockClient([]);
  const view = render(React.createElement(OwnerListings, props(client)));
  await flush();
  assert.ok(view.getByText('Todavía no tenés publicaciones propias.'));
  view.unmount();
  let attempts = 0;
  const flaky = { from: () => ({ select: () => ({ eq: () => ({ order: async () => ++attempts === 1 ? { error: new Error('offline') } : { data: [row] } }) }) }) };
  const failed = render(React.createElement(OwnerListings, props(flaky)));
  await flush();
  assert.ok(failed.getByRole('alert'));
  fireEvent.click(failed.getByRole('button', { name: 'Reintentar' }));
  await flush();
  assert.ok(failed.getByText('Toyota Corolla XEI'));
});

test('editing sends only whitelisted fields and notifies the catalog after confirmed success', async () => {
  const { client, calls } = mockClient();
  let changes = 0;
  const view = render(React.createElement(OwnerListings, { ...props(client), onChanged: () => { changes++; } }));
  await flush();
  fireEvent.click(view.getByRole('button', { name: 'Editar datos' }));
  fireEvent.change(view.getByLabelText('Precio (ARS)'), { target: { value: '22000000' } });
  fireEvent.change(view.getByLabelText('Kilómetros'), { target: { value: '0' } });
  fireEvent.click(view.getByRole('button', { name: 'Guardar cambios' }));
  await flush();
  const request = calls.find(call => call[0] === 'rpc');
  assert.equal(request[1], 'update_vehicle_listing');
  assert.equal(request[2].target_vehicle, 'car');
  assert.equal(request[2].payload.price, 22000000);
  assert.equal(request[2].payload.kilometers, 0);
  assert.equal(request[2].payload.owner_id, undefined);
  assert.equal(changes, 1);
  assert.match(view.getByRole('status').textContent, /guardados/i);
  assert.equal(view.queryByRole('button', { name: 'Guardar cambios' }), null);
});

test('invalid data is rejected before RPC; errors preserve editable input', async () => {
  const { client, calls } = mockClient();
  const view = render(React.createElement(OwnerListings, props(client)));
  await flush();
  fireEvent.click(view.getByRole('button', { name: 'Editar datos' }));
  fireEvent.change(view.getByLabelText('Precio (ARS)'), { target: { value: '-1' } });
  fireEvent.submit(view.getByRole('form', { name: 'Editar Toyota Corolla' }));
  await flush();
  assert.equal(calls.some(call => call[0] === 'rpc'), false);
  assert.ok(view.getByRole('alert'));
  assert.equal(view.getByLabelText('Precio (ARS)').value, '-1');
});

test('cancel and reopen discard unsaved edits without remote writes', async () => {
  const { client, calls } = mockClient();
  const view = render(React.createElement(OwnerListings, props(client)));
  await flush();
  fireEvent.click(view.getByRole('button', { name: 'Editar datos' }));
  fireEvent.change(view.getByLabelText('Marca'), { target: { value: 'Unsaved' } });
  fireEvent.click(view.getByRole('button', { name: 'Cancelar edición' }));
  fireEvent.click(view.getByRole('button', { name: 'Editar datos' }));
  assert.equal(view.getByLabelText('Marca').value, 'Toyota');
  assert.equal(calls.some(call => call[0] === 'rpc'), false);
});

test('withdrawal asks inline confirmation; cancel is safe; reactivation is recoverable', async () => {
  const { client, calls } = mockClient();
  const view = render(React.createElement(OwnerListings, props(client)));
  await flush();
  fireEvent.click(view.getByRole('button', { name: 'Retirar publicación' }));
  assert.ok(view.getByText(/se conservan/i));
  fireEvent.click(view.getByRole('button', { name: 'Cancelar retiro' }));
  assert.equal(calls.some(call => call[0] === 'rpc'), false);
  fireEvent.click(view.getByRole('button', { name: 'Retirar publicación' }));
  fireEvent.click(view.getByRole('button', { name: 'Confirmar retiro' }));
  await flush();
  assert.ok(view.getByText('Retirada'));
  fireEvent.click(view.getByRole('button', { name: 'Reactivar publicación' }));
  await flush();
  assert.ok(view.getByText('Activa'));
  assert.deepEqual(calls.filter(call => call[0] === 'rpc').map(call => call[2].next_status), ['deleted', 'active']);
});

test('draft cannot be published via a free status action and media editing has no fake button', async () => {
  const { client } = mockClient([{ ...row, status: 'draft' }]);
  const view = render(React.createElement(OwnerListings, props(client)));
  await flush();
  assert.ok(view.getByText('Borrador'));
  assert.equal(view.queryByRole('button', { name: /Reactivar|Pausar|Retirar|foto|video/i }), null);
  assert.ok(view.getByText(/edición de fotos y videos no está disponible/i));
});

test('double mutation is deduplicated until its response, then a paused row may reactivate', async () => {
  const { client, calls } = mockClient();
  const realRpc = client.rpc;
  let resolve;
  client.rpc = (name, args) => new Promise(done => { resolve = () => realRpc(name, args).then(done); });
  const { result } = renderHook(() => useOwnerListings(props(client)));
  await flush();
  let first, second;
  act(() => { first = result.current.changeStatus('car', 'paused'); second = result.current.changeStatus('car', 'paused'); });
  assert.equal(result.current.busyId, 'car');
  assert.equal(await second, false);
  await act(async () => { resolve(); await first; });
  assert.equal(calls.filter(call => call[0] === 'rpc').length, 1);
  assert.equal(result.current.listings[0].status, 'paused');
});

test('logout and account switch discard private rows, drafts and late mutation callbacks', async () => {
  const { client } = mockClient();
  let resolve;
  client.rpc = () => new Promise(done => { resolve = done; });
  let changes = 0;
  const { result, rerender } = renderHook(current => useOwnerListings({ ...current, client, onChanged: () => { changes++; } }), { initialProps: { session, profile } });
  await flush();
  let pending;
  act(() => { pending = result.current.changeStatus('car', 'paused'); });
  rerender({ session: null, profile: null });
  assert.deepEqual(result.current.listings, []);
  await act(async () => { resolve({ data: { ...row, status: 'paused' } }); await pending; });
  assert.equal(changes, 0);
  assert.deepEqual(result.current.listings, []);
  rerender({ session: { user: { id: 'someone' }, access_token: 'other' }, profile: { ...profile, id: 'someone' } });
  await flush();
  assert.deepEqual(result.current.listings, []);
});

test('late owner load is ignored after logout', async () => {
  let resolve;
  const client = { from: () => ({ select: () => ({ eq: () => ({ order: () => new Promise(done => { resolve = done; }) }) }) }) };
  const { result, rerender } = renderHook(current => useOwnerListings({ ...current, client }), { initialProps: { session, profile } });
  rerender({ session: null, profile: null });
  await act(async () => resolve({ data: [row] }));
  assert.deepEqual(result.current.listings, []);
});

test('failed mutation retains original row, enables retry and never calls onChanged', async () => {
  const { client } = mockClient();
  client.rpc = async () => ({ error: { message: 'offline' } });
  let changed = 0;
  const { result } = renderHook(() => useOwnerListings({ ...props(client), onChanged: () => changed++ }));
  await flush();
  let success;
  await act(async () => { success = await result.current.changeStatus('car', 'paused'); });
  assert.equal(success, false);
  assert.equal(result.current.busyId, null);
  assert.equal(result.current.listings[0].status, 'active');
  assert.match(result.current.actionError, /confirmar/i);
  assert.equal(changed, 0);
});

test('onChanged failure cannot turn a committed change into a failed save', async () => {
  const { client } = mockClient();
  const { result } = renderHook(() => useOwnerListings({ ...props(client), onChanged: async () => { throw new Error('catalog offline'); } }));
  await flush();
  let success;
  await act(async () => { success = await result.current.changeStatus('car', 'paused'); });
  assert.equal(success, true);
  assert.equal(result.current.listings[0].status, 'paused');
  assert.match(result.current.actionMessage, /guardad|pausad/i);
});

test('API edit validates publication basics and serializes a narrow payload', async () => {
  const { client, calls } = mockClient();
  const form = { ...row, kilometers: '0', partialPlate: '', acceptsTrade: false, acceptsFinancing: true, viewLocation: '', availableHours: '' };
  await assert.rejects(updateOwnerListing({ id: 'car', form: { ...form, year: '2020.5' }, client }), /Revisá/);
  await updateOwnerListing({ id: 'car', form, client });
  const payload = calls.find(call => call[0] === 'rpc')[2].payload;
  assert.equal(payload.accepts_financing, true);
  assert.equal(payload.kilometers, 0);
  assert.equal(payload.status, undefined);
  assert.equal(payload.id, undefined);
});

test('switching accounts unmounts an open private editor and never restores its draft', async () => {
  const { client } = mockClient([row, { ...row, id: 'other-car', owner_id: 'other-owner', model: 'Yaris' }]);
  const view = render(React.createElement(OwnerListings, props(client)));
  await flush();
  fireEvent.click(view.getByRole('button', { name: 'Editar datos' }));
  fireEvent.change(view.getByLabelText('Descripción'), { target: { value: 'Private unsaved draft' } });
  view.rerender(React.createElement(OwnerListings, { client, session: { user: { id: 'other-owner' }, access_token: 'other-token' }, profile: { ...profile, id: 'other-owner' } }));
  assert.equal(view.queryByRole('form'), null);
  assert.equal(view.queryByText('Toyota Corolla XEI'), null);
  await flush();
  assert.ok(view.getByText('Toyota Yaris XEI'));
  view.rerender(React.createElement(OwnerListings, props(client)));
  await flush();
  assert.equal(view.queryByRole('form'), null);
  fireEvent.click(view.getByRole('button', { name: 'Editar datos' }));
  assert.equal(view.getByLabelText('Descripción').value, 'Original');
});

test('pause is confirmed before the UI changes status and blocks repeated clicks', async () => {
  const { client } = mockClient();
  let resolve;
  let requests = 0;
  client.rpc = () => { requests++; return new Promise(done => { resolve = done; }); };
  const view = render(React.createElement(OwnerListings, props(client)));
  await flush();
  fireEvent.click(view.getByRole('button', { name: 'Pausar publicación' }));
  fireEvent.click(view.getByRole('button', { name: 'Pausar publicación' }));
  assert.equal(requests, 1);
  assert.ok(view.getByText('Activa'));
  assert.equal(view.getByRole('button', { name: 'Editar datos' }).disabled, true);
  await act(async () => resolve({ data: { ...row, status: 'paused' } }));
  assert.ok(view.getByText('Pausada'));
  assert.equal(view.getByRole('button', { name: 'Reactivar publicación' }).disabled, false);
});

test('unexpected foreign mutation response cannot be cached or announced as success', async () => {
  const { client } = mockClient();
  client.rpc = async () => ({ data: { ...row, owner_id: 'foreign', status: 'paused' } });
  let changed = 0;
  const { result } = renderHook(() => useOwnerListings({ ...props(client), onChanged: () => changed++ }));
  await flush();
  let success;
  await act(async () => { success = await result.current.changeStatus('car', 'paused'); });
  assert.equal(success, false);
  assert.equal(result.current.listings[0].owner_id, 'owner');
  assert.equal(result.current.listings[0].status, 'active');
  assert.equal(changed, 0);
});
