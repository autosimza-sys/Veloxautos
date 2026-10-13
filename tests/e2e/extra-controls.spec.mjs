import { test, expect } from '@playwright/test';
import { installExtraApi, login, logout, id } from './extra-api.mjs';
let api;
test.beforeEach(async ({ page }) => { api = await installExtraApi(page); });
test.afterEach(() => {
  expect(api.violations).toEqual([]);
  expect(api.pageErrors).toEqual([]);
  expect(api.aiCalls, 'All tested answers used mocked automatic FAQ; no model calls').toBe(0);
});
async function openInbox(page, profile = api.buyer) {
  await login(page, profile);
  await page.locator('#conversaciones').getByRole('button', { name: /Abrir conversación/ }).click();
  const chat = page.getByRole('dialog', { name: 'Chat interno VELOX' });
  await expect(chat.getByRole('textbox', { name: 'Escribir mensaje' })).toBeEnabled();
  return chat;
}

test('gallery navigates thumbnails arrows dots keyboard and closes with Escape and button', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.galleryThumb')).toHaveCount(3);
  await page.locator('.galleryThumb').nth(1).click();
  const box = page.locator('.galleryLightbox');
  await expect(box.locator('.lightboxCounter')).toHaveText('2 / 3');
  await box.locator('.lightboxNext').click(); await expect(box.locator('.lightboxCounter')).toHaveText('3 / 3');
  await box.locator('.lightboxNext').click(); await expect(box.locator('.lightboxCounter')).toHaveText('1 / 3');
  await box.locator('.lightboxPrev').click(); await expect(box.locator('.lightboxCounter')).toHaveText('3 / 3');
  await box.locator('.lightboxDot').nth(1).click(); await expect(box.locator('.lightboxCounter')).toHaveText('2 / 3');
  await page.keyboard.press('ArrowLeft'); await expect(box.locator('.lightboxCounter')).toHaveText('1 / 3');
  await page.keyboard.press('ArrowRight'); await expect(box.locator('.lightboxCounter')).toHaveText('2 / 3');
  await page.keyboard.press('Escape'); await expect(box).toHaveCount(0);
  await page.locator('.galleryMain').click(); await box.locator('.lightboxClose').click();
  await expect(box).toHaveCount(0);
});

test('authenticated price and kilometer filters combine clear and show empty states', async ({ page }) => {
  await page.goto('/'); await login(page, api.buyer);
  const catalog = page.locator('#catalogo'), cards = catalog.locator('.vehicleCard');
  await expect(cards).toHaveCount(10);
  await catalog.getByRole('button', { name: 'Filtrar', exact: true }).click();
  const price = catalog.getByRole('combobox', { name: 'Precio', exact: true });
  const km = catalog.getByRole('combobox', { name: 'Kilómetros', exact: true });
  await expect(price).toBeEnabled(); await expect(km).toBeEnabled();
  await price.selectOption('0'); await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('10.000 km');
  await km.selectOption('2'); await expect(cards).toHaveCount(0);
  await catalog.getByRole('button', { name: 'Limpiar filtros' }).click();
  await expect(cards).toHaveCount(10);
  await km.selectOption('0'); await expect(cards).toHaveCount(2);
  await catalog.getByRole('combobox', { name: 'Año', exact: true }).selectOption('2021');
  await expect(cards).toHaveCount(1);
  await catalog.getByRole('button', { name: 'Limpiar filtros' }).click();
  await catalog.getByLabel('Buscar vehículos').fill('NO EXISTE');
  await catalog.locator('.searchClear').click(); await expect(cards).toHaveCount(10);
});

