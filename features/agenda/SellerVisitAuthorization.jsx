"use client";
import {useEffect,useRef,useState} from 'react';
import {supabase} from '../../lib/supabase-client';
import {authorizationState,formatAuthorizationTime,validateVisitWindow} from './visit-authorization-model';

export default function SellerVisitAuthorization(props) {
 return <AuthorizationPanel key={props.vehicleId} {...props} />;
}
function AuthorizationPanel({vehicleId,client=supabase,listingActive=true}) {
 const [open,setOpen]=useState(false);
 return <div className="sellerFaq"><button type="button" className="secondary" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>Horarios del asistente</button>
  {open&&<AuthorizationEditor vehicleId={vehicleId} client={client} listingActive={listingActive} />}
 </div>;
}
const empty=()=>({start:'',end:'',duration:'',location:'',consent:false});
function AuthorizationEditor({vehicleId,client,listingActive}) {
 const [form,setForm]=useState(empty);const [rows,setRows]=useState([]);const [notice,setNotice]=useState('');
 const [loadError,setLoadError]=useState('');const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [revision,setRevision]=useState(0);
 const lock=useRef(false);const intent=useRef(null);const alive=useRef(false);
 const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{let active=true;
  Promise.resolve().then(()=>client.rpc('get_visit_authorizations',{target_vehicle:vehicleId})).then(({data,error})=>{
   if(!active)return;
   if(error||!Array.isArray(data)||data.some(r=>r.vehicle_id!==vehicleId))throw Error('unconfirmed');
   setRows(data);setLoadError('');setLoading(false);
  }).catch(()=>{if(active){setLoadError('No pudimos consultar los horarios. Actualizá antes de autorizar.');setLoading(false);}});
  return()=>{active=false;};
 },[client,vehicleId,revision]);
 function refresh(){setLoading(true);setRevision(v=>v+1);}
 function edit(key,value){setForm(v=>({...v,[key]:value,consent:key==='consent'?value:false}));intent.current=null;setNotice('');}
 async function save(event){event.preventDefault();if(lock.current||!listingActive||loading||loadError)return;
  const values=validateVisitWindow(form);if(values.error){setNotice(values.error);return;}
  lock.current=true;setBusy(true);setNotice('');
  try{
   intent.current ||= crypto.randomUUID();
   const {data,error}=await client.rpc('authorize_visit_window',{target_vehicle:vehicleId,...values,display_timezone:timezone,consent:true,request_id:intent.current});
   if(error||data?.vehicle_id!==vehicleId||data?.request_id!==intent.current||!data?.authorized_at||!data?.id)throw Error('unconfirmed');
   if(!alive.current)return;
   setNotice(data.revoked_at?'Ese intento ya fue revocado. No se reactivó el permiso.':'Autorización guardada. Todavía no se creó ninguna visita ni se envió un aviso.');
   setForm(empty());intent.current=null;refresh();
  }catch{if(alive.current)setNotice('No se confirmó el guardado. Conservamos tus datos; podés actualizar para comprobarlo o reintentar sin duplicar.');}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 async function revoke(row){if(lock.current)return;lock.current=true;setBusy(true);setNotice('');
  try{const {data,error}=await client.rpc('revoke_visit_authorization',{target_authorization:row.id});
   if(error||data?.id!==row.id||data?.vehicle_id!==vehicleId||!data?.revoked_at)throw Error('unconfirmed');
   if(alive.current){setNotice('Autorización revocada. Esto no cancela visitas que ya estuvieran acordadas.');refresh();}
  }catch{if(alive.current)setNotice('No se confirmó la revocación. Actualizá y comprobá el estado antes de reintentar.');}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <section aria-label="Disponibilidad autorizada del vendedor" className="visitAuthorization">
  <h4>Prepará la agenda de tu asistente</h4>
  <p>Elegí una fecha concreta y un horario. Los horarios escritos en la ficha no autorizan reservas por sí solos.</p>
  <p>El comprador puede elegir un horario libre y confirmar la visita con tu autorización. El aviso queda en Mis conversaciones, dentro de Velox.</p>
  <p>Zona horaria para cargar: {timezone}. El lugar se guarda de forma privada y queda autorizado para compartirse con el comprador al acordar una visita.</p>
  <button type="button" className="secondary" onClick={refresh} disabled={busy||loading}>Actualizar horarios</button>
  {loading&&<p role="status">Cargando horarios…</p>}{loadError&&<p role="alert">{loadError}</p>}
  {!listingActive&&<p>Activá la publicación para autorizar nuevos horarios. Podés revocar los anteriores.</p>}
  <form className="faqAnswerForm" onSubmit={save}>
   <fieldset disabled={busy||loading||!!loadError||!listingActive} className="visitAuthorizationFields">
    <legend>Nuevo horario autorizado</legend>
    <div className="formGrid"><label>Desde<input type="datetime-local" required value={form.start} onChange={e=>edit('start',e.target.value)} /></label>
    <label>Hasta<input type="datetime-local" required value={form.end} onChange={e=>edit('end',e.target.value)} /></label></div>
    <p>Cada franja puede abarcar hasta 24 horas. Podés tener hasta 20 franjas vigentes por auto.</p>
    <label>Duración de cada visita (minutos)<input type="number" min="1" max="1440" step="1" required value={form.duration} onChange={e=>edit('duration',e.target.value)} /></label>
    <label>Lugar de encuentro<input type="text" maxLength={300} required value={form.location} onChange={e=>edit('location',e.target.value)} /></label>
    <label className="visitAuthorizationConsent"><input type="checkbox" checked={form.consent} onChange={e=>edit('consent',e.target.checked)} />Autorizo al asistente a acordar visitas para este auto dentro de esta franja, con esta duración y lugar, sin pedirme confirmación en cada caso.</label>
    <button className="primary" disabled={!form.consent||busy} type="submit">{busy?'Guardando…':'Autorizar horario'}</button>
   </fieldset>
  </form>
  {!loading&&!loadError&&!rows.length&&<p>Todavía no autorizaste horarios para este auto.</p>}
  {rows.map(row=><article className="visitAuthorizationRecord" key={row.id}>
   <strong>{authorizationState(row)}</strong><p>{formatAuthorizationTime(row.starts_at,row.timezone)} a {formatAuthorizationTime(row.ends_at,row.timezone)} · {row.timezone}</p>
   <p>{row.duration_minutes} minutos por visita · {row.location}</p>
   <small>Autorizada el {formatAuthorizationTime(row.authorized_at,row.timezone)}</small>
   {row.revoked_at&&<small>Revocada el {formatAuthorizationTime(row.revoked_at,row.timezone)}</small>}
   {!row.revoked_at&&<button className="secondary" type="button" disabled={busy||loading||!!loadError} onClick={()=>revoke(row)}>Revocar autorización</button>}
  </article>)}
  <p>Revocar un horario impide nuevas reservas con ese permiso; no cancela visitas ya acordadas. Para corregirlo, revocalo y cargá uno nuevo.</p>
  {notice&&<p role="status">{notice}</p>}
 </section>;
}
