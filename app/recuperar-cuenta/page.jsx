import Link from 'next/link';
import AccountRecovery from '../../features/auth/AccountRecovery';

export const metadata = {
  title: 'Recuperar cuenta | Velox',
  description: 'Pedí un enlace para recuperar el acceso a tu cuenta de Velox.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function RecoverAccountPage() {
  return (
    <main className="section">
      <Link href="/">← Volver a Velox</Link>
      <p className="eyebrow">Tu cuenta</p>
      <h1>Recuperar el acceso</h1>
      <AccountRecovery />
    </main>
  );
}
