"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase-client";
import { sendChatMessage } from "./message-request";
import { requestAssistantReply } from './assistant-request';
import { CONVERSATION_FIELDS, MESSAGE_FIELDS, isParticipant, isTransportError } from "./chat-data";

const initialState = key => ({ key, conversation: null, messages: [], status: "", loading: true, busy: "", reportSubmitted: false, realtimeStatus: "" });

export function useChat({ session, vehicle, conversation: existingConversation, client = supabase, requestStorage }) {
  const userId = session?.user?.id;
  const existingId = existingConversation?.id;
  const existingBuyer = existingConversation?.buyer_id;
  const existingSeller = existingConversation?.seller_id;
  const vehicleId = vehicle?.id;
  const ownerId = vehicle?.ownerId;
  const key = JSON.stringify([userId, existingId, existingBuyer, existingSeller, existingId ? null : vehicleId, existingId ? null : ownerId]);
  const scopeRef = useRef(null);
  const [state, setState] = useState(() => initialState(key));

  const patch = useCallback((scope, next) => {
    if (!scope.active || scopeRef.current !== scope) return;
    setState(previous => scope.active && scopeRef.current === scope && previous.key === scope.key ? { ...previous, ...next } : previous);
  }, []);

  const refreshScope = useCallback(async (scope, { sent = false, confirmationNotice = "" } = {}) => {
    if (!scope.active || !scope.conversation?.id) return false;
    const request = ++scope.request;
    const current = () => scope.active && scopeRef.current === scope && request === scope.request;
    patch(scope, { loading: true, status: "" });
    try {
      const { data: conversation, error: conversationError } = await client.from("conversations")
        .select(CONVERSATION_FIELDS).eq("id", scope.conversation.id).maybeSingle();
      if (!current()) return false;
      if (conversationError) throw conversationError;
      if (!isParticipant(conversation, scope.userId)) {
        scope.conversation = null;
        patch(scope, { conversation: null, messages: [], loading: false, status: "Esta conversación ya no está disponible para tu cuenta." });
        return false;
      }
      scope.conversation = conversation;
      patch(scope, { conversation });
      const { data, error } = await client.from("messages").select(MESSAGE_FIELDS)
        .eq("conversation_id", conversation.id).order("created_at", { ascending: true })
        .order("is_automated", { ascending: true }).order("id", { ascending: true });
      if (!current()) return false;
      if (error) throw error;
      const messages = (data || []).filter(message => message.conversation_id === conversation.id);
      patch(scope, { messages, loading: false, status: confirmationNotice });
      const unreadIds = messages.filter(message => message.sender_id !== scope.userId && !message.read_at).map(message => message.id);
      if (unreadIds.length) {
        try {
          const readAt = new Date().toISOString();
          const { error: readError } = await client.from("messages").update({ read_at: readAt })
            .eq("conversation_id", conversation.id).in("id", unreadIds).neq("sender_id", scope.userId).is("read_at", null);
          if (!current()) return true;
          if (readError) throw readError;
          patch(scope, { messages: messages.map(message => unreadIds.includes(message.id) ? { ...message, read_at: readAt } : message) });
        } catch {
          if (current()) patch(scope, { status: "Mensajes cargados. No pudimos marcar los recibidos como leídos; podés actualizar para reintentar." });
        }
      }
      return true;
    } catch {
      if (current()) patch(scope, { loading: false, status: sent
        ? "Mensaje enviado. No pudimos actualizar el historial; usá Actualizar mensajes."
        : "No pudimos actualizar los mensajes. Revisá tu conexión y volvé a intentar." });
      return false;
    }
  }, [client, patch]);

  useEffect(() => {
    const scope = { key, userId, active: true, request: 0, conversation: null, busy: "", channels: [] };
    scopeRef.current = scope;
    const current = () => scope.active && scopeRef.current === scope;
    async function openConversation() {
      if (!current()) return;
      setState(initialState(key));
      if (!userId || !client) {
        patch(scope, { loading: false, status: !userId ? "Ingresá para ver tus mensajes." : "El chat no está disponible en este entorno." });
        return;
      }
      if (!existingId && (!vehicleId || !ownerId || ownerId === userId)) {
        patch(scope, { loading: false, status: ownerId === userId
          ? "Abrí las consultas de tu publicación desde Mis conversaciones."
          : "Esta publicación de muestra todavía no tiene chat real." });
        return;
      }
      if (existingId && !isParticipant({ id: existingId, buyer_id: existingBuyer, seller_id: existingSeller }, userId)) {
        patch(scope, { loading: false, status: "No tenés acceso a esta conversación." });
        return;
      }
      try {
        let conversation;
        if (existingId) conversation = { id: existingId };
        else {
          const findExisting = () => client.from("conversations").select(CONVERSATION_FIELDS)
            .eq("vehicle_id", vehicleId).eq("buyer_id", userId).maybeSingle();
          const { data, error } = await findExisting();
          if (!current()) return;
          if (error) throw error;
          conversation = data;
          if (!conversation) {
            const created = await client.from("conversations").insert({ vehicle_id: vehicleId, buyer_id: userId, seller_id: ownerId })
              .select(CONVERSATION_FIELDS).single();
            if (!current()) return;
            // A second tab can win the unique (vehicle, buyer) insert race.
            if (created.error?.code === "23505") {
              const retry = await findExisting();
              if (!current()) return;
              if (retry.error) throw retry.error;
              conversation = retry.data;
            } else {
              if (created.error) throw created.error;
              conversation = created.data;
            }
          }
        }
        if (!conversation?.id) throw new Error("No conversation");
        scope.conversation = conversation;
        await refreshScope(scope);
        if (!current() || !scope.conversation) return;
        try {
          const channel = client.channel(`conversation-${conversation.id}-${userId}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversation.id}` }, () => { if (current() && !scope.busy) void refreshScope(scope); })
            .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations", filter: `id=eq.${conversation.id}` }, () => { if (current() && !scope.busy) void refreshScope(scope); });
          scope.channels.push(channel);
          channel.subscribe(status => {
            if (status === "SUBSCRIBED") patch(scope, { realtimeStatus: "" });
            else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) patch(scope, { realtimeStatus: "La actualización en vivo no está disponible. Usá Actualizar mensajes para ver las novedades." });
          });
        } catch {
          patch(scope, { realtimeStatus: "La actualización en vivo no está disponible. Usá Actualizar mensajes para ver las novedades." });
        }
      } catch {
        patch(scope, { loading: false, status: "No pudimos abrir la conversación. Revisá tu conexión y volvé a abrir el chat." });
      }
    }
    // Deferring also avoids creating a chat in React StrictMode's discarded mount.
    void Promise.resolve().then(openConversation);
    return () => {
      scope.active = false;
      for (const channel of scope.channels) {
        try { void Promise.resolve(client.removeChannel(channel)).catch(() => {}); } catch { /* Already disconnected. */ }
      }
    };
  }, [client, existingBuyer, existingId, existingSeller, key, ownerId, patch, refreshScope, userId, vehicleId]);

  function getScope() {
    const scope = scopeRef.current;
    return scope?.active && scope.key === key && isParticipant(scope.conversation, userId) ? scope : null;
  }

  async function refresh() {
    const scope = getScope();
    if (scope && !scope.busy) return refreshScope(scope);
    return false;
  }

  async function sendMessage(body) {
    const scope = getScope();
    const cleanBody = body.trim();
    if (!scope || scope.busy || !cleanBody || scope.conversation.is_blocked) return false;
    scope.busy = "send";
    scope.request++;
    patch(scope, { busy: "send", loading: false, status: "" });
    try {
      const sent = await sendChatMessage({ client, userId: scope.userId, conversationId: scope.conversation.id, body: cleanBody,
        storage: requestStorage, isCurrent: () => scope.active && scopeRef.current === scope });
      if (!scope.active || scopeRef.current !== scope) return false;
      let confirmationNotice=sent.reused ? 'Envío confirmado.' : '';
      if(!sent.result.automated && scope.userId===scope.conversation.buyer_id && session?.access_token) {
        const ai=await requestAssistantReply(sent.result.message_id,session.access_token);
        if(!scope.active || scopeRef.current!==scope)return false;
        if(ai==='unavailable' || ai==='limited') confirmationNotice='Mensaje enviado al vendedor. El asistente no está disponible para responder ahora.';
        if(ai==='processing') confirmationNotice='Mensaje enviado. La respuesta del asistente está en proceso; podés actualizar el historial.';
      }
      await refreshScope(scope, { sent: true, confirmationNotice });
      if (!sent.storageCleared) patch(scope, { status: "Mensaje enviado. No pudimos actualizar la protección de reintentos de esta pestaña; revisá el almacenamiento del navegador antes de recargar." });
      return scope.active && scopeRef.current === scope;
    } catch (error) {
      patch(scope, { status: error?.code === "CHAT_REQUEST_STORAGE"
        ? "No pudimos guardar la protección de reintentos. El mensaje no se envió; habilitá el almacenamiento de sesión del navegador y volvé a intentar."
        : isTransportError(error) || error?.code === "CHAT_ACK_UNCONFIRMED"
          ? "No pudimos confirmar el envío. Podés reintentar el mismo texto sin duplicarlo. Si lo cambiás, se enviará como otro mensaje."
          : "No se pudo enviar el mensaje. Actualizá para comprobar si la conversación sigue disponible." });
      return false;
    } finally {
      scope.busy = "";
      patch(scope, { busy: "" });
    }
  }

  async function blockConversation() {
    const scope = getScope();
    if (!scope || scope.busy || scope.conversation.is_blocked) return false;
    scope.busy = "block";
    scope.request++;
    patch(scope, { busy: "block", loading: false, status: "" });
    try {
      const { data, error } = await client.from("conversations").update({ is_blocked: true })
        .eq("id", scope.conversation.id).select(CONVERSATION_FIELDS).single();
      if (error || !isParticipant(data, userId)) throw error || new Error("Unavailable");
      if (!scope.active || scopeRef.current !== scope) return false;
      scope.conversation = data;
      patch(scope, { conversation: data, status: "Conversación bloqueada." });
      return true;
    } catch {
      patch(scope, { status: "No pudimos confirmar el bloqueo. Actualizá los mensajes y volvé a intentar." });
      return false;
    } finally {
      scope.busy = "";
      patch(scope, { busy: "" });
    }
  }

  async function reportConversation(reason) {
    const scope = getScope();
    const cleanReason = reason.trim();
    if (!scope || scope.busy || !cleanReason || scope.reportSubmitted) return false;
    scope.busy = "report";
    scope.request++;
    patch(scope, { busy: "report", loading: false, status: "" });
    let submitted = false;
    try {
      const conversation = scope.conversation;
      const { error } = await client.from("reports").insert({ reporter_id: userId,
        reported_user_id: conversation.buyer_id === userId ? conversation.seller_id : conversation.buyer_id,
        vehicle_id: conversation.vehicle_id, conversation_id: conversation.id, reason: cleanReason });
      if (error) throw error;
      submitted = true;
      if (!scope.active || scopeRef.current !== scope) return false;
      scope.conversation = { ...scope.conversation, is_reported: true };
      scope.reportSubmitted = true;
      patch(scope, { conversation: scope.conversation, reportSubmitted: true });
      const { error: flagError } = await client.from("conversations").update({ is_reported: true }).eq("id", conversation.id);
      if (flagError) throw flagError;
      patch(scope, { status: "Denuncia enviada al equipo de VELOX." });
      return true;
    } catch {
      patch(scope, { status: submitted
        ? "Denuncia enviada. No pudimos actualizar su estado en la conversación."
        : "No pudimos confirmar la denuncia. Revisá tu conexión antes de reintentar." });
      return submitted;
    } finally {
      scope.busy = "";
      patch(scope, { busy: "" });
    }
  }

  const visible = state.key === key ? state : initialState(key);
  return { ...visible, blockConversation, refresh, reportConversation, sendMessage, userId };
}
