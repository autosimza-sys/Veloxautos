import {parseAppointmentTime,parseAppointmentDuration} from './appointment-model';

export function validateVisitWindow(form,now=Date.now()) {
 const start=parseAppointmentTime(form.start),end=parseAppointmentTime(form.end);
 if(!start||!end||start.getTime()<=now||end<=start||end-start>86400000)return{error:'Elegí un horario futuro y una franja de hasta 24 horas.'};
 const duration=parseAppointmentDuration(form.duration);
 if(!duration||duration>1440||duration*60000>end-start)return{error:'Indicá una duración en minutos enteros que entre en la franja.'};
 if(typeof form.location!=='string'||!form.location.trim()||form.location.trim().length>300)return{error:'Indicá un lugar de encuentro de hasta 300 caracteres.'};
 if(form.consent!==true)return{error:'Revisá los datos y autorizá expresamente este horario.'};
 return{window_start:start.toISOString(),window_end:end.toISOString(),visit_minutes:duration,meeting_location:form.location.trim()};
}

export function authorizationState(row,now=Date.now()) {
 if(row.revoked_at)return 'Revocada';
 if(new Date(row.ends_at).getTime()<=now)return 'Vencida';
 return 'Autorizada';
}

export function formatAuthorizationTime(value,timezone) {
 try{return new Date(value).toLocaleString('es-AR',{dateStyle:'medium',timeStyle:'short',timeZone:timezone});}
 catch{return 'Fecha o zona horaria no disponible';}
}