test('chat FAQ search selection quick questions failed send retry history and reopen', async ({ page }) => {
  await page.goto('/'); const chat = await openInbox(page);
  await chat.getByRole('button', { name: '¿Sigue disponible?', exact: true }).click();
  await expect(chat.getByRole('textbox', { name: 'Escribir mensaje' })).toHaveValue('¿Sigue disponible?');
  await chat.getByText('Buscar más preguntas', { exact: true }).click();
  const faq = chat.getByRole('region', { name: 'Preguntas frecuentes' });
  await faq.getByLabel('Buscar una pregunta').fill('NOEXISTEPREGUNTA');
  await expect(faq.getByRole('status')).toContainText('No encontramos');
  await faq.getByLabel('Buscar una pregunta').fill('llaves');
  const answer = faq.locator('.faqResults details').first();
  await answer.locator('summary').click();
  const question = await answer.locator('summary').innerText();
  await answer.getByRole('button', { name: 'Usar esta pregunta' }).click();
  await expect(chat.getByRole('textbox', { name: 'Escribir mensaje' })).toHaveValue(question);
  api.failOnce('rpc:send_message_idempotent');
  await chat.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(chat.getByText(/No pudimos confirmar el envío/)).toBeVisible();
  await expect(chat.getByRole('textbox', { name: 'Escribir mensaje' })).toHaveValue(question);
  await chat.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(chat.getByRole('log')).toContainText(question);
  await expect(chat.getByRole('log')).toContainText('Respuesta automática sintética');
  await expect(chat.getByRole('textbox', { name: 'Escribir mensaje' })).toHaveValue('');
  const requests = api.extraCalls.filter(c => c.key === 'rpc:send_message_idempotent');
  expect(requests).toHaveLength(2); expect(requests[0].body.message_request_id).toBe(requests[1].body.message_request_id);
  expect(api.messages).toHaveLength(2);
  await chat.getByRole('button', { name: 'Actualizar mensajes' }).click();
  await chat.getByRole('button', { name: 'Cerrar chat' }).click();
  await page.locator('#conversaciones').getByRole('button', { name: 'Actualizar conversaciones' }).click();
  await page.locator('#conversaciones').getByRole('button', { name: /Abrir conversación/ }).click();
  await expect(chat.getByRole('log')).toContainText(question);
  await page.keyboard.press('Escape'); await expect(chat).toHaveCount(0);
});

test('report can be cancelled retried and acknowledged before block disables further messages', async ({ page }) => {
  await page.goto('/'); const chat = await openInbox(page);
  const report = chat.getByRole('button', { name: 'Denunciar', exact: true });
  await report.click(); await chat.getByLabel('Motivo de la denuncia').fill('Ensayo de denuncia cancelado');
  await report.click(); await expect(chat.getByLabel('Motivo de la denuncia')).toHaveCount(0);
  expect(api.reports).toHaveLength(0);
  await report.click(); await chat.getByLabel('Motivo de la denuncia').fill('Ensayo sintético de trato inadecuado');
  api.failOnce('table:reports'); await chat.getByRole('button', { name: 'Enviar denuncia' }).click();
  await expect(chat.getByText(/No pudimos confirmar la denuncia/)).toBeVisible();
  expect(api.reports).toHaveLength(0);
  await chat.getByRole('button', { name: 'Enviar denuncia' }).click();
  await expect(chat.getByRole('button', { name: 'Denuncia enviada' })).toBeDisabled();
  expect(api.reports).toHaveLength(1);
  api.failOnce('table:conversations'); await chat.getByRole('button', { name: 'Bloquear', exact: true }).click();
  await expect(chat.getByText(/No pudimos confirmar el bloqueo/)).toBeVisible();
  await expect(chat.getByRole('textbox', { name: 'Escribir mensaje' })).toBeEnabled();
  await chat.getByRole('button', { name: 'Bloquear', exact: true }).click();
  await expect(chat.getByRole('button', { name: 'Bloqueado', exact: true })).toBeDisabled();
  await expect(chat.getByRole('textbox', { name: 'Escribir mensaje' })).toBeDisabled();
  await expect(chat.getByRole('button', { name: 'Preparar otra propuesta' })).toBeDisabled();
});

