import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { generateClaudeAnswer, generateRuleBasedAnswer, getAssistantAnswer } from "../lib/assistant.js";
import { formatDeclaredBoolean, generateRuleBasedAnswer as clientRules } from "../lib/assistant-rules.js";

const vehicle = {
  id: "test-vehicle",
  brand: "Toyota",
  model: "Corolla",
  status: "active",
  km: 41000,
  price: 45800000,
  zone: "Palermo, CABA",
  viewLocation: "Av. Santa Fe 3200",
  availableHours: "Sábados de 10 a 13",
  acceptsTrade: true,
  acceptsFinancing: false,
  description: "Service declarado al día.",
};

for (const question of [
  "¿Cuántos kilómetros tiene?",
  "¿CUÁNTOS KILÓMETROS TIENE?",
  "¿Cuántos kilómetros tiene?".normalize("NFD"),
  "¿Cuántos kilometros tiene?",
  "km?",
  "¿Cuánto recorrió?",
]) {
  test(`recognizes mileage: ${question}`, () => {
    assert.match(generateRuleBasedAnswer(question, vehicle), /41\.000 km/);
  });
}

test("does not confuse 'sigue' with availability", () => {
  assert.doesNotMatch(generateRuleBasedAnswer("¿Sigue haciendo ruidos?", vehicle), /disponible|publicaci[oó]n.*activa/i);
});

test("availability is unknown when the publication status is missing", () => {
  assert.match(generateRuleBasedAnswer("¿Sigue disponible?", {}), /no.*confirm|no.*inform/i);
});

test("an active publication does not guarantee current availability", () => {
  const answer = generateRuleBasedAnswer("¿Sigue disponible?", vehicle);
  assert.match(answer, /activa/i);
  assert.match(answer, /confirm.*vendedor/i);
  assert.doesNotMatch(answer, /^s[ií],/i);
});

for (const [status, expected] of [
  ["sold", /vendid/i],
  ["paused", /pausad/i],
  ["draft", /borrador/i],
  ["deleted", /eliminad/i],
  ["removed", /no.*confirm|no.*inform/i],
]) {
  test(`availability respects ${status} status`, () => {
    const answer = generateRuleBasedAnswer("¿Está disponible?", { ...vehicle, status });
    assert.match(answer, expected);
    assert.doesNotMatch(answer, /^s[ií],/i);
  });
}

for (const [field, question, affirmative, negative] of [
  ["acceptsTrade", "¿Acepta permuta?", /acepta evaluar permutas/i, /no acepta permutas/i],
  ["acceptsFinancing", "¿Acepta financiación?", /posibilidad.*financiaci[oó]n/i, /no ofrece financiaci[oó]n/i],
]) {
  test(`${field} distinguishes true, false and missing data`, () => {
    assert.match(generateRuleBasedAnswer(question, { [field]: true }), affirmative);
    assert.match(generateRuleBasedAnswer(question, { [field]: false }), negative);
    for (const missing of [undefined, null, "", "false", 0]) {
      const answer = generateRuleBasedAnswer(question, { [field]: missing });
      assert.match(answer, /no.*inform/i);
      assert.doesNotMatch(answer, negative);
    }
  });
}

test("recognizes canje consistently", () => {
  assert.equal(generateRuleBasedAnswer("¿Acepta canje?", vehicle), generateRuleBasedAnswer("¿Acepta permuta?", vehicle));
});

test("missing price does not invent an authentication restriction", () => {
  const answer = generateRuleBasedAnswer("¿Cuál es el precio?", {});
  assert.match(answer, /no.*inform/i);
  assert.doesNotMatch(answer, /registr|sesi[oó]n/i);
});

test("zero kilometers and zero price are values rather than absent data", () => {
  assert.match(generateRuleBasedAnswer("km?", { km: 0 }), /0 km/);
  assert.match(generateRuleBasedAnswer("precio", { price: 0 }), /\$0/);
});

test("invalid numeric values are not presented as vehicle facts", () => {
  for (const value of [undefined, null, "", "desconocido", NaN, Infinity, -1]) {
    assert.match(generateRuleBasedAnswer("kilómetros", { km: value }), /no.*inform/i);
    assert.match(generateRuleBasedAnswer("precio", { price: value }), /no.*inform/i);
  }
});

test("formats numeric strings returned by a data source", () => {
  assert.match(generateRuleBasedAnswer("kilómetros", { km: "41000" }), /41\.000 km/);
  assert.match(generateRuleBasedAnswer("precio", { price: "45800000" }), /\$45\.800\.000/);
});

test("missing condition data does not invent a completed self-inspection", () => {
  const answer = generateRuleBasedAnswer("¿Qué estado tiene?", {});
  assert.match(answer, /no.*inform/i);
  assert.doesNotMatch(answer, /complet[oó]|revisi[oó]n.*realizad/i);
});

test("condition answer uses a supplied checklist when there is no description", () => {
  const answer = generateRuleBasedAnswer("¿Qué estado tiene?", { checklist: { motor: "bueno", frenos: "normales" } });
  assert.match(answer, /motor: bueno/i);
  assert.match(answer, /frenos: normales/i);
  assert.match(answer, /declarad/i);
});

