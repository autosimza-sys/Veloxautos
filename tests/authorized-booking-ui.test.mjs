import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import React from "react";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<html><body></body></html>", { url: "http://localhost" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.React = React;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { render, fireEvent, act, cleanup, waitFor } = await import("@testing-library/react");
const { default: Booking } = await import("../features/agenda/AuthorizedVisitBooking.jsx");
const { default: Notices } = await import("../features/agenda/VisitNotices.jsx");
afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});
const conversation = { id: "conversation", buyer_id: "buyer", seller_id: "seller", vehicle_id: "car", is_blocked: false };
const slot = { authorization_id: "permission", scheduled_at: "2099-10-03T15:00:00Z", duration_minutes: 30, location: "Lugar privado", timezone: "America/Argentina/Mendoza" };
const receipt = { id: "visit", conversation_id: "conversation", buyer_id: "buyer", seller_id: "seller", scheduled_at: slot.scheduled_at, duration_minutes: 30, location: slot.location, status: "confirmed", confirmation_source: "seller_authorization", buyer_confirmed_at: "2026-10-09T17:00Z", seller_confirmed_at: "2026-10-09T16:00Z" };
const notice = { id: "notice", appointment_id: "visit", conversation_id: "conversation", recipient_id: "seller", kind: "confirmed", status: "confirmed", vehicle_title: "Test Car", buyer_name: "Comprador", scheduled_at: slot.scheduled_at, duration_minutes: 30, location: slot.location, read_at: null, created_at: "2026-10-09T17:00Z", timezone: slot.timezone };
async function open(client, extras = {}) {
  const v = render(/* @__PURE__ */ React.createElement(Booking, { conversation, userId: "buyer", client, ...extras }));
  await act(async () => fireEvent.click(v.getByRole("button", { name: "Ver horarios autorizados" })));
  return v;
}
async function select(v) {
  await act(async () => fireEvent.click(v.getByRole("button", { name: /Elegir horario/ })));
}
test("buyer reviews time, duration, location and explicitly agrees before one booking", async () => {
  const calls = [];
  let refreshed = 0;
  const client = { rpc: async (n, a) => {
    calls.push({ n, a });
    return { data: n === "get_available_visit_slots" ? [slot] : receipt };
  } };
  const v = await open(client, { onBooked: () => refreshed++ });
  await select(v);
  assert.match(v.container.textContent, /Lugar privado/);
  assert.equal(v.getByRole("button", { name: "Confirmar esta visita" }).disabled, true);
  fireEvent.click(v.getByRole("checkbox"));
  await act(async () => fireEvent.click(v.getByRole("button", { name: "Confirmar esta visita" })));
  await waitFor(() => assert.match(v.container.textContent, /Visita confirmada/));
  assert.equal(calls.filter((c) => c.n === "book_authorized_visit").length, 1);
  assert.equal(calls.at(-1).a.buyer_consent, true);
  assert.match(v.container.textContent, /Visita confirmada/);
  assert.equal(refreshed, 1);
});
test("ambiguous network retry keeps reference and never claims confirmation early", async () => {
  const requests = [];
  const client = { rpc: async (n, a) => {
    if (n === "get_available_visit_slots") return { data: [slot] };
    requests.push(a.booking_request_id);
    if (requests.length === 1) throw Error("offline");
    return { data: receipt };
  } };
  const v = await open(client);
  await select(v);
  fireEvent.click(v.getByRole("checkbox"));
  await act(async () => fireEvent.click(v.getByRole("button", { name: "Confirmar esta visita" })));
  await waitFor(() => assert.match(v.container.textContent, /No pudimos confirmar/));
  await act(async () => fireEvent.click(v.getByRole("button", { name: "Confirmar esta visita" })));
  await waitFor(() => assert.match(v.container.textContent, /Visita confirmada/));
  assert.equal(requests[0], requests[1]);
  assert.match(v.container.textContent, /Visita confirmada/);
});
test("missing backend or stale permission fails closed and allows refreshing availability", async () => {
  const v = await open({ rpc: async () => ({ error: { message: "private database diagnostic" } }) });
  assert.match(v.container.textContent, /No pudimos cargar/);
  assert.doesNotMatch(v.container.textContent, /private database/);
  assert.equal(v.queryByRole("button", { name: "Confirmar esta visita" }), null);
});
test("seller and blocked conversation cannot expose buyer booking controls", () => {
  const v = render(/* @__PURE__ */ React.createElement(Booking, { conversation, userId: "seller", client: {} }));
  assert.equal(v.queryByRole("button"), null);
  v.rerender(/* @__PURE__ */ React.createElement(Booking, { conversation: { ...conversation, is_blocked: true }, userId: "buyer", client: {} }));
  assert.equal(v.queryByRole("button"), null);
});
test("empty availability explains manual alternative without inventing a slot", async () => {
  const v = await open({ rpc: async () => ({ data: [] }) });
  assert.match(v.container.textContent, /No hay horarios/);
  assert.equal(v.queryByRole("checkbox"), null);
});
test("mismatched receipt retains draft and never reports success", async () => {
  const v = await open({ rpc: async (n) => ({ data: n === "get_available_visit_slots" ? [slot] : { ...receipt, conversation_id: "other" } }) });
  await select(v);
  fireEvent.click(v.getByRole("checkbox"));
  await act(async () => fireEvent.click(v.getByRole("button", { name: "Confirmar esta visita" })));
  await waitFor(() => assert.match(v.container.textContent, /No pudimos confirmar/));
  assert.equal(v.getByRole("checkbox").checked, true);
});
test("notice shows car, buyer and appointment; explicit acknowledgment marks only its receipt read", async () => {
  let read = false;
  const client = { rpc: async (n) => ({ data: n === "get_visit_notices" ? [{ ...notice, read_at: read ? "2026-10-09T18:00Z" : null }] : (read = true, { id: "notice", read_at: "2026-10-09T18:00Z" }) }) };
  const v = render(/* @__PURE__ */ React.createElement(Notices, { userId: "seller", client }));
  await waitFor(() => v.getByText("Test Car"));
  assert.match(v.container.textContent, /Comprador/);
  assert.match(v.container.textContent, /Lugar privado/);
  await act(async () => fireEvent.click(v.getByRole("button", { name: "Marcar como le\xEDdo" })));
  assert.equal(v.queryByRole("button", { name: "Marcar como le\xEDdo" }), null);
});
test("cancelled notice does not present the original confirmation as an upcoming agreed visit", async () => {
  const v = render(/* @__PURE__ */ React.createElement(Notices, { userId: "seller", client: { rpc: async () => ({ data: [{ ...notice, status: "cancelled" }] }) } }));
  await waitFor(() => v.getByText("Test Car"));
  assert.match(v.container.textContent, /Visita cancelada/);
});
test('old conversation availability cannot replace the new conversation',async()=>{
 let resolve;const client={rpc:()=>new Promise(r=>{resolve=r;})};
 const v=await open(client);v.rerender(React.createElement(Booking,{conversation:{...conversation,id:'new'},userId:'buyer',client}));
 await act(async()=>resolve({data:[slot]}));assert.equal(v.queryByText(/Lugar privado/),null);assert.equal(v.queryByRole('button',{name:/Elegir horario/}),null);
});
test('notice failures do not mark read and expose no internal diagnostic',async()=>{
 const client={rpc:async n=>n==='get_visit_notices'?{data:[notice]}:{error:{message:'PRIVATE diagnostic'}}};
 const v=render(React.createElement(Notices,{userId:'seller',client}));await waitFor(()=>v.getByText('Test Car'));
 await act(async()=>fireEvent.click(v.getByRole('button',{name:'Marcar como leído'})));
 assert.match(v.container.textContent,/No pudimos marcar/);assert.doesNotMatch(v.container.textContent,/PRIVATE/);assert.ok(v.getByRole('button',{name:'Marcar como leído'}));
});
test('account change ignores late private notices and refresh errors fail safely',async()=>{
 let resolve;const client={rpc:()=>new Promise(r=>{resolve=r;})};
 const v=render(React.createElement(Notices,{userId:'seller',client}));await act(async()=>{});const first=resolve;
 v.rerender(React.createElement(Notices,{userId:'other',client:{rpc:async()=>({error:{message:'private error'}})}}));
 await act(async()=>first({data:[notice]}));await waitFor(()=>assert.match(v.container.textContent,/No pudimos actualizar/));assert.doesNotMatch(v.container.textContent,/Lugar privado|private error/);
});
test('focus refreshes notices and signed-out users have no private surface',async()=>{
 let calls=0;const client={rpc:async()=>{calls++;return{data:[]};}};
 const v=render(React.createElement(Notices,{userId:'seller',client}));await act(async()=>{});
 await act(async()=>window.dispatchEvent(new window.Event('focus')));assert.equal(calls,2);
 v.rerender(React.createElement(Notices,{userId:null,client}));assert.equal(v.queryByRole('button'),null);
});
test('changing chosen slot clears acceptance and receipt for cancelled retry is explicit',async()=>{
 const v=await open({rpc:async n=>({data:n==='get_available_visit_slots'?[slot]:{...receipt,status:'cancelled'}})});
 await select(v);fireEvent.click(v.getByRole('checkbox'));fireEvent.click(v.getByRole('button',{name:'Elegir otro horario'}));await select(v);assert.equal(v.getByRole('checkbox').checked,false);
 fireEvent.click(v.getByRole('checkbox'));await act(async()=>fireEvent.click(v.getByRole('button',{name:'Confirmar esta visita'})));
 await waitFor(()=>assert.match(v.container.textContent,/ya fue cancelada/));assert.doesNotMatch(v.container.textContent,/Visita confirmada/);
});
