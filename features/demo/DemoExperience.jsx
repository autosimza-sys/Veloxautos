"use client";

import {useState} from 'react';
import Link from 'next/link';
import PublicationAssistant from '../publication/PublicationAssistant';
import SalesAssistantSection from '../sales-assistant/SalesAssistantSection';
import SellerVisitAuthorization from '../agenda/SellerVisitAuthorization';
import AuthorizedVisitBooking from '../agenda/AuthorizedVisitBooking';
import VisitNotices from '../agenda/VisitNotices';
import {createDemoSession} from './demo-session';

export default function DemoExperience(){
 const [session,setSession]=useState(null);
 return <>
  <header className="demoHeader"><Link className="brand" href="/" prefetch={false}><span className="mark">VX</span>VELOX</Link><span className="demoBadge">DEMOSTRACIÓN</span><Link href="/preguntas" prefetch={false}>Las 240 preguntas →</Link></header>
  <main className="demoPage">
   <div className="demoIntro"><p className="eyebrow">Menos consultas. Más visitas.</p><h1>Probá el recorrido de Velox.</h1>
    <p>Prepará un auto, preguntá como comprador y recibí el aviso de una visita como vendedor.</p></div>
   <aside className="demoDisclosure" aria-label="Alcance de la demostración"><strong>Todo lo que hagas acá es una simulación.</strong>
    <p>Datos de ejemplo, reservas y avisos sólo en esta pestaña. No se publican autos reales, no se envían mensajes ni se consumen créditos. Al recargar o reiniciar, se borra el recorrido.</p>
    <p>La IA generativa está apagada. Podés probar respuestas automáticas con los datos de la ficha; si falta información, se pide al vendedor.</p></aside>
   {!session?<section className="demoWelcome"><h2>De la publicación al encuentro.</h2><ol><li><b>Vendedor:</b> prepara la ficha, el auto check y los horarios.</li><li><b>Comprador:</b> resuelve sus dudas y acepta una visita.</li><li><b>Vendedor:</b> recibe el aviso dentro de Velox.</li></ol><button className="primary" onClick={()=>setSession(createDemoSession())}>Empezar demostración</button></section>
    :<DemoJourney key={session.conversation.buyer_id} session={session} onReset={()=>setSession(createDemoSession())}/>}
   <footer className="demoFooter">Promoción prevista: 90 días desde una fecha común de lanzamiento. Fecha y cupos por definir. Sin cobros automáticos.</footer>
  </main>
 </>;
}

