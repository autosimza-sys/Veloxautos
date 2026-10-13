import { test, expect } from '@playwright/test';
import { installPilotApi, login, logout, PASSWORD } from './pilot-api.mjs';

// These tests exercise real browser components and the Supabase SDK with a
// synthetic transport. Server permissions and persistent accounts have separate
// database/live pilot evidence; passing this suite does not certify RLS.
let api;
test.beforeEach(async ({ page }) => { api = await installPilotApi(page); });
test.afterEach(() => {
  expect(api.violations, 'No unhandled calls or external services').toEqual([]);
  expect(api.pageErrors, 'No uncaught browser errors').toEqual([]);
});

test('six sellers can enter, see only their inventory and credits, leave and return', async ({ page }) => {
  await page.goto('/');
  for (const profile of api.profiles.slice(0, 6)) {
    await login(page, profile);
    const own = page.locator('#mis-publicaciones');
    await expect(own.getByRole('article')).toHaveCount(api.own(profile).length);
    await expect(own).toContainText(api.own(profile)[0].model);
    await own.getByRole('button', { name: 'Actualizar mis publicaciones' }).click();
    await expect(own.getByRole('article')).toHaveCount(api.own(profile).length);
    await expect(page.locator('.creditBalance')).toContainText(String(api.balances.get(profile.id).granted));
    await page.locator('#creditos').getByText('Mis últimos movimientos de créditos', { exact: true }).click();
    await expect(page.locator('.creditHistory')).toContainText(`+${api.balances.get(profile.id).granted} créditos`);
    await logout(page, profile);
  }
  await login(page, api.profiles[0]);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Piloto 1 | salir', exact: true })).toBeVisible();
  await expect(page.locator('#mis-publicaciones').getByRole('article')).toHaveCount(1);
});

test('buyer and blocked seller cannot expose seller or administrator controls', async ({ page }) => {
  await page.goto('/');
  const buyer = api.profiles[6];
  await login(page, buyer);
  await expect(page.locator('#mis-publicaciones')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Admin/ })).toHaveCount(0);
  await page.goto('/velox-admin');
  await expect(page.getByText('Acceso denegado. Tu cuenta no tiene permisos de admin.')).toBeVisible();
  expect(api.calls.filter(c => c.key === 'rpc:get_admin_leads')).toHaveLength(0);
  await page.goto('/'); await logout(page, buyer);
  await login(page, api.profiles[9]);
  await expect(page.locator('#mis-publicaciones')).toHaveCount(0);
  await expect(page.getByText('Tu cuenta está bloqueada. Contactá a soporte.', { exact: true })).toBeVisible();
});

test('failed login stays signed out and buyer signup acknowledges only the confirmed session', async ({ page }) => {
  await page.goto('/');
  await login(page, api.profiles[0], 'wrong-password');
  const form = page.locator('#cuenta');
  await expect(form).toContainText('Invalid login credentials');
  await expect(page.locator('.accountPill')).toHaveCount(0);
  await form.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await form.getByLabel('Nombre', { exact: true }).fill('Nuevo comprador sintético');
  await form.getByLabel('Tipo de cuenta').selectOption('registered');
  await form.getByLabel('Email', { exact: true }).fill('new-buyer@example.invalid');
  await form.getByLabel('Contrasena', { exact: true }).fill(PASSWORD);
  await form.getByRole('button', { name: 'Crear cuenta', exact: true }).last().click();
  await expect(form).toContainText('Cuenta creada. Ya podés consultar vehículos.');
  await expect(form).not.toContainText('Ya podés preparar tu publicación');
  await expect(page.locator('#mis-publicaciones')).toHaveCount(0);
  expect(api.calls.find(c => c.key === 'auth:signup').body.data.role).toBe('registered');
});

test('signup without a confirmed session requests email confirmation and never grants a dashboard', async ({ page }) => {
  api.signupSession = false;
  await page.goto('/');
  const form = page.locator('#cuenta');
  await form.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await form.getByLabel('Nombre', { exact: true }).fill('Agencia pendiente');
  await form.getByLabel('Tipo de cuenta').selectOption('agency');
  await form.getByLabel('Nombre comercial').fill('Agencia sintética');
  await form.getByLabel('Email', { exact: true }).fill('pending-agency@example.invalid');
  await form.getByLabel('Contrasena', { exact: true }).fill(PASSWORD);
  await form.getByRole('button', { name: 'Crear cuenta', exact: true }).last().click();
  await expect(form).toContainText('Revisá tu email para confirmar la cuenta y luego ingresá.');
  await expect(page.locator('.accountPill')).toHaveCount(0);
  await expect(page.locator('#mis-publicaciones')).toHaveCount(0);
});

