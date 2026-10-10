import { checklistOptions } from "../../lib/velox-data.js";

export const PHOTO_GUIDE = [
  { id: "front", label: "Frontal", required: true, tip: "De frente, con el vehiculo completo dentro del cuadro." },
  { id: "right", label: "Lateral derecho", required: true, tip: "Mostra todo el lateral, sin cortar ruedas." },
  { id: "left", label: "Lateral izquierdo", required: true, tip: "Usa luz pareja y evita reflejos fuertes." },
  { id: "interior", label: "Interior", required: true, tip: "Mostra butacas, tablero y estado general." },
  { id: "dashboard", label: "Tablero", required: false, tip: "Encendido y con kilometraje visible." },
  { id: "engine", label: "Motor", required: false, tip: "Con buena luz y el vano completo." },
  { id: "trunk", label: "Baul", required: false, tip: "Vacio y abierto para mostrar su capacidad." },
  { id: "tires", label: "Cubiertas", required: false, tip: "Acercamiento al dibujo y estado." },
];

export function createPublicationForm() {
  return {
    brand: "",
    model: "",
    version: "",
    year: "",
    kilometers: "",
    price: "",
    zone: "",
    partialPlate: "",
    description: "",
    acceptsTrade: false,
    acceptsFinancing: false,
    viewLocation: "",
    availableHours: "",
    checklist: Object.fromEntries(Object.keys(checklistOptions).map(key => [key, ""])),
  };
}

export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const UNREVIEWED = "no revisado";
const MAX_DATABASE_INTEGER = 2147483647;
const CURRENT_YEAR = new Date().getFullYear();

function hasText(value) {
  return typeof value === "string" && Boolean(value.trim());
}

function isIntegerInRange(value, min, max = MAX_DATABASE_INTEGER) {
  if (typeof value !== "number" && typeof value !== "string") return false;
  if (typeof value === "string" && !/^\d+$/.test(value.trim())) return false;
  return Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max;
}

function declaredChecklistCount(checklist = {}) {
  return Object.entries(checklistOptions).filter(([key, options]) =>
    options.includes(checklist?.[key]) || checklist?.[key] === UNREVIEWED,
  ).length;
}

export function validatePublicationMedia(file, kind) {
  const photo = kind === "photo";
  const types = photo ? PHOTO_MIME_TYPES : VIDEO_MIME_TYPES;
  if (!file || !types.includes(file.type)) {
    return photo
      ? "Formato de foto no permitido. Usa JPEG, PNG o WebP."
      : "Formato de video no permitido. Usa MP4, WebM o QuickTime.";
  }
  if (!Number.isFinite(file.size) || file.size <= 0) return "El archivo esta vacio o no se puede leer.";
  const maxMb = photo ? 3 : 25;
  return file.size > maxMb * 1024 * 1024
    ? `${photo ? "Cada foto" : "El video"} puede pesar como maximo ${maxMb} MB.`
    : "";
}

export function validatePublicationStep(step, form, photos = []) {
  if (step === 0) return [form.brand, form.model, form.version].every(hasText)
    && isIntegerInRange(form.year, 1886, CURRENT_YEAR + 1);
  if (step === 1) return isIntegerInRange(form.kilometers, 0);
  if (step === 2) return isIntegerInRange(form.price, 1) && hasText(form.zone);
  if (step === 3) {
    const kinds = new Set(photos.map(photo => photo.kind));
    return photos.length >= 4 && photos.length <= PHOTO_GUIDE.length
      && kinds.size === photos.length
      && photos.every(photo => PHOTO_GUIDE.some(guide => guide.id === photo.kind) && !validatePublicationMedia(photo.file, "photo"))
      && PHOTO_GUIDE.filter(guide => guide.required).every(guide => kinds.has(guide.id));
  }
  if (step === 4) return declaredChecklistCount(form.checklist) === Object.keys(checklistOptions).length;
  if (step === 6) return [0, 1, 2, 3, 4].every(index => validatePublicationStep(index, form, photos));
  return step === 5;
}

export function buildDescription(form) {
  const vehicle = [form.brand, form.model, form.version].filter(hasText).map(value => value.trim()).join(" ");
  const identification = [vehicle, isIntegerInRange(form.year, 1886, CURRENT_YEAR + 1) ? form.year : ""].filter(Boolean).join(" ");
  const features = [];
  if (isIntegerInRange(form.kilometers, 0)) features.push(`${Number(form.kilometers).toLocaleString("es-AR")} km`);
  for (const [key, label] of [["motor", "motor"], ["caja", "caja"], ["interiores", "interior"]]) {
    const value = form.checklist?.[key];
    if (checklistOptions[key].includes(value) || value === UNREVIEWED) features.push(`${label} ${value}`);
  }
  return [
    identification,
    features.join(", "),
    hasText(form.zone) ? `Se puede ver en ${form.zone.trim()}` : "",
    "Informacion declarada por el propietario",
  ].filter(Boolean).join(". ") + ".";
}

