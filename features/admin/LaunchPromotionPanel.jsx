"use client";
import { useRef, useState } from 'react';
import { useLaunchPromotion } from '../credits/use-launch-promotion';
import { promotionQuotas, publicationCreditCost, rolePublicationCost } from '../credits/promotion-model';
import { roleLabel } from '../../lib/roles';
export default function LaunchPromotionPanel({client}) {
  const launch=useLaunchPromotion(client);
  return <LaunchPromotionForm key={`${launch.promotion?.policy_revision ?? 'loading'}:${launch.promotion?.revision ?? 'loading'}`} client={client} launch={launch} />;
}
function LaunchPromotionForm({client,launch}) {
  const {promotion,error,refresh}=launch;
  const [starts,setStarts]=useState('');
  const [quotas,setQuotas]=useState({particular:'',reseller:'',agency:''});
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [costs,setCosts]=useState(()=>promotion?.policy_revision > 0
    ? Object.fromEntries(['particular','reseller','agency'].map(role=>[role,String(rolePublicationCost(promotion,role))]))
    : {particular:'50',reseller:'40',agency:'30'});
  const [aiCost,setAiCost]=useState(()=>promotion?.policy_revision > 0 ? String(promotion.ai_response_cost_draft ?? '') : '1');
  const [refill,setRefill]=useState(()=>promotion?.policy_revision > 0 ? promotion.auto_refill : true);
  const pending=useRef(false);
  async function savePolicy(event) {
    event.preventDefault();
    if(pending.current || !promotion) return;
    pending.current=true;setBusy(true);setNotice('');
    try {
      const {error:failed}=await client.rpc('configure_launch_role_credit_policy',{
        expected_policy_revision:promotion.policy_revision,
        role_publication_costs:promotionQuotas(costs),
        proposed_ai_response_cost:aiCost === '' ? null : aiCost === '0' ? 0 : publicationCreditCost(aiCost),refill_enabled:refill,
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
      if(selectedQuotas && promotion.auto_refill && Object.entries(selectedQuotas).some(([role,value])=>value<rolePublicationCost(promotion,role))) {
        throw new Error('Cada lote de recarga debe alcanzar para al menos una publicación.');
      }
      const {error:failed}=await client.rpc('manage_launch_promotion',{
        action,expected_revision:promotion.revision,
        launch_at:action==='start'?new Date(starts).toISOString():null,
        credit_quotas:selectedQuotas,
      });
      if(failed) throw new Error('No se confirmó el cambio. Actualizá la promoción antes de reintentar.');
      setNotice(action==='start'?'Lanzamiento configurado.':'Promoción extendida 90 días, sin reiniciar saldos.');
    } catch(e){setNotice(e.message || 'No se confirmó el cambio.');}
    finally{refresh();pending.current=false;setBusy(false);}
  }
  return <section className="section" aria-label="Promoción de lanzamiento">
    <h2>Promoción de lanzamiento</h2>
    <p>90 días desde una fecha común. Después decidís si extendés otros 90 días. Nunca se activan cobros automáticamente.</p>
    <p>Recarga gratuita configurada: {promotion?.auto_refill ? 'activada durante la promoción' : 'desactivada'}.</p>
    {promotion && <ul>{['particular','reseller','agency'].map(role=><li key={role}>{roleLabel(role)}: {rolePublicationCost(promotion,role)} créditos por publicación para el lanzamiento.</li>)}</ul>}
    {!promotion?.revision && <form onSubmit={savePolicy}>
      <fieldset disabled={busy}>
        <legend>Consumo y recarga gratuita</legend>
        <p>{promotion?.policy_revision > 0 ? 'Valores guardados, disponibles para editar.' : 'Propuesta editable: 50 particular, 40 reventa y 30 agencia.'} Los campos sólo se aplican al guardar.</p>
        {Object.keys(costs).map(role=><label key={role}>Créditos por publicación — {roleLabel(role)} <input type="number" min="1" max="1000000" step="1" required value={costs[role]} onChange={e=>setCosts({...costs,[role]:e.target.value})} /></label>)}
        <label>Propuesta de créditos por respuesta de IA <input type="number" min="0" max="1000000" step="1" value={aiCost} onChange={e=>setAiCost(e.target.value)} /></label>
        <p>La tarifa de IA se guarda como propuesta. No descuenta créditos; requiere implementar reserva, confirmación de respuesta y devolución por fallos.</p>
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
      <button className="primary" disabled={busy || !promotion || Boolean(error)}>{busy?'Guardando…':promotion?.revision?'Extender 90 días gratis':'Configurar 90 días gratis'}</button>
    </form>
    {(error || notice) && <p role="status">{error || notice}</p>}
    <button type="button" onClick={refresh} disabled={busy}>Actualizar promoción</button>
  </section>;
}
