"use client";

import {useEffect,useRef,useState} from 'react';
import {appointmentRequest} from './appointment-request';
import {formatAuthorizationTime} from './visit-authorization-model';

export default function AuthorizedVisitBooking(props){
 if(!props.userId||props.userId!==props.conversation?.buyer_id||props.conversation?.is_blocked)return null;
 return <Booking key={`${props.userId}:${props.conversation.id}`} {...props}/>;
}
function Booking({conversation,userId,client,onBooked}){
 const [open,setOpen]=useState(false),[slots,setSlots]=useState([]),[selected,setSelected]=useState(null);
 const [consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [loaded,setLoaded]=useState(false),[receipt,setReceipt]=useState(null);
 const scope=useRef(null);
 useEffect(()=>{const value={active:true,busy:false,client};scope.current=value;return()=>{value.active=false;};},[client]);
 function current(s){return s?.active&&scope.current===s&&s.client===client;}
 async function load(){
  const s=scope.current;if(!current(s)||s.busy)return;
  s.busy=true;setBusy(true);setOpen(true);setNotice('');setSelected(null);setConsent(false);setReceipt(null);setLoaded(false);setSlots([]);
  try{
   const {data,error}=await client.rpc('get_available_visit_slots',{target_conversation:conversation.id});
   if(!current(s))return;
   if(error||!Array.isArray(data)||data.some(r=>!r.authorization_id||!Number.isFinite(Date.parse(r.scheduled_at))||!Number.isInteger(r.duration_minutes)||r.duration_minutes<1||typeof r.location!=='string'||typeof r.timezone!=='string'))throw Error('invalid slots');
   setSlots(data);setLoaded(true);
  }catch{if(current(s))setNotice('No pudimos cargar los horarios. Actualizá para volver a intentar.');}
  finally{s.busy=false;if(current(s))setBusy(false);}
 }
 async function book(e){
  e.preventDefault();const s=scope.current;if(!current(s)||s.busy||!consent||!selected)return;
  s.busy=true;setBusy(true);setNotice('');
  try{
   const request=await appointmentRequest({userId,conversationId:conversation.id,scheduledAt:selected.scheduled_at,durationMinutes:selected.duration_minutes,location:`authorized:${selected.authorization_id}`},undefined,{isCurrent:()=>current(s)});
   if(!request||!current(s))return;
   const {data,error}=await client.rpc('book_authorized_visit',{target_conversation:conversation.id,target_authorization:selected.authorization_id,slot_start:selected.scheduled_at,buyer_consent:true,booking_request_id:request.id});
   if(!current(s))return;
   if(error||!data?.id||data.conversation_id!==conversation.id||data.buyer_id!==userId||data.seller_id!==conversation.seller_id||data.confirmation_source!=='seller_authorization'||!['confirmed','cancelled'].includes(data.status)||!data.buyer_confirmed_at||!data.seller_confirmed_at||Date.parse(data.scheduled_at)!==Date.parse(selected.scheduled_at)||data.duration_minutes!==selected.duration_minutes||data.location!==selected.location)throw Error('unverified receipt');
   request.complete();setReceipt({...data,timezone:selected.timezone});setSelected(null);setConsent(false);
   setNotice(data.status==='confirmed'?'Visita confirmada. El vendedor tiene el aviso en Velox.':'Esta visita ya fue cancelada. No se creó otra reserva.');
   window.dispatchEvent(new window.Event('velox-visit-change'));
   try{await onBooked?.();}catch{/* Secondary refresh cannot undo the receipt. */}
  }catch{if(current(s))setNotice('No pudimos confirmar la reserva. Revisá la agenda y reintentá con este horario para recuperar el resultado, o actualizá los horarios si ya no está disponible.');}
  finally{s.busy=false;if(current(s))setBusy(false);}
 }
 return <section className="visitPlanner" aria-label="Reservar un horario autorizado" aria-busy={busy}>
  <h3>Elegí cuándo ver el auto</h3><p>El vendedor ya autorizó estos horarios. Cuando aceptás uno disponible, la visita queda confirmada.</p>
  <button type="button" className="primary" disabled={busy||!client} onClick={load}>{open?'Actualizar horarios disponibles':'Ver horarios autorizados'}</button>
  {open&&<>
   {busy&&!selected&&<p role="status">Consultando…</p>}
   {loaded&&!slots.length&&!receipt&&<p>No hay horarios libres autorizados. Podés enviar una propuesta desde Coordinar visita.</p>}
   {!selected&&!receipt&&<div className="visitSlots">{slots.map(slot=><button className="secondary" type="button" key={`${slot.authorization_id}:${slot.scheduled_at}`} disabled={busy} onClick={()=>{setSelected(slot);setConsent(false);setNotice('');}}>
    Elegir horario: {formatAuthorizationTime(slot.scheduled_at,slot.timezone)} · {slot.duration_minutes} min · {slot.timezone}
   </button>)}</div>}
   {slots.length===60&&!selected&&<p>Mostramos los próximos 60 horarios libres.</p>}
   {selected&&<form onSubmit={book}>
    <h4>Revisá tu visita</h4><p>{formatAuthorizationTime(selected.scheduled_at,selected.timezone)} · {selected.timezone}</p>
    <p>{selected.duration_minutes} minutos · {selected.location}</p>
    <label className="visitAuthorizationConsent"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>Confirmo que voy a asistir en este horario y lugar.</label>
    <button className="primary" type="submit" disabled={!consent||busy}>{busy?'Confirmando…':'Confirmar esta visita'}</button>
    <button className="secondary" type="button" disabled={busy} onClick={()=>{setSelected(null);setConsent(false);setNotice('');}}>Elegir otro horario</button>
   </form>}
   {receipt&&<p>{formatAuthorizationTime(receipt.scheduled_at,receipt.timezone)} · {receipt.timezone} · {receipt.duration_minutes} minutos · {receipt.location}</p>}
  </>}
  {notice&&<p role="status">{notice}</p>}
 </section>;
}