test('owner edits, cancels, pauses, reactivates and withdraws without spending a publication credit', async ({ page }) => {
  await page.goto('/'); await login(page, api.profiles[0]);
  const own = page.locator('#mis-publicaciones');
  const card = own.getByRole('article').first();
  await card.getByRole('button', { name: 'Editar datos' }).click();
  await card.getByRole('textbox', { name: 'Descripción', exact: true }).fill('Borrador que se descarta');
  await card.getByRole('button', { name: 'Cancelar edición' }).click();
  expect(api.calls.filter(c => c.key === 'rpc:update_vehicle_listing')).toHaveLength(0);
  await card.getByRole('button', { name: 'Editar datos' }).click();
  await expect(card.getByRole('textbox', { name: 'Descripción', exact: true })).not.toHaveValue('Borrador que se descarta');
  await card.getByLabel('Precio (ARS)').fill('12300000');
  api.failNext('rpc:update_vehicle_listing');
  await card.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(own.getByRole('alert')).toContainText('No pudimos confirmar el cambio');
  await expect(card.getByLabel('Precio (ARS)')).toHaveValue('12300000');
  await card.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(own.getByRole('status')).toContainText('Cambios guardados.');
  await card.getByRole('button', { name: 'Pausar publicación' }).click();
  await expect(card).toContainText('Pausada');
  await card.getByRole('button', { name: 'Reactivar publicación' }).click();
  await expect(card).toContainText('Activa');
  await card.getByRole('button', { name: 'Retirar publicación' }).click();
  await card.getByRole('button', { name: 'Cancelar retiro' }).click();
  await expect(card).toContainText('Activa');
  await card.getByRole('button', { name: 'Retirar publicación' }).click();
  await card.getByRole('button', { name: 'Confirmar retiro' }).click();
  await expect(card).toContainText('Retirada');
  await card.getByRole('button', { name: 'Reactivar publicación' }).click();
  await expect(card).toContainText('Activa');
  expect(api.balances.get(api.profiles[0].id).used).toBe(0);
  expect(api.calls.filter(c => c.key === 'rpc:publish_vehicle_with_credit')).toHaveLength(0);
});

test('seller answer needs explicit consent, survives a failed acknowledgement and can be corrected to unknown', async ({ page }) => {
  await page.goto('/'); await login(page, api.profiles[0]);
  await page.locator('#mis-publicaciones').getByRole('button', { name: 'Preguntas pendientes del auto' }).click();
  const panel = page.getByRole('region', { name: 'Respuestas del vendedor' });
  await expect(panel.getByRole('heading', { name: '¿Conserva las dos llaves?' })).toBeVisible();
  await panel.getByLabel('Respuesta declarada').fill('Sí, conservo ambas llaves originales.');
  const save = panel.getByRole('button', { name: 'Guardar respuesta para esta unidad' });
  await expect(save).toBeDisabled();
  await panel.getByRole('checkbox').check();
  api.failNext('rpc:answer_listing_faq');
  await save.click();
  await expect(panel.getByRole('status')).toContainText('No se confirmó el cambio');
  await expect(panel.getByLabel('Respuesta declarada')).toHaveValue('Sí, conservo ambas llaves originales.');
  await save.click();
  await expect.poll(() => api.tasks.get(api.own(api.profiles[0])[0].id)[0].revision).toBe(1);
  await panel.getByLabel('Qué sabés del dato').selectOption('unknown');
  await expect(panel.getByLabel('Respuesta declarada')).toHaveCount(0);
  await expect(save).toBeDisabled();
  await panel.getByRole('checkbox').check(); await save.click();
  await expect.poll(() => api.tasks.get(api.own(api.profiles[0])[0].id)[0].state).toBe('unknown');
  await panel.getByRole('button', { name: 'Actualizar preguntas' }).click();
  await expect(panel.getByLabel('Qué sabés del dato')).toHaveValue('unknown');
});