function DemoJourney({session,onReset}){
 const [step,setStep]=useState('seller'),[role,setRole]=useState('particular'),[formOpen,setFormOpen]=useState(false),[revision,setRevision]=useState(0);
 const [message,setMessage]=useState('');
 const vehicle=session.vehicle,conversation=session.conversation;
 function example(){session.useExample();setRevision(v=>v+1);setMessage('Publicación de ejemplo lista. Incluye una franja autorizada de prueba para mañana, de 15 a 17 h de Mendoza, con visitas de 30 minutos.');setFormOpen(false);}
 async function publish(value){
  const result=session.publish(value);
  if(result){setRevision(v=>v+1);setMessage('Publicación simulada creada. Tus archivos no se subieron. Ahora podés autorizar un horario y probar como comprador.');}
  return result;
 }
 return <div className="demoJourney">
  <nav className="demoSteps" aria-label="Pasos de la demostración">
   <button aria-pressed={step==='seller'} onClick={()=>setStep('seller')}><span>01</span>Preparar el auto</button>
   <button disabled={!vehicle} aria-pressed={step==='buyer'} onClick={()=>setStep('buyer')}><span>02</span>Consultar y reservar</button>
   <button disabled={!vehicle} aria-pressed={step==='notice'} onClick={()=>setStep('notice')}><span>03</span>Ver el aviso</button>
  </nav>
  <div className="demoToolbar"><span>Recorrido de ejemplo · sin registro</span><button className="secondary" onClick={onReset}>Reiniciar demostración</button></div>
  {step==='seller'&&<section aria-label="Preparar el auto de ejemplo">
   <div className="demoCard"><p className="eyebrow">01 · Vendedor</p><h2>Tu auto alimenta al asistente.</h2><p>Los datos, las condiciones y el auto check le permiten responder las consultas habituales.</p>
    <label className="demoRole">Tipo de vendedor<select value={role} onChange={e=>setRole(e.target.value)}><option value="particular">Particular</option><option value="reseller">Reventa</option><option value="agency">Agencia</option></select></label>
    <div className="demoActions"><button className="primary" onClick={example}>Usar publicación de ejemplo</button><button className="secondary" aria-expanded={formOpen} onClick={()=>setFormOpen(v=>!v)}>Probar formulario de publicación</button></div>
    <p className="demoHint">El ejemplo incluye un Toyota Etios ficticio y una franja autorizada por su vendedor ficticio. Podés revisar o revocar esa autorización debajo.</p>
    {message&&<p role="status">{message}</p>}
   </div>
   {formOpen&&<div className="demoForm"><p className="demoDisclosure">Formulario real en modo demostración. Las fotos se previsualizan en tu navegador; no se suben. No cargues datos personales.</p>
    <PublicationAssistant key={`form:${role}`} profile={{id:conversation.seller_id,role}} canPublish={true} onPublish={publish}/></div>}
   {vehicle&&<><VehicleSummary vehicle={vehicle}/><div className="demoCard"><SellerVisitAuthorization key={vehicle.id} vehicleId={vehicle.id} client={session.seller}/></div><button className="primary" onClick={()=>setStep('buyer')}>Continuar como comprador →</button></>}
  </section>}
  {step==='buyer'&&vehicle&&<section aria-label="Comprar en la demostración"><div className="demoCard"><p className="eyebrow">02 · Comprador</p><h2>Preguntá. Elegí un horario. Aceptá.</h2><p>Estas respuestas usan los datos del auto de ejemplo. Una pregunta no reserva: tenés que revisar y aceptar la visita.</p></div>
   <SalesAssistantSection key={vehicle.id} vehicle={vehicle}/>
   <div className="demoCard"><AuthorizedVisitBooking key={vehicle.id} conversation={conversation} userId={conversation.buyer_id} client={session.buyer} onBooked={()=>setRevision(v=>v+1)}/></div>
   <button className="primary" onClick={()=>setStep('notice')}>Ver qué recibe el vendedor →</button>
  </section>}
  {step==='notice'&&<section aria-label="Vendedor recibe aviso"><div className="demoCard"><p className="eyebrow">03 · Vendedor</p><h2>Ahora toca mostrar el auto.</h2><p>La visita acordada aparece dentro de Velox, con el comprador, el horario y el lugar. Acordar una visita no garantiza la venta.</p>
    <VisitNotices key={`notice:${revision}`} userId={conversation.seller_id} client={session.seller}/>
   </div><button className="secondary" onClick={()=>setStep('buyer')}>Volver al comprador</button></section>}
 </div>;
}
function VehicleSummary({vehicle}){
 return <article className="demoCard demoVehicle"><img src="/vehicle-placeholder.svg" alt="Ilustración de vehículo de ejemplo"/><div><p className="eyebrow">Publicación de ejemplo · no está a la venta</p><h3>{vehicle.brand} {vehicle.model}</h3><p>{vehicle.version} · {vehicle.year} · {vehicle.km.toLocaleString('es-AR')} km · {vehicle.zone}</p><strong>${vehicle.price.toLocaleString('es-AR')} · precio ficticio en ARS</strong><p>{vehicle.description}</p>
  <details><summary>Ver auto check declarado</summary><p>Es una declaración del vendedor, no una revisión profesional.</p><dl>{Object.entries(vehicle.checklist).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></details></div></article>;
}
