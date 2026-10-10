// Persist only an opaque fingerprint and UUID. Message text never enters storage.
// An unacknowledged intention survives hook remounts, logout/login and reload in
// this tab. A confirmed send retires it so repeating the text is a new message.
// NFC treats canonically equivalent keyboard encodings as the same intention.
// Accents, case and interior whitespace still preserve their semantic differences.
const acknowledgedWithoutCleanup = new Set();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requestError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function chatRequestStorage() {
  try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; }
}

export async function messageRequest({ userId, conversationId, body }, storage = chatRequestStorage()) {
  if (!userId || !conversationId || !body?.trim()) throw requestError("CHAT_REQUEST_INVALID", "Mensaje inválido.");
  if (!storage?.getItem || !storage?.setItem || !storage?.removeItem) {
    throw requestError("CHAT_REQUEST_STORAGE", "No hay almacenamiento de sesión disponible para proteger el envío.");
  }
  const serialized = JSON.stringify([userId, conversationId, body.trim().normalize("NFC")]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const key = `velox-chat-request:v1:${fingerprint}`;
  let id;
  let reused = false;
  try {
    const stored = storage.getItem(key);
    if (stored && !uuidPattern.test(stored)) throw new Error("Invalid pending request");
    reused = Boolean(stored && !acknowledgedWithoutCleanup.has(stored));
    id = reused ? stored : crypto.randomUUID();
    // Read + write are synchronous after hashing: another caller in this tab
    // sees the same pending UUID, rather than allocating a second intention.
    storage.setItem(key, id);
    if (storage.getItem(key) !== id) throw new Error("Request was not persisted");
    if (stored && stored !== id) acknowledgedWithoutCleanup.delete(stored);
  } catch {
    throw requestError("CHAT_REQUEST_STORAGE", "No pudimos guardar la protección de reintentos en esta pestaña.");
  }
  return {
    id,
    reused,
    complete() {
      // Call only with an authoritative RPC acknowledgement. A late completion
      // must not erase the UUID of a newer legitimate send with identical text.
      try {
        if (storage.getItem(key) !== id) return true;
        storage.removeItem(key);
        if (storage.getItem(key) === id) throw new Error("Request cleanup failed");
        acknowledgedWithoutCleanup.delete(id);
        return true;
      } catch {
        acknowledgedWithoutCleanup.add(id);
        return false;
      }
    },
  };
}

export async function sendChatMessage({ client, userId, conversationId, body, storage = chatRequestStorage(), isCurrent = () => true }) {
  const request = await messageRequest({ userId, conversationId, body }, storage);
  if (!isCurrent()) throw requestError("CHAT_SCOPE_CHANGED", "La sesión o conversación cambió antes del envío.");
  const response = await client.rpc("send_message_idempotent", {
    target_conversation: conversationId,
    message_body: body.trim().normalize("NFC"),
    message_request_id: request.id,
  });
  if (response.error) throw response.error;
  const result = response.data;
  if (response.status === 0 || !uuidPattern.test(result?.message_id || "") || typeof result?.automated !== "boolean"
    || (result.automated && !uuidPattern.test(result.automated_message_id || ""))) {
    throw requestError("CHAT_ACK_UNCONFIRMED", "No recibimos una confirmación válida del envío.");
  }
  // Even after closing/navigating, the authoritative acknowledgement retires
  // this exact intention. The hook separately decides whether its UI is current.
  return { result, reused: request.reused, storageCleared: request.complete() };
}
