import { roleLabel } from "../../lib/roles";

const packages = [
  { role: "particular", credits: 10, days: 90 },
  { role: "reseller", credits: 50, days: 90 },
  { role: "agency", credits: 200, days: 90 },
];

export default function CreditsSection({ balance, profile, status }) {
  return (
    <section className="section creditsSection" id="creditos">
      <div className="sectionTitle">
        <p className="eyebrow">Creditos de publicacion</p>
        <h2>Publica cuando lo necesitas. Sin suscripcion mensual.</h2>
      </div>

      {profile && (
        <div className="creditBalance">
          <div>
            <span>Tu cuenta</span>
            <strong>{roleLabel(profile.role)}</strong>
          </div>
          <div>
            <span>Disponibles</span>
            <strong>{balance?.remaining ?? "--"}</strong>
          </div>
          <div>
            <span>Usados</span>
            <strong>{balance?.used ?? "--"}</strong>
          </div>
          <div>
            <span>Vencimiento</span>
            <strong>{balance?.expires_at ? new Date(balance.expires_at).toLocaleDateString("es-AR") : "--"}</strong>
          </div>
        </div>
      )}

      <div className="creditPackages">
        {packages.map((pack) => (
          <article key={pack.role}>
            <span>{roleLabel(pack.role)}</span>
            <strong>{pack.credits} creditos</strong>
            <p>Hasta {pack.credits} publicaciones durante {pack.days} dias.</p>
          </article>
        ))}
      </div>
      {status && <p className="authStatus">{status}</p>}
    </section>
  );
}
