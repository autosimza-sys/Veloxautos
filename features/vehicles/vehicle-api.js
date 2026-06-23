import { supabase } from "../../lib/supabase-client";
import { roleLabel } from "../../lib/roles";
import {
  getVehicleQuality,
  getVehicleRecommendations,
} from "../publication/publication-quality";

export async function fetchVehicleCatalog() {
  const { data, error } = await supabase.rpc("get_vehicle_catalog");
  if (error) throw error;

  return Promise.all((data || []).map(async (vehicle) => {
    const media = await resolveVehicleMedia(vehicle.media || []);
    return mapVehicleFromDb({
      ...vehicle,
      profiles: {
        display_name: vehicle.seller_name,
        role: vehicle.seller_type,
      },
      vehicle_media: media,
    });
  }));
}

export async function createVehiclePublication({
  form,
  photoFiles = [],
  videoFile,
  profile,
  user,
}) {
  if (photoFiles.length < 4 || photoFiles.length > 8) {
    throw new Error("La publicacion necesita entre 4 y 8 fotos.");
  }

  const uploadedMedia = [];

  try {
    for (let index = 0; index < photoFiles.length; index += 1) {
      const photo = photoFiles[index];
      const storagePath = buildStoragePath(user.id, photo.file, `${index}-${photo.kind}`);
      await uploadMedia(storagePath, photo.file);
      uploadedMedia.push({
        media_type: "photo",
        storage_path: storagePath,
        sort_order: index,
      });
    }

    if (videoFile) {
      const storagePath = buildStoragePath(user.id, videoFile, "video");
      await uploadMedia(storagePath, videoFile);
      uploadedMedia.push({
        media_type: "video",
        storage_path: storagePath,
        sort_order: photoFiles.length,
      });
    }
  } catch (error) {
    await cleanupUploadedMedia(uploadedMedia);
    throw error;
  }

  const { data, error } = await supabase.rpc("create_vehicle_with_credit", {
    payload: {
      brand: form.brand,
      model: form.model,
      version: form.version,
      year: form.year,
      kilometers: form.kilometers,
      price: form.price,
      zone: form.zone,
      partial_plate: form.partialPlate,
      description: form.description,
      checklist: form.checklist,
      score: calculatePublicationScore(form),
      accepts_trade: form.acceptsTrade,
      accepts_financing: form.acceptsFinancing,
      view_location: form.viewLocation,
      available_hours: form.availableHours,
    },
  });

  if (error) {
    await cleanupUploadedMedia(uploadedMedia);
    throw error;
  }

  const mediaRows = uploadedMedia.map((media) => ({
    ...media,
    vehicle_id: data.id,
  }));

  if (mediaRows.length) {
    const { data: insertedMedia, error: mediaError } = await supabase
      .from("vehicle_media")
      .insert(mediaRows)
      .select();

    if (mediaError) {
      await supabase.from("vehicles").delete().eq("id", data.id);
      await cleanupUploadedMedia(uploadedMedia);
      throw new Error(`No se pudieron guardar las fotos: ${mediaError.message}`);
    }

    const resolvedMedia = await resolveVehicleMedia(insertedMedia || []);
    return mapVehicleFromDb({
      ...data,
      profiles: profile,
      vehicle_media: resolvedMedia,
    });
  }

  return mapVehicleFromDb({
    ...data,
    profiles: profile,
    vehicle_media: [],
  });
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
    acceptsTrade: Boolean(vehicle.accepts_trade),
    acceptsFinancing: Boolean(vehicle.accepts_financing),
    seller: sellerName,
    sellerType: roleLabel(vehicle.profiles?.role),
    ownerId: vehicle.owner_id,
    score: Number(vehicle.score || 1),
    image: firstImage || "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80",
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

function buildStoragePath(userId, file, label) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
  const safeLabel = label.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  return `${userId}/${Date.now()}-${safeLabel}.${extension}`;
}

async function uploadMedia(storagePath, file) {
  const { error } = await supabase.storage
    .from("vehicle-media")
    .upload(storagePath, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (error) throw new Error(`No se pudo subir ${file.name}: ${error.message}`);
}

async function cleanupUploadedMedia(media) {
  const paths = media.map((item) => item.storage_path).filter(Boolean);
  if (paths.length) await supabase.storage.from("vehicle-media").remove(paths);
}

async function resolveVehicleMedia(media) {
  return Promise.all(media.map(async (item) => {
    if (!item.storage_path || item.storage_path.startsWith("http")) return item;

    const { data, error } = await supabase.storage
      .from("vehicle-media")
      .createSignedUrl(item.storage_path, 60 * 60);

    return {
      ...item,
      storage_path: error ? "" : data.signedUrl,
    };
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
