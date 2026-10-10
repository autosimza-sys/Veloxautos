"use client";

import { useCallback, useState } from "react";
import { supabase } from "../../lib/supabase-client";
import ChatPreview from "./ChatPreview";
import { conversationTitle, isParticipant } from "./chat-data";
import { useChatInbox } from "./use-chat-inbox";
import VisitNotices from '../agenda/VisitNotices';

const listStyle = { display: "grid", gap: 12, listStyle: "none", padding: 0, margin: "20px 0 0" };
const rowStyle = { display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", textAlign: "left", color: "var(--text)", padding: 18 };
const detailStyle = { display: "grid", gap: 6, overflowWrap: "anywhere", minWidth: 0 };

export default function ChatInbox(props) {
  return <ChatInboxContent key={props.session?.user?.id || "signed-out"} {...props} />;
}

function ChatInboxContent({ session, client = supabase, ChatComponent = ChatPreview }) {
  const inbox = useChatInbox({ session, client });
  const userId = session?.user?.id;
  const refreshInbox = inbox.refresh;
  const [selection, setSelection] = useState(null);
  const selected = selection?.userId === userId && isParticipant(selection?.conversation, userId) ? selection.conversation : null;
  const close = useCallback(() => {
    setSelection(null);
    void refreshInbox();
  }, [refreshInbox]);

  return (
    <section className="section panel" id="conversaciones" aria-labelledby="chat-inbox-title">
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div>
          <p className="eyebrow">Tu actividad</p>
          <h2 id="chat-inbox-title">Mis conversaciones</h2>
          <p>Consultas que enviaste y recibiste por tus vehículos.</p>
        </div>
        {userId && <button type="button" className="secondary" disabled={inbox.loading} onClick={inbox.refresh}>
          {inbox.loading ? "Actualizando..." : "Actualizar conversaciones"}
        </button>}
      </div>
      <VisitNotices key={session?.access_token || userId} userId={userId} client={client}/>
      {!userId && <p>Ingresá para ver tus conversaciones.</p>}
      {userId && inbox.loading && <p role="status">Cargando conversaciones...</p>}
      {userId && inbox.status && <p role="alert">{inbox.status}</p>}
      {userId && !inbox.loading && !inbox.status && !inbox.conversations.length && (
        <p className="emptyState">Todavía no tenés conversaciones. Consultá por un vehículo o recibí consultas en tus publicaciones.</p>
      )}
      {userId && <ul style={listStyle}>
        {inbox.conversations.map(conversation => {
          const selling = conversation.seller_id === userId;
          return <li key={conversation.id}>
            <button type="button" className="panel" style={rowStyle} onClick={() => setSelection({ userId, conversation })}>
              <span style={detailStyle}>
                <strong>{conversationTitle(conversation)}</strong>
                <span>{selling ? "Consulta recibida" : "Tu consulta"} · {conversation.counterparty_name || (selling ? "Comprador" : "Vendedor")}</span>
              </span>
              <span>{conversation.is_blocked ? "Bloqueada · Ver mensajes" : "Abrir conversación"}</span>
            </button>
          </li>;
        })}
      </ul>}
      {selected && <ChatComponent key={`${userId}:${selected.id}`} session={session} conversation={selected} client={client} onClose={close} />}
    </section>
  );
}
