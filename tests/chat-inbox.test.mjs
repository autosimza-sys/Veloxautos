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
dom.window.HTMLElement.prototype.getClientRects = function () { return [this]; };
const { render, renderHook, fireEvent, cleanup, act } = await import('@testing-library/react');
const { useChat } = await import('../features/chat/use-chat.js');
const { useChatInbox } = await import('../features/chat/use-chat-inbox.js');
const { default: ChatInbox } = await import('../features/chat/ChatInbox.jsx');
const { default: ChatPreview } = await import('../features/chat/ChatPreview.jsx');
afterEach(cleanup);
const flush = () => act(() => new Promise(resolve => setTimeout(resolve, 0)));
const session = id => ({ user: { id } });
const thread = (id = 'thread-1') => ({ id, buyer_id: 'buyer', seller_id: 'seller', vehicle_id: 'car', is_blocked: false, is_reported: false, vehicle_brand: 'Ford', vehicle_model: 'Ka', counterparty_name: 'Ana', created_at: '2026-10-03T00:00:00Z' });
const message = (id = 'message-1', extra = {}) => ({ id, conversation_id: 'thread-1', sender_id: 'seller', body: 'Hola', created_at: '2026-10-03T00:00:00Z', read_at: null, ...extra });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fakeClient() {
  const client = {
    conversations: [thread()], messages: [], calls: [], channels: [], removed: [],
    async rpc(name, args) {
      this.calls.push({ table: name, action: 'rpc', args });
      if (name === 'get_my_conversations') return { data: this.conversations, error: null };
      if (name === 'send_message_idempotent') {
        this.messages.push(message(`sent-${this.messages.length}`, { conversation_id: args.target_conversation, sender_id: 'buyer', body: args.message_body }));
        return { data: { message_id: '70000000-0000-4000-8000-' + String(this.messages.length).padStart(12, '0'), automated: false }, error: null };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    },
    from(table) {
      const call = { table, action: 'select', filters: [] };
      const query = {
        select() { return this; },
        insert(value) { call.action = 'insert'; call.value = value; return this; },
        update(value) { call.action = 'update'; call.value = value; return this; },
        eq(field, value) { call.filters.push([field, 'eq', value]); return this; },
        neq(field, value) { call.filters.push([field, 'neq', value]); return this; },
        is(field, value) { call.filters.push([field, 'is', value]); return this; },
        in(field, value) { call.filters.push([field, 'in', value]); return this; },
        order() { return this; },
        maybeSingle() { call.single = true; return this; },
        single() { call.single = true; return this; },
        then(resolve, reject) {
          client.calls.push(call);
          return Promise.resolve().then(() => client.handle(call)).then(resolve, reject);
        },
      };
      return query;
    },
    handle(call) {
      let rows = call.table === 'conversations' ? this.conversations : call.table === 'messages' ? this.messages : [];
      rows = rows.filter(row => call.filters.every(([field, operator, value]) => operator === 'eq' || operator === 'is' ? row[field] === value : operator === 'neq' ? row[field] !== value : value.includes(row[field])));
      if (call.action === 'insert') {
        const row = call.table === 'conversations' ? { ...thread('created-thread'), ...call.value } : call.value;
        if (call.table === 'conversations') this.conversations.push(row);
        return { data: call.single ? row : [row], error: null };
      }
      if (call.action === 'update') rows.forEach(row => Object.assign(row, call.value));
      return { data: call.single ? (rows[0] ? { ...rows[0] } : null) : rows.map(row => ({ ...row })), error: null };
    },
    channel(name) {
      const channel = { name, listeners: [], on(_type, filter, callback) { this.listeners.push({ filter, callback }); return this; }, subscribe(callback) { this.status = callback; return this; } };
      this.channels.push(channel);
      return channel;
    },
    removeChannel(channel) { this.removed.push(channel); return Promise.resolve(); },
  };
  return client;
}
const noAgenda = () => null;

test('inbox lists buyer and seller conversations but filters foreign participants', async () => {
  for (const user of ['buyer', 'seller']) {
    const client = fakeClient();
    client.conversations.push({ ...thread('foreign'), buyer_id: 'other', seller_id: 'stranger' });
    const view = renderHook(() => useChatInbox({ session: session(user), client }));
    await flush();
    assert.deepEqual(view.result.current.conversations.map(row => row.id), ['thread-1']);
    assert.equal(client.calls[0].table, 'get_my_conversations');
    view.unmount();
  }
});

test('inbox clears previous identity immediately and ignores a late response after logout', async () => {
  const client = fakeClient(); const pending = deferred();
  client.rpc = () => pending.promise;
  const view = renderHook(({ current }) => useChatInbox({ session: current, client }), { initialProps: { current: session('buyer') } });
  await flush();
  view.rerender({ current: null });
  await act(async () => pending.resolve({ data: [thread()], error: null }));
  assert.deepEqual(view.result.current.conversations, []);
});

test('inbox turns network failures into a retryable status', async () => {
  const client = fakeClient(); const original = client.rpc;
  client.rpc = async () => { throw new Error('offline'); };
  const view = renderHook(() => useChatInbox({ session: session('buyer'), client }));
  await flush();
  assert.match(view.result.current.status, /conexión/i);
  client.rpc = original;
  await act(() => view.result.current.refresh());
  assert.equal(view.result.current.conversations.length, 1);
});

test('existing chats open for buyer and seller without inserting a conversation', async () => {
  for (const user of ['buyer', 'seller']) {
    const client = fakeClient(); client.messages = [message()];
    const view = renderHook(() => useChat({ session: session(user), conversation: thread(), client }));
    await flush();
    assert.equal(view.result.current.conversation.id, 'thread-1');
    assert.equal(view.result.current.messages.length, 1);
    assert.equal(client.calls.filter(call => call.table === 'conversations' && call.action === 'insert').length, 0);
    view.unmount();
  }
});

test('existing chat rejects a nonparticipant and unavailable chat before fetching messages', async () => {
  for (const user of ['stranger', 'buyer']) {
    const client = fakeClient();
    if (user === 'buyer') client.conversations = [];
    const view = renderHook(() => useChat({ session: session(user), conversation: thread(), client }));
    await flush();
    assert.equal(view.result.current.conversation, null);
    assert.equal(client.calls.filter(call => call.table === 'messages').length, 0);
    view.unmount();
  }
});

test('sending is single-flight and refreshes the authoritative history without Realtime', async () => {
  const client = fakeClient(); const pending = deferred(); const original = client.rpc.bind(client);
  client.rpc = async (...args) => { await pending.promise; return original(...args); };
  const view = renderHook(() => useChat({ session: session('buyer'), conversation: thread(), client }));
  await flush();
  let first; let duplicate;
  act(() => { first = view.result.current.sendMessage('  Consulta  '); duplicate = view.result.current.sendMessage('Consulta'); });
  assert.equal(await duplicate, false);
  await act(async () => { pending.resolve(); assert.equal(await first, true); });
  assert.equal(client.calls.filter(call => call.table === 'send_message_idempotent').length, 1);
  assert.equal(view.result.current.messages[0].body, 'Consulta');
  assert.equal(view.result.current.busy, '');
});

test('confirmed send clears draft even when refreshing history fails', async () => {
  const client = fakeClient(); const handle = client.handle;
  const view = renderHook(() => useChat({ session: session('buyer'), conversation: thread(), client }));
  await flush();
  client.handle = call => { if (call.table === 'messages' && call.action === 'select') throw new Error('offline'); return handle.call(client, call); };
  let result;
  await act(async () => { result = await view.result.current.sendMessage('Consulta'); });
  assert.equal(result, true);
  assert.match(view.result.current.status, /enviado.*actualiz/i);
});

test('send failures keep retry available and blocked conversations never send', async () => {
  const client = fakeClient();
  const view = renderHook(() => useChat({ session: session('buyer'), conversation: thread(), client }));
  await flush();
  client.rpc = async () => { throw new Error('offline'); };
  await act(async () => assert.equal(await view.result.current.sendMessage('Consulta'), false));
  assert.match(view.result.current.status, /confirmar.*envío/i);
  assert.equal(view.result.current.busy, '');
  await act(() => view.result.current.blockConversation());
  assert.equal(view.result.current.conversation.is_blocked, true);
  assert.equal(await view.result.current.sendMessage('No enviar'), false);
});

test('received messages are marked read only for fetched incoming unread IDs', async () => {
  const client = fakeClient(); client.messages = [message(), message('own', { sender_id: 'buyer' }), message('read', { read_at: 'already' })];
  const view = renderHook(() => useChat({ session: session('buyer'), conversation: thread(), client }));
  await flush();
  const updates = client.calls.filter(call => call.table === 'messages' && call.action === 'update');
  assert.equal(updates.length, 1);
  assert.ok(updates[0].filters.some(filter => filter[0] === 'id' && filter[1] === 'in' && filter[2].join(',') === 'message-1'));
  assert.equal(view.result.current.messages.find(row => row.id === 'own').read_at, null);
});

test('read receipt updates and conversation blocks refresh from Realtime; channels are removed', async () => {
  const client = fakeClient(); client.messages = [message('own', { sender_id: 'buyer' })];
  const view = renderHook(() => useChat({ session: session('buyer'), conversation: thread(), client }));
  await flush();
  const listeners = client.channels.flatMap(channel => channel.listeners);
  assert.equal(listeners.find(entry => entry.filter.table === 'messages').filter.event, '*');
  client.messages[0].read_at = 'read'; client.conversations[0].is_blocked = true;
  await act(async () => listeners.find(entry => entry.filter.table === 'messages').callback({ eventType: 'UPDATE' }));
  await flush();
  assert.equal(view.result.current.messages[0].read_at, 'read');
  assert.equal(view.result.current.conversation.is_blocked, true);
  view.unmount();
  assert.equal(client.removed.length, client.channels.length);
});

test('slow history cannot overwrite a newer conversation or logged-out view', async () => {
  const client = fakeClient(); const pending = deferred(); const handle = client.handle;
  client.conversations.push(thread('thread-2'));
  client.messages = [message('second', { conversation_id: 'thread-2' })];
  client.handle = call => call.table === 'messages' && call.action === 'select' && call.filters.some(filter => filter[2] === 'thread-1') ? pending.promise : handle.call(client, call);
  const view = renderHook(({ current, selected }) => useChat({ session: current, conversation: selected, client }), { initialProps: { current: session('buyer'), selected: thread() } });
  await flush();
  view.rerender({ current: session('buyer'), selected: thread('thread-2') });
  await flush();
  await act(async () => pending.resolve({ data: [message('old')], error: null }));
  assert.equal(view.result.current.conversation.id, 'thread-2');
  assert.equal(view.result.current.messages[0].id, 'second');
  view.rerender({ current: null, selected: thread('thread-2') });
  assert.deepEqual(view.result.current.messages, []);
  await flush();
});

test('report uses the existing conversation vehicle and reports metadata-update failures honestly', async () => {
  const client = fakeClient(); const handle = client.handle;
  const view = renderHook(() => useChat({ session: session('seller'), conversation: thread(), client }));
  await flush();
  client.handle = call => call.table === 'conversations' && call.action === 'update' ? { error: { message: 'failed flag' } } : handle.call(client, call);
  await act(async () => assert.equal(await view.result.current.reportConversation('Contenido indebido'), true));
  const report = client.calls.find(call => call.table === 'reports');
  assert.equal(report.value.vehicle_id, 'car');
  assert.equal(report.value.reported_user_id, 'buyer');
  assert.match(view.result.current.status, /enviada.*estado/i);
});

test('modal focuses close, traps focus, closes with Escape/backdrop and restores focus', async () => {
  function Harness() {
    const [open, setOpen] = React.useState(false);
    return React.createElement(React.Fragment, null,
      React.createElement('button', { onClick: () => setOpen(true) }, 'Abrir'),
      open && React.createElement(ChatPreview, { session: session('buyer'), conversation: thread(), client: null, onClose: () => setOpen(false), AgendaComponent: noAgenda }),
    );
  }
  const view = render(React.createElement(Harness));
  for (const closeBy of ['Escape', 'backdrop']) {
    const opener = view.getByText('Abrir'); opener.focus(); fireEvent.click(opener);
    const close = view.getByLabelText('Cerrar chat');
    assert.equal(document.activeElement, close);
    assert.equal(document.body.style.overflow, 'hidden');
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    assert.ok(view.getByRole('dialog').contains(document.activeElement));
    fireEvent.click(view.getByText('Ford Ka'));
    assert.ok(view.getByRole('dialog'));
    if (closeBy === 'Escape') fireEvent.keyDown(document, { key: 'Escape' });
    else fireEvent.click(view.getByRole('dialog'));
    assert.equal(view.queryByRole('dialog'), null);
    assert.equal(document.activeElement, opener);
    assert.equal(document.body.style.overflow, '');
  }
  await flush();
});

test('inbox opens existing chat without selecting a catalog vehicle and survives repeated navigation', async () => {
  const client = fakeClient();
  const Preview = props => React.createElement(ChatPreview, { ...props, AgendaComponent: noAgenda });
  const view = render(React.createElement(ChatInbox, { session: session('seller'), client, ChatComponent: Preview }));
  await flush();
  for (let index = 0; index < 2; index++) {
    const opener = view.getByRole('button', { name: /Ford Ka/ }); opener.focus(); fireEvent.click(opener);
    await flush();
    assert.ok(view.getByRole('dialog'));
    assert.ok(view.getByLabelText('Escribir mensaje'));
    fireEvent.keyDown(document, { key: 'Escape' });
    await flush();
    assert.equal(view.queryByRole('dialog'), null);
    assert.equal(document.activeElement, opener);
  }
  assert.equal(client.calls.some(call => call.table === 'conversations' && call.action === 'insert'), false);
});

test('catalog buyer reuses an existing chat, creates only once when needed, and owner cannot self-chat', async () => {
  for (const user of ['buyer', 'new-buyer', 'seller']) {
    const client = fakeClient();
    const view = renderHook(() => useChat({ session: session(user), vehicle: { id: 'car', ownerId: 'seller' }, client }), { wrapper: React.StrictMode });
    await flush();
    const inserts = client.calls.filter(call => call.table === 'conversations' && call.action === 'insert');
    assert.equal(inserts.length, user === 'new-buyer' ? 1 : 0);
    assert.equal(Boolean(view.result.current.conversation), user !== 'seller');
    view.unmount();
  }
});

test('concurrent tab creation falls back to the conversation protected by the unique constraint', async () => {
  const client = fakeClient(); client.conversations = []; const original = client.handle;
  client.handle = function(call) {
    if (call.table === 'conversations' && call.action === 'insert') {
      this.conversations.push(thread());
      return { data: null, error: { code: '23505', message: 'duplicate' } };
    }
    return original.call(this, call);
  };
  const view = renderHook(() => useChat({ session: session('buyer'), vehicle: { id: 'car', ownerId: 'seller' }, client }));
  await flush();
  assert.equal(view.result.current.conversation.id, 'thread-1');
  assert.equal(client.calls.filter(call => call.table === 'conversations' && call.action === 'insert').length, 1);
});

test('refresh response started before blocking cannot restore an unblocked snapshot', async () => {
  const client = fakeClient(); const pending = deferred(); const original = client.handle;
  const view = renderHook(() => useChat({ session: session('buyer'), conversation: thread(), client }));
  await flush();
  let hold = true;
  client.handle = function(call) {
    if (hold && call.table === 'conversations' && call.action === 'select') { hold = false; return pending.promise; }
    return original.call(this, call);
  };
  let refreshing;
  act(() => { refreshing = view.result.current.refresh(); });
  await flush();
  await act(() => view.result.current.blockConversation());
  await act(async () => { pending.resolve({ data: thread(), error: null }); await refreshing; });
  assert.equal(view.result.current.conversation.is_blocked, true);
  assert.equal(view.result.current.loading, false);
});

test('slow send from a previous conversation cannot clear the new conversation status or history', async () => {
  const client = fakeClient(); const pending = deferred();
  client.conversations.push(thread('thread-2'));
  client.messages = [message('second', { conversation_id: 'thread-2' })];
  client.rpc = () => pending.promise;
  const view = renderHook(({ selected }) => useChat({ session: session('buyer'), conversation: selected, client }), { initialProps: { selected: thread() } });
  await flush();
  let sending;
  act(() => { sending = view.result.current.sendMessage('Old draft'); });
  view.rerender({ selected: thread('thread-2') });
  await flush();
  await act(async () => { pending.resolve({ data: { message_id: '70000000-0000-4000-8000-000000000001', automated: false }, error: null }); assert.equal(await sending, false); });
  assert.equal(view.result.current.conversation.id, 'thread-2');
  assert.equal(view.result.current.messages[0].id, 'second');
  assert.equal(view.result.current.busy, '');
});

test('read-update errors preserve the history and disclose unconfirmed read receipts', async () => {
  const client = fakeClient(); client.messages = [message()]; const original = client.handle;
  client.handle = call => call.table === 'messages' && call.action === 'update' ? { data: null, error: { message: 'offline' } } : original.call(client, call);
  const view = renderHook(() => useChat({ session: session('buyer'), conversation: thread(), client }));
  await flush();
  assert.equal(view.result.current.messages.length, 1);
  assert.equal(view.result.current.messages[0].read_at, null);
  assert.match(view.result.current.status, /marcar.*leídos/i);
  assert.equal(view.result.current.loading, false);
});

test('Realtime failure leaves manual refresh and sending operational', async () => {
  const client = fakeClient();
  const view = renderHook(() => useChat({ session: session('buyer'), conversation: thread(), client }));
  await flush();
  act(() => client.channels[0].status('CHANNEL_ERROR'));
  assert.match(view.result.current.realtimeStatus, /Actualizar mensajes/);
  await act(async () => assert.equal(await view.result.current.sendMessage('Funciona sin Realtime'), true));
  assert.equal(view.result.current.messages.at(-1).body, 'Funciona sin Realtime');
  await act(async () => assert.equal(await view.result.current.refresh(), true));
});

test('seller can reply from the inbox and draft resets when selected conversation changes', async () => {
  const client = fakeClient(); client.conversations.push(thread('thread-2'));
  const view = render(React.createElement(ChatPreview, { session: session('seller'), conversation: thread(), client, onClose() {}, AgendaComponent: noAgenda }));
  await flush();
  fireEvent.change(view.getByLabelText('Escribir mensaje'), { target: { value: 'Podés verlo mañana' } });
  fireEvent.submit(view.getByRole('form', { name: 'Enviar mensaje' }));
  await flush();
  assert.equal(view.getByLabelText('Escribir mensaje').value, '');
  assert.equal(client.calls.find(call => call.table === 'send_message_idempotent').args.message_body, 'Podés verlo mañana');
  fireEvent.change(view.getByLabelText('Escribir mensaje'), { target: { value: 'Borrador anterior' } });
  view.rerender(React.createElement(ChatPreview, { session: session('seller'), conversation: thread('thread-2'), client, onClose() {}, AgendaComponent: noAgenda }));
  await flush();
  assert.equal(view.getByLabelText('Escribir mensaje').value, '');
});

test('blocked chat keeps appointment history while disabling composer and appointment mutations', async () => {
  const client = fakeClient(); client.conversations[0].is_blocked = true;
  const view = render(React.createElement(ChatPreview, { session: session('buyer'), conversation: thread(), client, onClose() {} }));
  await flush();
  assert.equal(view.getByLabelText('Escribir mensaje').disabled, true);
  assert.equal(view.getByRole('button', { name: 'Enviar', exact: true }).disabled, true);
  assert.ok(view.getByRole('region', { name: 'Agenda de visitas' }));
  assert.equal(view.getByRole('button', { name: 'Coordinar visita' }).disabled, true);
  assert.equal(view.getByRole('button', { name: 'Actualizar agenda' }).disabled, false);
  assert.equal(view.getByRole('button', { name: '¿Sigue disponible?' }).disabled, true);
});

test('a report by one participant does not prevent the other from reporting', async () => {
  const client = fakeClient(); client.conversations[0].is_reported = true;
  const view = renderHook(() => useChat({ session: session('seller'), conversation: thread(), client }));
  await flush();
  await act(async () => assert.equal(await view.result.current.reportConversation('Necesito denunciar este contenido'), true));
  assert.equal(view.result.current.reportSubmitted, true);
  await act(async () => assert.equal(await view.result.current.reportConversation('No duplicar'), false));
  assert.equal(client.calls.filter(call => call.table === 'reports').length, 1);
});

test('blocking and reporting are single-flight and prevent simultaneous message sends', async () => {
  for (const operation of ['blockConversation', 'reportConversation']) {
    const client = fakeClient(); const pending = deferred(); const original = client.handle;
    const view = renderHook(() => useChat({ session: session('buyer'), conversation: thread(), client }));
    await flush();
    client.handle = call => (operation === 'blockConversation' ? call.table === 'conversations' && call.action === 'update' : call.table === 'reports') ? pending.promise : original.call(client, call);
    let first;
    act(() => { first = view.result.current[operation]('Motivo'); });
    await act(async () => {
      assert.equal(await view.result.current[operation]('Motivo duplicado'), false);
      assert.equal(await view.result.current.sendMessage('No enviar durante bloqueo'), false);
    });
    await act(async () => { pending.resolve({ data: { ...thread(), is_blocked: operation === 'blockConversation' }, error: null }); await first; });
    assert.equal(client.calls.filter(call => call.table === 'send_message_idempotent').length, 0);
    view.unmount();
  }
});

test('inbox latest refresh wins and an earlier request cannot restore removed conversations', async () => {
  const client = fakeClient(); const pending = deferred();
  const view = renderHook(() => useChatInbox({ session: session('buyer'), client }));
  await flush();
  client.rpc = () => pending.promise;
  let oldRefresh;
  act(() => { oldRefresh = view.result.current.refresh(); });
  client.rpc = async () => ({ data: [], error: null });
  await act(() => view.result.current.refresh());
  await act(async () => { pending.resolve({ data: [thread()], error: null }); await oldRefresh; });
  assert.deepEqual(view.result.current.conversations, []);
  assert.equal(view.result.current.loading, false);
});

test('logout dismisses an open inbox chat and login never restores its old selection', async () => {
  const client = fakeClient();
  const Preview = props => React.createElement(ChatPreview, { ...props, AgendaComponent: noAgenda });
  const view = render(React.createElement(ChatInbox, { session: session('seller'), client, ChatComponent: Preview }));
  await flush();
  fireEvent.click(view.getByRole('button', { name: /Ford Ka/ }));
  await flush();
  assert.ok(view.getByRole('dialog'));
  view.rerender(React.createElement(ChatInbox, { session: null, client, ChatComponent: Preview }));
  assert.equal(view.queryByRole('dialog'), null);
  assert.equal(view.queryByRole('button', { name: /Ford Ka/ }), null);
  assert.equal(document.body.style.overflow, '');
  view.rerender(React.createElement(ChatInbox, { session: session('seller'), client, ChatComponent: Preview }));
  await flush();
  assert.equal(view.queryByRole('dialog'), null);
});

test('hook preserves a confirmed send and warns if pending-request cleanup fails', async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: () => { throw new Error('Storage unavailable'); } };
  const client = fakeClient();
  const view = renderHook(() => useChat({ session: session('buyer'), conversation: thread(), client, requestStorage: storage }));
  await flush();
  await act(async () => assert.equal(await view.result.current.sendMessage('Mensaje confirmado'), true));
  assert.equal(view.result.current.messages[0].body, 'Mensaje confirmado');
  assert.match(view.result.current.status, /Mensaje enviado.*protección/i);
  await act(async () => assert.equal(await view.result.current.sendMessage('Mensaje confirmado'), true));
  const sends = client.calls.filter(call => call.table === 'send_message_idempotent');
  assert.notEqual(sends[0].args.message_request_id, sends[1].args.message_request_id);
});

test('hook remount after lost response explicitly retries the same UUID with no duplicate message', async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const client = fakeClient(); const rpc = client.rpc.bind(client); const received = new Map(); const calls = [];
  client.rpc = async (name, args) => {
    calls.push(args);
    if (received.has(args.message_request_id)) return received.get(args.message_request_id);
    const response = await rpc(name, args);
    received.set(args.message_request_id, response);
    return { data: null, error: { code: '', message: 'Failed to fetch' }, status: 0 };
  };
  const options = { session: session('buyer'), conversation: thread(), client, requestStorage: storage };
  let view = renderHook(() => useChat(options));
  await flush();
  await act(async () => assert.equal(await view.result.current.sendMessage('Persistir intención'), false));
  assert.match(view.result.current.status, /reintentar.*sin duplicarlo/);
  assert.equal(calls.length, 1, 'no automatic retry');
  view.unmount();
  view = renderHook(() => useChat(options));
  await flush();
  await act(async () => assert.equal(await view.result.current.sendMessage('Persistir intención'), true));
  assert.equal(calls[0].message_request_id, calls[1].message_request_id);
  assert.equal(view.result.current.messages.length, 1);
  assert.equal(values.size, 0);
});
