import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import React from "react";
import { JSDOM } from "jsdom";
import * as quality from "../features/publication/publication-quality.js";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.React = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { render, fireEvent, cleanup, act } = await import("@testing-library/react");
const { default: PublicationAssistant } = await import("../features/publication/PublicationAssistant.jsx");

afterEach(() => cleanup());

function formWithFacts() {
  return {
    ...quality.createPublicationForm(), brand: "Marca de prueba", model: "Modelo de prueba", version: "Base",
    year: "2020", kilometers: "0", price: "1000000", zone: "Zona de prueba",
  };
}

test("an empty publication starts at zero, without default mechanical claims", () => {
  const form = quality.createPublicationForm();
  assert.equal(quality.getPublicationQuality({ form, photos: [], videoFile: null }), 0);
  assert.equal(form.year, "");
  assert.ok(Object.values(form.checklist).every(value => !value));
  assert.doesNotMatch(quality.buildDescription(form), /0 km|motor bueno|caja buena|nunca chocado|undefined|NaN/);
});

test("generated descriptions include only explicitly provided facts", () => {
  const form = formWithFacts();
  const description = quality.buildDescription(form);
  assert.match(description, /0 km/);
  assert.doesNotMatch(description, /motor|caja|interior/);
  assert.match(quality.buildDescription({ ...form, checklist: { motor: "regular" } }), /motor regular/);
});

test("blank or unrecognized checklist values do not inflate quality", () => {
  const form = quality.createPublicationForm();
  assert.equal(quality.getPublicationQuality({ form: { ...form, checklist: { a: "bueno", b: "bueno" } }, photos: [], videoFile: null }), 0);
});

test("numeric validation requires compatible integers and a plausible year", () => {
  const form = formWithFacts();
  assert.equal(quality.validatePublicationStep(0, form, []), true);
  assert.equal(quality.validatePublicationStep(1, form, []), true);
  assert.equal(quality.validatePublicationStep(2, form, []), true);
  for (const year of ["", " ", 0, 1885, 3000, 2020.5, Infinity]) {
    assert.equal(quality.validatePublicationStep(0, { ...form, year }, []), false, `year ${year}`);
  }
  for (const kilometers of ["", " ", -1, "no", Infinity, 1.5, 2147483648]) {
    assert.equal(quality.validatePublicationStep(1, { ...form, kilometers }, []), false, `km ${kilometers}`);
  }
  for (const price of ["", " ", 0, -1, Infinity, 1.5, 2147483648]) {
    assert.equal(quality.validatePublicationStep(2, { ...form, price }, []), false, `price ${price}`);
  }
  assert.equal(quality.validatePublicationStep(0, { ...form, brand: " " }, []), false);
  assert.equal(quality.validatePublicationStep(2, { ...form, zone: " " }, []), false);
});

test("photo validation requires all four unique guided photos", () => {
  const form = formWithFacts();
  const file = { type: "image/jpeg", size: 32 };
  assert.equal(quality.validatePublicationStep(3, form, ["front", "right", "left", "interior"].map(kind => ({ kind, file }))), true);
  assert.equal(quality.validatePublicationStep(3, form, ["front", "front", "left", "interior"].map(kind => ({ kind, file }))), false);
  assert.equal(quality.validatePublicationStep(3, form, ["dashboard", "engine", "trunk", "tires"].map(kind => ({ kind, file }))), false);
});

test("media checks reject wrong MIME, empty content and oversized files", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp"]) {
    assert.equal(quality.validatePublicationMedia({ type, size: 3 * 1024 * 1024 }, "photo"), "");
  }
  assert.ok(quality.validatePublicationMedia({ type: "image/svg+xml", size: 100 }, "photo"));
  assert.ok(quality.validatePublicationMedia({ type: "text/plain", size: 100 }, "photo"));
  assert.ok(quality.validatePublicationMedia({ type: "image/jpeg", size: 3 * 1024 * 1024 + 1 }, "photo"));
  assert.ok(quality.validatePublicationMedia({ type: "image/jpeg", size: 0 }, "photo"));
  assert.equal(quality.validatePublicationMedia({ type: "video/mp4", size: 25 * 1024 * 1024 }, "video"), "");
  assert.ok(quality.validatePublicationMedia({ type: "text/plain", size: 100 }, "video"));
  assert.ok(quality.validatePublicationMedia({ type: "video/mp4", size: 25 * 1024 * 1024 + 1 }, "video"));
});

