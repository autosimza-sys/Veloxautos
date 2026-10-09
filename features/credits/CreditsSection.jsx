import { roleLabel } from "../../lib/roles";
import { useLaunchPromotion } from './use-launch-promotion';
import { promotionState } from './promotion-model';

export default function CreditsSection({ balance, profile, status }) {
  const {promotion,error}=useLaunchPromotion();
  const {phase}=promotionState(promotion);
  const packages=Object.entries(promotion?.quotas || {}).filter(([role])=>['particular','reseller','agency'].includes(role));
  return (
    <section className="section creditsSection" id="creditos">
      <div className="sectionTitle">
        <p className="eyebrow">Creditos de publicacion</p>
        <h2>Publicá durante el lanzamiento gratuito.</h2>
        <p>90 días desde el lanzamiento para todos. Las extensiones se informarán acá; el vencimiento no genera cargos.</p>
        {phase==='unconfigured' && <p>Fecha de lanzamiento y cupos por confirmar.</p>}
        {phase==='scheduled' && <p>Comienza el {new Date(promotion.starts_at).toLocaleString('es-AR')}.</p>}
        {phase==='free' && <p>Período gratuito hasta el {new Date(promotion.ends_at).toLocaleString('es-AR')}.</p>}
        {phase==='review' && <p>El período gratuito terminó. Estamos evaluando su extensión; no se activó ningún cobro.</p>}
        {error && <p role="status">{error}</p>}
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
        {packages.map(([role, credits]) => (
          <article key={role}>
            <span>{roleLabel(role)}</span>
            <strong>{credits} créditos iniciales</strong>
            <p>Vigencia común del período de lanzamiento.</p>
          </article>
        ))}
      </div>
      {status && <p className="authStatus">{status}</p>}
    </section>
  );
}
