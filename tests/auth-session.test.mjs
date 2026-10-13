import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { renderHook, act, cleanup } = await import('@testing-library/react');
const { useAuth } = await import('../features/auth/use-auth.js');
afterEach(cleanup);
const flush = () => act(() => new Promise(resolve => setTimeout(resolve, 10)));
function fakeClient() {
  const requests = [];
  let listener;
  const client = {
    requests,
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: callback => { listener = callback; return { data: { listener, subscription: { unsubscribe() {} } } }; },
      signInWithPassword: async () => ({ error: null }),
      signOut: async () => ({ error: null }),
    },
    emit: session => listener('TEST', session),
    from: () => ({ select: () => ({ eq: (_field, id) => ({ single: () => new Promise(resolve => requests.push({ id, resolve })) }) }) }),
  };
  return client;
}
test('auth events are synchronous and slow profile cannot restore a logged-out user', async () => {
  const client = fakeClient();
  const { result } = renderHook(() => useAuth(client));
  await flush();
  let returned;
  act(() => { returned = client.emit({ user: { id: 'alice' }, access_token: 'x' }); });
  assert.equal(returned, undefined, 'auth callback must not hold the Supabase auth lock');
  await flush();
  act(() => client.emit(null));
  await act(async () => client.requests.shift().resolve({ data: { id: 'alice', role: 'admin' } }));
  assert.equal(result.current.session, null);
  assert.equal(result.current.profile, null);
});
test('rapid repeated submit performs one request and does not auto-login unconfirmed signup', async () => {
  const client = fakeClient();
  let calls = 0;
  let resolveLogin;
  client.auth.signInWithPassword = () => { calls++; return new Promise(resolve => { resolveLogin = resolve; }); };
  const { result } = renderHook(() => useAuth(client));
  await flush();
  const event = { preventDefault() {} };
  let first;
  act(() => { first = result.current.submitAuth(event); result.current.submitAuth(event); });
  assert.equal(calls, 1);
  await act(async () => { resolveLogin({ error: null }); await first; });
  assert.equal(result.current.authBusy, false);
});
test('network errors become actionable status and permit retry', async () => {
  const client = fakeClient();
  client.auth.signInWithPassword = async () => { throw new Error('offline'); };
  const { result } = renderHook(() => useAuth(client));
  await flush();
  await act(() => result.current.submitAuth({ preventDefault() {} }));
  assert.match(result.current.authStatus, /conexión/i);
  assert.equal(result.current.authBusy, false);
});

test('chat registration defaults to buyer, publication restores a seller role', async () => {
  const client = fakeClient();
  const { result } = renderHook(() => useAuth(client));
  await flush();
  act(() => result.current.startRegistration('chat'));
  assert.equal(result.current.authForm.role, 'registered');
  assert.equal(result.current.authMode, 'register');
  act(() => result.current.startRegistration('publish'));
  assert.equal(result.current.authForm.role, 'particular');
  act(() => result.current.setAuthForm({ ...result.current.authForm, role: 'agency' }));
  act(() => result.current.startRegistration('publish'));
  assert.equal(result.current.authForm.role, 'agency');
});

test('registration status reflects the loaded role and does not claim access without a profile', async () => {
  for (const [profile, expected] of [
    [{id:'new',role:'registered'}, /consultar vehículos/],
    [{id:'new',role:'agency'}, /preparar tu publicación/],
    [{id:'new',role:'particular',is_blocked:true}, /necesita revisión/],
    [null, /no pudimos cargar tu perfil/],
  ]) {
    const client=fakeClient();
    client.auth.signUp=async()=>({data:{user:{id:'new'},session:{user:{id:'new'}}}});
    client.from=()=>({select:()=>({eq:()=>({single:async()=>({data:profile})})}),
      insert:()=>({select:()=>({single:async()=>({data:null,error:{message:'denied'}})})})});
    const { result,unmount }=renderHook(()=>useAuth(client));
    await flush();
    act(()=>result.current.setAuthMode('register'));
    await act(()=>result.current.submitAuth({preventDefault(){}}));
    assert.match(result.current.authStatus,expected);
    assert.doesNotMatch(result.current.authStatus,/ya podés publicar/i);
    unmount();
  }
});
test('unconfirmed registration does not trigger password login or persist password in form', async () => {
  const client = fakeClient();
  let loginCalls = 0;
  client.auth.signInWithPassword = async () => { loginCalls++; return { error: null }; };
  client.auth.signUp = async () => ({ data: { user: { id: 'pending' }, session: null }, error: null });
  const { result } = renderHook(() => useAuth(client));
  await flush();
  act(() => {
    result.current.setAuthMode('register');
    result.current.setAuthForm({ email: 'test@example.test', password: 'temporary-test-value', role: 'particular' });
  });
  await act(() => result.current.submitAuth({ preventDefault() {} }));
  assert.equal(loginCalls, 0);
  assert.equal(result.current.authForm.password, '');
  assert.match(result.current.authStatus, /confirmar/);
});
test('buyer registration remains registered and unknown roles never become sellers or admins', async () => {
  for (const role of ['registered', 'admin', 'unexpected']) {
    const client = fakeClient(); let submitted;
    client.auth.signUp = async args => { submitted = args; return { data: { user: { id: 'pending' }, session: null } }; };
    const { result, unmount } = renderHook(() => useAuth(client));
    await flush();
    act(() => { result.current.setAuthMode('register'); result.current.setAuthForm({ email: 'test@example.test', password: 'test-password', role }); });
    await act(() => result.current.submitAuth({ preventDefault() {} }));
    assert.equal(submitted.options.data.role, 'registered');
    unmount();
  }
});
