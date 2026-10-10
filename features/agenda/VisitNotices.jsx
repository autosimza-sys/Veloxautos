"use client";

import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '../../lib/supabase-client';
import {formatAuthorizationTime} from './visit-authorization-model';

export default function VisitNotices(props){
 return props.userId?<NoticeList key={props.userId} {...props}/>:null;
}
function NoticeList({userId,client=supabase}){
 const [view,setView]=useState({rows:[],client:null}),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const scope=useRef(null);
 const refresh=useCallback(async()=>{
  const s=scope.current;if(!s?.active||s.client!==client||s.busy)return;
  const sequence=++s.sequence;
  try{
   const result=await client.rpc('get_visit_notices');
   if(!s.active||sequence!==s.sequence)return;
   if(result.error||!Array.isArray(result.data)||result.data.some(n=>n.recipient_id!==userId||!n.id||!n.appointment_id))throw Error('invalid notices');
   setView({rows:result.data,client});setError('');
  }catch{if(s.active&&sequence===s.sequence)setError('No pudimos actualizar los avisos. Volvé a intentar.');}
 },[client,userId]);
 useEffect(()=>{
  const s={active:true,client,sequence:0,busy:false};scope.current=s;
  const update=()=>{if(document.visibilityState!=='hidden')void refresh();};
  Promise.resolve().then(()=>{if(s.active)void refresh();});const timer=window.setInterval(update,30_000);
  window.addEventListener('focus',update);window.addEventListener('velox-visit-change',update);document.addEventListener('visibilitychange',update);
  return()=>{s.active=false;window.clearInterval(timer);window.removeEventListener('focus',update);window.removeEventListener('velox-visit-change',update);document.removeEventListener('visibilitychange',update);};
 },[client,refresh]);
 async function markRead(id){
  const s=scope.current;if(!s?.active||s.busy)return;s.busy=true;s.sequence++;setBusy(true);
  try{
   const {data,error:failure}=await client.rpc('read_visit_notice',{target_notice:id});
   if(!s.active)return;
   if(failure||data?.id!==id||!data.read_at)throw Error('no receipt');
   setView(v=>({...v,rows:v.rows.map(n=>n.id===id?{...n,read_at:data.read_at}:n)}));setError('');
  }catch{if(s.active)setError('No pudimos marcar el aviso como leído. Volvé a intentar.');}
  finally{s.busy=false;if(s.active)setBusy(false);}
 }
 const rows=view.client===client?view.rows:[],unread=rows.filter(n=>!n.read_at).length;
 return <section className="visitNotices" aria-label="Avisos de visitas">
  <h3>Avisos de visitas {unread>0&&<span>· {unread} sin leer</span>}</h3>
  <p>Los avisos quedan acá. Se actualizan mientras usás Velox.</p>
  <button className="secondary" type="button" disabled={busy||!client} onClick={refresh}>Actualizar avisos</button>
  {error&&<p role="alert">{error}</p>}
  {!error&&!rows.length&&<p>Todavía no tenés avisos de visitas.</p>}
  {rows.map(n=><article key={n.id} className="visitAuthorizationRecord">
   <strong>{n.status==='cancelled'?'Visita cancelada':'Visita confirmada'}{!n.read_at?' · Nuevo':''}</strong>
   <h4>{n.vehicle_title}</h4><p>Comprador: {n.buyer_name}</p>
   <p>{formatAuthorizationTime(n.scheduled_at,n.timezone)} · {n.timezone} · {n.duration_minutes} minutos</p><p>{n.location}</p>
   {n.kind==='confirmed'&&n.status==='cancelled'&&<p>La confirmación original quedó cancelada.</p>}
   {!n.read_at&&<button className="secondary" type="button" disabled={busy} onClick={()=>markRead(n.id)}>Marcar como leído</button>}
  </article>)}
  {rows.length===100&&<p>Mostramos los últimos 100 avisos. El historial de cada visita está en su conversación.</p>}
 </section>;
}
