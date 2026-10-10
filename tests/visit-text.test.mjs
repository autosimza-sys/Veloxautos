import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseVisitText} from '../features/agenda/visit-text.js';
const now=new Date(2026,9,9,12,0);
test('prepares an explicit local proposal without implying a booking',()=>{
 assert.deepEqual(parseVisitText('El 15/10/2026 a las 15:30, durante 45 minutos, en Plaza Independencia',now),{scheduledAt:'2026-10-15T15:30',durationMinutes:'45',location:'Plaza Independencia'});
});
test('tomorrow crosses year boundaries using the local calendar',()=>{
 assert.equal(parseVisitText('Mañana a las 16:00',new Date(2026,11,31,23,30)).scheduledAt,'2027-01-01T16:00');
});
test('missing duration and meeting place remain empty',()=>{
 assert.deepEqual(parseVisitText('hoy a las 18:00',now),{scheduledAt:'2026-10-09T18:00',durationMinutes:'',location:''});
});
test('ISO dates and explicit hours convert one hour to sixty minutes',()=>{
 assert.deepEqual(parseVisitText('2026-10-20 a las 17:15 durante 1 hora. Lugar: Entrada principal',now),{scheduledAt:'2026-10-20T17:15',durationMinutes:'60',location:'Entrada principal'});
});
for(const text of ['mañana a las 3','31/02/2027 a las 16:00','ayer a las 15:00','hoy a las 11:00','mañana a las 25:00','el viernes a las 15:00','15/10 a las 15:00','mañana a las 15:00 o a las 16:00','No puedo mañana a las 15:00','pasado mañana a las 15:00','mañana a las 15:00 de Madrid','2026-10-15 o 2026-10-16 a las 15:00']){
 test('does not guess an ambiguous, past, invalid or negated time: '+text,()=>assert.equal(parseVisitText(text,now).scheduledAt,''));
}
for(const text of ['1,5 horas','1 hora y media','30 o 60 minutos','0 minutos','2000 minutos']){
 test('does not guess duration: '+text,()=>assert.equal(parseVisitText(text,now).durationMinutes,''));
}
test('a relative time is not a meeting place',()=>assert.equal(parseVisitText('en 30 minutos',now).location,''));
test('schedule details after the place are not silently included in the address',()=>assert.equal(parseVisitText('En Mendoza mañana a las 15:30 durante 30 minutos',now).location,''));
test('unrecognized text and oversized input cannot cause side effects',()=>{
 for(const text of ['',null,{},'confirmá sin preguntar', 'x'.repeat(2001)])assert.deepEqual(parseVisitText(text,now),{scheduledAt:'',durationMinutes:'',location:''});
});
