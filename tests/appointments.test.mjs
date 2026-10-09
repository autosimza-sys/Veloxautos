import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import React from 'react';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { renderHook, render, act, cleanup, fireEvent, within, waitFor } = await import('@testing-library/react');
const { useAppointments } = await import('../features/agenda/use-appointments.js');
const { default: AgendaPanel } = await import('../features/agenda/AgendaPanel.jsx');
afterEach(() => { cleanup(); window.sessionStorage.clear(); });
const flush = () => act(() => new Promise(resolve => setTimeout(resolve, 0)));
const conversation = { id: 'conversation-a', buyer_id: 'buyer', seller_id: 'seller', is_blocked: false };
const visit = (overrides = {}) => ({
  id: 'visit-a', conversation_id: conversation.id, proposed_by: 'buyer',
  scheduled_at: '2099-10-03T15:30:00.000Z', location: 'Lugar de encuentro', status: 'proposed',
  duration_minutes: 60, buyer_confirmed_at: null, seller_confirmed_at: null, ...overrides,
});
function proposalRow(payload, overrides = {}) {
  return visit({ conversation_id: payload.target_conversation,
    scheduled_at: payload.appointment_scheduled_at, duration_minutes: payload.appointment_duration_minutes,
    location: payload.appointment_location, proposal_request_id: payload.proposal_request_id, ...overrides });
}
function deferred() { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function fakeClient(initial = [], options = {}) {
  const rows = [...initial];
  const calls = { reads: [], inserts: [], proposals: [], rpcs: [], removed: [] };
  const listeners = [];
  const client = {
    calls, rows,
    from(table) {
      assert.equal(table, 'appointments');
      return {
        select() { return { eq(field, id) { assert.equal(field, 'conversation_id'); return {
          order() { calls.reads.push(id); return options.read ? options.read(id) : Promise.resolve({ data: rows.filter(row => row.conversation_id === id).map(row => ({ ...row })), error: null }); },
        }; } }; },
        async insert(payload) {
          calls.inserts.push(payload);
          throw new Error('Direct appointment inserts are forbidden; use propose_appointment');
        },
      };
    },
    async rpc(name, payload) {
      calls.rpcs.push({ name, payload });
      if (name === 'propose_appointment') {
        calls.proposals.push(payload);
        if (options.propose) return options.propose(payload);
        const row = proposalRow(payload, { id: `new-${calls.proposals.length}` });
        rows.push(row);
        return { data: row, error: null };
      }
      if (options.rpc) return options.rpc(payload);
      const row = rows.find(row => row.id === payload.target_appointment);
      if (row.status !== payload.expected_status) return { error: { code: '40001', message: 'Appointment state changed' } };
      row.status = payload.next_status;
      if (row.status === 'accepted') row.seller_confirmed_at = '2099-10-01T12:00:00Z';
      if (row.status === 'confirmed') row.buyer_confirmed_at = '2099-10-01T13:00:00Z';
      return { data: { ...row }, error: null };
    },
    channel() { const channel = { on(_event, _filter, callback) { listeners.push(callback); return channel; }, subscribe() { if (options.realtimeFails) throw new Error('No Realtime'); return channel; } }; return channel; },
    removeChannel(channel) { calls.removed.push(channel); return Promise.resolve(); },
    emit() { for (const listener of listeners) listener(); },
  };
  return client;
}
function mountHook(client, overrides = {}) {
  return renderHook(props => useAppointments(props), { initialProps: { conversation, userId: 'buyer', client, ...overrides } });
}

test('historical unverified visits retain their status with no consent claims or action buttons', async () => {
  const client = fakeClient([visit({status:'confirmed',legacy_unverified:true,scheduled_at:'2026-07-14T03:59:00Z',duration_minutes:null})]);
  const view = render(React.createElement(AgendaPanel,{conversation,userId:'buyer',client}));
  await flush();
  const article = within(view.container.querySelector('article.appointment'));
  assert.ok(article.getByText(/Registro anterior: Confirmada \(sin verificar\)/));
  assert.ok(article.getByText(/sólo de consulta/));
  assert.ok(article.getByText('Duración no registrada'));
  assert.equal(article.queryAllByRole('button').length,0);
  assert.equal(article.queryByText(/Comprador:|Vendedor:/),null);
  assert.equal(client.calls.rpcs.length,0);
});

test('loads scoped visits with an injected client and supports explicit refresh without Realtime', async () => {
  const client = fakeClient([visit()]);
  const { result } = mountHook(client);
  await flush();
  assert.equal(result.current.appointments.length, 1);
  client.rows.push(visit({ id: 'visit-b' }));
  await act(() => result.current.refresh());
  assert.equal(result.current.appointments.length, 2);
  assert.equal(client.calls.reads.length, 2);
});

test('rejects missing, invalid, normalized, past dates and blank locations without network mutations', async () => {
  const client = fakeClient();
  const { result } = mountHook(client);
  await flush();
  for (const scheduledAt of ['', 'invalid', '2099-02-30T12:00', '2099-13-01T12:00', '2020-01-01T12:00']) {
    await act(async () => assert.equal(await result.current.propose({ durationMinutes: 60, scheduledAt, location: 'Lugar' }), false));
    assert.match(result.current.status, /fecha|hora/i);
  }
  await act(async () => assert.equal(await result.current.propose({ durationMinutes: 60, scheduledAt: '2099-10-03T12:00', location: '   ' }), false));
  assert.match(result.current.status, /lugar/i);
  assert.equal(client.calls.proposals.length, 0);
});

test('proposes a trimmed interval through the idempotent RPC in browser local time and refreshes', async () => {
  const client = fakeClient();
  const { result } = mountHook(client);
  await flush();
  await act(async () => assert.equal(await result.current.propose({ durationMinutes: 60, scheduledAt: '2099-10-03T12:00', location: '  Lugar  ' }), true));
  assert.deepEqual(client.calls.proposals[0], {
    target_conversation: conversation.id, appointment_duration_minutes: 60,
    appointment_scheduled_at: new Date('2099-10-03T12:00').toISOString(), appointment_location: 'Lugar',
    proposal_request_id: client.calls.proposals[0].proposal_request_id,
  });
  assert.equal(client.calls.rpcs[0].name, 'propose_appointment');
  assert.match(client.calls.proposals[0].proposal_request_id, /^[0-9a-f-]{36}$/i);
  assert.equal(client.calls.inserts.length, 0);
  assert.equal(result.current.appointments.length, 1);
  assert.equal(client.calls.reads.length, 2);
  assert.equal(result.current.busy, false);
});

test('synchronous repeated proposals use a ref guard and make one write', async () => {
  const pending = deferred();
  const client = fakeClient([], { propose: () => pending.promise });
  const { result } = mountHook(client);
  await flush();
  let first; let repeated;
  act(() => {
    first = result.current.propose({ durationMinutes: 60, scheduledAt: '2099-10-03T12:00', location: 'Lugar' });
    repeated = result.current.propose({ durationMinutes: 60, scheduledAt: '2099-10-03T12:00', location: 'Lugar' });
  });
  assert.equal(result.current.busy, true);
  await waitFor(() => assert.equal(client.calls.proposals.length, 1));
  await act(async () => { pending.resolve({ data: proposalRow(client.calls.proposals[0]), error: null }); await first; assert.equal(await repeated, false); });
  assert.equal(result.current.busy, false);
});

test('a proposer cannot accept or reject their proposal, but can cancel it', async () => {
  const client = fakeClient([visit()]);
  const { result } = mountHook(client);
  await flush();
  await act(async () => assert.equal(await result.current.changeStatus('visit-a', 'accepted'), false));
  await act(async () => assert.equal(await result.current.changeStatus('visit-a', 'rejected'), false));
  assert.equal(client.calls.rpcs.length, 0);
  await act(async () => assert.equal(await result.current.changeStatus('visit-a', 'cancelled'), true));
  assert.deepEqual(client.calls.rpcs[0], { name: 'transition_appointment', payload: {
    target_appointment: 'visit-a', expected_status: 'proposed', next_status: 'cancelled',
  } });
  assert.equal(result.current.appointments[0].status, 'cancelled');
});

test('counterparty accepts once, proposer confirms later, and either member can cancel confirmed visits', async () => {
  const client = fakeClient([visit()]);
  const hook = mountHook(client, { userId: 'seller' });
  await flush();
  await act(() => hook.result.current.changeStatus('visit-a', 'accepted'));
  assert.equal(hook.result.current.appointments[0].seller_confirmed_at, '2099-10-01T12:00:00Z');
  await act(async () => assert.equal(await hook.result.current.changeStatus('visit-a', 'confirmed'), false));
  assert.equal(client.calls.rpcs.length, 1);
  hook.rerender({ conversation, userId: 'buyer', client });
  await flush();
  await act(async () => assert.equal(await hook.result.current.changeStatus('visit-a', 'confirmed'), true));
  assert.equal(hook.result.current.appointments[0].status, 'confirmed');
  assert.ok(hook.result.current.appointments[0].buyer_confirmed_at);
  await act(() => hook.result.current.changeStatus('visit-a', 'cancelled'));
  assert.equal(hook.result.current.appointments[0].status, 'cancelled');
});

test('disallows unknown rows, invalid transitions, reopening final rows and accepting expired proposals', async () => {
  const client = fakeClient([visit({ scheduled_at: '2020-01-01T12:00:00Z' }), visit({ id: 'final', status: 'rejected' })]);
  const { result } = mountHook(client, { userId: 'seller' });
  await flush();
  for (const [id, status] of [['missing', 'accepted'], ['visit-a', 'accepted'], ['visit-a', 'confirmed'], ['visit-a', 'anything'], ['final', 'proposed']]) {
    await act(async () => assert.equal(await result.current.changeStatus(id, status), false));
  }
  assert.equal(client.calls.rpcs.length, 0);
  await act(async () => assert.equal(await result.current.changeStatus('visit-a', 'cancelled'), true));
});

test('logged-out users and non-members cannot mutate or cancel', async () => {
  for (const overrides of [{ userId: null }, { userId: 'outsider' }]) {
    const client = fakeClient([visit()]);
    const hook = mountHook(client, overrides);
    await flush();
    await act(async () => assert.equal(await hook.result.current.propose({ durationMinutes: 60, scheduledAt: '2099-10-03T12:00', location: 'Lugar' }), false));
    await act(async () => assert.equal(await hook.result.current.changeStatus('visit-a', 'cancelled'), false));
    assert.equal(client.calls.proposals.length + client.calls.rpcs.length, 0);
    assert.equal(hook.result.current.canMutate, false);
    assert.equal(hook.result.current.canCancel, false);
    hook.unmount();
  }
});

test('stale expected status conflicts refresh the agenda and cannot overwrite the server state', async () => {
  const client = fakeClient([visit()]);
  const { result } = mountHook(client, { userId: 'seller' });
  await flush();
  client.rows[0].status = 'cancelled';
  await act(async () => assert.equal(await result.current.changeStatus('visit-a', 'accepted'), false));
  assert.equal(client.calls.rpcs[0].payload.expected_status, 'proposed');
  assert.equal(result.current.appointments[0].status, 'cancelled');
  assert.match(result.current.status, /cambi|actualiz/i);
  assert.equal(result.current.busy, false);
});

test('duplicate transition clicks use one RPC even before the busy render', async () => {
  const pending = deferred();
  const client = fakeClient([visit()], { rpc: () => pending.promise });
  const { result } = mountHook(client, { userId: 'seller' });
  await flush();
  let first; let second;
  act(() => { first = result.current.changeStatus('visit-a', 'accepted'); second = result.current.changeStatus('visit-a', 'rejected'); });
  assert.equal(client.calls.rpcs.length, 1);
  await act(async () => { pending.resolve({ data: visit({ status: 'accepted' }), error: null }); await first; assert.equal(await second, false); });
  assert.equal(result.current.busy, false);
});

test('network and server failures are visible, release busy and allow a manual retry', async () => {
  let failing = true;
  const client = fakeClient([], { propose: async payload => { if (failing) throw new Error('offline'); return { data: proposalRow(payload), error: null }; } });
  const { result } = mountHook(client);
  await flush();
  await act(async () => assert.equal(await result.current.propose({ durationMinutes: 60, scheduledAt: '2099-10-03T12:00', location: 'Lugar' }), false));
  assert.match(result.current.status, /conexión|intenta|intentá/i);
  assert.equal(result.current.busy, false);
  failing = false;
  await act(async () => assert.equal(await result.current.propose({ durationMinutes: 60, scheduledAt: '2099-10-03T12:00', location: 'Lugar' }), true));
  assert.equal(client.calls.proposals.length, 2);
});

test('saved proposal with a failed refresh is not reported as an unsaved proposal', async () => {
  let readCount = 0;
  const client = fakeClient([], { read: async () => ++readCount === 1 ? { data: [], error: null } : { error: { message: 'offline' } } });
  const { result } = mountHook(client);
  await flush();
  await act(async () => assert.equal(await result.current.propose({ durationMinutes: 60, scheduledAt: '2099-10-03T12:00', location: 'Lugar' }), true));
  assert.match(result.current.status, /propuest|guard/i);
  assert.match(result.current.status, /actualiz/i);
  assert.equal(result.current.busy, false);
});

test('late loads cannot restore a previous conversation or a logged-out user', async () => {
  const pending = deferred();
  const nextConversation = { ...conversation, id: 'conversation-b' };
  const client = fakeClient([], { read: id => id === conversation.id ? pending.promise : Promise.resolve({ data: [visit({ id: 'visit-b', conversation_id: id })], error: null }) });
  const hook = mountHook(client);
  await flush();
  hook.rerender({ conversation: nextConversation, userId: 'buyer', client });
  assert.equal(hook.result.current.appointments.length, 0);
  await flush();
  await act(async () => pending.resolve({ data: [visit()], error: null }));
  assert.deepEqual(hook.result.current.appointments.map(row => row.id), ['visit-b']);
  hook.rerender({ conversation: nextConversation, userId: null, client });
  assert.equal(hook.result.current.appointments.length, 0);
  await flush();
  assert.equal(hook.result.current.appointments.length, 0);
  assert.equal(client.calls.removed.length, 2);
});

test('latest refresh wins when an older read resolves last', async () => {
  const oldRead = deferred();
  let reads = 0;
  const client = fakeClient([], { read: () => ++reads === 1 ? oldRead.promise : Promise.resolve({ data: [visit({ status: 'cancelled' })], error: null }) });
  const { result } = mountHook(client);
  await flush();
  await act(() => result.current.refresh());
  await act(async () => oldRead.resolve({ data: [visit()], error: null }));
  assert.equal(result.current.appointments[0].status, 'cancelled');
});

test('late mutation cannot set success or refresh the next conversation', async () => {
  const pending = deferred();
  const client = fakeClient([], { propose: () => pending.promise });
  const hook = mountHook(client);
  await flush();
  let mutation;
  act(() => { mutation = hook.result.current.propose({ durationMinutes: 60, scheduledAt: '2099-10-03T12:00', location: 'Old location' }); });
  await waitFor(() => assert.equal(client.calls.proposals.length, 1));
  const nextConversation = { ...conversation, id: 'conversation-b' };
  hook.rerender({ conversation: nextConversation, userId: 'buyer', client });
  await flush();
  const readsBefore = client.calls.reads.length;
  await act(async () => { pending.resolve({ error: null }); assert.equal(await mutation, false); });
  assert.equal(client.calls.reads.length, readsBefore);
  assert.equal(hook.result.current.status, '');
  assert.equal(hook.result.current.busy, false);
});

test('a failing Realtime subscription does not prevent reads or manual refresh', async () => {
  const client = fakeClient([visit()], { realtimeFails: true });
  const { result } = mountHook(client);
  await flush();
  assert.equal(result.current.appointments.length, 1);
  await act(() => result.current.refresh());
  assert.equal(client.calls.reads.length, 2);
});

test('missing client is handled without throwing and explains unavailable configuration', async () => {
  const { result } = mountHook(null);
  await flush();
  await act(async () => assert.equal(await result.current.propose({ durationMinutes: 60, scheduledAt: '2099-10-03T12:00', location: 'Lugar' }), false));
  assert.match(result.current.status, /conexión|configur/i);
  assert.equal(result.current.canMutate, false);
});

test('panel explains browser timezone and renders only participant-appropriate actions', async () => {
  const client = fakeClient([visit()]);
  const view = render(React.createElement(AgendaPanel, { conversation, userId: 'buyer', client }));
  await flush();
  assert.equal(view.queryByRole('button', { name: 'Aceptar' }), null);
  assert.equal(view.queryByRole('button', { name: 'Rechazar' }), null);
  assert.ok(view.getByRole('button', { name: 'Cancelar visita' }));
  assert.match(view.getByText(/Zona horaria/).textContent, /navegador/);
  assert.ok(view.getByRole('button', { name: 'Actualizar agenda' }));
  view.rerender(React.createElement(AgendaPanel, { conversation, userId: 'seller', client }));
  await flush();
  assert.ok(view.getByRole('button', { name: 'Aceptar' }));
  assert.ok(view.getByRole('button', { name: 'Rechazar' }));
});

test('panel shows each party confirmation and reserves final confirmation for proposer', async () => {
  const client = fakeClient([visit({ status: 'accepted', seller_confirmed_at: '2099-10-01T12:00:00Z' })]);
  const view = render(React.createElement(AgendaPanel, { conversation, userId: 'seller', client }));
  await flush();
  assert.equal(view.queryByRole('button', { name: 'Confirmar visita' }), null);
  assert.match(view.getByText(/Comprador:/).textContent, /pendiente/);
  assert.match(view.getByText(/Vendedor:/).textContent, /confirmó/);
  view.rerender(React.createElement(AgendaPanel, { conversation, userId: 'buyer', client }));
  await flush();
  assert.ok(view.getByRole('button', { name: 'Confirmar visita' }));
});

test('blocked panel allows cancellation while disabling proposals and all other changes', async () => {
  const client = fakeClient([visit()]);
  const view = render(React.createElement(AgendaPanel, { conversation: { ...conversation, is_blocked: true }, userId: 'seller', client }));
  await flush();
  assert.equal(view.getByRole('button', { name: 'Coordinar visita' }).disabled, true);
  assert.equal(view.getByRole('button', { name: 'Cancelar visita' }).disabled, false);
  assert.equal(view.getByRole('button', { name: 'Aceptar' }).disabled, true);
  assert.equal(view.getByRole('button', { name: 'Rechazar' }).disabled, true);
  assert.match(view.getByText(/conversación.*bloqueada/i).textContent, /Podés cancelar visitas pendientes/);
  assert.ok(view.getByText('Lugar de encuentro'));
});

test('panel clears proposal drafts when switching conversation or logging out', async () => {
  const client = fakeClient();
  const view = render(React.createElement(AgendaPanel, { conversation, userId: 'buyer', client }));
  await flush();
  fireEvent.click(view.getByRole('button', { name: 'Coordinar visita' }));
  fireEvent.change(view.getByLabelText('Lugar'), { target: { value: 'Private draft' } });
  view.rerender(React.createElement(AgendaPanel, { conversation: { ...conversation, id: 'conversation-b' }, userId: 'buyer', client }));
  await flush();
  assert.equal(view.queryByLabelText('Lugar'), null);
  fireEvent.click(view.getByRole('button', { name: 'Coordinar visita' }));
  assert.equal(view.getByLabelText('Lugar').value, '');
  view.rerender(React.createElement(AgendaPanel, { conversation, userId: null, client }));
  await flush();
  assert.equal(view.queryByLabelText('Lugar'), null);
});

test('panel keeps failed form input, announces error and disables duplicate writes while busy', async () => {
  const pending = deferred();
  const client = fakeClient([], { propose: () => pending.promise });
  const view = render(React.createElement(AgendaPanel, { conversation, userId: 'buyer', client }));
  await flush();
  fireEvent.click(view.getByRole('button', { name: 'Coordinar visita' }));
  fireEvent.change(view.getByLabelText('Fecha y hora'), { target: { value: '2099-10-03T12:00' } });
  fireEvent.change(view.getByLabelText('Lugar'), { target: { value: 'Lugar seguro' } });
  fireEvent.change(view.getByLabelText('Duración en minutos'), { target: { value: '60' } });
  fireEvent.submit(view.getByRole('button', { name: 'Proponer' }).closest('form'));
  assert.equal(view.getByRole('button', { name: /Proponiendo|Guardando/ }).disabled, true);
  await waitFor(() => assert.equal(client.calls.proposals.length, 1));
  await act(async () => pending.resolve({ error: { message: 'offline' } }));
  assert.equal(view.getByLabelText('Lugar').value, 'Lugar seguro');
  assert.match(within(view.getByRole('status')).getByText(/.+/).textContent, /pudimos|conexión/i);
});

test('backend stale and schedule-conflict messages are actionable instead of generic connection errors', async () => {
  for (const [message, expected] of [
    ['La visita cambió. Actualizá la agenda antes de continuar.', /visita cambió/],
    ['Ese horario ya está reservado para el comprador o el vendedor.', /reservado.*Elegí otro horario/],
    ['El intervalo de la visita se superpone con otra reserva de uno de los participantes.', /superpone.*duración/],
  ]) {
    const client = fakeClient([visit()], { rpc: async () => ({ error: { code: 'P0001', message } }) });
    const hook = mountHook(client, { userId: 'seller' });
    await flush();
    await act(async () => assert.equal(await hook.result.current.changeStatus('visit-a', 'accepted'), false));
    assert.match(hook.result.current.status, expected);
    assert.equal(client.calls.reads.length, 2);
    hook.unmount();
  }
});

test('failed initial read offers refresh and distinguishes unavailable data from an empty agenda', async () => {
  let failing = true;
  const client = fakeClient([], { read: async () => {
    if (failing) throw new Error('offline');
    return { data: [], error: null };
  } });
  const view = render(React.createElement(AgendaPanel, { conversation, userId: 'buyer', client }));
  await flush();
  assert.equal(view.queryByText('Todavía no hay visitas propuestas.'), null);
  assert.match(view.getByRole('status').textContent, /No pudimos actualizar/);
  failing = false;
  fireEvent.click(view.getByRole('button', { name: 'Actualizar agenda' }));
  await flush();
  assert.ok(view.getByText('Todavía no hay visitas propuestas.'));
  assert.equal(view.queryByRole('status'), null);
});

test('expired proposals may be rejected and cancelled, but expired accepted visits cannot be confirmed', async () => {
  const client = fakeClient([visit({ scheduled_at: '2020-01-01T12:00:00Z' })]);
  const hook = mountHook(client, { userId: 'seller' });
  await flush();
  await act(async () => assert.equal(await hook.result.current.changeStatus('visit-a', 'rejected'), true));
  assert.equal(hook.result.current.appointments[0].status, 'rejected');
  client.rows[0].status = 'accepted';
  hook.rerender({ conversation, userId: 'buyer', client });
  await flush();
  await act(async () => assert.equal(await hook.result.current.changeStatus('visit-a', 'confirmed'), false));
  await act(async () => assert.equal(await hook.result.current.changeStatus('visit-a', 'cancelled'), true));
  assert.equal(hook.result.current.appointments[0].status, 'cancelled');
});

test('local timezone conversion preserves wall-clock input and rejects DST gaps rather than shifting appointments', async () => {
  const { parseAppointmentTime } = await import('../features/agenda/appointment-model.js');
  const originalTimezone = process.env.TZ;
  try {
    process.env.TZ = 'America/Argentina/Buenos_Aires';
    assert.equal(parseAppointmentTime('2099-10-03T12:00').toISOString(), '2099-10-03T15:00:00.000Z');
    process.env.TZ = 'America/New_York';
    assert.equal(parseAppointmentTime('2027-03-14T02:30'), null);
    assert.equal(parseAppointmentTime('2027-03-14T03:30').toISOString(), '2027-03-14T07:30:00.000Z');
    assert.equal(parseAppointmentTime('2100-02-29T12:00'), null);
    assert.equal(parseAppointmentTime('2028-02-29T12:00').getDate(), 29);
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

test('a pending mutation cannot restore appointments or status after logout', async () => {
  const pending = deferred();
  const client = fakeClient([visit()], { rpc: () => pending.promise });
  const hook = mountHook(client, { userId: 'seller' });
  await flush();
  let mutation;
  act(() => { mutation = hook.result.current.changeStatus('visit-a', 'accepted'); });
  hook.rerender({ conversation, userId: null, client });
  await flush();
  await act(async () => { pending.resolve({ data: visit({ status: 'accepted' }), error: null }); assert.equal(await mutation, false); });
  assert.deepEqual(hook.result.current.appointments, []);
  assert.equal(hook.result.current.busy, false);
  assert.match(hook.result.current.status, /Ingresá/);
  assert.equal(client.calls.reads.length, 1);
});

test('Realtime refreshes are optional enhancements and cleaned-up listeners cannot fetch old conversations', async () => {
  const client = fakeClient([visit()]);
  const hook = mountHook(client);
  await flush();
  client.rows[0].status = 'cancelled';
  act(() => client.emit());
  await flush();
  assert.equal(hook.result.current.appointments[0].status, 'cancelled');
  hook.unmount();
  const reads = client.calls.reads.length;
  act(() => client.emit());
  await flush();
  assert.equal(client.calls.reads.length, reads);
  assert.equal(client.calls.removed.length, 1);
});

test('the action matrix is symmetric for buyer-proposed and seller-proposed visits', async () => {
  const { appointmentActions } = await import('../features/agenda/appointment-model.js');
  for (const [proposer, counterpart] of [['buyer', 'seller'], ['seller', 'buyer']]) {
    const row = visit({ proposed_by: proposer });
    assert.deepEqual(appointmentActions(row, conversation, proposer), ['cancelled']);
    assert.deepEqual(appointmentActions(row, conversation, counterpart), ['accepted', 'rejected', 'cancelled']);
    assert.deepEqual(appointmentActions({ ...row, status: 'accepted' }, conversation, proposer), ['confirmed', 'cancelled']);
    assert.deepEqual(appointmentActions({ ...row, status: 'accepted' }, conversation, counterpart), ['cancelled']);
    for (const userId of [proposer, counterpart]) {
      assert.deepEqual(appointmentActions({ ...row, status: 'confirmed' }, conversation, userId), ['cancelled']);
      assert.deepEqual(appointmentActions({ ...row, status: 'cancelled' }, conversation, userId), []);
      assert.deepEqual(appointmentActions({ ...row, status: 'rejected' }, conversation, userId), []);
    }
  }
});

test('an RPC with a missing or unrelated result never announces an unverified successful change', async () => {
  for (const data of [null, visit({ id: 'unrelated', status: 'accepted' }), visit({ status: 'proposed' })]) {
    const client = fakeClient([visit()], { rpc: async () => ({ data, error: null }) });
    const hook = mountHook(client, { userId: 'seller' });
    await flush();
    await act(async () => assert.equal(await hook.result.current.changeStatus('visit-a', 'accepted'), false));
    assert.match(hook.result.current.status, /verificar/);
    assert.equal(hook.result.current.appointments[0].status, 'proposed');
    assert.equal(hook.result.current.busy, false);
    hook.unmount();
  }
});

test('conversation blocking preserves member cancellation for every active status and denies other mutations', async () => {
  const blockedConversation = { ...conversation, is_blocked: true };
  for (const userId of ['buyer', 'seller']) {
    for (const status of ['proposed', 'accepted', 'confirmed']) {
      const client = fakeClient([visit({ status })]);
      const hook = mountHook(client, { conversation: blockedConversation, userId });
      await flush();
      assert.equal(hook.result.current.canMutate, false);
      assert.equal(hook.result.current.canCancel, true);
      await act(async () => assert.equal(await hook.result.current.propose({ durationMinutes: 60, scheduledAt: '2099-10-03T12:00', location: 'Lugar' }), false));
      for (const nextStatus of ['accepted', 'rejected', 'confirmed']) {
        await act(async () => assert.equal(await hook.result.current.changeStatus('visit-a', nextStatus), false));
      }
      assert.equal(client.calls.proposals.length + client.calls.rpcs.length, 0);
      await act(async () => assert.equal(await hook.result.current.changeStatus('visit-a', 'cancelled'), true));
      assert.deepEqual(client.calls.rpcs[0], { name: 'transition_appointment', payload: {
        target_appointment: 'visit-a', expected_status: status, next_status: 'cancelled',
      } });
      assert.equal(hook.result.current.appointments[0].status, 'cancelled');
      hook.unmount();
    }
  }
});

test('blocked conversation cancellation remains protected against same-turn repeated clicks', async () => {
  const pending = deferred();
  const client = fakeClient([visit()], { rpc: () => pending.promise });
  const view = render(React.createElement(AgendaPanel, { conversation: { ...conversation, is_blocked: true }, userId: 'seller', client }));
  await flush();
  const cancel = view.getByRole('button', { name: 'Cancelar visita' });
  fireEvent.click(cancel);
  fireEvent.click(cancel);
  assert.equal(client.calls.rpcs.length, 1);
  assert.equal(cancel.disabled, true);
  await act(async () => {
    client.rows[0].status = 'cancelled';
    pending.resolve({ data: visit({ status: 'cancelled' }), error: null });
  });
  assert.equal(view.queryByRole('button', { name: 'Cancelar visita' }), null);
  assert.ok(view.getByText('Cancelada'));
});

test('server denial of a blocked callers cancellation remains visible and never announces success', async () => {
  const client = fakeClient([visit()], { rpc: async () => ({ error: { code: '42501', message: 'Caller is blocked' } }) });
  const hook = mountHook(client, { conversation: { ...conversation, is_blocked: true } });
  await flush();
  await act(async () => assert.equal(await hook.result.current.changeStatus('visit-a', 'cancelled'), false));
  assert.equal(client.calls.rpcs.length, 1);
  assert.equal(hook.result.current.appointments[0].status, 'proposed');
  assert.match(hook.result.current.status, /No tenés permiso/);
  assert.equal(hook.result.current.busy, false);
});

function proposalStorageFixture() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
const proposalInput = { scheduledAt: '2099-10-03T12:00', durationMinutes: 60, location: 'Lugar seguro' };

test('duration is explicitly required, must be a positive SQL integer and has no commercial default', async () => {
  const client = fakeClient();
  const hook = mountHook(client);
  await flush();
  for (const durationMinutes of [undefined, null, '', ' ', 0, -1, 1.5, '1.5', '1e3', 'abc', Infinity, 2147483648]) {
    await act(async () => assert.equal(await hook.result.current.propose({ ...proposalInput, durationMinutes }), false));
    assert.match(hook.result.current.status, /duración|entero|minutos/i);
  }
  assert.equal(client.calls.rpcs.length, 0);
  await act(async () => assert.equal(await hook.result.current.propose({ ...proposalInput, durationMinutes: 2147483647 }), true));
  assert.equal(client.calls.proposals[0].appointment_duration_minutes, 2147483647);
  hook.unmount();
  const view = render(React.createElement(AgendaPanel, { conversation, userId: 'buyer', client }));
  await flush();
  fireEvent.click(view.getByRole('button', { name: 'Coordinar visita' }));
  assert.equal(view.getByLabelText('Duración en minutos').value, '');
  assert.equal(view.getByLabelText('Duración en minutos').required, true);
});

test('panel shows explicit start, end and duration in the browser timezone', async () => {
  const row = visit({ scheduled_at: '2099-10-03T15:30:00Z', duration_minutes: 75 });
  const view = render(React.createElement(AgendaPanel, { conversation, userId: 'buyer', client: fakeClient([row]) }));
  await flush();
  assert.ok(view.getByText(/Inicio:/));
  const end = new Date(new Date(row.scheduled_at).getTime() + 75 * 60_000).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
  assert.match(view.getByText(/Fin:/).textContent, new RegExp(end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.ok(view.getByText('Duración: 75 minutos'));
});

test('lost response followed by remount uses the persisted UUID and cannot duplicate a proposal', async () => {
  const requestStorage = proposalStorageFixture();
  let saved;
  let attempt = 0;
  const client = fakeClient([], { propose: async payload => {
    if (!saved) { saved = proposalRow(payload, { id: 'one-only' }); client.rows.push(saved); }
    if (++attempt === 1) throw new Error('Response lost after insert');
    return { data: saved, error: null };
  } });
  let hook = mountHook(client, { requestStorage });
  await flush();
  await act(async () => assert.equal(await hook.result.current.propose(proposalInput), false));
  assert.equal(requestStorage.values.size, 1);
  hook.unmount();
  hook = mountHook(client, { requestStorage });
  await flush();
  await act(async () => assert.equal(await hook.result.current.propose(proposalInput), true));
  assert.equal(client.calls.proposals[0].proposal_request_id, client.calls.proposals[1].proposal_request_id);
  assert.equal(client.rows.length, 1);
  assert.equal(requestStorage.values.size, 0);
});

test('uncertain RPC payload errors retain the intent UUID until a verified row is returned', async () => {
  const requestStorage = proposalStorageFixture();
  let attempt = 0;
  const client = fakeClient([], { propose: async payload => ({ error: null, data: ++attempt === 1 ? null : proposalRow(payload, { status: 'confirmed' }) }) });
  const hook = mountHook(client, { requestStorage });
  await flush();
  await act(async () => assert.equal(await hook.result.current.propose(proposalInput), false));
  assert.match(hook.result.current.status, /verificar/);
  assert.equal(requestStorage.values.size, 1);
  await act(async () => assert.equal(await hook.result.current.propose(proposalInput), true));
  assert.equal(client.calls.proposals[0].proposal_request_id, client.calls.proposals[1].proposal_request_id);
  assert.equal(requestStorage.values.size, 0);
  assert.match(hook.result.current.status, /confirmada/i);
});

test('changing duration or normalized location after uncertainty makes a new intent', async () => {
  const requestStorage = proposalStorageFixture();
  const client = fakeClient([], { propose: async () => { throw new Error('offline'); } });
  const hook = mountHook(client, { requestStorage });
  await flush();
  for (const input of [proposalInput, { ...proposalInput, location: ' Lugar seguro ' }, { ...proposalInput, durationMinutes: 90 }, { ...proposalInput, location: 'Otro lugar' }]) {
    await act(() => hook.result.current.propose(input));
  }
  const ids = client.calls.proposals.map(item => item.proposal_request_id);
  assert.equal(ids[0], ids[1]);
  assert.equal(new Set(ids).size, 3);
});

test('storage denial or silent non-persistence explains the blocker and sends no proposal', async () => {
  for (const requestStorage of [null, { getItem() { return null; }, setItem() { throw new Error('blocked'); } }, { getItem() { return null; }, setItem() {} }]) {
    const client = fakeClient();
    const hook = mountHook(client, { requestStorage });
    await flush();
    await act(async () => assert.equal(await hook.result.current.propose(proposalInput), false));
    assert.match(hook.result.current.status, /almacenamiento|referencia/i);
    assert.equal(client.calls.rpcs.length, 0);
    assert.equal(hook.result.current.busy, false);
    hook.unmount();
  }
});

test('the busy guard covers asynchronous hashing and logout during hashing sends nothing or persists nothing', async () => {
  const pending = deferred();
  const requestStorage = proposalStorageFixture();
  let hashes = 0;
  const requestCrypto = { randomUUID: () => crypto.randomUUID(), subtle: { digest() { hashes++; return pending.promise; } } };
  const client = fakeClient();
  const hook = mountHook(client, { requestStorage, requestCrypto });
  await flush();
  let first; let second;
  act(() => { first = hook.result.current.propose(proposalInput); second = hook.result.current.propose(proposalInput); });
  assert.equal(hashes, 1);
  assert.equal(hook.result.current.busy, true);
  hook.rerender({ conversation, userId: null, client, requestStorage, requestCrypto });
  await flush();
  await act(async () => { pending.resolve(new Uint8Array(32).buffer); assert.equal(await first, false); assert.equal(await second, false); });
  assert.equal(client.calls.rpcs.length, 0);
  assert.equal(requestStorage.values.size, 0);
  assert.equal(hook.result.current.busy, false);
});

test('past time can recover an uncertain persisted proposal but cannot start a new intention', async () => {
  const requestStorage = proposalStorageFixture();
  let attempt = 0;
  const client = fakeClient([], { propose: async payload => {
    if (++attempt === 1) throw new Error('Response lost');
    return { data: proposalRow(payload, { status: 'cancelled' }), error: null };
  } });
  const hook = mountHook(client, { requestStorage });
  await flush();
  await act(async () => assert.equal(await hook.result.current.propose(proposalInput), false));
  const realNow = Date.now;
  try {
    Date.now = () => new Date('2100-01-01T00:00:00Z').getTime();
    await act(async () => assert.equal(await hook.result.current.propose(proposalInput), true));
    assert.equal(client.calls.proposals[0].proposal_request_id, client.calls.proposals[1].proposal_request_id);
    assert.match(hook.result.current.status, /cancelada/i);
    await act(async () => assert.equal(await hook.result.current.propose({ ...proposalInput, location: 'Nueva intención' }), false));
    assert.match(hook.result.current.status, /fecha|hora/);
    assert.equal(client.calls.proposals.length, 2);
  } finally { Date.now = realNow; }
});

test('proposal responses must match every immutable payload field before clearing their safe retry reference', async () => {
  for (const change of [{ id: null }, { proposed_by: 'outsider' }, { conversation_id: 'another-chat' },
    { scheduled_at: '2099-10-04T12:00:00Z' }, { duration_minutes: 61 }, { location: 'Another location' }, { status: 'unknown' }]) {
    const requestStorage = proposalStorageFixture();
    let attempt = 0;
    const client = fakeClient([], { propose: async payload => ({ data: proposalRow(payload, ++attempt === 1 ? change : {}), error: null }) });
    const hook = mountHook(client, { requestStorage });
    await flush();
    await act(async () => assert.equal(await hook.result.current.propose(proposalInput), false));
    assert.match(hook.result.current.status, /verificar/);
    assert.equal(requestStorage.values.size, 1);
    await act(async () => assert.equal(await hook.result.current.propose(proposalInput), true));
    assert.equal(client.calls.proposals[0].proposal_request_id, client.calls.proposals[1].proposal_request_id);
    assert.equal(requestStorage.values.size, 0);
    hook.unmount();
  }
});

test('seller proposals verify the authenticated author and send identity-free RPC arguments', async () => {
  const client = fakeClient([], { propose: async payload => ({ data: proposalRow(payload, { proposed_by: 'seller' }), error: null }) });
  const hook = mountHook(client, { userId: 'seller' });
  await flush();
  await act(async () => assert.equal(await hook.result.current.propose(proposalInput), true));
  assert.equal('proposed_by' in client.calls.proposals[0], false);
  assert.equal('userId' in client.calls.proposals[0], false);
});

test('navigating to another conversation during hashing never persists or sends the abandoned proposal', async () => {
  const pending = deferred();
  const requestStorage = proposalStorageFixture();
  const requestCrypto = { randomUUID: () => crypto.randomUUID(), subtle: { digest: () => pending.promise } };
  const client = fakeClient();
  const hook = mountHook(client, { requestStorage, requestCrypto });
  await flush();
  let first;
  act(() => { first = hook.result.current.propose(proposalInput); });
  hook.rerender({ conversation: { ...conversation, id: 'other-chat' }, userId: 'buyer', client, requestStorage, requestCrypto });
  await flush();
  await act(async () => { pending.resolve(new Uint8Array(32).buffer); assert.equal(await first, false); });
  assert.equal(client.calls.rpcs.length, 0);
  assert.equal(requestStorage.values.size, 0);
  assert.equal(hook.result.current.status, '');
});

test('legacy visits with missing duration can only be cancelled or rejected with normal role permissions', async () => {
  const { appointmentActions } = await import('../features/agenda/appointment-model.js');
  for (const duration_minutes of [null, undefined, 0, -1]) {
    const row = visit({ duration_minutes });
    assert.deepEqual(appointmentActions(row, conversation, 'buyer'), ['cancelled']);
    assert.deepEqual(appointmentActions(row, conversation, 'seller'), ['rejected', 'cancelled']);
    assert.deepEqual(appointmentActions({ ...row, status: 'accepted' }, conversation, 'buyer'), ['cancelled']);
  }
  const view = render(React.createElement(AgendaPanel, { conversation, userId: 'seller', client: fakeClient([visit({ duration_minutes: null })]) }));
  await flush();
  assert.ok(view.getByText('Duración pendiente'));
  assert.equal(view.queryByRole('button', { name: 'Aceptar' }), null);
  assert.ok(view.getByRole('button', { name: 'Rechazar' }));
});

test('known ACK survives reference-cleanup failure with warning and a new identical intention gets a new UUID', async () => {
  for (const silent of [false, true]) {
    const requestStorage = proposalStorageFixture();
    requestStorage.removeItem = () => { if (!silent) throw new Error('blocked'); };
    const client = fakeClient();
    const hook = mountHook(client, { requestStorage });
    await flush();
    await act(async () => assert.equal(await hook.result.current.propose(proposalInput), true));
    assert.match(hook.result.current.status, /La visita quedó registrada, pero no pudimos liberar su referencia local/);
    assert.equal(requestStorage.values.size, 1);
    await act(async () => assert.equal(await hook.result.current.propose(proposalInput), true));
    assert.notEqual(client.calls.proposals[0].proposal_request_id, client.calls.proposals[1].proposal_request_id);
    assert.equal(client.rows.length, 2);
    assert.match(hook.result.current.status, /Permití el almacenamiento antes de crear otra igual/);
    hook.unmount();
  }
});

test('a known ACK clears the reference and a subsequent identical intentional proposal receives a new UUID', async () => {
  const requestStorage = proposalStorageFixture();
  const client = fakeClient();
  const hook = mountHook(client, { requestStorage });
  await flush();
  await act(async () => assert.equal(await hook.result.current.propose(proposalInput), true));
  assert.equal(requestStorage.values.size, 0);
  await act(async () => assert.equal(await hook.result.current.propose(proposalInput), true));
  assert.equal(requestStorage.values.size, 0);
  assert.notEqual(client.calls.proposals[0].proposal_request_id, client.calls.proposals[1].proposal_request_id);
  assert.equal(client.rows.length, 2);
});

test('a new intention is blocked before RPC if persisting a replacement UUID after a known ACK fails', async () => {
  for (const removeFails of ['throw', 'silent']) {
    const requestStorage = proposalStorageFixture();
    requestStorage.removeItem = () => { if (removeFails === 'throw') throw new Error('remove blocked'); };
    const client = fakeClient();
    const hook = mountHook(client, { requestStorage });
    await flush();
    await act(async () => assert.equal(await hook.result.current.propose(proposalInput), true));
    requestStorage.setItem = () => { throw new Error('write blocked'); };
    await act(async () => assert.equal(await hook.result.current.propose(proposalInput), false));
    assert.equal(client.calls.proposals.length, 1);
    assert.equal(client.rows.length, 1);
    assert.match(hook.result.current.status, /almacenamiento|referencia/);
    assert.equal(hook.result.current.busy, false);
    hook.unmount();
  }
});

test('historical cancelled or rejected visits with no duration never ask to define their past interval', async () => {
  for (const status of ['cancelled', 'rejected']) {
    const view = render(React.createElement(AgendaPanel, { conversation, userId: 'seller', client: fakeClient([visit({ status, duration_minutes: null })]) }));
    await flush();
    assert.ok(view.getByText('Duración no registrada'));
    assert.equal(view.queryByText('Duración pendiente'), null);
    assert.equal(view.queryByText(/Falta definir duración/), null);
    assert.equal(view.queryByRole('button', { name: 'Aceptar' }), null);
    assert.equal(view.queryByRole('button', { name: 'Confirmar visita' }), null);
    view.unmount();
  }
});