test('alternate visit planner closes goes back sends only after review and permits two-party transitions', async ({ page }) => {
  await page.goto('/'); let chat = await openInbox(page);
  const agenda = chat.getByRole('region', { name: 'Agenda de visitas', exact: true });
  await agenda.getByRole('button', { name: 'Preparar otra propuesta' }).click();
  const planner = chat.getByRole('region', { name: 'Asistente de visitas', exact: true });
  await planner.getByRole('button', { name: 'Cerrar asistente' }).click();
  await expect(planner).toHaveCount(0);
  await agenda.getByRole('button', { name: 'Preparar otra propuesta' }).click();
  await planner.getByText('Preparar una propuesta escribiendo', { exact: true }).click();
  await planner.getByLabel('Escribí tu propuesta de visita').fill('Mañana a las 15:30, durante 30 minutos, en la plaza sintética');
  await planner.getByRole('button', { name: 'Preparar propuesta desde el texto' }).click();
  await expect(planner.getByRole('button', { name: 'Enviar propuesta' })).toBeVisible();
  expect(api.appointments).toHaveLength(0);
  await planner.getByRole('button', { name: 'Atrás', exact: true }).click();
  await planner.getByLabel('Lugar de encuentro').fill('Plaza sintética corregida');
  await planner.getByRole('button', { name: 'Revisar propuesta' }).click();
  api.failOnce('rpc:propose_appointment'); await planner.getByRole('button', { name: 'Enviar propuesta' }).click();
  await expect(planner.getByRole('alert')).toContainText('No se confirmó');
  await planner.getByRole('button', { name: 'Enviar propuesta' }).click();
  await expect(planner).toHaveCount(0); await expect(agenda.locator('.appointment')).toContainText('Plaza sintética corregida');
  expect(api.appointments).toHaveLength(1);
  const proposalCalls = api.extraCalls.filter(c => c.key === 'rpc:propose_appointment');
  expect(proposalCalls[0].body.proposal_request_id).toBe(proposalCalls[1].body.proposal_request_id);
  await expect(agenda.getByRole('button', { name: 'Aceptar', exact: true })).toHaveCount(0);
  await chat.getByRole('button', { name: 'Cerrar chat' }).click(); await logout(page, api.buyer);
  chat = await openInbox(page, api.seller);
  await chat.getByRole('button', { name: 'Aceptar', exact: true }).click();
  await expect(chat.locator('.appointment')).toContainText('Aceptada');
  await expect(chat.getByRole('button', { name: 'Confirmar visita', exact: true })).toHaveCount(0);
  await chat.getByRole('button', { name: 'Cerrar chat' }).click(); await logout(page, api.seller);
  chat = await openInbox(page);
  await chat.getByRole('button', { name: 'Confirmar visita', exact: true }).click();
  await expect(chat.locator('.appointment')).toContainText('Confirmada');
  await chat.getByRole('button', { name: 'Cancelar visita', exact: true }).click();
  await expect(chat.locator('.appointment')).toContainText('Cancelada');
  await expect(chat.locator('.appointmentActions button')).toHaveCount(0);
});

