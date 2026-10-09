"use client";
import {useRef,useState} from 'react';
import {parseVisitText} from './visit-text';
export default function VisitPlanner({onPropose,onClose,disabled=false}) {
  const [step,setStep]=useState(0);
  const [draft,setDraft]=useState({scheduledAt:'',durationMinutes:'',location:''});
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [proposalText,setProposalText]=useState('');
  const lock=useRef(false);
  const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  const prompts=['¿Qué día y a qué hora querés ver el vehículo?','¿Cuántos minutos necesitás para la visita?','¿Dónde proponés encontrarte?','Revisemos la propuesta antes de enviarla.'];
  function prepareText(){
    if(disabled||busy||lock.current)return;
    const prepared=parseVisitText(proposalText);
    const nextStep=!prepared.scheduledAt?0:!prepared.durationMinutes?1:!prepared.location?2:3;
    setDraft(prepared);setStep(nextStep);
    setNotice(nextStep===3?'Revisá los datos antes de enviar. La visita todavía no está propuesta.':'Faltan datos o hay algo ambiguo. Completá los campos para preparar la propuesta.');
  }
  async function submit(event) {
    event.preventDefault();if(disabled || lock.current)return;
    setNotice('');
    if(step===0 && (!Number.isFinite(Date.parse(draft.scheduledAt)) || Date.parse(draft.scheduledAt)<=Date.now())){setNotice('Elegí una fecha futura.');return;}
    if(step===1 && (!/^\d+$/.test(draft.durationMinutes) || Number(draft.durationMinutes)<1 || Number(draft.durationMinutes)>1440)){setNotice('Indicá una duración entre 1 y 1440 minutos.');return;}
    if(step===2 && !draft.location.trim()){setNotice('Indicá un lugar para que la otra persona pueda revisarlo.');return;}
    if(step<3){setStep(step+1);return;}
    lock.current=true;setBusy(true);
    try{if(await onPropose({...draft,location:draft.location.trim()}))onClose();else setNotice('No se confirmó la propuesta. Revisá el estado de la agenda antes de reintentar.');}
    catch{setNotice('No se confirmó la propuesta. Conservamos los datos para reintentar.');}
    finally{lock.current=false;setBusy(false);}
  }
  return <section className="visitPlanner" aria-label="Asistente de visitas">
    <h3>Coordinemos la visita</h3>
    <details><summary>Preparar una propuesta escribiendo</summary>
      <label>Escribí tu propuesta de visita<textarea maxLength="2000" disabled={disabled||busy} value={proposalText} onChange={e=>setProposalText(e.target.value)} placeholder="Mañana a las 15:30, durante 30 minutos, en la plaza" /></label>
      <p>Usá hora de 24 horas y una fecha completa, hoy o mañana. Si algo no queda claro, te pedimos completarlo. Este texto prepara los campos; no envía mensajes ni confirma visitas.</p>
      <button type="button" disabled={disabled||busy||!proposalText.trim()} onClick={prepareText}>Preparar propuesta desde el texto</button>
    </details>
    <p role="status">{prompts[step]}</p>
    <p>Hora local: {zone}. El horario se propone; la otra persona debe aceptar antes de la confirmación final.</p>
    <form onSubmit={submit}>
      {step===0 && <label>Fecha y hora de la visita<input type="datetime-local" required value={draft.scheduledAt} disabled={disabled || busy} onChange={e=>setDraft({...draft,scheduledAt:e.target.value})} /></label>}
      {step===1 && <label>Minutos para la visita<input type="number" min="1" max="1440" step="1" required value={draft.durationMinutes} disabled={disabled || busy} onChange={e=>setDraft({...draft,durationMinutes:e.target.value})} /></label>}
      {step===2 && <label>Lugar de encuentro<input maxLength="300" required value={draft.location} disabled={disabled || busy} onChange={e=>setDraft({...draft,location:e.target.value})} /></label>}
      {step===3 && <dl><dt>Fecha</dt><dd>{new Date(draft.scheduledAt).toLocaleString('es-AR')} ({zone})</dd><dt>Duración</dt><dd>{draft.durationMinutes} minutos</dd><dt>Lugar</dt><dd>{draft.location}</dd></dl>}
      {notice && <p role="alert">{notice}</p>}
      <button className="primary" disabled={disabled || busy}>{busy?'Enviando…':step===3?'Enviar propuesta':step===2?'Revisar propuesta':'Siguiente'}</button>
      {step>0 && <button type="button" disabled={busy} onClick={()=>setStep(step-1)}>Atrás</button>}
      <button type="button" disabled={busy} onClick={onClose}>Cerrar asistente</button>
    </form>
  </section>;
}
