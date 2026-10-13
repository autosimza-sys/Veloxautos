import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import React from 'react';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://velox.test/recuperar-cuenta' });
globalThis.window = dom.window;
globalThis.self = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { render, renderHook, fireEvent, cleanup, act } = await import('@testing-library/react');
const { useAccountRecovery, RECOVERY_REQUEST_NOTICE } = await import('../features/auth/use-account-recovery.js');
const { default: AccountRecovery } = await import('../features/auth/AccountRecovery.jsx');
afterEach(() => { cleanup(); window.history.replaceState({}, '', '/recuperar-cuenta'); });
const flush = () => act(() => new Promise(resolve => setTimeout(resolve, 5)));
const event = () => ({ preventDefault() {} });
const recoverySession = { user: { id: 'recovering-user' }, access_token: 'offline-test-token', expires_at: Math.floor(Date.now() / 1000) + 3600 };

function fakeClient(options = {}) {
  let callback;
  const calls = [];
  return { calls,
    emit(name, session) { return callback(name, session); },
    auth: {
      onAuthStateChange(listener) { callback = listener; return { data: { subscription: { unsubscribe() { calls.push(['unsubscribe']); } } } }; },
      initialize: async () => options.initialize ? options.initialize(callback) : { error: null },
      resetPasswordForEmail: async (...args) => { calls.push(['request', ...args]); return options.request ? options.request(...args) : { data: {}, error: null }; },
      updateUser: async (...args) => { calls.push(['update', ...args]); return options.update ? options.update(...args) : { data: { user: recoverySession.user }, error: null }; },
      signOut: async (...args) => { calls.push(['logout', ...args]); if (options.logout) return options.logout(...args); callback('SIGNED_OUT', null); return { error: null }; },
      stopAutoRefresh() {},
    },
  };
}

async function setup(options = {}) {
  const client = fakeClient(options);
  const view = renderHook(() => useAccountRecovery({ client }));
  await flush();
  return { client, ...view };
}

function enterPassword(result, password = 'a-new-password', confirmation = password) {
  act(() => { result.current.setPassword(password); result.current.setConfirmation(confirmation); });
}

test('an ordinary persisted session, SIGNED_IN or recovery-looking URL cannot enable a password change', async () => {
  window.history.replaceState({}, '', '/recuperar-cuenta?type=recovery');
  const { client, result } = await setup();
  for (const name of ['INITIAL_SESSION', 'SIGNED_IN', 'USER_UPDATED', 'TOKEN_REFRESHED']) {
    act(() => client.emit(name, recoverySession));
    assert.equal(result.current.mode, 'request');
  }
  enterPassword(result);
  await act(() => result.current.changePassword(event()));
  assert.equal(client.calls.filter(call => call[0] === 'update').length, 0);
});

test('only a valid PASSWORD_RECOVERY event enables change, and the callback is synchronous', async () => {
  const { client, result } = await setup();
  act(() => client.emit('PASSWORD_RECOVERY', null));
  assert.equal(result.current.mode, 'request');
  let returned;
  act(() => { returned = client.emit('PASSWORD_RECOVERY', recoverySession); });
  assert.equal(returned, undefined);
  assert.equal(result.current.mode, 'change');
});

test('expired and invalid links keep the request form without displaying provider details', async () => {
  window.history.replaceState({}, '', '/recuperar-cuenta#error_code=otp_expired');
  const { client, result } = await setup({ initialize: async () => ({ error: { code: 'otp_expired', message: 'secret diagnostic' } }) });
  assert.match(result.current.error, /venció|válido/);
  assert.doesNotMatch(result.current.error, /secret diagnostic/);
  act(() => client.emit('PASSWORD_RECOVERY', { ...recoverySession, expires_at: 1 }));
  assert.equal(result.current.mode, 'request');
  assert.equal(client.calls.filter(call => call[0] === 'update').length, 0);
});

test('a recovery event emitted during client initialization is retained', async () => {
  const { result } = await setup({ initialize: async callback => { callback('PASSWORD_RECOVERY', recoverySession); return { error: null }; } });
  assert.equal(result.current.mode, 'change');
});

