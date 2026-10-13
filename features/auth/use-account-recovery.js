"use client";

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

export const RECOVERY_PATH = '/recuperar-cuenta';
export const MIN_RECOVERY_PASSWORD_LENGTH = 8;
export const RECOVERY_REQUEST_NOTICE = 'Si existe una cuenta habilitada con ese email, recibirás un enlace para cambiar la contraseña. Revisá también la carpeta de spam.';
const EXPIRED_NOTICE = 'El enlace no es válido, venció o ya fue utilizado. Pedí uno nuevo para continuar.';
const initialState = { ready: false, mode: 'request', busy: false, status: '', error: '' };

// Recovery uses the existing SDK and public configuration, but not the ordinary
// persisted login session. Subscribe immediately after constructing this client:
// the SDK emits PASSWORD_RECOVERY once during its asynchronous URL initialization.
export function createRecoveryClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key, { auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: true,
    flowType: 'implicit',
    storageKey: 'velox-password-recovery',
  } }) : null;
}

function hasCallbackParameters() {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.slice(1));
  return ['access_token', 'refresh_token', 'error', 'error_code', 'code', 'type']
    .some(key => url.searchParams.has(key) || hash.has(key));
}

function isExpiredError(error) {
  return error?.status === 401 || ['session_not_found', 'refresh_token_not_found',
    'refresh_token_already_used', 'bad_jwt', 'otp_expired', 'flow_state_expired']
    .includes(error?.code);
}

