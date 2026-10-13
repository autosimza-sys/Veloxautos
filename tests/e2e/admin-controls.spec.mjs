import { test, expect } from '@playwright/test';
import { installAdminApi, login } from './admin-api.mjs';
let api;
test.beforeEach(async ({ page }) => {
  api = await installAdminApi(page);
  await page.goto('/'); await login(page, api.admin); await page.goto('/velox-admin');
  await expect(page.locator('.adminUserName')).toHaveText('Admin sintético');
});
test.afterEach(() => {
  expect(api.violations).toEqual([]); expect(api.pageErrors).toEqual([]); expect(api.aiCalls).toBe(0);
});
const calls = key => api.adminCalls.filter(c => c.key === key);
async function promotionPanel(page) {
  await page.getByRole('button', { name: 'Promoción', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Promoción de lanzamiento', exact: true });
  await expect(panel.getByRole('button', { name: 'Guardar costo y recarga' })).toBeEnabled();
  return panel;
}
const costInput = (panel, label) => panel.getByRole('spinbutton', { name: `Créditos por publicación — ${label}`, exact: true });

test('admin saved custom tariffs hydrate validate persist zero and nullable AI with refill disabled', async ({ page }) => {
  let panel = await promotionPanel(page);
  for (const [label,value] of [['Particular','77'],['Revendedor','51'],['Agencia','23']]) await expect(costInput(panel,label)).toHaveValue(value);
  const ai = () => panel.getByRole('spinbutton', { name: 'Propuesta de créditos por respuesta de IA' });
  await expect(ai()).toHaveValue('0'); await expect(panel.getByRole('checkbox')).not.toBeChecked();
  await costInput(panel,'Particular').fill('0');
  await panel.getByRole('button', { name: 'Guardar costo y recarga' }).click();
  expect(await costInput(panel,'Particular').evaluate(el => el.validity.rangeUnderflow)).toBe(true);
  expect(calls('rpc:configure_launch_role_credit_policy')).toHaveLength(0);
  for (const [label,value] of [['Particular','91'],['Revendedor','73'],['Agencia','51']]) await costInput(panel,label).fill(value);
  api.failOnce('rpc:configure_launch_role_credit_policy');
  await panel.getByRole('button', { name: 'Guardar costo y recarga' }).click();
  await expect(panel.getByRole('status')).toContainText('No se confirmó la configuración');
  await expect(costInput(panel,'Particular')).toHaveValue('91');
  await panel.getByRole('button', { name: 'Guardar costo y recarga' }).click();
  await expect.poll(() => api.promotion.policy_revision).toBe(5);
  await expect(costInput(panel,'Revendedor')).toHaveValue('73');
  await panel.getByRole('button', { name: 'Actualizar promoción' }).click();
  await expect(ai()).toHaveValue('0'); await expect(panel.getByRole('checkbox')).not.toBeChecked();
  await page.reload(); panel = await promotionPanel(page);
  await expect(costInput(panel,'Agencia')).toHaveValue('51'); await expect(ai()).toHaveValue('0');
  await ai().fill(''); await panel.getByRole('button', { name: 'Guardar costo y recarga' }).click();
  await expect.poll(() => api.promotion.policy_revision).toBe(6);
  await expect(ai()).toHaveValue('');
  await panel.getByRole('button', { name: 'Actualizar promoción' }).click();
  await expect(ai()).toHaveValue('');
  const saved = calls('rpc:configure_launch_role_credit_policy').at(-1).body;
  expect(saved).toMatchObject({ role_publication_costs: { particular:91, reseller:73, agency:51 },
    proposed_ai_response_cost:null, refill_enabled:false });
  expect(calls('rpc:manage_launch_promotion')).toHaveLength(0);
  expect(api.promotion.revision).toBe(0);
});

test('admin launch validates refill quota and waits for server acknowledgement before start and extension', async ({ page }) => {
  const panel = await promotionPanel(page);
  await panel.getByRole('checkbox').check(); await panel.getByRole('button', { name: 'Guardar costo y recarga' }).click();
  await expect.poll(() => api.promotion.policy_revision).toBe(5);
  await expect(panel.getByText('Recarga gratuita configurada: activada durante la promoción.', { exact:true })).toBeVisible();
  await expect(panel.getByRole('checkbox')).toBeChecked();
  const group = panel.getByRole('group', { name: 'Inicio y lote de créditos por vendedor' });
  const date = new Date(Date.now() + 86400000);
  const local = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T12:00`;
  await group.getByLabel('Fecha y hora de lanzamiento').fill(local);
  for (const label of ['Particular','Revendedor','Agencia']) await group.getByRole('spinbutton', { name: label, exact:true }).fill('1');
  await panel.getByRole('button', { name: 'Configurar 90 días gratis' }).click();
  await expect(panel.getByRole('status')).toContainText('Cada lote de recarga debe alcanzar');
  expect(calls('rpc:manage_launch_promotion')).toHaveLength(0);
  for (const label of ['Particular','Revendedor','Agencia']) await group.getByRole('spinbutton', { name: label, exact:true }).fill('100');
  api.failOnce('rpc:manage_launch_promotion'); await panel.getByRole('button', { name: 'Configurar 90 días gratis' }).click();
  await expect(panel.getByRole('status')).toContainText('No se confirmó el cambio');
  expect(api.promotion.revision).toBe(0);
  await expect(panel.getByRole('button', { name: 'Extender 90 días gratis' })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Configurar 90 días gratis' }).click();
  await expect(panel.getByRole('button', { name: 'Extender 90 días gratis' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Guardar costo y recarga' })).toHaveCount(0);
  await expect(panel).toContainText('Vigente hasta:');
  const endBefore = Date.parse(api.promotion.ends_at), quotasBefore = { ...api.promotion.quotas };
  api.failOnce('rpc:manage_launch_promotion'); await panel.getByRole('button', { name: 'Extender 90 días gratis' }).click();
  await expect(panel.getByRole('status')).toContainText('No se confirmó el cambio');
  expect(api.promotion.revision).toBe(1);
  await panel.getByRole('button', { name: 'Extender 90 días gratis' }).click();
  await expect.poll(() => api.promotion.revision).toBe(2);
  expect(Date.parse(api.promotion.ends_at)-endBefore).toBe(90*86400000);
  expect(api.promotion.quotas).toEqual(quotasBefore);
  const request = calls('rpc:manage_launch_promotion').at(-1).body;
  expect(request).toEqual({ action:'extend', expected_revision:1, launch_at:null, credit_quotas:null });
  await panel.getByRole('button', { name: 'Actualizar promoción' }).click();
  await expect(panel.getByRole('button', { name: 'Extender 90 días gratis' })).toBeEnabled();
});

test('admin catalog pauses activates cancels retirement restores and handles partial bulk failure', async ({ page }, testInfo) => {
  const rows = page.locator('.adminTable tbody tr');
  await expect(rows).toHaveCount(10);
  const first = rows.first();
  await first.getByRole('button', { name:'Pausar', exact:true }).click();
  await expect(first).toContainText('Pausada');
  await first.getByRole('button', { name:'Activar', exact:true }).click();
  await expect(first).toContainText('Activa');
  const before = calls('rpc:set_vehicle_listing_status').length;
  page.once('dialog', dialog => dialog.dismiss()); await first.getByRole('button', { name:'Retirar', exact:true }).click();
  expect(calls('rpc:set_vehicle_listing_status')).toHaveLength(before);
  page.once('dialog', dialog => dialog.accept()); await first.getByRole('button', { name:'Retirar', exact:true }).click();
  await expect(first).toContainText('Retirada');
  await expect(first.getByRole('checkbox')).toBeDisabled();
  await first.getByRole('button', { name:'Restaurar', exact:true }).click(); await expect(first).toContainText('Activa');
  await page.getByRole('checkbox', { name:'Seleccionar todas las publicaciones' }).check();
  await expect(rows.locator('input:checked')).toHaveCount(10);
  await page.locator('.adminBulkBar').getByRole('button', { name:'Cancelar', exact:true }).click();
  await expect(page.locator('.adminBulkBar')).toHaveCount(0);
  await rows.nth(0).getByRole('checkbox').check(); await rows.nth(1).getByRole('checkbox').check();
  api.failOnce('rpc:set_vehicle_listing_status');
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name:'Retirar seleccionadas' }).click();
  await expect(page.locator('.adminStatusBar')).toContainText('1 retirada. 1 sin retirar.');
  await expect(page.locator('.adminBulkBar')).toContainText('1 publicación seleccionada');
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name:'Retirar seleccionadas' }).click();
  await expect(page.locator('.adminBulkBar')).toHaveCount(0);
  await expect(rows.nth(0)).toContainText('Retirada'); await expect(rows.nth(1)).toContainText('Retirada');
  await rows.nth(0).getByRole('button', { name:'Restaurar', exact:true }).click();
  await rows.nth(1).getByRole('button', { name:'Restaurar', exact:true }).click();
  const geometry = await page.evaluate(() => {
    const rect = selector => { const {x,y,width,height} = document.querySelector(selector).getBoundingClientRect(); return {x,y,width,height}; };
    return { viewport:innerWidth, documentWidth:document.documentElement.scrollWidth, scrollX,
      main:rect('.adminMain'), status:rect('.adminStatusBar'), close:rect('.adminStatusClose'), table:rect('.adminTableWrap') };
  });
  geometry.configuredWidth = page.viewportSize().width;
  await testInfo.attach('admin-catalog-geometry', { body:JSON.stringify(geometry,null,2), contentType:'application/json' });
  expect(geometry.documentWidth, 'Only the table should scroll horizontally, not the whole admin page').toBeLessThanOrEqual(geometry.configuredWidth + 1);
  await page.getByRole('button', { name:'Cerrar aviso', exact:true }).click({ timeout:10000 }); await expect(page.locator('.adminStatusBar')).toHaveCount(0);
  expect(api.vehicles.every(v => v.status === 'active')).toBe(true);
});

test('admin CRM refresh selection and status update preserve metadata scope without private messages', async ({ page }) => {
  await page.getByRole('button', { name:/CRM \/ Leads/ }).click();
  await page.getByRole('button', { name:/Fiat Unidad 1-1/ }).click();
  const status = page.getByRole('combobox', { name:'Estado lead' });
  await expect(status).toHaveValue('new');
  await expect(page.getByText('Mensajes privados: disponibles solo para los participantes de la conversación.')).toBeVisible();
  api.failOnce('rpc:set_lead_status'); await status.selectOption('interested');
  await expect(page.locator('.adminStatusBar')).toContainText('Error CRM');
  await expect(status).toHaveValue('new');
  for (const value of ['interested','visit_scheduled','visited','closed','lost','new']) {
    await status.selectOption(value); await expect(status).toHaveValue(value);
    await expect.poll(() => api.lead.lead_status).toBe(value);
  }
  api.failOnce('rpc:get_admin_leads'); await page.getByRole('button', { name:'Actualizar CRM' }).click();
  await expect(page.locator('.adminMain').getByRole('alert')).toContainText('No se pudo cargar el CRM');
  await page.getByRole('button', { name:'Reintentar CRM' }).click();
  await page.getByRole('button', { name:/Fiat Unidad 1-1/ }).click();
  await expect(status).toHaveValue('new');
  expect([...api.calls,...api.adminCalls].filter(c => c.key === 'table:messages')).toHaveLength(0);
  await page.getByRole('link', { name:'← Volver al sitio' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3100/');
});