test('visit availability requires explicit consent and revocation changes only the permission', async ({ page }) => {
  await page.goto('/'); await login(page, api.profiles[0]);
  await page.locator('#mis-publicaciones').getByRole('button', { name: 'Horarios del asistente' }).click();
  const panel = page.getByRole('region', { name: 'Disponibilidad autorizada del vendedor' });
  const start = new Date(Date.now() + 86400000); start.setHours(10, 0, 0, 0);
  const local = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:00`;
  await panel.getByLabel('Desde', { exact: true }).fill(local(start));
  await panel.getByLabel('Hasta', { exact: true }).fill(local(new Date(start.getTime() + 3600000)));
  await panel.getByLabel('Duración de cada visita (minutos)').fill('30');
  await panel.getByLabel('Lugar de encuentro').fill('Lugar privado de prueba');
  const save = panel.getByRole('button', { name: 'Autorizar horario', exact: true });
  await expect(save).toBeDisabled();
  await panel.getByRole('checkbox').check(); await save.click();
  await expect(panel.getByRole('status').filter({ hasText: 'Autorización guardada.' })).toContainText('Todavía no se creó ninguna visita');
  await expect(panel.locator('.visitAuthorizationRecord')).toContainText('30 minutos por visita · Lugar privado de prueba');
  await panel.getByRole('button', { name: 'Revocar autorización' }).click();
  await expect(panel.getByRole('status').filter({ hasText: 'Autorización revocada.' })).toContainText('Esto no cancela visitas');
  await expect(panel.getByRole('button', { name: 'Revocar autorización' })).toHaveCount(0);
  expect(api.calls.filter(c => ['rpc:book_authorized_visit', 'rpc:propose_appointment'].includes(c.key))).toHaveLength(0);
});

test('switching account removes private drafts, inventory and prior credit history even with an overbroad response', async ({ page }) => {
  api.leakOtherOwner = true; // Deliberately malformed read: UI must also scope ownership.
  await page.goto('/'); await login(page, api.profiles[0]);
  await expect(page.locator('#mis-publicaciones').getByRole('article')).toHaveCount(1);
  await page.locator('#mis-publicaciones').getByRole('button', { name: 'Editar datos' }).click();
  await page.locator('#mis-publicaciones').getByRole('textbox', { name: 'Descripción', exact: true }).fill('BORRADOR PRIVADO DEL PRIMER VENDEDOR');
  await page.locator('#creditos').getByText('Mis últimos movimientos de créditos', { exact: true }).click();
  await expect(page.locator('.creditHistory')).toContainText('+10 créditos');
  await logout(page, api.profiles[0]); await login(page, api.profiles[3]);
  const own = page.locator('#mis-publicaciones');
  await expect(own.getByRole('article')).toHaveCount(2);
  await expect(own).not.toContainText('Unidad 1-1');
  await expect(own.getByRole('form')).toHaveCount(0);
  await own.getByRole('button', { name: 'Editar datos' }).first().click();
  await expect(own.getByRole('textbox', { name: 'Descripción', exact: true })).not.toHaveValue('BORRADOR PRIVADO DEL PRIMER VENDEDOR');
  await page.locator('#creditos').getByText('Mis últimos movimientos de créditos', { exact: true }).click();
  await expect(page.locator('.creditHistory')).toContainText('+50 créditos');
  await expect(page.locator('.creditHistory')).not.toContainText('+10 créditos');
});

test('catalog filters reset and anonymous chat registration defaults to buyer', async ({ page }, testInfo) => {
  await page.goto('/');
  const catalog = page.locator('#catalogo');
  await expect(catalog.locator('.vehicleCard')).toHaveCount(10);
  await catalog.getByRole('button', { name: 'Filtrar', exact: true }).click();
  await expect(catalog.getByRole('combobox', { name: 'Precio', exact: true })).toBeDisabled();
  await catalog.getByRole('combobox', { name: 'Marca', exact: true }).selectOption('Ford');
  await expect(catalog.locator('.vehicleCard')).toHaveCount(6);
  await catalog.getByLabel('Buscar vehículos').fill('NO EXISTE');
  await expect(catalog.locator('.vehicleCard')).toHaveCount(0);
  await catalog.getByRole('button', { name: 'Ver todos', exact: true }).click();
  await expect(catalog.locator('.vehicleCard')).toHaveCount(10);
  await page.getByRole('button', { name: 'Registrate para chatear', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Tipo de cuenta')).toHaveValue('registered');
  await expect(dialog.getByRole('button', { name: 'Crear cuenta y consultar', exact: true })).toBeVisible();
  const geometry = await page.evaluate(() => {
    const rectangle = selector => {
      const { x, y, width, height } = document.querySelector(selector).getBoundingClientRect();
      return { x, y, width, height };
    };
    const overflow = [...document.querySelectorAll('main *')].map(element => {
      const rect = element.getBoundingClientRect();
      return { tag: element.tagName, id: element.id, className: element.className, right: rect.right, width: rect.width };
    }).filter(item => item.right > document.documentElement.clientWidth + 1 && item.width > 0).slice(0, 25);
    return { viewport: innerWidth, scrollX, documentWidth: document.documentElement.scrollWidth, overflow,
      overlay: rectangle('.chatModal'), form: rectangle('.authModal'), close: rectangle('.authModalHeader .close') };
  });
  geometry.configuredViewport = page.viewportSize().width;
  await testInfo.attach('auth-modal-geometry', { body: JSON.stringify(geometry, null, 2), contentType: 'application/json' });
  expect(geometry.documentWidth, 'Modal must not enlarge the mobile layout viewport').toBeLessThanOrEqual(geometry.configuredViewport + 1);
  expect(geometry.form.x, 'Modal left edge stays within viewport').toBeGreaterThanOrEqual(0);
  expect(geometry.form.x + geometry.form.width, 'Modal right edge stays within viewport').toBeLessThanOrEqual(geometry.configuredViewport + 1);
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.locator('header.topbar').getByRole('button', { name: 'Vender mi vehiculo', exact: true }).click();
  await expect(dialog.getByLabel('Tipo de cuenta')).toHaveValue('particular');
});

test('recovery replies generically for existing and unknown emails and ordinary login does not authorize password reset', async ({ page }) => {
  await page.goto('/'); await login(page, api.profiles[0]);
  await page.locator('#cuenta').getByRole('link', { name: 'Olvidé mi contraseña' }).click();
  await expect(page).toHaveURL(/\/recuperar-cuenta$/);
  await expect(page.getByLabel('Nueva contraseña', { exact: true })).toHaveCount(0);
  for (const email of [api.profiles[0].email, 'unknown-account@example.invalid']) {
    await page.getByLabel('Email de tu cuenta').fill(email);
    await page.getByRole('button', { name: 'Pedir enlace de recuperación' }).click();
    await expect(page.getByRole('status')).toContainText('Si existe una cuenta habilitada con ese email');
  }
  expect(api.calls.filter(c => c.key === 'auth:recover')).toHaveLength(2);
  expect(api.calls.filter(c => c.key === 'auth:user' && c.method === 'PUT')).toHaveLength(0);
});

test('expired recovery link cannot enable a new password and can request a fresh link', async ({ page }) => {
  await page.goto('/recuperar-cuenta#error=access_denied&error_code=otp_expired&error_description=Expired');
  const panel = page.getByRole('region', { name: 'Recuperación de cuenta' });
  await expect(panel.getByRole('alert')).toContainText('El enlace no es válido, venció o ya fue utilizado');
  await expect(page.getByLabel('Nueva contraseña', { exact: true })).toHaveCount(0);
  await page.getByLabel('Email de tu cuenta').fill('unknown@example.invalid');
  api.failNext('auth:recover', 429);
  await page.getByRole('button', { name: 'Pedir enlace de recuperación' }).click();
  await expect(panel.getByRole('alert')).toBeVisible();
  await expect(panel.getByRole('status')).toHaveCount(0);
  await page.getByRole('button', { name: 'Pedir enlace de recuperación' }).click();
  await expect(page.getByRole('status')).toContainText('Si existe una cuenta habilitada');
});

test('failed catalog request offers a real retry and no invented inventory', async ({ page }) => {
  api.failNext('rpc:get_vehicle_catalog');
  api.persistentFailures.add('rpc:get_vehicle_catalog');
  await page.goto('/');
  const catalog = page.locator('#catalogo');
  await expect(catalog.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  await expect(catalog.locator('.vehicleCard')).toHaveCount(0);
  api.failures.delete('rpc:get_vehicle_catalog');
  await catalog.getByRole('button', { name: 'Reintentar' }).click();
  await expect(catalog.locator('.vehicleCard')).toHaveCount(10);
});

test('new-publication private draft is cleared on logout before another seller enters', async ({ page }) => {
  await page.goto('/'); await login(page, api.profiles[0]);
  const assistant = page.locator('#asistente');
  await assistant.getByRole('textbox', { name: 'Marca', exact: true }).fill('BORRADOR PRIVADO DE A');
  await assistant.getByRole('textbox', { name: 'Modelo', exact: true }).fill('MODELO PRIVADO');
  await logout(page, api.profiles[0]);
  await expect(assistant.getByRole('textbox', { name: 'Marca', exact: true })).toHaveValue('');
  await login(page, api.profiles[3]);
  await expect(assistant.getByRole('textbox', { name: 'Modelo', exact: true })).toHaveValue('');
});

test('anonymous publication draft survives first login in place and clears on logout and the next account', async ({ page }) => {
  await page.goto('/');
  const assistant = page.locator('#asistente');
  const brand = assistant.getByRole('textbox', { name: 'Marca', exact: true });
  const model = assistant.getByRole('textbox', { name: 'Modelo', exact: true });
  await brand.fill('BORRADOR ANONIMO INICIAL');
  await model.fill('MODELO ANONIMO INICIAL');

  // The user signs in through the current page; navigation would mask a reset.
  await login(page, api.profiles[0]);
  await expect(brand).toHaveValue('BORRADOR ANONIMO INICIAL');
  await expect(model).toHaveValue('MODELO ANONIMO INICIAL');

  await logout(page, api.profiles[0]);
  await expect(brand).toHaveValue('');
  await expect(model).toHaveValue('');
  await login(page, api.profiles[3]);
  await expect(brand).toHaveValue('');
  await expect(model).toHaveValue('');
});
