import {buildDescription,getPublicationQuality,validatePublicationStep} from '../publication/publication-quality.js';
import {validateVisitWindow} from '../agenda/visit-authorization-model.js';

// Browser-only fixtures. This adapter has no transport and is never an API or
// authorization boundary. Real permissions and concurrency are enforced in SQL.
export function createDemoSession({now=Date.now}={}) {
 const sellerId=crypto.randomUUID(),buyerId=crypto.randomUUID();
 let vehicle=null,conversation=null,authorizations=[],appointments=[],notices=[];
 const requests=new Map();
 const stamp=()=>new Date(now()).toISOString();
 const copy=value=>structuredClone(value);
 const localMinute=value=>{
  const d=new Date(value),pad=n=>String(n).padStart(2,'0');
  return Number.isFinite(d.getTime())?`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`:'';
 };
 function replaceVehicle(value){
  vehicle={...value,id:crypto.randomUUID(),image:'/vehicle-placeholder.svg',status:'active'};
  conversation={id:crypto.randomUUID(),vehicle_id:vehicle.id,buyer_id:buyerId,seller_id:sellerId,is_blocked:false};
  authorizations=[];appointments=[];notices=[];requests.clear();
 }
 function useExample(){
  replaceVehicle({brand:'Toyota',model:'Etios',version:'XLS',year:2018,km:78000,price:12500000,zone:'Mendoza',
   seller:'Vendedor de ejemplo',sellerType:'Demostración',quality:70,
   description:'Vehículo de ejemplo. El vendedor ficticio declara mantenimiento al día y detalles de pintura. No es una oferta real.',
   checklist:{motor:'bueno',caja:'buena',pintura:'detalles visibles',cubiertas:'media vida',choques:'no revisado'},
   acceptsTrade:true,acceptsFinancing:false,availableHours:'Usá Ver horarios autorizados para elegir y aceptar una visita de ejemplo.'});
  const start=new Date(now());start.setUTCDate(start.getUTCDate()+1);start.setUTCHours(18,0,0,0);
  authorizations.push({id:crypto.randomUUID(),vehicle_id:vehicle.id,owner_id:sellerId,request_id:crypto.randomUUID(),
   starts_at:start.toISOString(),ends_at:new Date(start.getTime()+7200000).toISOString(),duration_minutes:30,
   location:'Punto de encuentro de ejemplo · Mendoza',timezone:'America/Argentina/Mendoza',authorized_at:stamp(),revoked_at:null});
 }
 function publish({form,photoFiles=[],videoFile=null}){
  if(!validatePublicationStep(6,form,photoFiles))return false;
  replaceVehicle({brand:form.brand,model:form.model,version:form.version,year:Number(form.year),km:Number(form.kilometers),price:Number(form.price),zone:form.zone,
   description:form.description||buildDescription(form),checklist:copy(form.checklist),acceptsTrade:form.acceptsTrade,acceptsFinancing:form.acceptsFinancing,
   availableHours:form.availableHours,viewLocation:form.viewLocation,seller:'Vendedor de ejemplo',sellerType:'Demostración',
   quality:getPublicationQuality({form,photos:photoFiles,videoFile})});
  return true;
 }
 function available(){
  const slots=[];
  for(const a of authorizations.filter(a=>!a.revoked_at))for(let t=Date.parse(a.starts_at);t+a.duration_minutes*60000<=Date.parse(a.ends_at);t+=a.duration_minutes*60000){
   if(t<=now()||appointments.some(p=>t<Date.parse(p.scheduled_at)+p.duration_minutes*60000&&t+a.duration_minutes*60000>Date.parse(p.scheduled_at)))continue;
   slots.push({authorization_id:a.id,scheduled_at:new Date(t).toISOString(),duration_minutes:a.duration_minutes,location:a.location,timezone:a.timezone});
  }
  return slots.sort((a,b)=>Date.parse(a.scheduled_at)-Date.parse(b.scheduled_at)).slice(0,60);
 }
 const fail=()=>{throw Error('Solicitud no disponible en la demostración.');};
 function execute(role,name,args){
  const id=role==='seller'?sellerId:buyerId;
  if(name==='get_visit_notices')return notices.filter(n=>n.recipient_id===id);
  if(name==='read_visit_notice'){
   const n=notices.find(n=>n.id===args.target_notice&&n.recipient_id===id);if(!n)return fail();
   n.read_at ||= stamp();return n;
  }
  if(name==='get_available_visit_slots'){
   if(role!=='buyer'||(conversation&&args.target_conversation!==conversation.id))return fail();
   return available();
  }
  if(!vehicle)return fail();
  if(name==='get_visit_authorizations'){
   if(role!=='seller'||args.target_vehicle!==vehicle.id)return fail();return authorizations;
  }
  if(name==='revoke_visit_authorization'){
   const a=authorizations.find(a=>a.id===args.target_authorization);if(role!=='seller'||!a)return fail();a.revoked_at ||= stamp();return a;
  }
  if(name==='authorize_visit_window'){
   if(role!=='seller'||args.target_vehicle!==vehicle.id||!args.request_id)return fail();
   const valid=validateVisitWindow({start:localMinute(args.window_start),end:localMinute(args.window_end),duration:args.visit_minutes,location:args.meeting_location,consent:args.consent},now());
   if(valid.error)return fail();
   new Intl.DateTimeFormat('es-AR',{timeZone:args.display_timezone}).format(new Date(now()));
   const fingerprint=JSON.stringify([valid,args.display_timezone]);
   const old=authorizations.find(a=>a.request_id===args.request_id);
   if(old){if(old.fingerprint!==fingerprint)return fail();return old;}
   const active=authorizations.filter(a=>!a.revoked_at&&Date.parse(a.ends_at)>now());
   if(active.length>=20||active.some(a=>Date.parse(a.starts_at)<Date.parse(valid.window_end)&&Date.parse(a.ends_at)>Date.parse(valid.window_start)))return fail();
   const a={id:crypto.randomUUID(),vehicle_id:vehicle.id,owner_id:sellerId,request_id:args.request_id,starts_at:valid.window_start,ends_at:valid.window_end,
    duration_minutes:valid.visit_minutes,location:valid.meeting_location,timezone:args.display_timezone,authorized_at:stamp(),revoked_at:null,fingerprint};
   authorizations.push(a);return a;
  }
  if(name==='book_authorized_visit'){
   if(role!=='buyer'||args.target_conversation!==conversation.id||args.buyer_consent!==true||!args.booking_request_id)return fail();
   const fingerprint=JSON.stringify([args.target_conversation,args.target_authorization,args.slot_start]);
   const old=requests.get(args.booking_request_id);
   if(old){if(old.fingerprint!==fingerprint)return fail();return old.receipt;}
   const slot=available().find(s=>s.authorization_id===args.target_authorization&&s.scheduled_at===args.slot_start);
   if(!slot)return fail();
   const authorization=authorizations.find(a=>a.id===slot.authorization_id);
   const receipt={id:crypto.randomUUID(),conversation_id:conversation.id,buyer_id:buyerId,seller_id:sellerId,
    scheduled_at:slot.scheduled_at,duration_minutes:slot.duration_minutes,location:slot.location,status:'confirmed',confirmation_source:'seller_authorization',
    buyer_confirmed_at:stamp(),seller_confirmed_at:authorization.authorized_at};
   appointments.push(receipt);requests.set(args.booking_request_id,{fingerprint,receipt});
   for(const recipient_id of [sellerId,buyerId])notices.push({...receipt,id:crypto.randomUUID(),appointment_id:receipt.id,recipient_id,kind:'confirmed',
    vehicle_title:`${vehicle.brand} ${vehicle.model}`,buyer_name:'Comprador de ejemplo',timezone:slot.timezone,created_at:stamp(),read_at:null});
   return receipt;
  }
  return fail();
 }
 const client=role=>({rpc:async(name,args={})=>{
  try{return{data:copy(execute(role,name,args)),error:null};}catch{return{data:null,error:{message:'Solicitud no disponible en la demostración.'}};}
 }});
 return {get vehicle(){return copy(vehicle);},get conversation(){return copy(conversation)||{buyer_id:buyerId,seller_id:sellerId};},useExample,publish,buyer:client('buyer'),seller:client('seller')};
}