function renderWizard(t, onPublish = async () => true) {
  let url = 0;
  const created = t.mock.method(URL, "createObjectURL", () => `blob:test-${++url}`);
  const revoked = t.mock.method(URL, "revokeObjectURL", () => {});
  const view = render(React.createElement(PublicationAssistant, {
    canPublish: true, profile: { role: "particular" }, onNeedAuth() {}, onPublish, publishStatus: "",
  }));
  return { view, created, revoked };
}

function fill(view, label, value) {
  fireEvent.change(view.getByLabelText(label, { exact: false }), { target: { value } });
}

function continueWizard(view) { fireEvent.click(view.getByRole("button", { name: "Continuar", exact: true })); }

function reachPhotos(view) {
  fill(view, "Marca", "Marca de prueba");
  fill(view, "Modelo", "Modelo de prueba");
  fill(view, "Version", "Base");
  fill(view, "Ano", "2020");
  continueWizard(view);
  fill(view, "Cuantos kilometros tiene?", "0");
  continueWizard(view);
  fill(view, "Que precio queres publicar?", "1000000");
  fill(view, "Ubicacion", "Zona de prueba");
  continueWizard(view);
}

function uploadPhoto(view, index = 0, options = {}) {
  const file = new dom.window.File(["fake-image-for-local-test"], "foto.jpg", { type: "image/jpeg", ...options });
  fireEvent.change(view.container.querySelectorAll('input[type="file"]')[index], { target: { files: [file] } });
  return file;
}

function reachReview(view) {
  reachPhotos(view);
  for (let index = 0; index < 4; index += 1) uploadPhoto(view, index);
  continueWizard(view);
  const selects = view.getAllByRole("combobox");
  assert.ok(selects.every(select => select.value === ""));
  assert.equal(view.getByRole("button", { name: "Continuar", exact: true }).disabled, true);
  for (const select of selects) fireEvent.change(select, { target: { value: "no revisado" } });
  continueWizard(view);
  assert.match(view.getByLabelText("Descripcion sugerida").value, /0 km/);
  assert.doesNotMatch(view.getByLabelText("Descripcion sugerida").value, /motor bueno|caja buena|nunca chocado/);
  continueWizard(view);
}

test("seven-step flow submits once, blocks repeated clicks and resets after success", async (t) => {
  let release;
  const calls = [];
  const { view, revoked } = renderWizard(t, payload => {
    calls.push(payload);
    return new Promise(resolve => { release = resolve; });
  });
  assert.ok(view.getByText("0% completa"));
  reachReview(view);
  const button = view.getByRole("button", { name: "Confirmar y publicar" });
  act(() => {
    button.click();
    button.click();
  });
  assert.equal(calls.length, 1);
  assert.equal(button.disabled, true);
  assert.equal(view.getByRole("button", { name: "Volver" }).disabled, true);
  assert.equal(calls[0].form.kilometers, "0");
  assert.equal(calls[0].photoFiles.length, 4);
  assert.ok(Object.values(calls[0].form.checklist).every(value => value === "no revisado"));
  await act(async () => release(true));
  assert.ok(view.getByText("0% completa"));
  assert.equal(view.getByLabelText("Marca").value, "");
  assert.equal(revoked.mock.callCount(), 4);
});

test("upload rejects non-images without creating previews", (t) => {
  const { view, created } = renderWizard(t);
  reachPhotos(view);
  uploadPhoto(view, 0, { type: "text/plain" });
  assert.equal(created.mock.callCount(), 0);
  assert.ok(view.getByText(/formato/i));
  assert.ok(view.getByText("0/8 fotos cargadas. Necesitas al menos 4."));
});

test("previews are revoked on replacement, removal and unmount exactly once", (t) => {
  const { view, created, revoked } = renderWizard(t);
  reachPhotos(view);
  uploadPhoto(view);
  uploadPhoto(view);
  fireEvent.click(view.getByRole("button", { name: "Eliminar", exact: true }));
  uploadPhoto(view, 1);
  view.unmount();
  assert.equal(created.mock.callCount(), 3);
  assert.deepEqual(revoked.mock.calls.map(call => call.arguments[0]).sort(), ["blob:test-1", "blob:test-2", "blob:test-3"]);
});

test("a failed publication keeps the draft and permits an explicit retry", async (t) => {
  let calls = 0;
  const { view, revoked } = renderWizard(t, async () => {
    calls += 1;
    throw new Error("simulated failure");
  });
  reachReview(view);
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Confirmar y publicar" })));
  assert.equal(calls, 1);
  assert.equal(revoked.mock.callCount(), 0);
  assert.ok(view.getByText(/No pudimos publicar/i));
  assert.equal(view.getByRole("button", { name: "Confirmar y publicar" }).disabled, false);
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Confirmar y publicar" })));
  assert.equal(calls, 2);
});