test('request waits for ACK, guards duplicate clicks, and uses a fixed same-origin return path', async () => {
  window.history.replaceState({}, '', '/recuperar-cuenta?redirect=https://untrusted.test');
  let resolveRequest;
  const { client, result } = await setup({ request: () => new Promise(resolve => { resolveRequest = resolve; }) });
  act(() => result.current.setEmail('  user@example.invalid  '));
  let pending;
  act(() => { pending = result.current.requestLink(event()); void result.current.requestLink(event()); });
  assert.equal(client.calls.filter(call => call[0] === 'request').length, 1);
  assert.equal(result.current.status, '');
  assert.equal(result.current.busy, true);
  assert.deepEqual(client.calls.find(call => call[0] === 'request').slice(1), ['user@example.invalid', { redirectTo: 'https://velox.test/recuperar-cuenta' }]);
  await act(async () => { resolveRequest({ data: {}, error: null }); await pending; });
  assert.equal(result.current.status, RECOVERY_REQUEST_NOTICE);
  assert.equal(result.current.busy, false);
});

test('accepted and account-specific denied requests receive the same conditional notice', async () => {
  for (const code of [null, 'user_not_found', 'email_not_confirmed', 'user_banned']) {
    const { result, unmount } = await setup({ request: async () => ({ data: {}, error: code ? { code, message: 'account detail' } : null }) });
    act(() => result.current.setEmail('user@example.invalid'));
    await act(() => result.current.requestLink(event()));
    assert.equal(result.current.status, RECOVERY_REQUEST_NOTICE);
    assert.equal(result.current.error, '');
    unmount();
  }
});

test('request network failure is generic and a retry can complete', async () => {
  let attempts = 0;
  const { result } = await setup({ request: async () => { if (++attempts === 1) throw Error('network secret'); return { error: null }; } });
  act(() => result.current.setEmail('user@example.invalid'));
  await act(() => result.current.requestLink(event()));
  assert.match(result.current.error, /No pudimos confirmar/);
  assert.equal(result.current.status, '');
  assert.equal(result.current.busy, false);
  await act(() => result.current.requestLink(event()));
  assert.equal(result.current.status, RECOVERY_REQUEST_NOTICE);
  assert.equal(result.current.error, '');
});

test('empty or malformed email never calls the SDK', async () => {
  const { client, result } = await setup();
  act(() => result.current.setEmail('not-an-email'));
  await act(() => result.current.requestLink(event()));
  assert.match(result.current.error, /email válido/);
  assert.equal(client.calls.filter(call => call[0] === 'request').length, 0);
});

test('short or mismatched passwords never call updateUser', async () => {
  const { client, result } = await setup();
  act(() => client.emit('PASSWORD_RECOVERY', recoverySession));
  enterPassword(result, 'short');
  await act(() => result.current.changePassword(event()));
  assert.match(result.current.error, /8 caracteres/);
  enterPassword(result, 'a-new-password', 'a-different-password');
  await act(() => result.current.changePassword(event()));
  assert.match(result.current.error, /no coinciden/);
  assert.equal(client.calls.filter(call => call[0] === 'update').length, 0);
});

test('password change requires matching user ACK before reporting completion or signing out', async () => {
  let resolveUpdate;
  const { client, result } = await setup({ update: () => new Promise(resolve => { resolveUpdate = resolve; }) });
  act(() => client.emit('PASSWORD_RECOVERY', recoverySession));
  enterPassword(result);
  let pending;
  act(() => { pending = result.current.changePassword(event()); void result.current.changePassword(event()); });
  assert.equal(client.calls.filter(call => call[0] === 'update').length, 1);
  assert.equal(client.calls.filter(call => call[0] === 'logout').length, 0);
  assert.equal(result.current.status, '');
  await act(async () => { resolveUpdate({ data: { user: recoverySession.user }, error: null }); await pending; });
  assert.equal(result.current.mode, 'done');
  assert.equal(result.current.password, '');
  assert.equal(result.current.confirmation, '');
  assert.deepEqual(client.calls.find(call => call[0] === 'logout')[1], { scope: 'global' });
  assert.match(result.current.status, /Contraseña actualizada/);
  assert.match(result.current.status, /otros dispositivos puede demorar/);
  assert.doesNotMatch(result.current.status, /sesiones cerradas/);
});

test('empty or wrong-user update responses cannot claim password success', async () => {
  for (const reply of [{ data: null }, { data: { user: { id: 'other-user' } } }]) {
    const { client, result, unmount } = await setup({ update: async () => reply });
    act(() => client.emit('PASSWORD_RECOVERY', recoverySession));
    enterPassword(result);
    await act(() => result.current.changePassword(event()));
    assert.equal(result.current.mode, 'change');
    assert.match(result.current.error, /No pudimos confirmar/);
    assert.equal(result.current.status, '');
    assert.equal(client.calls.filter(call => call[0] === 'logout').length, 0);
    unmount();
  }
});

