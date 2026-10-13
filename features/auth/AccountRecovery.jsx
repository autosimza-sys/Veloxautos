"use client";

import { MIN_RECOVERY_PASSWORD_LENGTH, useAccountRecovery } from './use-account-recovery';
import Link from 'next/link';

export default function AccountRecovery({ client, createClient }) {
  const recovery = useAccountRecovery({ client, createClient });
  return (
    <section className="authSection" aria-label="Recuperación de cuenta">
      <div>
        <h2>{recovery.mode === 'change' ? 'Elegí una nueva contraseña' : 'Volvé a ingresar a Velox'}</h2>
        <p>Usá el email con el que creaste tu cuenta. Si el enlace venció o recargaste la página antes de completar el cambio, podés pedir uno nuevo.</p>
        <p>Al guardar la contraseña pediremos cerrar las sesiones de tu cuenta. En otros dispositivos puede demorar hasta que venza la sesión. Para volver a ingresar, usá la nueva contraseña.</p>
      </div>
      <div className="authCard" aria-busy={recovery.busy || !recovery.ready}>
        {!recovery.ready && <p role="status">Comprobando el acceso...</p>}
        {recovery.ready && recovery.mode === 'request' && (
          <form onSubmit={recovery.requestLink} style={{ display: 'grid', gap: 14 }}>
            <label>Email de tu cuenta
              <input type="email" required autoComplete="email" value={recovery.email}
                disabled={recovery.busy} onChange={event => recovery.setEmail(event.target.value)} />
            </label>
            <button type="submit" className="primary" disabled={recovery.busy}>
              {recovery.busy ? 'Procesando solicitud...' : 'Pedir enlace de recuperación'}
            </button>
          </form>
        )}
        {recovery.ready && recovery.mode === 'change' && (
          <form onSubmit={recovery.changePassword} style={{ display: 'grid', gap: 14 }}>
            <label>Nueva contraseña
              <input type="password" required autoComplete="new-password" minLength={MIN_RECOVERY_PASSWORD_LENGTH}
                value={recovery.password} disabled={recovery.busy} onChange={event => recovery.setPassword(event.target.value)} />
            </label>
            <label>Repetí la nueva contraseña
              <input type="password" required autoComplete="new-password" minLength={MIN_RECOVERY_PASSWORD_LENGTH}
                value={recovery.confirmation} disabled={recovery.busy} onChange={event => recovery.setConfirmation(event.target.value)} />
            </label>
            <p>Usá al menos {MIN_RECOVERY_PASSWORD_LENGTH} caracteres y una contraseña que no uses en otro sitio.</p>
            <button type="submit" className="primary" disabled={recovery.busy}>
              {recovery.busy ? 'Guardando...' : 'Guardar nueva contraseña'}
            </button>
          </form>
        )}
        {recovery.mode === 'closing' && <button type="button" className="primary" disabled={recovery.busy} onClick={recovery.retrySessionClose}>
          {recovery.busy ? 'Cerrando sesiones...' : 'Reintentar cierre de sesiones'}
        </button>}
        {recovery.error && <p role="alert" className="authError">{recovery.error}</p>}
        {recovery.status && <p role="status">{recovery.status}</p>}
        {recovery.mode === 'done' && <Link href="/#cuenta">Ingresar con mi nueva contraseña</Link>}
      </div>
    </section>
  );
}
