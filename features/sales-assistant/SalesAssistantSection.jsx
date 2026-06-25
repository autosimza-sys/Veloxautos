"use client";

import { useRef, useState } from "react";

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

  if (q.includes("donde") || q.includes("ubic") || q.includes("zona") || q.includes("ver") || q.includes("visitar")) {
    const zona = vehicle.zone ? `El vehículo está en ${vehicle.zone}.` : "";
    const lugar = vehicle.viewLocation ? ` Se puede ver en ${vehicle.viewLocation}.` : " El punto exacto se coordina por chat con el vendedor.";
    return (zona + lugar).trim() || "La ubicación se coordina por chat con el vendedor.";
  }

  if (q.includes("horario") || q.includes("cuándo") || q.includes("cuando")) {
    return vehicle.availableHours
      ? `Los horarios informados por el vendedor son: ${vehicle.availableHours}.`
      : "El vendedor aún no definió horarios específicos. Podés proponérselos abriendo el chat.";
  }

  if (q.includes("kilometr") || q.includes(" km") || q.includes("km ") || q.includes("recorrió") || q.includes("kilómetros")) {
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
      : "El propietario completó una autorevision declarada en la publicación.";
  }

  return "No tengo ese dato cargado todavía, pero podés abrirle el chat al vendedor y preguntarle directamente.";
}

export default function SalesAssistantSection({ vehicle }) {
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      role: "assistant",
      text: `Hola. Soy el asistente de ${vehicle.brand} ${vehicle.model}. Respondé cualquier pregunta con los datos de esta publicación.`,
    },
  ]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef(null);

  function scrollToBottom() {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }

  function ask(question) {
    if (!question.trim()) return;
    const userMsg = { id: `u-${Date.now()}`, role: "user", text: question.trim() };
    const answer = generateAnswer(question, vehicle);
    const assistantMsg = { id: `a-${Date.now()}`, role: "assistant", text: answer };

    setMessages((current) => [...current, userMsg, assistantMsg]);
    setInput("");
    scrollToBottom();
  }

  function handleSubmit(event) {
    event.preventDefault();
    ask(input);
  }

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
          <div><span>Permuta</span><strong>{vehicle.acceptsTrade ? "Acepta" : "No acepta"}</strong></div>
          <div><span>Financiación</span><strong>{vehicle.acceptsFinancing ? "Disponible" : "No disponible"}</strong></div>
        </div>
      </div>

      <div className="salesChat">
        <div className="salesChatMessages">
          {messages.map((message) => (
            <div
              className={message.role === "user" ? "salesChatMsg user" : "salesChatMsg assistant"}
              key={message.id}
            >
              {message.role === "assistant" && (
                <span className="assistantAvatar" style={{ flexShrink: 0, fontSize: "11px", width: "32px", height: "32px" }}>VX</span>
              )}
              <p>{message.text}</p>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="salesChatQuick">
          {QUICK_QUESTIONS.map((question) => (
            <button
              className="chatQuickBtn"
              key={question}
              type="button"
              onClick={() => ask(question)}
            >
              {question}
            </button>
          ))}
        </div>

        <form className="salesChatComposer" onSubmit={handleSubmit}>
          <input
            placeholder="Escribí tu pregunta..."
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <button className="primary" disabled={!input.trim()} type="submit">
            Preguntar
          </button>
        </form>
      </div>
    </section>
  );
}
