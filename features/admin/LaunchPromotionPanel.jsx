"use client";
import { useRef, useState } from 'react';
import { useLaunchPromotion } from '../credits/use-launch-promotion';
import { promotionQuotas } from '../credits/promotion-model';
import { roleLabel } from '../../lib/roles';
export default function LaunchPromotionPanel({client}) {
  const {promotion,error,refresh}=useLaunchPromotion(client);
  const [starts,setStarts]=useState('');
  const [quotas,setQuotas]=useState({particular:'',reseller:'',agency:''});
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const pending=useRef(false);
  async function submit(event) {
    event.preventDefault();
    if(pending.current || !promotion) return;
    pending.current=true;setBusy(true);setNotice('');
    try {
      const action=promotion.revision?'extend':'start';
      const {error:failed}=await client.rpc('manage_launch_promotion',{
        action,expected_revision:promotion.revision,
        launch_at:action==='start'?new Date(starts).toISOString():null,
        credit_quotas:action==='start'?promotionQuotas(quotas):null,
      });
      if(failed) throw new Error('No se confirmó el cambio. Actualizá la promoción antes de reintentar.');
      setNotice(action==='start'?'Lanzamiento configurado.':'Promoción extendida tres meses, sin reiniciar saldos.');
    } catch(e){setNotice(e.message || 'No se confirmó el cambio.');}
    finally{refresh();pending.current=false;setBusy(false);}
  }
  return <section className="section" aria-label="Promoción de lanzamiento">
    <h2>Promoción de lanzamiento</h2>
    <p>90 días desde una fecha común. Después decidís si extendés tres meses. Nunca se activan cobros automáticamente.</p>
    {promotion?.ends_at && <p>Vigente hasta: {new Date(promotion.ends_at).toLocaleString('es-AR')}</p>}
    <form onSubmit={submit}>
      {!promotion?.revision && <fieldset disabled={busy}>
        <legend>Inicio y créditos por vendedor</legend>
        <label>Fecha y hora de lanzamiento <input type="datetime-local" required value={starts} onChange={e=>setStarts(e.target.value)} /></label>
        {Object.keys(quotas).map(role=><label key={role}>{roleLabel(role)} <input type="number" min="1" max="1000000" step="1" required value={quotas[role]} onChange={e=>setQuotas({...quotas,[role]:e.target.value})} /></label>)}
      </fieldset>}
      <button className="primary" disabled={busy || !promotion || Boolean(error)}>{busy?'Guardando…':promotion?.revision?'Extender tres meses gratis':'Configurar 90 días gratis'}</button>
    </form>
    {(error || notice) && <p role="status">{error || notice}</p>}
    <button type="button" onClick={refresh} disabled={busy}>Actualizar promoción</button>
  </section>;
}
