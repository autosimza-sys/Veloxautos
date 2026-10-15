import { installPilotApi, syntheticCatalogPage } from './pilot-api.mjs';
export { login, logout } from './pilot-api.mjs';
export const id = n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const stamp = () => new Date().toISOString();
const actorOf = request => {
  try { return JSON.parse(Buffer.from(request.headers().authorization.split('.')[1], 'base64url')).sub; } catch { return null; }
};

// Reuses the committed fixture, extending only HTTP responses in this process.
// This transport is test data, never evidence of server authorization or RLS.
export async function installExtraApi(page) {
  const base = await installPilotApi(page);
  const buyer = base.profiles[6], seller = base.profiles[0], vehicle = base.vehicles[0];
  const conversation = { id: id(1), buyer_id: buyer.id, seller_id: seller.id, vehicle_id: vehicle.id,
    vehicle_brand: vehicle.brand, vehicle_model: vehicle.model, is_blocked: false, is_reported: false,
    created_at: stamp(), lead_status: 'new' };
  const state = { ...base, buyer, seller, conversation, messages: [], reports: [], appointments: [], notices: [],
    extraCalls: [], failures: new Set(), receipts: new Map(), slots: [], aiCalls: 0 };
  state.failOnce = key => state.failures.add(key);
  state.addAppointment = (props = {}) => {
    const item = { id: id(200 + state.appointments.length), conversation_id: conversation.id,
      buyer_id: buyer.id, seller_id: seller.id, proposed_by: buyer.id, status: 'proposed',
      scheduled_at: new Date(Date.now() + 7 * 86400000).toISOString(), duration_minutes: 30,
      location: 'Lugar sintético', legacy_unverified: false, ...props };
    state.appointments.push(item); return item;
  };
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    const respond = (data, status = 200) => route.fulfill({ status, contentType: 'application/json',
      body: JSON.stringify(data), headers: { 'access-control-allow-origin': '*' } });
    if (url.pathname === '/api/assistant') {
      state.aiCalls++; return respond({ state: 'skipped' });
    }
    if (url.hostname !== 'pilot-supabase.invalid') return route.fallback();
    if (url.pathname.startsWith('/media/')) return route.fulfill({ contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#357"/></svg>' });
    const key = url.pathname.replace('/rest/v1/rpc/', 'rpc:').replace('/rest/v1/', 'table:');
    const handlers = ['rpc:get_vehicle_catalog_page', 'rpc:get_my_conversations', 'table:conversations', 'table:messages',
      'table:reports', 'rpc:send_message_idempotent', 'table:appointments', 'rpc:propose_appointment',
      'rpc:transition_appointment', 'rpc:get_visit_notices', 'rpc:read_visit_notice',
      'rpc:get_available_visit_slots', 'rpc:book_authorized_visit'];
    if (!handlers.includes(key)) return route.fallback();
    const body = request.postDataJSON() || {}, actor = actorOf(request), method = request.method();
    state.extraCalls.push({ key, body, actor, method });
    if (method === 'OPTIONS') return respond({});
    if (state.failures.delete(key)) return respond({ code: 'test_network', message: 'Network failure simulated locally' }, 503);
    const member = [buyer.id, seller.id].includes(actor);
    if (key === 'rpc:get_vehicle_catalog_page') return respond(syntheticCatalogPage(base.vehicles.map(v => ({ ...v,
      seller_name: base.profiles.find(p => p.id === v.owner_id).display_name,
      seller_type: base.profiles.find(p => p.id === v.owner_id).role,
      price: actor ? v.price : null, kilometers: actor ? v.kilometers : null,
      media: v.id === vehicle.id ? [0, 1, 2].map(n => ({ media_type: 'photo', sort_order: n,
        storage_path: `https://pilot-supabase.invalid/media/photo-${n}.svg` })) : [] })),body));
    if (key === 'rpc:get_my_conversations') return respond(member ? [{ ...conversation,
      counterparty_name: actor === buyer.id ? seller.display_name : buyer.display_name }] : []);
    if (key === 'table:conversations') {
      if (!member) return respond(null);
      if (method === 'PATCH') Object.assign(conversation, body);
      return respond(conversation);
    }
    if (key === 'table:messages') {
      if (method === 'PATCH') state.messages.filter(m => m.sender_id !== actor).forEach(m => Object.assign(m, body));
      return respond(member ? state.messages : []);
    }
    if (key === 'rpc:send_message_idempotent') {
      if (state.receipts.has(body.message_request_id)) return respond(state.receipts.get(body.message_request_id));
      const message = { id: id(10 + state.messages.length), conversation_id: conversation.id, sender_id: actor,
        body: body.message_body, created_at: stamp(), read_at: null, is_automated: false };
      state.messages.push(message);
      const automatic = { ...message, id: id(10 + state.messages.length), sender_id: seller.id,
        body: 'Respuesta automática sintética: el vendedor conserva ambas llaves.', is_automated: true };
      state.messages.push(automatic);
      const receipt = { message_id: message.id, automated: true, automated_message_id: automatic.id };
      state.receipts.set(body.message_request_id, receipt); return respond(receipt);
    }
    if (key === 'table:reports') { state.reports.push(body); return respond({}); }
    if (key === 'table:appointments') return respond(member ? state.appointments : []);
    if (key === 'rpc:propose_appointment') return respond(state.addAppointment({
      scheduled_at: body.appointment_scheduled_at, duration_minutes: body.appointment_duration_minutes,
      location: body.appointment_location, proposed_by: actor }));
    if (key === 'rpc:transition_appointment') {
      const item = state.appointments.find(a => a.id === body.target_appointment);
      Object.assign(item, { status: body.next_status });
      if (['accepted', 'confirmed'].includes(body.next_status)) item[actor === buyer.id ? 'buyer_confirmed_at' : 'seller_confirmed_at'] = stamp();
      return respond(item);
    }
    if (key === 'rpc:get_visit_notices') return respond(state.notices.filter(n => n.recipient_id === actor));
    if (key === 'rpc:read_visit_notice') {
      const notice = state.notices.find(n => n.id === body.target_notice && n.recipient_id === actor);
      if (!notice) return respond({}, 403);
      notice.read_at = stamp(); return respond(notice);
    }
    if (key === 'rpc:get_available_visit_slots') return respond(state.slots);
    if (key === 'rpc:book_authorized_visit') {
      const slot = state.slots.find(s => s.authorization_id === body.target_authorization && s.scheduled_at === body.slot_start);
      return respond(state.addAppointment({ ...slot, status: 'confirmed', confirmation_source: 'seller_authorization',
        buyer_confirmed_at: stamp(), seller_confirmed_at: stamp() }));
    }
  });
  return state;
}
