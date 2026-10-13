import { roleLabel } from "../../lib/roles";
import { promotionState } from './promotion-model';
import { useCreditHistory } from './use-credit-history';

const movementLabels = { initial_grant: 'Créditos iniciales', publication: 'Publicación de auto', promo_refill: 'Recarga gratuita', admin_adjustment: 'Ajuste de saldo', expiration: 'Vencimiento', purchase: 'Acreditación por compra' };

export default function CreditsSection({ balance, profile, status, launch }) {
  const {promotion,error}=launch;
  const history = useCreditHistory(profile?.id, balance);
  const {phase}=promotionState(promotion);
  const packages=Object.entries(promotion?.quotas || {}).filter(([role])=>['particular','reseller','agency'].includes(role));
  return (
    <section className="section creditsSection" id="creditos">
      <div className="sectionTitle">
        <p className="eyebrow">Créditos de publicación</p>
        <h2>Publicá durante el lanzamiento gratuito.</h2>
        <p>90 días desde el lanzamiento para todos. Las extensiones se informarán acá; el vencimiento no genera cargos.</p>
        {phase==='unconfigured' && <p>Fecha de lanzamiento y cupos por confirmar.</p>}
        {phase==='scheduled' && <p>Comienza el {new Date(promotion.starts_at).toLocaleString('es-AR')}.</p>}
        {phase==='free' && <p>Período gratuito hasta el {new Date(promotion.ends_at).toLocaleString('es-AR')}.</p>}
        {phase==='review' && <p>El período gratuito terminó. Estamos evaluando su extensión; no se activó ningún cobro.</p>}
        {promotion?.revision > 0 && <p>Publicar un auto consume {promotion.publication_cost ?? 1} créditos. Editar, responder preguntas básicas y coordinar visitas están incluidos.</p>}
        {promotion?.revision > 0 && promotion.auto_refill && <p>Durante el período gratuito, el saldo se recarga sin cargo al agotarse o cuando no alcanza para publicar. Cada recarga queda registrada y no cambia la fecha final.</p>}
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
            <span>Usados acumulados</span>
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
            <p>{promotion.auto_refill ? `Recargas gratuitas de ${credits} créditos durante la promoción.` : 'Vigencia común del período de lanzamiento.'}</p>
          </article>
        ))}
      </div>
      {profile && <details className="creditHistory">
        <summary>Mis últimos movimientos de créditos</summary>
        <p>El uso y las recargas se registran por separado. Los créditos gratuitos no generan deuda.</p>
        {history.isLoading && <p role="status">Consultando movimientos…</p>}
        {history.error && <p role="status">{history.error}</p>}
        {!history.isLoading && !history.error && !history.entries.length && <p>Todavía no hay movimientos.</p>}
        <ol>{history.entries.map(entry => <li key={entry.id}>
          <span>{movementLabels[entry.kind] || 'Movimiento de créditos'} <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString('es-AR')}</time></span>
          <strong>{entry.amount > 0 ? '+' : ''}{entry.amount} créditos</strong>
        </li>)}</ol>
        {history.entries.length === 20 && <p>Se muestran los 20 movimientos más recientes.</p>}
      </details>}
      {status && <p className="authStatus">{status}</p>}
    </section>
  );
}
