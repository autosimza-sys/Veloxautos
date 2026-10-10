import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import React from "react";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/velox-admin" });
globalThis.window = dom.window;
globalThis.self = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.confirm = () => true;
const { render, fireEvent, cleanup, act } = await import("@testing-library/react");
const { default: AdminDashboard } = await import("../../features/admin/AdminDashboard.jsx");
afterEach(cleanup);

const leads = [
  { id: "lead-1", vehicle_brand: "Toyota", vehicle_model: "Corolla", vehicle_year: 2020, vehicle_zone: "Mendoza", vehicle_status: "active", buyer_name: "Ana", seller_name: "Autos Demo", lead_status: "new", created_at: "2026-10-01T12:00:00Z", lead_updated_at: "2026-10-01T12:00:00Z", is_reported: true, is_blocked: false },
  { id: "lead-2", vehicle_brand: "Ford", vehicle_model: "Focus", vehicle_year: 2019, vehicle_zone: "Mendoza", vehicle_status: "paused", buyer_name: "Luis", seller_name: "Autos Demo", lead_status: "interested", created_at: "2026-10-02T12:00:00Z", lead_updated_at: "2026-10-02T12:00:00Z", is_reported: false, is_blocked: false },
];
const flush = () => act(() => new Promise(resolve => setTimeout(resolve, 5)));
function setup(options = {}) {
  const calls = [];
  let authListener;
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "admin" } } } }),
      onAuthStateChange: listener => { authListener = listener; return { data: { subscription: { unsubscribe() {} } } }; },
    },
    from(table) {
      calls.push(["from", table]);
      if (table === "profiles") return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: "admin", role: "admin", display_name: "Admin", is_blocked: false }, error: null }) }) }) };
      if (table === "vehicles") return { select: () => ({ order: async () => ({ data: options.vehicles || [], error: null }) }) };
      throw new Error(`Private or unexpected table: ${table}`);
    },
    async rpc(name, params) {
      calls.push(["rpc", name, params]);
      if (name === "get_admin_leads") return options.load ? options.load() : { data: leads.map(lead => ({ ...lead })), error: null };
      if (name === "set_vehicle_listing_status") return options.vehicleSave(params);
      if (name === "set_lead_status") return options.save ? options.save(params) : { data: [{ id: params.target_conversation, lead_status: params.new_status, lead_updated_at: "2026-10-03T03:00:00Z" }], error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    },
  };
  const routes = [];
  const router = { replace: path => routes.push(path) };
  const view = render(React.createElement(AdminDashboard, { client, router }));
  return { view, calls, routes, emitAuth: session => authListener("SIGNED_OUT", session) };
}
async function openCRM(view) {
  await view.findByRole("button", { name: /CRM \/ Leads/ });
  fireEvent.click(view.getByRole("button", { name: /CRM \/ Leads/ }));
  await flush();
}

test("admin CRM loads RPC metadata and never queries private chats or other profile details", async () => {
  const { view, calls } = setup();
  await openCRM(view);
  fireEvent.click(view.getByRole("button", { name: /Toyota Corolla/ }));
  assert.ok(view.getByText("Ana", { exact: true }));
  assert.ok(view.getByText(/Mensajes privados/));
  assert.ok(view.getByText(/revisión.*pendiente/i));
  assert.ok(calls.some(call => call[1] === "get_admin_leads"));
  assert.equal(calls.filter(call => call[0] === "from" && call[1] === "profiles").length, 1);
  assert.ok(calls.every(call => !["messages", "conversations"].includes(call[1])));
});

test("failed CRM load is explicit and retry recovers instead of claiming an empty inbox", async () => {
  let attempts = 0;
  const { view } = setup({ load: () => ++attempts === 1 ? { error: { message: "offline" } } : { data: leads, error: null } });
  await openCRM(view);
  assert.ok(view.getByRole("alert"));
  assert.equal(view.queryByText("Sin conversaciones"), null);
  fireEvent.click(view.getByRole("button", { name: /Reintentar CRM/ }));
  await view.findByRole("button", { name: /Toyota Corolla/ });
  assert.equal(attempts, 2);
});

test("CRM save waits for validated RPC success and guards repeated changes", async () => {
  let resolveSave;
  const { view, calls } = setup({ save: () => new Promise(resolve => { resolveSave = resolve; }) });
  await openCRM(view);
  fireEvent.click(view.getByRole("button", { name: /Toyota Corolla/ }));
  const select = view.getByLabelText("Estado lead");
  act(() => {
    fireEvent.change(select, { target: { value: "closed" } });
    fireEvent.change(select, { target: { value: "lost" } });
  });
  assert.equal(calls.filter(call => call[1] === "set_lead_status").length, 1);
  assert.equal(select.disabled, true);
  await act(async () => resolveSave({ data: [{ id: "lead-1", lead_status: "closed", lead_updated_at: "2026-10-03T03:00:00Z" }], error: null }));
  assert.equal(view.getByLabelText("Estado lead").value, "closed");
  assert.equal(view.getByLabelText("Estado lead").disabled, false);
});