test("repeated Continue clicks do not skip a step, and Back retains entered data", (t) => {
  const { view } = renderWizard(t);
  fill(view, "Marca", "Marca de prueba");
  fill(view, "Modelo", "Modelo de prueba");
  fill(view, "Version", "Base");
  fill(view, "Ano", "2020");
  const next = view.getByRole("button", { name: "Continuar", exact: true });
  act(() => { next.click(); next.click(); });
  assert.ok(view.getByLabelText("Cuantos kilometros tiene?", { exact: false }));
  fill(view, "Cuantos kilometros tiene?", "0");
  fireEvent.click(view.getByRole("button", { name: "Volver" }));
  assert.equal(view.getByLabelText("Marca").value, "Marca de prueba");
  continueWizard(view);
  assert.equal(view.getByLabelText("Cuantos kilometros tiene?", { exact: false }).value, "0");
});

test("false publish results preserve the draft and release the busy lock", async (t) => {
  const { view, revoked } = renderWizard(t, async () => false);
  reachReview(view);
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Confirmar y publicar" })));
  assert.equal(view.getByRole("button", { name: "Confirmar y publicar" }).disabled, false);
  assert.equal(revoked.mock.callCount(), 0);
  assert.ok(view.getByText("4/8"));
});

test("a complete publication reaches 100 without assuming a good mechanical condition", () => {
  const form = {
    ...formWithFacts(),
    description: "Descripción ficticia de prueba. ".repeat(5),
    viewLocation: "Lugar ficticio", availableHours: "A coordinar", partialPlate: "ABC",
  };
  for (const key of Object.keys(form.checklist)) form.checklist[key] = "no revisado";
  assert.equal(quality.getPublicationQuality({ form, photos: quality.PHOTO_GUIDE.map(({ id }) => ({ kind: id })), videoFile: true }), 100);
  assert.match(quality.buildDescription(form), /motor no revisado/);
});

test("catalog completeness scores only fields actually received", () => {
  assert.equal(quality.getVehicleQuality({}), 0);
  assert.equal(quality.getVehicleQuality({ brand: "Marca", model: "Modelo", version: "Base", year: 2020, km: 0, price: 1, zone: "Zona" }), 20);
});

test("going back to correct a declaration refreshes an untouched suggested description", (t) => {
  const { view } = renderWizard(t);
  reachReview(view);
  fireEvent.click(view.getByRole("button", { name: "Volver" }));
  fireEvent.click(view.getByRole("button", { name: "Volver" }));
  fireEvent.change(view.getByLabelText("Motor"), { target: { value: "regular" } });
  continueWizard(view);
  assert.match(view.getByLabelText("Descripcion sugerida").value, /motor regular/);
  fill(view, "Descripcion sugerida", "Texto escrito por el vendedor.");
  fireEvent.click(view.getByRole("button", { name: "Volver" }));
  fireEvent.change(view.getByLabelText("Motor"), { target: { value: "bueno" } });
  continueWizard(view);
  assert.equal(view.getByLabelText("Descripcion sugerida").value, "Texto escrito por el vendedor.");
});

test("losing publication permission before confirming cannot submit", (t) => {
  let calls = 0;
  const { view } = renderWizard(t, async () => { calls += 1; return true; });
  reachReview(view);
  view.rerender(React.createElement(PublicationAssistant, {
    canPublish: false, profile: { role: "buyer" }, onNeedAuth() {}, onPublish: async () => { calls += 1; }, publishStatus: "",
  }));
  const button = view.getByRole("button", { name: "Confirmar y publicar" });
  fireEvent.click(button);
  assert.equal(button.disabled, true);
  assert.equal(calls, 0);
});

test("a seller without credits sees the supplied access explanation rather than an invalid role claim", () => {
  const view = render(React.createElement(PublicationAssistant, {
    canPublish: false,
    profile: { role: "particular" },
    publishAccessMessage: "No te quedan creditos de publicacion.",
    onNeedAuth() {}, onPublish() {}, publishStatus: "",
  }));
  assert.ok(view.getByText("No te quedan creditos de publicacion."));
  assert.equal(view.queryByText(/no tiene permiso de publicación/i), null);
  assert.equal(view.queryByText(/cambiar tu rol/i), null);
});
