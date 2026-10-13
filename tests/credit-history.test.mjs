import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window; globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { renderHook, act, cleanup } = await import('@testing-library/react');
const { useCreditHistory } = await import('../features/credits/use-credit-history.js');
afterEach(cleanup);
const flush = () => act(() => new Promise(resolve => setTimeout(resolve, 0)));
function clientFor(read) {
  return { from: table => {
    assert.equal(table, 'credit_ledger');
    return { select: () => ({ eq: (field, id) => {
      assert.equal(field, 'user_id');
      const query = { order: () => query, limit: n => { assert.equal(n, 20); return read(id); } };
      return query;
    } }) };
  } };
}
test('account switch and signout immediately hide previous private ledger', async () => {
  let resolveSecond;
  const client = clientFor(id => id === 'a' ? Promise.resolve({ data: [{ id: 'private-a', amount: -50 }] }) : new Promise(resolve => { resolveSecond = resolve; }));
  const { result, rerender } = renderHook(({ id }) => useCreditHistory(id, { granted: 100, used: 50 }, client), { initialProps: { id: 'a' } });
  await flush(); assert.equal(result.current.entries[0].id, 'private-a');
  rerender({ id: 'b' }); assert.deepEqual(result.current.entries, []);
  rerender({ id: null });
  await act(async () => resolveSecond({ data: [{ id: 'private-b' }] }));
  assert.deepEqual(result.current.entries, []);
});
test('new consumption refreshes movements; errors show no stale transaction history', async () => {
  let count = 0;
  const client = clientFor(async () => ++count === 1 ? { data: [{ id: 'initial', amount: 100 }] } : { error: { message: 'network' } });
  const { result, rerender } = renderHook(({ used }) => useCreditHistory('a', { granted: 100, used }, client), { initialProps: { used: 0 } });
  await flush(); assert.equal(result.current.entries.length, 1);
  rerender({ used: 50 }); assert.deepEqual(result.current.entries, []);
  await flush(); assert.match(result.current.error, /consultar/); assert.deepEqual(result.current.entries, []);
});