test("save errors and empty responses preserve the prior status and permit retry", async () => {
  let attempts = 0;
  const { view } = setup({ save: () => ++attempts === 1 ? { error: { message: "denied" } } : { data: [], error: null } });
  await openCRM(view);
  fireEvent.click(view.getByRole("button", { name: /Toyota Corolla/ }));
  fireEvent.change(view.getByLabelText("Estado lead"), { target: { value: "closed" } });
  await flush();
  assert.equal(view.getByLabelText("Estado lead").value, "new");
  assert.ok(view.getByText(/denied/));
  fireEvent.change(view.getByLabelText("Estado lead"), { target: { value: "closed" } });
  await flush();
  assert.equal(view.getByLabelText("Estado lead").value, "new");
  assert.ok(view.getByText(/No se confirmó/));
});

test("an older save cannot overwrite a newly selected lead", async () => {
  let resolveSave;
  const { view } = setup({ save: () => new Promise(resolve => { resolveSave = resolve; }) });
  await openCRM(view);
  fireEvent.click(view.getByRole("button", { name: /Toyota Corolla/ }));
  fireEvent.change(view.getByLabelText("Estado lead"), { target: { value: "closed" } });
  fireEvent.click(view.getByRole("button", { name: /Ford Focus/ }));
  await act(async () => resolveSave({ data: [{ id: "lead-1", lead_status: "closed", lead_updated_at: "2026-10-03T03:00:00Z" }], error: null }));
  assert.ok(view.getByText("Luis", { exact: true }));
  assert.equal(view.getByLabelText("Estado lead").value, "interested");
});

test("sign-out clears admin metadata and cannot be reversed by an old CRM response", async () => {
  let resolveLoad;
  const { view, emitAuth, routes } = setup({ load: () => new Promise(resolve => { resolveLoad = resolve; }) });
  await flush();
  act(() => emitAuth(null));
  await flush();
  await act(async () => resolveLoad({ data: leads, error: null }));
  assert.equal(view.queryByRole("button", { name: /Toyota Corolla/ }), null);
  assert.ok(routes.includes("/"));
});


const vehicles = [
  { id: "car-1", brand: "Toyota", model: "Etios", year: 2020, price: 100, status: "active", created_at: "2026-10-01T12:00:00Z" },
  { id: "car-2", brand: "Ford", model: "Fiesta", year: 2019, price: 200, status: "active", created_at: "2026-10-02T12:00:00Z" },
];

test("admin retirement uses status RPC and keeps a recoverable row without deleting media", async () => {
  const { view, calls } = setup({ vehicles: [vehicles[0]], vehicleSave: params => ({ data: { ...vehicles[0], status: params.next_status }, error: null }) });
  await view.findByText("Toyota Etios");
  fireEvent.click(view.getByRole("button", { name: "Retirar" }));
  await flush();
  assert.ok(view.getByText("Toyota Etios"));
  assert.ok(view.getByText(/● Retirada/));
  assert.ok(view.getByRole("button", { name: "Restaurar" }));
  assert.deepEqual(calls.find(call => call[1] === "set_vehicle_listing_status")[2], { target_vehicle: "car-1", next_status: "deleted" });
  assert.ok(calls.every(call => call[1] !== "vehicle_media"));
});

test("bulk retirement reports per-item failure and retains the failed item selected", async () => {
  const { view } = setup({ vehicles, vehicleSave: params => params.target_vehicle === "car-1"
    ? { data: { ...vehicles[0], status: "deleted" }, error: null }
    : { error: { message: "sin permiso" } } });
  await view.findByText("Toyota Etios");
  fireEvent.click(view.getByLabelText("Seleccionar todas las publicaciones"));
  fireEvent.click(view.getByRole("button", { name: /Retirar seleccionadas/ }));
  await flush();
  assert.ok(view.getByText(/1 retirada.*1 sin retirar/));
  assert.equal(view.getByLabelText("Seleccionar Toyota Etios").checked, false);
  assert.equal(view.getByLabelText("Seleccionar Ford Fiesta").checked, true);
  assert.ok(view.getByText(/sin permiso/));
});

test("unconfirmed vehicle status response never announces success", async () => {
  const { view } = setup({ vehicles: [vehicles[0]], vehicleSave: () => ({ data: null, error: null }) });
  await view.findByText("Toyota Etios");
  fireEvent.click(view.getByRole("button", { name: "Pausar" }));
  await flush();
  assert.ok(view.getByText(/No se confirmó/));
  assert.ok(view.getByText(/● Activa/));
});
