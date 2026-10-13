import { installPilotApi } from './pilot-api.mjs';
export { login } from './pilot-api.mjs';
const id = n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export async function installAdminApi(page) {
  const base = await installPilotApi(page);
  const state = { ...base, failures:new Set(), aiCalls:0 };
  state.failOnce = key => state.failures.add(key);
  state.admin = { id: id(900), email: 'admin-extra@example.invalid', display_name: 'Admin sintético',
    role: 'admin', is_blocked: false, business_name: '' };
  state.profiles.push(state.admin);
  state.balances.set(state.admin.id, { granted: 0, used: 0, expires_at: new Date(Date.now()+90*86400000).toISOString() });
  state.adminCalls = [];
  state.promotion = { revision: 0, starts_at: null, ends_at: null, quotas: null,
    publication_cost: 1, publication_costs: { particular: 77, reseller: 51, agency: 23 },
    ai_response_cost_draft: 0, auto_refill: false, policy_revision: 4 };
  state.lead = { id:id(1), buyer_id:base.profiles[6].id, seller_id:base.profiles[0].id,
    vehicle_id:base.vehicles[0].id, vehicle_brand:'Fiat', vehicle_model:'Unidad 1-1',
    lead_status:'new', created_at:new Date().toISOString(), is_blocked:false, is_reported:false,
    buyer_name: 'Comprador sintético', seller_name: 'Vendedor sintético',
    vehicle_year: 2021, vehicle_zone: 'Mendoza', vehicle_status: 'active', lead_updated_at: new Date().toISOString() };
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.pathname === '/api/assistant') {
      state.aiCalls++;
      return route.fulfill({ contentType:'application/json', body:JSON.stringify({state:'skipped'}) });
    }
    if (url.hostname !== 'pilot-supabase.invalid') return route.fallback();
    const key = url.pathname.replace('/rest/v1/rpc/', 'rpc:').replace('/rest/v1/', 'table:');
    let actor;
    try { actor = JSON.parse(Buffer.from(req.headers().authorization.split('.')[1], 'base64url')).sub; } catch { actor = null; }
    const handlers = ['table:launch_promotion', 'rpc:configure_launch_role_credit_policy', 'rpc:manage_launch_promotion',
      'rpc:get_admin_leads', 'rpc:set_lead_status', 'rpc:get_assigned_inspection_context'];
    if (actor === state.admin.id) handlers.push('table:vehicles', 'rpc:set_vehicle_listing_status');
    if (!handlers.includes(key)) return route.fallback();
    const body = req.postDataJSON() || {};
    state.adminCalls.push({ key, body, actor, method: req.method() });
    const respond = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data),
      headers: { 'access-control-allow-origin': '*' } });
    if (req.method() === 'OPTIONS') return respond({});
    if (state.failures.delete(key)) return respond({ code: 'test_network', message: 'Network failure simulated locally' }, 503);
    if (key === 'table:launch_promotion') return respond(state.promotion);
    // The home page reads this on admin login; no mechanical action is exercised.
    if (key === 'rpc:get_assigned_inspection_context') return respond([]);
    if (actor !== state.admin.id) return respond({ code: '42501', message: 'Synthetic admin only' }, 403);
    if (key === 'rpc:configure_launch_role_credit_policy') {
      if (body.expected_policy_revision !== state.promotion.policy_revision || state.promotion.revision) return respond({ code: '40001', message: 'Synthetic policy changed' }, 409);
      Object.assign(state.promotion, { publication_costs: body.role_publication_costs,
        ai_response_cost_draft: body.proposed_ai_response_cost, auto_refill: body.refill_enabled,
        policy_revision: state.promotion.policy_revision + 1 });
      return respond(state.promotion);
    }
    if (key === 'rpc:manage_launch_promotion') {
      if (body.expected_revision !== state.promotion.revision) return respond({ code: '40001', message: 'Synthetic campaign changed' }, 409);
      const start = body.action === 'start' ? new Date(body.launch_at) : new Date(state.promotion.starts_at);
      const endBase = body.action === 'start' ? start.getTime() : new Date(state.promotion.ends_at).getTime();
      Object.assign(state.promotion, { revision: state.promotion.revision + 1,
        starts_at: start.toISOString(), ends_at: new Date(endBase + 90*86400000).toISOString(),
        quotas: body.action === 'start' ? body.credit_quotas : state.promotion.quotas });
      return respond(state.promotion);
    }
    if (key === 'table:vehicles') return respond(state.vehicles.map(v => ({ ...v,
      profiles: state.profiles.find(p => p.id === v.owner_id) })));
    if (key === 'rpc:set_vehicle_listing_status') {
      const vehicle = state.vehicles.find(v => v.id === body.target_vehicle);
      Object.assign(vehicle, { status: body.next_status }); return respond(vehicle);
    }
    if (key === 'rpc:get_admin_leads') return respond([state.lead]);
    if (key === 'rpc:set_lead_status') {
      Object.assign(state.lead, { lead_status: body.new_status, lead_updated_at: new Date().toISOString() });
      return respond([state.lead]);
    }
  });
  return state;
}