test('direct visit form closes submits and recipient can reject a separate proposal', async ({ page }) => {
  await page.goto('/'); const chat = await openInbox(page, api.seller);
  const agenda = chat.getByRole('region', { name: 'Agenda de visitas', exact: true });
  await agenda.getByRole('button', { name: 'Coordinar visita', exact: true }).click();
  await agenda.getByRole('button', { name: 'Cerrar propuesta' }).click();
  await expect(agenda.getByLabel('Fecha y hora', { exact: true })).toHaveCount(0);
  api.addAppointment({ proposed_by: api.buyer.id });
  await agenda.getByRole('button', { name: 'Actualizar agenda' }).click();
  await agenda.getByRole('button', { name: 'Rechazar', exact: true }).click();
  await expect(agenda.locator('.appointment')).toContainText('Rechazada');
  await agenda.getByRole('button', { name: 'Coordinar visita', exact: true }).click();
  const date = new Date(Date.now() + 10 * 86400000);
  const value = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T15:30`;
  await agenda.getByLabel('Fecha y hora', { exact: true }).fill(value);
  await agenda.getByLabel('Duración en minutos').fill('45');
  await agenda.getByLabel('Lugar', { exact: true }).fill('Otra plaza sintética');
  await agenda.getByRole('button', { name: 'Proponer', exact: true }).click();
  await expect(agenda.locator('.appointment')).toHaveCount(2);
  await expect(agenda.getByLabel('Lugar', { exact: true })).toHaveCount(0);
});

test('manual visit planner validates future date walks next and back and closes without sending', async ({ page }) => {
  await page.goto('/'); const chat = await openInbox(page);
  await chat.getByRole('button', { name: 'Preparar otra propuesta' }).click();
  const planner = chat.getByRole('region', { name: 'Asistente de visitas', exact: true });
  await planner.getByLabel('Fecha y hora de la visita').fill('2000-01-01T15:30');
  await planner.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(planner.getByRole('alert')).toContainText('Elegí una fecha futura.');
  const date = new Date(Date.now() + 10 * 86400000);
  const value = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T15:30`;
  await planner.getByLabel('Fecha y hora de la visita').fill(value);
  await planner.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await planner.getByLabel('Minutos para la visita').fill('30');
  await planner.getByRole('button', { name: 'Atrás', exact: true }).click();
  await expect(planner.getByLabel('Fecha y hora de la visita')).toHaveValue(value);
  await planner.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(planner.getByLabel('Minutos para la visita')).toHaveValue('30');
  await planner.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await planner.getByLabel('Lugar de encuentro').fill('Lugar manual sintético');
  await planner.getByRole('button', { name: 'Revisar propuesta', exact: true }).click();
  await expect(planner).toContainText('30 minutos');
  await expect(planner).toContainText('Lugar manual sintético');
  await expect(planner.getByRole('button', { name: 'Enviar propuesta' })).toBeVisible();
  await planner.getByRole('button', { name: 'Cerrar asistente' }).click();
  await expect(planner).toHaveCount(0);
  expect(api.extraCalls.filter(c => c.key === 'rpc:propose_appointment')).toHaveLength(0);
});

test('authorized booking permits another slot requires renewed consent and confirms after retry', async ({ page }) => {
  api.slots = [0,1].map(n => ({ authorization_id: id(400), scheduled_at: new Date(Date.now() + (5+n) * 86400000).toISOString(),
    duration_minutes: 30, location: 'Plaza autorizada sintética', timezone: 'America/Argentina/Mendoza' }));
  await page.goto('/'); const chat = await openInbox(page);
  const booking = chat.getByRole('region', { name: 'Reservar un horario autorizado' });
  await booking.getByRole('button', { name: 'Ver horarios autorizados' }).click();
  await booking.getByRole('button', { name: /Elegir horario:/ }).first().click();
  const confirm = booking.getByRole('button', { name: 'Confirmar esta visita' });
  await expect(confirm).toBeDisabled(); await booking.getByRole('checkbox').check();
  await booking.getByRole('button', { name: 'Elegir otro horario' }).click();
  await booking.getByRole('button', { name: /Elegir horario:/ }).nth(1).click();
  await expect(booking.getByRole('checkbox')).not.toBeChecked(); await expect(confirm).toBeDisabled();
  await booking.getByRole('checkbox').check(); api.failOnce('rpc:book_authorized_visit'); await confirm.click();
  await expect(booking.getByRole('status')).toContainText('No pudimos confirmar la reserva');
  expect(api.appointments).toHaveLength(0);
  await confirm.click(); await expect(booking.getByRole('status').filter({ hasText: 'Visita confirmada.' })).toBeVisible();
  await expect(chat.locator('.appointment')).toContainText('Confirmada');
  const calls = api.extraCalls.filter(c => c.key === 'rpc:book_authorized_visit');
  expect(calls[0].body.booking_request_id).toBe(calls[1].body.booking_request_id);
  expect(api.appointments).toHaveLength(1);
});

