"use client";

import { useEffect, useRef, useState } from "react";
import { formatDeclaredBoolean, generateRuleBasedAnswer } from "../../lib/assistant-rules.js";

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

function welcomeMsg(vehicle) {
  const name = vehicle ? `${vehicle.brand} ${vehicle.model}` : "este vehículo";
  return {
    id: "welcome",
    role: "assistant",
    text: `Hola. Soy el asistente de ${name}. Hacé clic en una pregunta frecuente o escribí la tuya.`,
  };
}

export default function SalesAssistantSection({ vehicle }) {
  if (!vehicle) return null;
  // A new listing gets a fresh session without a setState/reset effect.
  const sessionKey = vehicle.id ?? JSON.stringify([vehicle.brand, vehicle.model, vehicle.version, vehicle.year]);
  return <SalesAssistantSession key={sessionKey} vehicle={vehicle} />;
}

function SalesAssistantSession({ vehicle }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (messages.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [messages.length]);

  function ask(question) {
    const q = question.trim();
    if (!q) return;

    let answer;
    try {
      answer = generateRuleBasedAnswer(q, vehicle);
    } catch {
      answer = "Ocurrió un error al procesar la pregunta. Intentá de nuevo.";
    }
    // IDs are deterministic and unique even for multiple asks in one tick.
    setMessages((prev) => [
      ...prev,
      { id: `u-${prev.length}`, role: "user", text: q },
      { id: `a-${prev.length + 1}`, role: "assistant", text: answer },
    ]);
    setInput("");
  }

  function handleSubmit(e) {
    e.preventDefault();
    ask(input);
  }

  return (
    <section className="section salesAssistantSection" id="asistente-venta">
      <div>
        <p className="eyebrow">Asistente de venta</p>
        <h2>Responde con datos, no con promesas.</h2>
        <p>
          VELOX usa la información de esta publicación para resolver preguntas frecuentes.
          Para consultar al vendedor, abrí el chat de la publicación.
        </p>
        <div className="assistantContext">
          <div><span>Vehículo</span><strong>{vehicle.brand} {vehicle.model}</strong></div>
          <div><span>Zona</span><strong>{vehicle.zone || "No informada"}</strong></div>
          <div><span>Permuta</span><strong>{formatDeclaredBoolean(vehicle.acceptsTrade, "Acepta ✓", "No acepta")}</strong></div>
          <div><span>Financiación</span><strong>{formatDeclaredBoolean(vehicle.acceptsFinancing, "Ofrece ✓", "No ofrece")}</strong></div>
        </div>
      </div>

      <div className="salesChat">
        <div className="salesChatMessages" role="log" aria-label="Conversación con el asistente" aria-live="polite">
          {[welcomeMsg(vehicle), ...messages].map((msg) => (
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
            aria-label="Tu pregunta sobre el vehículo"
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
