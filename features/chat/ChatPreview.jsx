"use client";

import { useRef, useState } from "react";
import AgendaPanel from "../agenda/AgendaPanel";
import { useModalFocus } from "../auth/use-modal-focus";
import { conversationTitle } from "./chat-data";
import { useChat } from "./use-chat";
import FaqBrowser from '../faq/FaqBrowser';

export default function ChatPreview(props) {
  const key = `${props.session?.user?.id}:${props.conversation?.id || props.vehicle?.id}`;
  return <ChatDialog key={key} {...props} />;
}

function ChatDialog({ onClose, session, vehicle, conversation, client, AgendaComponent = AgendaPanel }) {
  const chat = useChat({ session, vehicle, conversation, client });
  const dialogRef = useRef(null);
  useModalFocus(dialogRef, onClose);
  const [body, setBody] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState("");
  const disabled = !chat.conversation || chat.conversation.is_blocked || chat.loading || Boolean(chat.busy);
  const selling = chat.conversation?.seller_id === chat.userId;

  async function submitMessage(event) {
    event.preventDefault();
    const submittedBody = body;
    if (await chat.sendMessage(submittedBody)) setBody(current => current === submittedBody ? "" : current);
  }

  async function submitReport(event) {
    event.preventDefault();
    if (await chat.reportConversation(reason)) {
      setReason("");
      setReportOpen(false);
    }
  }

  return (
    <div className="chatModal" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Chat interno VELOX"
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="chatBox realChat">
        <header className="chatHeader">
          <div>
            <small>{selling ? "Consulta recibida por" : "Consulta por"}</small>
            <h3>{conversationTitle(conversation, vehicle)}</h3>
          </div>
          <button type="button" className="close" onClick={onClose} aria-label="Cerrar chat">X</button>
        </header>

        <div className="chatMessages" role="log" aria-label="Mensajes de la conversación" aria-live="polite" aria-relevant="additions text" aria-busy={chat.loading}>
          {!chat.messages.length && !chat.status && !chat.loading && (
            <p className="emptyChat">Todavía no hay mensajes. Iniciá la conversación.</p>
          )}
          {chat.messages.map(message => (
            <div className={message.sender_id === chat.userId ? "message buyer" : "message seller"} key={message.id}>
              <p>{message.body}</p>
              <small>
                {message.is_automated && "Asistente VELOX | "}
                {new Date(message.created_at).toLocaleString("es-AR")}
                {message.sender_id === chat.userId && (message.read_at ? " | Leído" : " | Enviado")}
              </small>
            </div>
          ))}
        </div>

        {chat.loading && <p className="chatStatus" role="status">Cargando mensajes...</p>}
        {chat.status && <p className="chatStatus" role="status">{chat.status}</p>}
        {chat.realtimeStatus && <p className="chatStatus" role="status">{chat.realtimeStatus}</p>}
        {chat.conversation && <div className="chatSafety">
          <button type="button" onClick={chat.refresh} disabled={chat.loading || Boolean(chat.busy)}>Actualizar mensajes</button>
        </div>}

        {chat.conversation && (
          <AgendaComponent key={chat.conversation.id} conversation={chat.conversation} userId={chat.userId} client={client} />
        )}

        {!selling && <div className="chatQuickQuestions">
          {["¿Sigue disponible?", "¿Aceptás permuta?", "¿En qué zona se puede ver?", "¿Qué horarios hay?"].map(question => (
            <button type="button" key={question} disabled={disabled} onClick={() => setBody(question)}>{question}</button>
          ))}
        </div>}
        {!selling && <details className="chatFaq"><summary>Buscar más preguntas</summary><FaqBrowser onChoose={setBody} disabled={disabled} /></details>}

        <form className="chatComposer" onSubmit={submitMessage} aria-label="Enviar mensaje">
          <input
            aria-label="Escribir mensaje"
            disabled={disabled}
            placeholder={chat.conversation?.is_blocked ? "Conversación bloqueada" : "Escribir mensaje..."}
            value={body}
            onChange={event => setBody(event.target.value)}
          />
          <button className="primary" disabled={disabled || !body.trim()} type="submit">
            {chat.busy === "send" ? "Enviando..." : "Enviar"}
          </button>
        </form>

        {chat.conversation && (
          <div className="chatSafety">
            <button type="button" disabled={Boolean(chat.busy) || chat.reportSubmitted} aria-expanded={reportOpen}
              onClick={() => setReportOpen(current => !current)}>{chat.reportSubmitted ? "Denuncia enviada" : "Denunciar"}</button>
            <button type="button" disabled={Boolean(chat.busy) || chat.conversation.is_blocked} onClick={chat.blockConversation}>
              {chat.conversation.is_blocked ? "Bloqueado" : chat.busy === "block" ? "Bloqueando..." : "Bloquear"}
            </button>
          </div>
        )}

        {reportOpen && !chat.reportSubmitted && (
          <form className="reportForm" onSubmit={submitReport}>
            <label>
              Motivo de la denuncia
              <textarea required disabled={Boolean(chat.busy)} value={reason} onChange={event => setReason(event.target.value)} />
            </label>
            <button className="primary" type="submit" disabled={!reason.trim() || Boolean(chat.busy)}>
              {chat.busy === "report" ? "Enviando denuncia..." : "Enviar denuncia"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