export function useAccountRecovery({ client: suppliedClient, createClient: clientFactory = createRecoveryClient } = {}) {
  const [state, setState] = useState(initialState);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const scopeRef = useRef(null);

  useEffect(() => {
    const scope = { active: true, client: null, recoveryUser: null, revision: 0, busy: false, passwordSaved: false };
    scopeRef.current = scope;
    const current = () => scope.active && scopeRef.current === scope;
    const patch = values => { if (current()) setState(previous => ({ ...previous, ...values })); };

    // Do not consume a recovery link in React StrictMode's discarded effect.
    void Promise.resolve().then(async () => {
      if (!current()) return;
      const hadCallback = hasCallbackParameters();
      try {
        scope.client = suppliedClient === undefined ? clientFactory() : suppliedClient;
        if (!scope.client) {
          patch({ ...initialState, ready: true, error: 'La recuperación de cuentas no está disponible en este momento. Intentá más tarde.' });
          return;
        }
        const { data } = scope.client.auth.onAuthStateChange((event, session) => {
          if (!current()) return;
          // Never call another SDK method from this synchronous auth callback.
          if (event === 'PASSWORD_RECOVERY' && session?.user?.id && session.access_token) {
            if (session.expires_at && session.expires_at * 1000 <= Date.now()) {
              scope.recoveryUser = null;
              patch({ ready: true, mode: 'request', error: EXPIRED_NOTICE, status: '' });
              return;
            }
            scope.recoveryUser = session.user.id;
            scope.revision++;
            setPassword('');
            setConfirmation('');
            patch({ ready: true, mode: 'change', busy: false, error: '', status: '' });
          } else if (event === 'SIGNED_OUT' || event === 'SIGNED_IN'
            || (event === 'TOKEN_REFRESHED' && session?.user?.id !== scope.recoveryUser)) {
            scope.recoveryUser = null;
            scope.revision++;
            setPassword('');
            setConfirmation('');
            // Our own sign-out after a confirmed update must not erase its ACK.
            if (!scope.passwordSaved) patch({ mode: 'request', error: hadCallback ? EXPIRED_NOTICE : '', status: '' });
          }
        });
        scope.subscription = data.subscription;
        const initialized = await scope.client.auth.initialize();
        if (!current()) return;
        if (initialized?.error) {
          scope.recoveryUser = null;
          patch({ ready: true, mode: 'request', error: hadCallback ? EXPIRED_NOTICE : 'No pudimos conectar con las cuentas. Intentá pedir el enlace nuevamente.' });
        } else {
          patch({ ready: true, ...(hadCallback && !scope.recoveryUser ? { error: EXPIRED_NOTICE } : {}) });
        }
      } catch {
        patch({ ready: true, mode: 'request', error: 'No pudimos conectar con las cuentas. Revisá la conexión e intentá nuevamente.' });
      }
    });
    return () => {
      scope.active = false;
      scope.revision++;
      scope.subscription?.unsubscribe();
      scope.client?.auth.stopAutoRefresh?.();
    };
  }, [suppliedClient, clientFactory]);

  function activeScope() {
    const scope = scopeRef.current;
    return scope?.active && scope.client ? scope : null;
  }

  function patch(scope, values) {
    if (scope.active && scopeRef.current === scope) setState(previous => ({ ...previous, ...values }));
  }

  async function requestLink(event) {
    event.preventDefault();
    const scope = activeScope();
    if (!scope || scope.busy || !state.ready || state.mode !== 'request') return;
    const cleanEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      patch(scope, { error: 'Ingresá un email válido.', status: '' });
      return;
    }
    scope.busy = true;
    const revision = scope.revision;
    patch(scope, { busy: true, status: '', error: '' });
    try {
      const result = await scope.client.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: new URL(RECOVERY_PATH, window.location.origin).href,
      });
      if (!scope.active || revision !== scope.revision) return;
      // Account-specific denials have the same conditional wording as an
      // accepted request. Neither the UI nor raw provider text confirms an account.
      const accountDenial = ['user_not_found', 'email_not_confirmed', 'user_banned'].includes(result?.error?.code);
      if (!result || (result.error && !accountDenial)) throw Error('Request not confirmed');
      patch(scope, { status: RECOVERY_REQUEST_NOTICE });
    } catch {
      if (revision === scope.revision) patch(scope, { error: 'No pudimos confirmar la solicitud. Esperá un momento y volvé a intentarlo.' });
    } finally {
      scope.busy = false;
      patch(scope, { busy: false });
    }
  }

  async function closeRecoverySession(scope) {
    scope.busy = true;
    patch(scope, { mode: 'closing', busy: true, status: '', error: '' });
    try {
      const result = await scope.client.auth.signOut({ scope: 'global' });
      if (!result || result.error) throw Error('Sign out not confirmed');
      patch(scope, { mode: 'done', status: 'Contraseña actualizada. Ya podés ingresar con la nueva contraseña. El cierre en otros dispositivos puede demorar hasta que venza su sesión.' });
    } catch {
      patch(scope, { error: 'La contraseña se actualizó, pero no pudimos confirmar el cierre de las sesiones. Reintentá el cierre antes de salir.' });
    } finally {
      scope.busy = false;
      patch(scope, { busy: false });
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    const scope = activeScope();
    if (!scope || scope.busy || !scope.recoveryUser || state.mode !== 'change') return;
    if (password.length < MIN_RECOVERY_PASSWORD_LENGTH) {
      patch(scope, { error: `Usá una contraseña de al menos ${MIN_RECOVERY_PASSWORD_LENGTH} caracteres.`, status: '' });
      return;
    }
    if (password !== confirmation) {
      patch(scope, { error: 'Las contraseñas no coinciden.', status: '' });
      return;
    }
    scope.busy = true;
    const revision = scope.revision;
    const userId = scope.recoveryUser;
    patch(scope, { busy: true, status: '', error: '' });
    try {
      const result = await scope.client.auth.updateUser({ password });
      if (!scope.active || revision !== scope.revision) return;
      if (result?.error) {
        if (isExpiredError(result.error)) {
          scope.recoveryUser = null;
          setPassword('');
          setConfirmation('');
          patch(scope, { mode: 'request', error: EXPIRED_NOTICE });
          return;
        }
        throw Error('Password not confirmed');
      }
      if (result?.data?.user?.id !== userId) throw Error('Password not confirmed');
      scope.passwordSaved = true;
      scope.recoveryUser = null;
      setPassword('');
      setConfirmation('');
      await closeRecoverySession(scope);
    } catch {
      if (revision === scope.revision) patch(scope, { error: 'No pudimos confirmar el cambio. Reintentá con una contraseña nueva de al menos 8 caracteres o pedí otro enlace.' });
    } finally {
      scope.busy = false;
      patch(scope, { busy: false });
    }
  }

  async function retrySessionClose() {
    const scope = activeScope();
    if (scope && !scope.busy && scope.passwordSaved) await closeRecoverySession(scope);
  }

  return { ...state, email, password, confirmation, setEmail, setPassword, setConfirmation,
    requestLink, changePassword, retrySessionClose };
}
