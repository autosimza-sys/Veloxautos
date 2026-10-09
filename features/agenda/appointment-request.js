const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// An ACK is known for this page lifetime even if storage refuses deletion.
// After reload, an old persisted UUID is conservatively treated as pending.
const confirmedRequests = new Set();

function requestError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function storageError() {
  return requestError(
    "No pudimos guardar una referencia segura en el almacenamiento de esta pestaña. No se envió la propuesta. Permití el almacenamiento del sitio y volvé a intentar.",
    "APPOINTMENT_STORAGE_UNAVAILABLE",
  );
}

// Persist only a digest and random UUID. The same unresolved intention must
// survive remounts/reloads; an in-memory fallback could create a duplicate.
export async function appointmentRequest(payload, storage, {
  cryptoProvider = globalThis.crypto, isCurrent = () => true, createIfMissing = true,
} = {}) {
  if (!isCurrent()) return null;
  const canonical = JSON.stringify([
    payload.userId, payload.conversationId, new Date(payload.scheduledAt).toISOString(),
    Number(payload.durationMinutes), payload.location.trim(),
  ]);
  let digest;
  try {
    if (!cryptoProvider?.subtle?.digest || !cryptoProvider?.randomUUID) throw new Error("Crypto unavailable");
    digest = await cryptoProvider.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  } catch {
    throw requestError("No pudimos crear una referencia segura para el envío en este navegador. No se envió la propuesta.", "APPOINTMENT_CRYPTO_UNAVAILABLE");
  }
  if (!isCurrent()) return null;
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const key = `velox-appointment:${fingerprint}`;
  let saved;
  try {
    if (storage === undefined) storage = window.sessionStorage;
    if (!storage?.getItem) throw storageError();
    saved = storage.getItem(key);
    if (saved !== null && saved !== undefined && !uuidPattern.test(saved)) throw storageError();
  } catch { throw storageError(); }
  if (confirmedRequests.has(saved)) saved = null;
  if (!saved && !createIfMissing) {
    throw requestError("Elegí una fecha y hora posteriores al momento actual. Sólo se puede recuperar una propuesta pasada si ya se había enviado desde esta pestaña.", "APPOINTMENT_PAST_WITHOUT_REQUEST");
  }
  const reused = Boolean(saved);
  const id = saved || cryptoProvider.randomUUID();
  if (!uuidPattern.test(id)) throw storageError();
  try {
    if (!saved) storage.setItem(key, id);
    if (storage.getItem(key) !== id) throw storageError();
  } catch { throw storageError(); }
  return {
    id, reused,
    complete() {
      confirmedRequests.add(id);
      // A delayed completion must not remove a newer intentional proposal.
      try {
        if (storage.getItem(key) === id) storage.removeItem(key);
        return storage.getItem(key) !== id;
      } catch { return false; }
    },
  };
}