export function getPublicationRecommendations({ form, photos, videoFile }) {
  const recommendations = [];
  const photoIds = new Set(photos.map((photo) => photo.kind));

  PHOTO_GUIDE.forEach((photo) => {
    if (!photoIds.has(photo.id)) {
      recommendations.push({
        id: `photo-${photo.id}`,
        level: photo.required ? "high" : "medium",
        text: `Falta foto: ${photo.label}.`,
      });
    }
  });

  if (!hasText(form.description) || form.description.trim().length < 90) {
    recommendations.push({
      id: "description",
      level: "high",
      text: "Completa una descripcion mas detallada para generar confianza.",
    });
  }

  if (!hasText(form.partialPlate)) {
    recommendations.push({
      id: "plate",
      level: "low",
      text: "Agregar patente parcial ayuda a identificar la unidad sin exponer el dominio completo.",
    });
  }

  if (!hasText(form.viewLocation) || !hasText(form.availableHours)) {
    recommendations.push({
      id: "availability",
      level: "medium",
      text: "Define lugar y horarios para que el asistente pueda coordinar visitas.",
    });
  }

  if (!videoFile) {
    recommendations.push({
      id: "video",
      level: "low",
      text: "Un video corto del exterior e interior mejora la presentacion.",
    });
  }

  return recommendations;
}

export function getPublicationQuality({ form, photos = [], videoFile }) {
  let points = 0;
  if (hasText(form.brand)) points += 3;
  if (hasText(form.model)) points += 3;
  if (hasText(form.version)) points += 2;
  if (isIntegerInRange(form.year, 1886, CURRENT_YEAR + 1)) points += 3;
  if (isIntegerInRange(form.kilometers, 0)) points += 3;
  if (isIntegerInRange(form.price, 1)) points += 3;
  if (hasText(form.zone)) points += 3;
  points += Math.min(32, photos.length * 4);
  if (videoFile) points += 8;
  if (hasText(form.description) && form.description.trim().length >= 90) points += 12;
  if (hasText(form.partialPlate)) points += 5;
  if (hasText(form.viewLocation)) points += 5;
  if (hasText(form.availableHours)) points += 5;
  points += Math.floor(13 * declaredChecklistCount(form.checklist) / Object.keys(checklistOptions).length);
  return Math.min(100, points);
}

export function getVehicleQuality(vehicle) {
  const photos = (vehicle.media || []).filter((item) => item.media_type === "photo");
  const videoFile = (vehicle.media || []).some((item) => item.media_type === "video");
  const form = {
    brand: vehicle.brand, model: vehicle.model, version: vehicle.version, year: vehicle.year,
    kilometers: vehicle.km, price: vehicle.price, zone: vehicle.zone,
    description: vehicle.description || "",
    partialPlate: vehicle.partialPlate || "",
    viewLocation: vehicle.viewLocation || "",
    availableHours: vehicle.availableHours || "",
    checklist: vehicle.checklist || {},
  };

  return getPublicationQuality({ form, photos, videoFile });
}

export function getVehicleRecommendations(vehicle) {
  const recommendations = [];
  const photoCount = (vehicle.media || []).filter((item) => item.media_type === "photo").length;

  if (photoCount < 4) recommendations.push(`Agrega ${4 - photoCount} foto(s) para alcanzar el minimo recomendado.`);
  if (photoCount < 8) recommendations.push("Completa la galeria con tablero, motor, baul y cubiertas.");
  if (!(vehicle.media || []).some((item) => item.media_type === "video")) recommendations.push("Agrega un video corto del exterior e interior.");
  if (!vehicle.description || vehicle.description.length < 90) recommendations.push("Amplia la descripcion con mantenimiento, uso y detalles conocidos.");
  if (!vehicle.viewLocation || !vehicle.availableHours) recommendations.push("Define lugar y horarios para coordinar visitas.");
  if (declaredChecklistCount(vehicle.checklist) < Object.keys(checklistOptions).length) recommendations.push("Completa la autorevision declarada por el propietario.");

  return recommendations;
}

export function qualityLabel(quality) {
  if (quality >= 85) return "Muy completa";
  if (quality >= 65) return "Buena";
  if (quality >= 45) return "En progreso";
  return "Necesita datos";
}
