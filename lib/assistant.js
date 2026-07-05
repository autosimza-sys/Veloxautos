/**
 * VELOX Assistant Service
 *
 * Si ANTHROPIC_API_KEY está disponible → usa Claude API (Fase 2)
 * Si no → responde con reglas basadas en los datos del vehículo (Fase 1)
 *
 * Diseñado para ser llamado desde el RPC send_message_with_assistant
 * o desde una API route en /api/assistant.
 */

// ── Fase 1: Respuestas por reglas ────────────────────────

export function generateRuleBasedAnswer(question, vehicle) {
  if (!vehicle) return "Cargando datos del vehículo...";
  const q = question.toLowerCase();

  if (q.includes("disponib") || q.includes("sigue")) {
    return "Sí, el vehículo sigue publicado como disponible en VELOX.";
  }

  if (q.includes("permuta") || q.includes("canje")) {
    return vehicle.acceptsTrade
      ? "Sí, el vendedor indicó que acepta evaluar permutas."
      : "El vendedor indicó que no acepta permutas por el momento.";
  }

  if (q.includes("financ") || q.includes("cuota")) {
    return vehicle.acceptsFinancing
      ? "Sí, hay posibilidad de conversar financiación con el vendedor."
      : "La publicación no ofrece financiación actualmente.";
  }

  if (q.includes("donde") || q.includes("ubic") || q.includes("zona") || q.includes("visitar") ||
      q.includes("ver ") || q.includes("ver?") || q.includes("ver.")) {
    const zona   = vehicle.zone ? `El vehículo está en ${vehicle.zone}.` : "";
    const lugar  = vehicle.viewLocation
      ? ` Se puede ver en ${vehicle.viewLocation}.`
      : " El punto exacto se coordina por chat con el vendedor.";
    return (zona + lugar).trim() || "La ubicación se coordina directamente con el vendedor.";
  }

  if (q.includes("horario") || q.includes("cuándo") || q.includes("cuando")) {
    return vehicle.availableHours
      ? `Los horarios informados son: ${vehicle.availableHours}.`
      : "El vendedor aún no definió horarios. Podés proponérselos en el chat.";
  }

  if (q.includes("kilometr") || q.includes(" km") || q.includes("recorrió")) {
    return vehicle.km != null
      ? `La publicación declara ${vehicle.km.toLocaleString("es-AR")} km.`
      : "No se informaron los kilómetros en esta publicación.";
  }

  if (q.includes("precio") || q.includes("vale") || q.includes("cuesta") || q.includes("negoci")) {
    if (!vehicle.price) return "El precio no está visible sin registrarse.";
    return `El precio publicado es $${vehicle.price.toLocaleString("es-AR")}. La negociación se conversa directamente con el vendedor.`;
  }

  if (q.includes("estado") || q.includes("detalle") || q.includes("mecan") || q.includes("condic")) {
    if (vehicle.description) return vehicle.description;
    return "El vendedor completó una auto-revisión declarada en la publicación. Consultale por chat para más detalle.";
  }

  return "No tengo ese dato cargado todavía, pero podés avisarle al vendedor directamente por el chat.";
}

// ── Fase 2: Claude API (preparada, activa si hay API key) ─

export async function generateClaudeAnswer(question, vehicle, conversationHistory = []) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fallback a reglas si no hay API key
    return generateRuleBasedAnswer(question, vehicle);
  }

  const systemPrompt = `Sos el asistente de ventas de VELOX, una plataforma argentina de venta de vehículos.
Tu objetivo es ayudar al comprador a resolver sus dudas sobre el siguiente vehículo y facilitar el cierre de la venta.

DATOS DEL VEHÍCULO:
- Marca/Modelo: ${vehicle.brand} ${vehicle.model} ${vehicle.version} (${vehicle.year})
- Kilómetros: ${vehicle.km?.toLocaleString("es-AR") || "No informado"} km
- Precio: $${vehicle.price?.toLocaleString("es-AR") || "Consultar"}
- Zona: ${vehicle.zone || "No informada"}
- Acepta permuta: ${vehicle.acceptsTrade ? "Sí" : "No"}
- Acepta financiación: ${vehicle.acceptsFinancing ? "Sí" : "No"}
- Lugar de vista: ${vehicle.viewLocation || "A coordinar"}
- Horarios: ${vehicle.availableHours || "A coordinar"}
- Estado declarado: ${vehicle.description || "Sin descripción adicional"}

REGLAS:
- Respondé en español rioplatense, sin tuteo.
- Sé directo y profesional, no exageres.
- Si no tenés el dato, decí "No tengo ese dato cargado, pero podés consultarle directamente al vendedor."
- No inventes datos que no estén en la ficha.
- Máximo 2-3 oraciones por respuesta.
- Objetivo: ayudar al comprador a avanzar hacia una visita o cierre.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: systemPrompt,
        messages: [
          ...conversationHistory,
          { role: "user", content: question },
        ],
      }),
    });

    if (!response.ok) throw new Error(`Claude API error: ${response.status}`);
    const data = await response.json();
    return data.content?.[0]?.text || generateRuleBasedAnswer(question, vehicle);
  } catch (err) {
    console.error("Claude API error, falling back to rules:", err.message);
    return generateRuleBasedAnswer(question, vehicle);
  }
}

// ── Exportación principal ────────────────────────────────

/**
 * Genera respuesta del asistente.
 * Usa Claude si hay API key, si no usa reglas.
 */
export async function getAssistantAnswer(question, vehicle, conversationHistory = []) {
  if (process.env.ANTHROPIC_API_KEY) {
    return generateClaudeAnswer(question, vehicle, conversationHistory);
  }
  return generateRuleBasedAnswer(question, vehicle);
}
