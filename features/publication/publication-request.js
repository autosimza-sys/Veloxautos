import { PHOTO_GUIDE } from "./publication-quality";

const memoryRequests = new Map();

export function orderedPublicationPhotos(photos) {
  return [...photos].sort((a, b) => PHOTO_GUIDE.findIndex(item => item.id === a.kind) - PHOTO_GUIDE.findIndex(item => item.id === b.kind));
}

export async function fileDigest(file) {
  const bytes = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonical(value[key])]),
  );
  return value;
}

export async function publicationRequest({ userId, form, photoFiles, videoFile }, storage) {
  const files = [];
  for (const photo of orderedPublicationPhotos(photoFiles)) files.push([photo.kind, photo.file.type, await fileDigest(photo.file)]);
  if (videoFile) files.push(["video", videoFile.type, await fileDigest(videoFile)]);
  const serialized = JSON.stringify(canonical({ userId, form, files }));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const key = `velox-publication:${userId}:${fingerprint}`;
  let id;
  try { id = storage?.getItem(key); } catch { /* Private browsing may disable storage. */ }
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) id = memoryRequests.get(key) || crypto.randomUUID();
  memoryRequests.set(key, id);
  try { storage?.setItem(key, id); } catch { /* In-memory retry remains available. */ }
  return {
    id,
    complete() {
      memoryRequests.delete(key);
      try { storage?.removeItem(key); } catch { /* No raw vehicle data is persisted. */ }
    },
  };
}
