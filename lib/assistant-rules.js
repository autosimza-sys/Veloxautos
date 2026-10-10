/**
 * Pure, client-safe answers based only on the supplied vehicle record.
 * Keep API clients, credentials and server configuration out of this module.
 */

const UNKNOWN_ANSWER = "No tengo ese dato cargado todavía. Podés consultarle directamente al vendedor por chat.";

function normalizeQuestion(question) {
  return typeof question === "string"
    ? question.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
    : "";
}

function textValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function formatDeclaredNumber(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number.toLocaleString("es-AR") : null;
}

export function formatDeclaredBoolean(value, yes = "Sí", no = "No") {
  if (value === true) return yes;
  if (value === false) return no;
  return "No informado";
}

function availabilityAnswer(status) {
  switch (status) {
    case "active":
      return "La publicación figura activa en VELOX. Confirmá la disponibilidad actual con el vendedor antes de coordinar una visita.";
    case "sold":
      return "El vehículo figura como vendido en la publicación.";
    case "paused":
      return "La publicación figura pausada. Consultale al vendedor si volverá a ofrecer el vehículo.";
    case "draft":
      return "La publicación figura como borrador; no puedo confirmar que el vehículo esté en venta.";
    case "deleted":
      return "La publicación figura eliminada; no puedo confirmar la disponibilidad del vehículo.";
    default:
      return "No tengo información para confirmar la disponibilidad actual. Consultale directamente al vendedor.";
  }
}

export function generateRuleBasedAnswer(question, vehicle) {
  if (!vehicle) return "No tengo los datos del vehículo para responder todavía.";
  const q = normalizeQuestion(question);
  if (!q) return UNKNOWN_ANSWER;

  if (/\b(permut\w*|canje\w*)\b/.test(q)) {
    if (vehicle.acceptsTrade === true) return "Sí, el vendedor indicó que acepta evaluar permutas.";
    if (vehicle.acceptsTrade === false) return "El vendedor indicó que no acepta permutas por el momento.";
    return "No se informó si el vendedor acepta permutas. Consultáselo por chat.";
  }

  if (/\b(financ\w*|cuotas?)\b/.test(q)) {
    if (vehicle.acceptsFinancing === true) return "Sí, hay posibilidad de conversar financiación con el vendedor.";
    if (vehicle.acceptsFinancing === false) return "La publicación no ofrece financiación actualmente.";
    return "No se informó si el vendedor ofrece financiación. Consultáselo por chat.";
  }

  if (/\b(horarios?|cuando|hora)\b/.test(q)) {
    const hours = textValue(vehicle.availableHours);
    return hours
      ? `Los horarios informados son: ${hours}.`
      : "No se informaron horarios en esta publicación. Podés proponer uno por chat al vendedor.";
  }

  if (/\b(disponib\w*|vendid[oa])\b/.test(q) || /\bsigue\s+(?:en\s+venta|publicad[oa])\b/.test(q)) {
    return availabilityAnswer(vehicle.status);
  }

  if (/\b(kilometr\w*|kms?|recorr\w*)\b/.test(q)) {
    const km = formatDeclaredNumber(vehicle.km);
    return km !== null
      ? `La publicación declara ${km} km.`
      : "No se informaron los kilómetros en esta publicación.";
  }

  if (/\b(precio|vale|cuesta|negoci\w*)\b/.test(q)) {
    const price = formatDeclaredNumber(vehicle.price);
    return price !== null
      ? `El precio publicado es $${price}. La negociación se conversa directamente con el vendedor.`
      : "No tengo informado el precio en los datos disponibles. Consultale al vendedor.";
  }

  if (/\b(estado|detalle\w*|mecan\w*|condic\w*|ruidos?|motor|frenos?)\b/.test(q)) {
    const description = textValue(vehicle.description);
    if (description) return `El vendedor declara: ${description}`;
    const checklist = vehicle.checklist;
    const items = checklist && typeof checklist === "object" && !Array.isArray(checklist)
      ? Object.entries(checklist)
        .filter(([, value]) => textValue(value))
        .slice(0, 4)
        .map(([key, value]) => `${key}: ${value.trim()}`)
        .join(", ")
      : "";
    return items
      ? `Estado declarado por el propietario: ${items}.`
      : "No se informó el estado del vehículo en los datos disponibles. Consultale al vendedor por chat.";
  }

  if (/\b(donde|ubic\w*|zona|visitar\w*|ver)\b/.test(q)) {
    const zone = textValue(vehicle.zone);
    const location = textValue(vehicle.viewLocation);
    const details = [
      zone ? `La zona informada es ${zone}.` : "",
      location ? `El lugar informado para verlo es ${location}.` : "",
    ].filter(Boolean).join(" ");
    return details || "No se informó dónde se puede ver el vehículo. Coordiná el lugar por chat con el vendedor.";
  }

  return UNKNOWN_ANSWER;
}
