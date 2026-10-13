"use client";
import { useRef, useState } from 'react';
import { useLaunchPromotion } from '../credits/use-launch-promotion';
import { promotionQuotas, publicationCreditCost } from '../credits/promotion-model';
import { roleLabel } from '../../lib/roles';
export default function LaunchPromotionPanel({client}) {
  const {promotion,error,refresh}=useLaunchPromotion(client);
  const [starts,setStarts]=useState('');
  const [quotas,setQuotas]=useState({particular:'',reseller:'',agency:''});
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [cost,setCost]=useState('');
  const [refill,setRefill]=useState(true);
  const pending=useRef(false);
  async function savePolicy(event) {
    event.preventDefault();
    if(pending.current || !promotion) return;
    pending.current=true;setBusy(true);setNotice('');
    try {
      const {error:failed}=await client.rpc('configure_launch_credit_policy',{
        expected_policy_revision:promotion.policy_revision,
        publication_credit_cost:publicationCreditCost(cost),refill_enabled:refill,
      });
      if(failed) throw new Error('No se confirmó la configuración. Actualizá la promoción antes de reintentar.');
      setNotice('Costo y recarga guardados. El período gratuito todavía no comenzó.');
    } catch(e){setNotice(e.message || 'No se confirmó el cambio.');}
    finally{refresh();pending.current=false;setBusy(false);}
  }
  async function submit(event) {
    event.preventDefault();
    if(pending.current || !promotion) return;
    pending.current=true;setBusy(true);setNotice('');
    try {
      const action=promotion.revision?'extend':'start';
      const selectedQuotas=action==='start'?promotionQuotas(quotas):null;
      if(selectedQuotas && promotion.auto_refill && Object.values(selectedQuotas).some(value=>value<promotion.publication_cost)) {
        throw new Error('Cada lote de recarga debe alcanzar para al menos una publicación.');
      }
      const {error:failed}=await client.rpc('manage_launch_promotion',{
        action,expected_revision:promotion.revision,
        launch_at:action==='start'?new Date(starts).toISOString():null,
        credit_quotas:selectedQuotas,
      });
      if(failed) throw new Error('No se confirmó el cambio. Actualizá la promoción antes de reintentar.');
      setNotice(action==='start'?'Lanzamiento configurado.':'Promoción extendida tres meses, sin reiniciar saldos.');
    } catch(e){setNotice(e.message || 'No se confirmó el cambio.');}
    finally{refresh();pending.current=false;setBusy(false);}
  }
  return <section className="section" aria-label="Promoción de lanzamiento">
    <h2>Promoción de lanzamiento</h2>
    <p>90 días desde una fecha común. Después decidís si extendés tres meses. Nunca se activan cobros automáticamente.</p>
    <p>Costo configurado para el lanzamiento: {promotion?.publication_cost ?? '—'} créditos por publicación. Recarga gratuita: {promotion?.auto_refill ? 'activada durante la promoción' : 'desactivada'}.</p>
    {!promotion?.revision && <form onSubmit={savePolicy}>
      <fieldset disabled={busy}>
        <legend>Consumo y recarga gratuita</legend>
        <label>Créditos por publicación <input type="number" min="1" max="1000000" step="1" required value={cost} onChange={e=>setCost(e.target.value)} /></label>
        <label><input type="checkbox" checked={refill} onChange={e=>setRefill(e.target.checked)} /> Reponer gratis el lote del vendedor cuando se agote o no alcance para publicar</label>
        <p>Guardar esta regla no inicia los 90 días ni cambia saldos. El costo queda fijo cuando comienza la campaña.</p>
      </fieldset>
      <button className="primary" disabled={busy || !promotion || Boolean(error)}>Guardar costo y recarga</button>
    </form>}
    {promotion?.ends_at && <p>Vigente hasta: {new Date(promotion.ends_at).toLocaleString('es-AR')}</p>}
    <form onSubmit={submit}>
      {!promotion?.revision && <fieldset disabled={busy}>
        <legend>Inicio y lote de créditos por vendedor</legend>
        <label>Fecha y hora de lanzamiento <input type="datetime-local" required value={starts} onChange={e=>setStarts(e.target.value)} /></label>
        {Object.keys(quotas).map(role=><label key={role}>{roleLabel(role)} <input type="number" min="1" max="1000000" step="1" required value={quotas[role]} onChange={e=>setQuotas({...quotas,[role]:e.target.value})} /></label>)}
        <p>El lote se acredita al comenzar o registrarse, y se usa en cada recarga si está activada. Los saldos históricos mayores se conservan.</p>
      </fieldset>}
      <button className="primary" disabled={busy || !promotion || Boolean(error)}>{busy?'Guardando…':promotion?.revision?'Extender tres meses gratis':'Configurar 90 días gratis'}</button>
    </form>
    {(error || notice) && <p role="status">{error || notice}</p>}
    <button type="button" onClick={refresh} disabled={busy}>Actualizar promoción</button>
  </section>;
}
