import { uploadMediaWithAdmission } from "../../lib/storage-upload";
import { supabase } from "../../lib/supabase-client";
import { roleLabel } from "../../lib/roles";
import { fileDigest, orderedPublicationPhotos } from "../publication/publication-request";
import {
  getVehicleQuality,
  getVehicleRecommendations,
  validatePublicationStep,
  validatePublicationMedia,
} from "../publication/publication-quality";

export async function fetchVehicleCatalog(client = supabase) {
  return (await fetchVehicleCatalogPage({}, client)).vehicles;
}

export async function fetchVehicleCatalogPage({ cursor = null, filters = {} } = {}, client = supabase) {
  if (!client) throw new Error("La conexión al catálogo no está configurada.");
  const { data, error } = await client.rpc("get_vehicle_catalog_page", { page_size: 24, after_cursor: cursor, filters });
  if (error) throw error;
  if (!data || !Array.isArray(data.items) || data.items.length > 24) throw new Error("Respuesta de catálogo inválida.");
  const allMedia = data.items.flatMap(vehicle => vehicle.media || []);
  const resolved = await resolveVehicleMedia(allMedia, client);
  let offset = 0;
  const vehicles = data.items.map(vehicle => {
    const count = (vehicle.media || []).length;
    const media = resolved.slice(offset, offset + count);
    offset += count;
    return mapVehicleFromDb({ ...vehicle, status: "active",
      profiles: { display_name: vehicle.seller_name, role: vehicle.seller_type }, vehicle_media: media });
  });
  return { vehicles, nextCursor: data.next_cursor || null, brands: data.brands || [], years: data.years || [] };
}

export async function createVehiclePublication({
  form, photoFiles = [], videoFile, profile, user, requestId, publicationQuote, client = supabase,
}) {
  if (!client || !user?.id) throw new Error("Falta iniciar sesión o configurar la conexión.");
  if (!validatePublicationStep(6, form, photoFiles)) {
    throw new Error("Revisá los datos y las fotos de la publicación antes de continuar.");
  }
  if (videoFile && validatePublicationMedia(videoFile, "video")) {
    throw new Error(validatePublicationMedia(videoFile, "video"));
  }
  if (!requestId || !/^[0-9a-f-]{36}$/i.test(requestId)) {
    throw new Error("Falta el identificador de la publicación. Volvé a intentarlo.");
  }
  const uploadedMedia = [];
  const files = [
    ...orderedPublicationPhotos(photoFiles).map(photo => ({ file: photo.file, type: "photo" })),
    ...(videoFile ? [{ file: videoFile, type: "video" }] : []),
  ];
  for (let index = 0; index < files.length; index += 1) {
    const { file, type } = files[index];
    const path = await buildStoragePath(user.id, requestId, file, index);
    await uploadMediaWithAdmission(client, "vehicle-media", path, file);
    uploadedMedia.push({ media_type: type, storage_path: path, sort_order: index });
  }
  // A network timeout may arrive after the transaction commits. Keep staged
  // objects and the same request id for retry; never delete a possibly-live car.
  let response;
  try {
    response = await client.rpc("publish_vehicle_with_credit", {
      publication_request_id: requestId,
      media_payload: uploadedMedia,
      payload: {
        ...(publicationQuote ? { publication_quote: publicationQuote } : {}),
        brand: form.brand, model: form.model, version: form.version,
        year: form.year, kilometers: form.kilometers, price: form.price, zone: form.zone,
        partial_plate: form.partialPlate, description: form.description,
        checklist: form.checklist, score: calculatePublicationScore(form),
        accepts_trade: form.acceptsTrade, accepts_financing: form.acceptsFinancing,
        view_location: form.viewLocation, available_hours: form.availableHours,
      },
    });
  } catch {
    throw new Error("No pudimos confirmar la publicación. Revisá la conexión y reintentá sin cambiar los datos; no se cobrará otro crédito.");
  }
  if (response.error) {
    if (response.status === 0 || response.status >= 500 || !response.error.code) {
      throw new Error("No pudimos confirmar la publicación. Revisá la conexión y reintentá sin cambiar los datos; no se cobrará otro crédito.");
    }
    if (response.error.code === "PGRST202") {
      throw new Error("La publicación segura todavía no está habilitada. Contactá al administrador.");
    }
    throw response.error;
  }
  if (!response.data?.id) throw new Error("No pudimos confirmar la publicación. Reintentá sin cambiar los datos.");
  const resolvedMedia = await resolveVehicleMedia(uploadedMedia, client);
  return mapVehicleFromDb({ ...response.data, profiles: profile, vehicle_media: resolvedMedia });
}

export function mapVehicleFromDb(vehicle) {
  const sellerName = vehicle.profiles?.business_name
    || vehicle.profiles?.display_name
    || "Vendedor VELOX";
  const firstImage = vehicle.vehicle_media
    ?.filter((item) => item.media_type === "photo")
    ?.sort((a, b) => a.sort_order - b.sort_order)?.[0]?.storage_path;

  const mappedVehicle = {
    id: vehicle.id,
    brand: vehicle.brand,
    model: vehicle.model,
    version: vehicle.version,
    year: vehicle.year,
    km: vehicle.kilometers,
    price: vehicle.price,
    zone: vehicle.zone,
    partialPlate: vehicle.partial_plate,
    viewLocation: vehicle.view_location,
    availableHours: vehicle.available_hours,
    acceptsTrade: vehicle.accepts_trade,
    acceptsFinancing: vehicle.accepts_financing,
    status: vehicle.status,
    seller: sellerName,
    sellerType: roleLabel(vehicle.profiles?.role),
    ownerId: vehicle.owner_id,
    score: Number(vehicle.score || 1),
    image: firstImage || "/vehicle-placeholder.svg",
    media: vehicle.vehicle_media || [],
    description: vehicle.description || "Publicacion VELOX.",
    checklist: vehicle.checklist || {},
  };

  return {
    ...mappedVehicle,
    quality: getVehicleQuality(mappedVehicle),
    recommendations: getVehicleRecommendations(mappedVehicle),
  };
}

async function buildStoragePath(userId, requestId, file, index) {
  const extensions = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  };
  const hash = await fileDigest(file);
  return `${userId}/${requestId}/${index}-${hash}.${extensions[file.type]}`;
}


async function resolveVehicleMedia(media, client = supabase) {
  const paths = [...new Set(media.map(item => item.storage_path).filter(path => path && !path.startsWith("http")))];
  let signedByPath = new Map();
  if (paths.length) {
    try {
      const { data, error } = await client.storage.from("vehicle-media").createSignedUrls(paths, 60 * 60);
      if (!error) signedByPath = new Map((data || []).map(item => [item.path, item.signedUrl]));
    } catch { /* Catalog and confirmed publication stay usable without media URLs. */ }
  }
  return media.map(item => ({
    ...item,
    storage_path: item.storage_path?.startsWith("https://") ? item.storage_path : signedByPath.get(item.storage_path) || "",
  }));
}

function calculatePublicationScore(form) {
  let score = 1;
  const filledFields = [
    form.brand,
    form.model,
    form.version,
    form.year,
    form.kilometers,
    form.price,
    form.zone,
    form.description,
    form.viewLocation,
    form.availableHours,
  ].filter(Boolean).length;

  score += Math.min(4, filledFields * 0.35);
  score += Object.keys(form.checklist || {}).length >= 8 ? 2 : 1;
  if (form.acceptsTrade) score += 0.4;
  if (form.acceptsFinancing) score += 0.4;
  if (form.partialPlate) score += 0.4;

  return Math.min(10, Math.round(score * 10) / 10);
}