test('visit notice reads only after acknowledgement retries and persists across refresh and login', async ({ page }) => {
  api.notices.push({ id: id(500), recipient_id: api.seller.id, appointment_id: id(200), status: 'confirmed', kind: 'confirmed',
    vehicle_title: 'Auto sintético', buyer_name: 'Comprador sintético', scheduled_at: new Date(Date.now()+86400000).toISOString(),
    timezone: 'America/Argentina/Mendoza', duration_minutes: 30, location: 'Plaza sintética', read_at: null });
  await page.goto('/'); await login(page, api.seller);
  const notices = page.getByRole('region', { name: 'Avisos de visitas' });
  await expect(notices).toContainText('1 sin leer');
  api.failOnce('rpc:read_visit_notice'); await notices.getByRole('button', { name: 'Marcar como leído' }).click();
  await expect(notices.getByRole('alert')).toContainText('No pudimos marcar');
  await expect(notices.getByRole('button', { name: 'Marcar como leído' })).toBeEnabled();
  await notices.getByRole('button', { name: 'Marcar como leído' }).click();
  await expect(notices.getByRole('button', { name: 'Marcar como leído' })).toHaveCount(0);
  await notices.getByRole('button', { name: 'Actualizar avisos' }).click();
  await expect(notices).not.toContainText('sin leer');
  await logout(page, api.seller); await login(page, api.seller);
  await expect(notices).toContainText('Auto sintético'); await expect(notices).not.toContainText('sin leer');
});

test('publication media rejects invalid type replaces and removes photo and video without uploads', async ({ page }) => {
  await page.goto('/'); await login(page, api.seller);
  const form = page.locator('#asistente');
  for (const [name,value] of [['Marca','Fiat'],['Modelo','Cronos'],['Version','Drive'],['Ano','2021']]) await form.getByLabel(name,{exact:true}).fill(value);
  const next = () => form.getByRole('button', { name: 'Continuar', exact: true }).click();
  await next(); await form.getByRole('spinbutton', { name: /Cuantos kilometros/ }).fill('10000');
  await next(); await form.getByRole('spinbutton', { name: /Que precio/ }).fill('15000000');
  await form.getByLabel('Ubicacion', { exact: true }).fill('Mendoza'); await next();
  const front = form.getByLabel('Foto Frontal', { exact: true });
  await front.setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid') });
  await expect(form.locator('.photoGuide.complete')).toHaveCount(0);
  await expect(form.locator('.warning')).toBeVisible();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const photo = name => ({ name, mimeType: 'image/png', buffer: png });
  await front.setInputFiles(photo('first.png')); const original = await form.locator('.photoGuide').first().locator('img').getAttribute('src');
  await front.setInputFiles(photo('replacement.png'));
  await expect(form.locator('.photoGuide.complete')).toHaveCount(1);
  await expect(form.locator('.photoGuide').first().locator('img')).not.toHaveAttribute('src', original);
  await form.locator('.photoGuide').first().getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(form.locator('.photoGuide.complete')).toHaveCount(0);
  await expect(form.getByRole('button', { name: 'Continuar', exact: true })).toBeDisabled();
  for (const label of ['Frontal','Lateral derecho','Lateral izquierdo','Interior']) await form.getByLabel(`Foto ${label}`,{exact:true}).setInputFiles(photo(`${label}.png`));
  await expect(form.getByRole('button', { name: 'Continuar', exact: true })).toBeEnabled();
  const video = form.getByLabel('Video del vehiculo');
  await video.setInputFiles({ name: 'first.mp4', mimeType: 'video/mp4', buffer: Buffer.from('synthetic-video-not-playback') });
  await video.setInputFiles({ name: 'replacement.mp4', mimeType: 'video/mp4', buffer: Buffer.from('synthetic-replacement') });
  await expect(form.locator('.videoUpload')).toContainText('replacement.mp4');
  await form.getByRole('button', { name: 'Eliminar video' }).click();
  await expect(form.getByRole('button', { name: 'Eliminar video' })).toHaveCount(0);
  await form.getByRole('button', { name: 'Volver', exact: true }).click(); await next();
  await expect(form.locator('.photoGuide.complete')).toHaveCount(4);
  expect(api.calls.filter(c => c.key.includes('storage') || c.key === 'rpc:publish_vehicle_with_credit')).toHaveLength(0);
});
