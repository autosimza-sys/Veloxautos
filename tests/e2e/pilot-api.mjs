import { expect } from '@playwright/test';

export const PASSWORD = 'Synthetic-pilot-only-2026';
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const roles = ['particular', 'particular', 'particular', 'reseller', 'reseller', 'agency', 'registered', 'registered', 'registered'];
const countByRole = { particular: 1, reseller: 2, agency: 3, registered: 0 };
const grantByRole = { particular: 10, reseller: 50, agency: 200, registered: 0 };
const future = () => new Date(Date.now() + 90 * 86400000).toISOString();

function token(userId) {
  return [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: userId, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'synthetic-signature'].join('.');
}
function actorOf(request) {
  try { return JSON.parse(Buffer.from(request.headers().authorization.split('.')[1], 'base64url')).sub; } catch { return null; }
}


export function syntheticCatalogPage(rows, {filters = {}, after_cursor = null, page_size = 24} = {}) {
 const matched=rows.filter(v=>(!filters.search||`${v.brand} ${v.model} ${v.version} ${v.zone} ${v.year}`.toLowerCase().includes(filters.search.toLowerCase()))
 &&(!filters.brand||v.brand===filters.brand)&&(!filters.year||v.year===filters.year)
 &&(filters.minPrice==null||v.price>=filters.minPrice)&&(filters.maxPrice==null||v.price<=filters.maxPrice)
 &&(filters.minKm==null||v.kilometers>=filters.minKm)&&(filters.maxKm==null||v.kilometers<=filters.maxKm));
 const start=after_cursor?matched.findIndex(v=>v.id===after_cursor.id)+1:0;
 const items=matched.slice(start,start+page_size);
 return {items,next_cursor:start+items.length<matched.length?{id:items.at(-1).id,created_at:items.at(-1).created_at}:null,
 brands:[...new Set(rows.map(v=>v.brand))].sort(),years:[...new Set(rows.map(v=>v.year))].sort((a,b)=>b-a)};
}

