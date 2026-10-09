import {parseAppointmentTime} from './appointment-model';

// Conservative local convenience parser. It never books, accepts, calls a model,
// or fills an unstated duration/place. Every result goes through editable review.
export function parseVisitText(value,now=new Date()) {
  const draft={scheduledAt:'',durationMinutes:'',location:''};
  if(typeof value!=='string'||!value.trim()||value.length>2000||!Number.isFinite(now.getTime()))return draft;
  const text=value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  // Alternatives, corrections and negation need clarification, not first-match wins.
  if(/\b(no|ni|o|cancelar|cancela|en vez|mejor)\b/.test(text))return draft;
  const dates=[...text.matchAll(/\b(?:(\d{4})-(\d{2})-(\d{2})|(\d{1,2})\/(\d{1,2})\/(\d{4})|(hoy|manana))\b/g)];
  const times=[...text.matchAll(/\ba\s+las?\s+(\d{1,2}):(\d{2})\b/g)];
  const externalTime=/\b(utc|gmt|pasado manana)\b|\d{1,2}:\d{2}\s+de\s+\p{L}/u.test(text);
  if(dates.length===1&&times.length===1&&!externalTime){
    const date=dates[0];let y,m,d;
    if(date[7]){const local=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12);if(date[7]==='manana')local.setDate(local.getDate()+1);y=local.getFullYear();m=local.getMonth()+1;d=local.getDate();}
    else {y=Number(date[1]||date[6]);m=Number(date[2]||date[5]);d=Number(date[3]||date[4]);}
    const pad=n=>String(n).padStart(2,'0');
    const candidate=`${String(y).padStart(4,'0')}-${pad(m)}-${pad(d)}T${pad(times[0][1])}:${times[0][2]}`;
    const parsed=parseAppointmentTime(candidate);
    if(parsed&&parsed.getTime()>now.getTime())draft.scheduledAt=candidate;
  }
  const durations=[...text.matchAll(/(?:^|[^\d.,])(\d+)\s*(minutos?|mins?|horas?|h)(?!\p{L})/gu)];
  if(durations.length===1&&!/\b\d+\s*horas?\s+y\b/.test(text)){
    const minutes=Number(durations[0][1])*(durations[0][2].startsWith('h')?60:1);
    if(Number.isInteger(minutes)&&minutes>=1&&minutes<=1440)draft.durationMinutes=String(minutes);
  }
  const place=value.match(/\b(?:en\s+|lugar\s*:\s*)([^;\n]+)$/i)?.[1]?.trim().replace(/[.,]$/,'').trim();
  const hasSchedule=place&&/\b(hoy|mañana|a\s+las?|durante)\b|\d{1,2}:\d{2}|\d{1,2}\/\d{1,2}/i.test(place);
  if(place&&place.length<=300&&!hasSchedule&&!/^\d+\s*(minutos?|mins?|horas?|h)\b/i.test(place))draft.location=place;
  return draft;
}
