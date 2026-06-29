"use client";

import { useEffect, useRef, useState } from "react";

const QUICK_QUESTIONS = [
  "¿Sigue disponible?",
  "¿Acepta permuta?",
  "¿Dónde se puede ver?",
  "¿Qué horarios hay?",
  "¿Acepta financiación?",
  "¿Cuántos kilómetros tiene?",
  "¿Es negociable el precio?",
  "¿Qué estado tiene?",
];

function generateAnswer(question, vehicle) {
  if (!vehicle) return "Cargando datos del vehículo...";
  const q = question.toLowerCase();

  if (q.includes("disponib") || q.includes("sigue")) {
    return "Sí, el vehículo sigue publicado como disponible en VELOX.";
  }

  if (q.includes("permuta")) {
    return vehicle.acceptsTrade
      ? "Sí, el vendedor indicó que acepta evaluar permutas."
      : "El vendedor indicó que no acepta permutas por el momento.";
  }

  if (q.includes("financ") || q.includes("cuota")) {
    return vehicle.acceptsFinancing
      ? "Sí, la publicación indica que puede conversar opciones de financiación."
      : "La publicación no ofrece financiación actualmente.";
  }

  if (q.includes("donde") || q.includes("ubic") || q.includes("zona") || q.includes("visitar")) {
    const zona = vehicle.zone ? `El vehículo está en ${vehicle.zone}.` : "";
    const lugar = vehicle.viewLocation ? ` Se puede ver en ${vehicle.viewLocation}.` : " El punto exacto se coordina por chat con el vendedor.";
    return (zona + lugar).trim() || "La ubicación se coordina por chat con el vendedor.";
  }

  if (q.includes("ver ") || q.includes("ver?") || q.includes("ver.")) {
    const zona = vehicle.zone ? `El vehículo está en ${vehicle.zone}.` : "";
    const lugar = vehicle.viewLocation ? ` Se puede ver en ${vehicle.viewLocation}.` : " El punto exacto se coordina por chat con el vendedor.";
    return (zona + lugar).trim() || "La ubicación se coordina por chat con el vendedor.";
  }

  if (q.includes("horario") || q.includes("cuándo") || q.includes("cuando")) {
    return vehicle.availableHours
      ? `Los horarios informados por el vendedor son: ${vehicle.availableHours}.`
      : "El vendedor aún no definió horarios específicos. Podés proponérselos abriendo el chat.";
  }

  if (q.includes("kilometr") || q.includes("km") || q.includes("recorrió")) {
    return vehicle.km != null
      ? `La publicación declara ${vehicle.km.toLocaleString("es-AR")} km.`
      : "No se informaron los kilómetros en esta publicación.";
  }

  if (q.includes("precio") || q.includes("vale") || q.includes("cuesta") || q.includes("negoci")) {
    if (!vehicle.price) return "El precio no está visible aquí. Registrate para verlo.";
    return `El precio publicado es $${vehicle.price.toLocaleString("es-AR")}. La negociación se puede conversar por chat con el vendedor.`;
  }

  if (q.includes("estado") || q.includes("detalle") || q.includes("mecan") || q.includes("condic")) {
    if (vehicle.description) return vehicle.description;
    const checklist = vehicle.checklist || {};
    const items = Object.entries(checklist).slice(0, 4).map(([key, value]) => `${key}: ${value}`).join(", ");
    return items
      ? `Estado declarado por el propietario — ${items}.`
      : "El propietario completó una autorevisión declarada en la publicación.";
  }

  return "No tengo ese dato cargado todavía, pero podés abrirle el chat al vendedor y preguntarle directamente.";
}

function welcomeMsg(vehicle) {
  const name = vehicle ? `${vehicle.brand} ${vehicle.model}` : "este vehículo";
  return {
    id: "welcome",
    role: "assistant",
    text: `Hola. Soy el asistente de ${name}. Hacé clic en una pregunta frecuente o escribí la tuya.`,
  };
}

export default function SalesAssistantSection({ vehicle }) {
  const [messages, setMessages] = useState(() => [welcomeMsg(vehicle)]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef(null);

  // Reiniciar chat cuando cambia el vehículo
  useEffect(() => {
    setMessages([welcomeMsg(vehicle)]);
    setInput("");
  }, [vehicle?.id]);

  function scrollToBottom() {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 60);
  }

  function ask(question) {
    const q = question.trim();
    if (!q) return;

    const userMsg = { id: `u-${Date.now()}`, role: "user", text: q };
    let answer;
    try {
      answer = generateAnswer(question, vehicle);
    } catch (err) {
      answer = "Ocurrió un error al procesar la pregunta. Intentá de nuevo.";
    }
    const botMsg = { id: `a-${Date.now() + 1}`, role: "assistant", text: answer };

    setMessages((prev) => [...prev, userMsg, botMsg]);
    setInput("");
    scrollToBottom();
  }

  function handleSubmit(e) {
    e.preventDefault();
    ask(input);
  }

  if (!vehicle) return null;

  return (
    <section className="section salesAssistantSection" id="asistente-venta">
      <div>
        <p className="eyebrow">Asistente de venta</p>
        <h2>Responde con datos, no con promesas.</h2>
        <p>
          VELOX usa la información de esta publicación para resolver preguntas frecuentes.
          Las consultas abiertas van directo al vendedor por chat.
        </p>
        <div className="assistantContext">
          <div><span>Vehículo</span><strong>{vehicle.brand} {vehicle.model}</strong></div>
          <div><span>Zona</span><strong>{vehicle.zone || "No informada"}</strong></div>
          <div><span>Permuta</span><strong>{vehicle.acceptsTrade ? "Acepta ✓" : "No acepta"}</strong></div>
          <div><span>Financiación</span><strong>{vehicle.acceptsFinancing ? "Disponible ✓" : "No disponible"}</strong></div>
        </div>
      </div>

      <div className="salesChat">
        <div className="salesChatMessages">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={msg.role === "user" ? "salesChatMsg user" : "salesChatMsg assistant"}
            >
              {msg.role === "assistant" && (
                <span className="assistantAvatar" style={{ flexShrink: 0, fontSize: "11px", width: "32px", height: "32px" }}>VX</span>
              )}
              <p>{msg.text}</p>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="salesChatQuick">
          {QUICK_QUESTIONS.map((q) => (
            <button
              key={q}
              className="chatQuickBtn"
              type="button"
              onClick={() => ask(q)}
            >
              {q}
            </button>
          ))}
        </div>

        <form className="salesChatComposer" onSubmit={handleSubmit}>
          <input
            placeholder="Escribí tu pregunta..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button className="primary" type="submit" disabled={!input.trim()}>
            Preguntar
          </button>
        </form>
      </div>
    </section>
  );
}