export async function installPilotApi(page) {
  const profiles = roles.map((role, i) => ({ id: id(i + 1), email: `pilot-${i + 1}@example.invalid`,
    display_name: `Piloto ${i + 1}`, role, is_blocked: false, business_name: ['agency', 'reseller'].includes(role) ? `Comercio ${i + 1}` : '' }));
  profiles.push({ id: id(10), email: 'blocked@example.invalid', display_name: 'Cuenta bloqueada', role: 'particular', is_blocked: true });
  const vehicles = profiles.filter(p => !p.is_blocked).flatMap((p, i) => Array.from({ length: countByRole[p.role] }, (_, n) => ({
    id: id(100 + i * 10 + n), owner_id: p.id, status: 'active', brand: i % 2 ? 'Ford' : 'Fiat',
    model: `Unidad ${i + 1}-${n + 1}`, version: 'Base', year: 2020 + i % 4,
    kilometers: 10000 + i * 20000, price: 10000000 + i * 10000000, zone: 'Mendoza',
    description: `Publicación sintética de ${p.display_name}`, view_location: `Lugar privado ${i + 1}`,
    available_hours: '', partial_plate: '', accepts_trade: false, accepts_financing: false,
    score: 4, checklist: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  })));
  const balances = new Map(profiles.map(p => [p.id, { granted: grantByRole[p.role], used: 0, expires_at: future() }]));
  const state = { profiles, vehicles, balances, calls: [], violations: [], pageErrors: [], failures: new Map(),
    signupSession: true, tasks: new Map(), windows: [], leakOtherOwner: false, persistentFailures: new Set() };
  state.failNext = (key, status = 503) => state.failures.set(key, status);
  state.own = profile => vehicles.filter(v => v.owner_id === profile.id);
  const authUser = profile => ({ id: profile.id, email: profile.email, aud: 'authenticated', role: 'authenticated',
    user_metadata: { display_name: profile.display_name, role: profile.role }, app_metadata: { provider: 'email', providers: ['email'] },
    created_at: new Date().toISOString() });
  const session = profile => ({ access_token: token(profile.id), refresh_token: `synthetic-refresh-${profile.id}`,
    token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: authUser(profile) });

  page.on('pageerror', error => state.pageErrors.push(error.message));

  await page.routeWebSocket('**/realtime/**', socket => socket.close());
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === 'http://127.0.0.1:3100') return route.continue();
    if (url.hostname === 'images.unsplash.com' && request.resourceType() === 'image') {
      return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2" />' });
    }
    if (url.hostname !== 'pilot-supabase.invalid') {
      state.violations.push(`${request.method()} ${url.origin}${url.pathname}`);
      return route.abort();
    }
    const body = request.postDataJSON() || {};
    const key = url.pathname.replace('/rest/v1/rpc/', 'rpc:').replace('/rest/v1/', 'table:').replace('/auth/v1/', 'auth:');
    const actor = actorOf(request);
    state.calls.push({ key, method: request.method(), actor, body, search: url.search });
    const respond = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data),
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
    if (request.method() === 'OPTIONS') return respond({});
    if (state.failures.has(key)) {
      const status = state.failures.get(key);
      if (!state.persistentFailures.has(key)) state.failures.delete(key);
      return respond({ code: 'synthetic_failure', message: 'Fallo simulado de conexión' }, status);
    }
    if (key === 'auth:token') {
      const profile = profiles.find(p => p.email === body.email);
      return profile && body.password === PASSWORD ? respond(session(profile))
        : respond({ error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
    }
    if (key === 'auth:signup') {
      const profile = { id: id(50 + profiles.length), email: body.email, display_name: body.data.display_name,
        role: body.data.role, business_name: body.data.business_name || '', is_blocked: false };
      profiles.push(profile); balances.set(profile.id, { granted: grantByRole[profile.role], used: 0, expires_at: future() });
      return respond(state.signupSession ? session(profile) : authUser(profile));
    }
    if (key === 'auth:logout' || key === 'auth:recover') return respond({});
    if (key === 'auth:user') {
      const profile = profiles.find(p => p.id === actor);
      return profile ? respond(authUser(profile)) : respond({ error_code: 'bad_jwt', msg: 'Invalid synthetic session' }, 401);
    }
    if (key === 'table:profiles') return respond(profiles.find(p => p.id === url.searchParams.get('id')?.slice(3)) || null);
    if (key === 'table:launch_promotion') return respond({ revision: 0, starts_at: null, ends_at: null, quotas: null,
      publication_cost: 1, auto_refill: false, policy_revision: 0 });
    if (key === 'table:credit_balances') return respond(balances.get(actor) || null);
    if (key === 'table:credit_ledger') return respond([{ id: id(500 + profiles.findIndex(p => p.id === actor)), kind: 'initial_grant',
      amount: balances.get(actor)?.granted || 0, created_at: new Date().toISOString() }]);
    if (key === 'table:vehicles') return respond(vehicles.filter(v => state.leakOtherOwner || v.owner_id === actor));
    if (key === 'table:inspection_requests' || key === 'table:appointments') return respond([]);
    if (['rpc:get_my_conversations', 'rpc:get_visit_notices', 'rpc:get_available_visit_slots'].includes(key)) return respond([]);
    if (key === 'rpc:get_vehicle_catalog_page') return respond(syntheticCatalogPage(vehicles.filter(v => v.status === 'active').map(v => ({ ...v,
      seller_name: profiles.find(p => p.id === v.owner_id).display_name,
      seller_type: profiles.find(p => p.id === v.owner_id).role, media: [],
      price: actor ? v.price : null, kilometers: actor ? v.kilometers : null, view_location: null })),body));
    if (key === 'rpc:update_vehicle_listing' || key === 'rpc:set_vehicle_listing_status') {
      const vehicle = vehicles.find(v => v.id === body.target_vehicle && v.owner_id === actor);
      if (!vehicle) return respond({ code: '42501', message: 'Acceso denegado por el simulador' }, 403);
      Object.assign(vehicle, key === 'rpc:update_vehicle_listing' ? body.payload : { status: body.next_status });
      return respond(vehicle);
    }
    if (key === 'rpc:get_listing_faq_tasks') {
      if (!state.tasks.has(body.target_vehicle)) state.tasks.set(body.target_vehicle, [{ question_id: 'c01.synthetic',
        question: '¿Conserva las dos llaves?', state: 'pending', answer: '', revision: 0 }]);
      return respond(state.tasks.get(body.target_vehicle));
    }
    if (key === 'rpc:answer_listing_faq') {
      const task = state.tasks.get(body.target_vehicle).find(t => t.question_id === body.question_id);
      Object.assign(task, { state: body.next_state, answer: body.answer_text, revision: task.revision + 1 });
      return respond(task);
    }
    if (key === 'rpc:get_visit_authorizations') return respond(state.windows.filter(w => w.vehicle_id === body.target_vehicle));
    if (key === 'rpc:authorize_visit_window') {
      const window = { ...body, id: id(700 + state.windows.length), vehicle_id: body.target_vehicle,
        starts_at: body.window_start, ends_at: body.window_end, duration_minutes: body.visit_minutes,
        location: body.meeting_location, timezone: body.display_timezone, authorized_at: new Date().toISOString(), revoked_at: null };
      state.windows.push(window); return respond(window);
    }
    if (key === 'rpc:revoke_visit_authorization') {
      const window = state.windows.find(w => w.id === body.target_authorization);
      window.revoked_at = new Date().toISOString(); return respond(window);
    }
    state.violations.push(`${request.method()} ${key}`);
    return respond({ code: 'UNMOCKED', message: 'Unexpected offline request' }, 501);
  });
  return state;
}

export async function login(page, profile, password = PASSWORD) {
  const form = page.locator('#cuenta');
  await form.getByRole('button', { name: 'Entrar', exact: true }).first().click();
  await form.getByLabel('Email', { exact: true }).fill(profile.email);
  await form.getByLabel('Contrasena', { exact: true }).fill(password);
  await form.getByRole('button', { name: 'Entrar', exact: true }).last().click();
  if (password === PASSWORD) await expect(page.getByRole('button', { name: `${profile.display_name} | salir`, exact: true })).toBeVisible();
}

export async function logout(page, profile) {
  await page.getByRole('button', { name: `${profile.display_name} | salir`, exact: true }).click();
  await expect(page.locator('#cuenta')).toContainText('Sesión cerrada.');
  await expect(page.locator('#mis-publicaciones')).toHaveCount(0);
  await expect(page.locator('#conversaciones')).toHaveCount(0);
}