test("accented location question uses known location data", () => {
  const answer = generateRuleBasedAnswer("¿Dónde está?", vehicle);
  assert.match(answer, /Palermo, CABA/);
  assert.match(answer, /Av\. Santa Fe 3200/);
});

test("a time question mentioning 'ver' still answers with the hours", () => {
  assert.match(generateRuleBasedAnswer("¿Cuándo lo puedo ver?", vehicle), /Sábados de 10 a 13/);
});

test("availability of financing is not confused with publication availability", () => {
  assert.match(generateRuleBasedAnswer("¿Hay financiación disponible?", vehicle), /no ofrece financiaci[oó]n/i);
});

test("specific vehicle questions take precedence over generic 'ver' wording", () => {
  assert.match(generateRuleBasedAnswer("¿Puedo ver los kilómetros?", vehicle), /41\.000 km/);
  assert.match(generateRuleBasedAnswer("¿Puedo ver el precio?", vehicle), /\$45\.800\.000/);
});

test("malformed or empty checklist entries do not become declared facts", () => {
  for (const checklist of [[], "bueno", { motor: null, frenos: {}, caja: " " }]) {
    assert.match(generateRuleBasedAnswer("estado", { checklist }), /no.*inform/i);
  }
});

test("context labels distinguish a missing flag from an explicit refusal", () => {
  assert.equal(formatDeclaredBoolean(true, "Acepta", "No acepta"), "Acepta");
  assert.equal(formatDeclaredBoolean(false, "Acepta", "No acepta"), "No acepta");
  assert.equal(formatDeclaredBoolean(undefined, "Acepta", "No acepta"), "No informado");
  assert.equal(formatDeclaredBoolean(null, "Acepta", "No acepta"), "No informado");
});

test("client and service export the identical pure rules implementation", () => {
  assert.equal(clientRules, generateRuleBasedAnswer);
});

test("the client component imports only the pure rules module", async () => {
  const component = await readFile(new URL("../features/sales-assistant/SalesAssistantSection.jsx", import.meta.url), "utf8");
  const rules = await readFile(new URL("../lib/assistant-rules.js", import.meta.url), "utf8");
  assert.match(component, /from ["']\.\.\/\.\.\/lib\/assistant-rules\.js["']/);
  assert.doesNotMatch(component, /from ["'][^"']*\/assistant(?:\.js)?["']/);
  assert.doesNotMatch(rules, /process\.env|ANTHROPIC|fetch\(/);
});

test("missing location and hours remain unknown", () => {
  assert.match(generateRuleBasedAnswer("¿Dónde está?", {}), /no.*inform/i);
  assert.match(generateRuleBasedAnswer("¿Qué horarios hay?", {}), /no.*inform/i);
});

test("missing vehicle and malformed questions do not crash", () => {
  assert.doesNotThrow(() => generateRuleBasedAnswer("hola", null));
  for (const question of [null, undefined, {}, 42, ""]) {
    assert.doesNotThrow(() => generateRuleBasedAnswer(question, vehicle));
  }
});

test("service entrypoint uses the same rules without an API key", async (t) => {
  const original = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  t.after(() => {
    if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = original;
  });
  assert.equal(await getAssistantAnswer("¿Cuántos kilómetros tiene?", vehicle), generateRuleBasedAnswer("¿Cuántos kilómetros tiene?", vehicle));
});

function useMockApiKey(t) {
  const original = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-only-not-a-real-key";
  t.after(() => {
    if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = original;
  });
}

test("optional API prompt preserves unknown flags and status without making a network request", async (t) => {
  useMockApiKey(t);
  let request;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    request = JSON.parse(options.body);
    return { ok: true, json: async () => ({ content: [{ text: "Respuesta de prueba" }] }) };
  });
  assert.equal(await generateClaudeAnswer("¿Acepta permuta?", { acceptsFinancing: false, km: 0 }), "Respuesta de prueba");
  assert.match(request.system, /Acepta permuta: No informado/);
  assert.match(request.system, /Acepta financiación: No\n/);
  assert.match(request.system, /Estado de publicación: No informado/);
  assert.match(request.system, /Kilómetros: 0 km/);
  assert.doesNotMatch(request.system, /undefined|null/);
});

test("optional API falls back to the corrected rules on failures", async (t) => {
  useMockApiKey(t);
  t.mock.method(console, "error", () => {});
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 503 }));
  assert.equal(await generateClaudeAnswer("¿Cuántos kilómetros tiene?", vehicle), clientRules("¿Cuántos kilómetros tiene?", vehicle));
});

test("optional API does not send an empty question or missing vehicle", async (t) => {
  useMockApiKey(t);
  const fetch = t.mock.method(globalThis, "fetch", async () => assert.fail("No API request expected"));
  assert.equal(await generateClaudeAnswer("hola", null), clientRules("hola", null));
  assert.equal(await generateClaudeAnswer("  ", vehicle), clientRules("  ", vehicle));
  assert.equal(fetch.mock.callCount(), 0);
});