test('an expired session during update returns to requesting a new link', async () => {
  const { client, result } = await setup({ update: async () => ({ error: { status: 401, code: 'bad_jwt' } }) });
  act(() => client.emit('PASSWORD_RECOVERY', recoverySession));
  enterPassword(result);
  await act(() => result.current.changePassword(event()));
  assert.equal(result.current.mode, 'request');
  assert.match(result.current.error, /venció|válido/);
  assert.equal(result.current.password, '');
});

test('update network error can be retried without reporting unconfirmed success', async () => {
  let attempts = 0;
  const { client, result } = await setup({ update: async () => { if (++attempts === 1) throw Error('offline'); return { data: { user: recoverySession.user } }; } });
  act(() => client.emit('PASSWORD_RECOVERY', recoverySession));
  enterPassword(result);
  await act(() => result.current.changePassword(event()));
  assert.match(result.current.error, /No pudimos confirmar/);
  assert.equal(result.current.status, '');
  assert.equal(result.current.busy, false);
  await act(() => result.current.changePassword(event()));
  assert.equal(result.current.mode, 'done');
});

test('sign-out failure preserves password ACK and retries only sign-out, not the update', async () => {
  let attempts = 0;
  const { client, result } = await setup({ logout: async () => ++attempts === 1 ? { error: { message: 'network' } } : { error: null } });
  act(() => client.emit('PASSWORD_RECOVERY', recoverySession));
  enterPassword(result);
  await act(() => result.current.changePassword(event()));
  assert.equal(result.current.mode, 'closing');
  assert.match(result.current.error, /contraseña se actualizó/);
  assert.equal(result.current.status, '');
  await act(() => result.current.retrySessionClose());
  assert.equal(result.current.mode, 'done');
  assert.equal(client.calls.filter(call => call[0] === 'update').length, 1);
  assert.equal(client.calls.filter(call => call[0] === 'logout').length, 2);
});

test('a signed-out or replaced recovery session cannot be restored by a late update response', async () => {
  let resolveUpdate;
  const { client, result } = await setup({ update: () => new Promise(resolve => { resolveUpdate = resolve; }) });
  act(() => client.emit('PASSWORD_RECOVERY', recoverySession));
  enterPassword(result);
  let pending;
  act(() => { pending = result.current.changePassword(event()); });
  act(() => client.emit('SIGNED_OUT', null));
  await act(async () => { resolveUpdate({ data: { user: recoverySession.user } }); await pending; });
  assert.equal(result.current.mode, 'request');
  assert.equal(result.current.status, '');
  assert.equal(client.calls.filter(call => call[0] === 'logout').length, 0);
});

test('StrictMode discarded effect does not create or consume a second recovery client', async () => {
  const client = fakeClient();
  let creations = 0;
  const factory = () => { creations++; return client; };
  render(React.createElement(React.StrictMode, null, React.createElement(AccountRecovery, { createClient: factory })));
  await flush();
  assert.equal(creations, 1);
});

test('component exposes request, recovery fields and final login link with actionable errors', async () => {
  const client = fakeClient();
  const view = render(React.createElement(AccountRecovery, { client }));
  await flush();
  fireEvent.change(view.getByLabelText('Email de tu cuenta'), { target: { value: 'user@example.invalid' } });
  fireEvent.submit(view.getByRole('button', { name: 'Pedir enlace de recuperación' }).closest('form'));
  await flush();
  assert.ok(view.getByText(RECOVERY_REQUEST_NOTICE));
  act(() => client.emit('PASSWORD_RECOVERY', recoverySession));
  fireEvent.change(view.getByLabelText('Nueva contraseña'), { target: { value: 'new-password-one' } });
  fireEvent.change(view.getByLabelText('Repetí la nueva contraseña'), { target: { value: 'new-password-two' } });
  fireEvent.submit(view.getByRole('button', { name: 'Guardar nueva contraseña' }).closest('form'));
  assert.match(view.getByRole('alert').textContent, /no coinciden/);
  fireEvent.change(view.getByLabelText('Repetí la nueva contraseña'), { target: { value: 'new-password-one' } });
  fireEvent.submit(view.getByRole('button', { name: 'Guardar nueva contraseña' }).closest('form'));
  await flush();
  assert.ok(view.getByRole('link', { name: 'Ingresar con mi nueva contraseña' }));
  assert.equal(view.queryByLabelText('Nueva contraseña'), null);
});
