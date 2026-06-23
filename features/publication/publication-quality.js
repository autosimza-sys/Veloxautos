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
    year: new Date().getFullYear(),
    kilometers: "",
    price: "",
    zone: "",
    partialPlate: "",
    description: "",
    acceptsTrade: false,
    acceptsFinancing: false,
    viewLocation: "",
    availableHours: "",
    checklist: {
      motor: "bueno",
      caja: "buena",
      trenDelantero: "sin ruidos",
      amortiguadores: "normales",
      cubiertas: "media vida",
      frenos: "normales",
      aire: "funciona perfecto",
      interiores: "buenos",
      vidrios: "originales",
      pintura: "original",
      choques: "nunca chocado",
    },
  };
}

export function buildDescription(form) {
  const vehicle = [form.brand, form.model, form.version].filter(Boolean).join(" ");
  const features = [
    `${Number(form.kilometers || 0).toLocaleString("es-AR")} km`,
    `motor ${form.checklist.motor}`,
    `caja ${form.checklist.caja}`,
    `interior ${form.checklist.interiores}`,
  ];

  return `${vehicle} ${form.year}. ${features.join(", ")}. Se puede ver en ${form.zone || "zona a coordinar"}. Informacion declarada por el propietario.`;
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

  if (!form.description || form.description.length < 90) {
    recommendations.push({
      id: "description",
      level: "high",
      text: "Completa una descripcion mas detallada para generar confianza.",
    });
  }

  if (!form.partialPlate) {
    recommendations.push({
      id: "plate",
      level: "low",
      text: "Agregar patente parcial ayuda a identificar la unidad sin exponer el dominio completo.",
    });
  }

  if (!form.viewLocation || !form.availableHours) {
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

export function getPublicationQuality({ form, photos, videoFile }) {
  let points = 20;
  points += Math.min(32, photos.length * 4);
  if (videoFile) points += 8;
  if (form.description.length >= 90) points += 12;
  if (form.partialPlate) points += 5;
  if (form.viewLocation) points += 5;
  if (form.availableHours) points += 5;
  if (Object.keys(form.checklist).length >= 10) points += 13;
  return Math.min(100, points);
}

export function getVehicleQuality(vehicle) {
  const photos = (vehicle.media || []).filter((item) => item.media_type === "photo");
  const videoFile = (vehicle.media || []).some((item) => item.media_type === "video");
  const form = {
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
  if (Object.keys(vehicle.checklist || {}).length < 10) recommendations.push("Completa la autorevision declarada por el propietario.");

  return recommendations;
}

export function qualityLabel(quality) {
  if (quality >= 85) return "Muy completa";
  if (quality >= 65) return "Buena";
  if (quality >= 45) return "En progreso";
  return "Necesita datos";
}
