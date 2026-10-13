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
// jsdom has no layout; model visible controls for focus management.
dom.window.HTMLElement.prototype.getClientRects = function () { return [this]; };

const { render, fireEvent, cleanup, act } = await import('@testing-library/react');
const { default: AuthModal } = await import('../features/auth/AuthModal.jsx');
const { useAuthDialog } = await import('../features/auth/use-auth-dialog.js');
const props = {
  authForm: { email: '', password: '', displayName: '', phone: '', role: 'particular', businessName: '' },
  authMode: 'register', authStatus: '', profile: null,
  onSubmit() {}, setAuthForm() {}, setAuthMode() {},
};
afterEach(() => cleanup());

test('buyer is selectable in registration and success text alone cannot hide the form', () => {
  const view = render(React.createElement(AuthModal, { ...props, intent: 'chat',
    authStatus: 'Cuenta creada. Ya podés publicar', onClose() {} }));
  assert.ok(view.getByRole('option', { name: /Comprador/ }));
  assert.equal(view.getByLabelText('Tipo de cuenta').options.length, 4);
  assert.ok(view.getByRole('button', { name: 'Crear cuenta y consultar' }));
  assert.equal(view.queryByText('✓ Sesión activa'), null);
});

function DialogHarness() {
  const dialog = useAuthDialog();
  return React.createElement(React.Fragment, null,
    React.createElement('button', { onClick: () => dialog.open('publish') }, 'Open'),
    dialog.intent && React.createElement(AuthModal, { ...props, onClose: dialog.close }),
  );
}

async function waitForHistory() { await act(() => new Promise(resolve => setTimeout(resolve, 30))); }

test('modal focuses its close button, traps focus, restores focus and scroll after Escape', async () => {
  const view = render(React.createElement(DialogHarness));
  const opener = view.getByText('Open');
  opener.focus();
  fireEvent.click(opener);
  const close = view.getByLabelText('Cerrar');
  assert.equal(document.activeElement, close);
  assert.equal(document.body.style.overflow, 'hidden');
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
  assert.equal(document.activeElement, view.getByText('Crear cuenta y publicar'));
  fireEvent.keyDown(document, { key: 'Tab' });
  assert.equal(document.activeElement, close);
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitForHistory();
  assert.equal(view.queryByRole('dialog'), null);
  assert.equal(document.activeElement, opener);
  assert.equal(document.body.style.overflow, '');
});

test('Back closes modal, Forward restores it, repeated close does not leave dead overlay', async () => {
  const view = render(React.createElement(DialogHarness));
  fireEvent.click(view.getByText('Open'));
  assert.ok(view.getByRole('dialog'));
  window.history.back();
  await waitForHistory();
  assert.equal(view.queryByRole('dialog'), null);
  window.history.forward();
  await waitForHistory();
  assert.ok(view.getByRole('dialog'));
  fireEvent.click(view.getByLabelText('Cerrar'));
  await waitForHistory();
  assert.equal(view.queryByRole('dialog'), null);
  fireEvent.click(view.getByText('Open'));
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitForHistory();
  assert.equal(view.queryByRole('dialog'), null);
});

test('clicking content keeps modal open and clicking backdrop closes it', async () => {
  const view = render(React.createElement(DialogHarness));
  fireEvent.click(view.getByText('Open'));
  fireEvent.click(view.getByText('Creá tu cuenta gratis'));
  assert.ok(view.getByRole('dialog'));
  fireEvent.click(view.getByRole('dialog'));
  await waitForHistory();
  assert.equal(view.queryByRole('dialog'), null);
});
