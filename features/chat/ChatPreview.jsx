"use client";

import { useState } from "react";
import AgendaPanel from "../agenda/AgendaPanel";
import { useChat } from "./use-chat";

export default function ChatPreview({ onClose, session, vehicle }) {
  const chat = useChat({ session, vehicle });
  const [body, setBody] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState("");

  async function submitMessage(event) {
    event.preventDefault();
    if (await chat.sendMessage(body)) setBody("");
  }

  async function submitReport(event) {
    event.preventDefault();
    if (await chat.reportConversation(reason)) {
      setReason("");
      setReportOpen(false);
    }
  }

  return (
    <div className="chatModal" role="dialog" aria-modal="true" aria-label="Chat interno VELOX">
      <div className="chatBox realChat">
        <header className="chatHeader">
          <div>
            <small>Consulta por</small>
            <h3>{vehicle.brand} {vehicle.model}</h3>
          </div>
          <button className="close" onClick={onClose} aria-label="Cerrar chat">X</button>
        </header>

        <div className="chatMessages">
          {!chat.messages.length && !chat.status && (
            <p className="emptyChat">Todavia no hay mensajes. Hace tu primera consulta.</p>
          )}
          {chat.messages.map((message) => (
            <div className={message.sender_id === chat.userId ? "message buyer" : "message seller"} key={message.id}>
              <p>{message.body}</p>
              <small>
                {message.is_automated && "Asistente VELOX | "}
                {new Date(message.created_at).toLocaleString("es-AR")}
                {message.sender_id === chat.userId && (message.read_at ? " | Leido" : " | Enviado")}
              </small>
            </div>
          ))}
        </div>

        {chat.status && <p className="chatStatus">{chat.status}</p>}

        {chat.conversation && (
          <AgendaPanel conversation={chat.conversation} userId={chat.userId} />
        )}

        <div className="chatQuickQuestions">
          {["Sigue disponible?", "Aceptas permuta?", "Donde se puede ver?", "Que horarios hay?"].map((question) => (
            <button type="button" key={question} onClick={() => setBody(question)}>{question}</button>
          ))}
        </div>

        <form className="chatComposer" onSubmit={submitMessage}>
          <input
            disabled={!chat.conversation || chat.conversation.is_blocked}
            placeholder={chat.conversation?.is_blocked ? "Conversacion bloqueada" : "Escribir mensaje..."}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <button className="primary" disabled={!body.trim() || chat.conversation?.is_blocked} type="submit">
            Enviar
          </button>
        </form>

        {chat.conversation && (
          <div className="chatSafety">
            <button type="button" onClick={() => setReportOpen((current) => !current)}>Denunciar</button>
            <button type="button" disabled={chat.conversation.is_blocked} onClick={chat.blockConversation}>
              {chat.conversation.is_blocked ? "Bloqueado" : "Bloquear"}
            </button>
          </div>
        )}

        {reportOpen && (
          <form className="reportForm" onSubmit={submitReport}>
            <label>
              Motivo de la denuncia
              <textarea required value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
            <button className="primary" type="submit">Enviar denuncia</button>
          </form>
        )}
      </div>
    </div>
  );
}
