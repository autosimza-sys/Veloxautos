"use client";
import {useEffect,useRef,useState} from 'react';
import {supabase} from '../../lib/supabase-client';

export default function SellerFaqPanel({vehicleId,client=supabase}) {
 const [open,setOpen]=useState(false);
 return <div className="sellerFaq"><button type="button" className="secondary" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>Preguntas pendientes del auto</button>
  {open && <SellerTasks key={vehicleId} vehicleId={vehicleId} client={client} />}
 </div>;
}
function SellerTasks({vehicleId,client}) {
 const [tasks,setTasks]=useState([]);const [status,setStatus]=useState('Cargando preguntas…');
 const [revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;
  Promise.resolve().then(()=>client.rpc('get_listing_faq_tasks',{target_vehicle:vehicleId})).then(({data,error})=>{
   if(!active)return;if(error || !Array.isArray(data)){setStatus('No pudimos cargar las preguntas.');return;}
   setTasks(data);setStatus(data.length?'':'No hay preguntas técnicas pendientes registradas para este auto.');
  }).catch(()=>{if(active)setStatus('No pudimos cargar las preguntas.');});
  return()=>{active=false;};
 },[client,vehicleId,revision]);
 return <section aria-label="Respuestas del vendedor">
  <p>Respondé sólo sobre este vehículo. La declaración se mostrará a quienes consulten esta unidad; no incluyas datos de compradores, teléfonos, direcciones exactas ni condiciones privadas.</p>
  {status && <p role="status">{status}</p>}
  <button type="button" onClick={()=>setRevision(v=>v+1)}>Actualizar preguntas</button>
  {tasks.map(task=><AnswerForm key={`${task.question_id}:${task.revision}`} task={task} vehicleId={vehicleId} client={client} onSaved={()=>setRevision(v=>v+1)} />)}
 </section>;
}
function AnswerForm({task,vehicleId,client,onSaved}) {
 const [state,setState]=useState(task.state==='pending'?'known':task.state);
 const [answer,setAnswer]=useState(task.answer||'');const [approved,setApproved]=useState(false);
 const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');const lock=useRef(false);
 async function submit(event){event.preventDefault();if(lock.current || !approved)return;
  lock.current=true;setBusy(true);setNotice('');
  try{const {data,error}=await client.rpc('answer_listing_faq',{target_vehicle:vehicleId,question_id:task.question_id,next_state:state,answer_text:answer,expected_revision:task.revision});
   if(error || data?.question_id!==task.question_id || data?.revision!==task.revision+1)throw Error('unconfirmed');
   setNotice('Declaración guardada. Se usará cuando vuelvan a consultar este dato; no se envió un aviso a compradores.');onSaved();
  }catch{setNotice('No se confirmó el cambio. Conservamos tu respuesta; actualizá para comprobar el estado antes de reintentar.');}
  finally{lock.current=false;setBusy(false);}
 }
 return <form className="faqAnswerForm" onSubmit={submit}>
  <h4>{task.question}</h4>
  <label>Qué sabés del dato<select disabled={busy} value={state} onChange={e=>{setState(e.target.value);setApproved(false);}}><option value="known">Lo conozco y lo declaro</option><option value="uncertain">Es incierto / necesita confirmación</option><option value="unknown">No lo sé</option></select></label>
  {state!=='unknown' && <label>Respuesta declarada<textarea maxLength={600} required disabled={busy} value={answer} onChange={e=>{setAnswer(e.target.value);setApproved(false);}} /></label>}
  <label><input type="checkbox" checked={approved} disabled={busy} onChange={e=>setApproved(e.target.checked)} />Confirmo que es información de esta unidad que autorizo a compartir en sus consultas.</label>
  <button className="primary" disabled={busy || !approved || (state!=='unknown'&&!answer.trim())}>{busy?'Guardando…':'Guardar respuesta para esta unidad'}</button>
  {notice && <p role="status">{notice}</p>}
 </form>;
}
