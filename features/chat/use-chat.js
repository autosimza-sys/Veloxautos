"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase-client";

export function useChat({ session, vehicle }) {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState("Abriendo conversacion...");
  const userId = session?.user?.id;
  const vehicleId = vehicle?.id;

  const loadMessages = useCallback(async (conversationId) => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      setStatus(error.message);
      return;
    }

    setMessages(data || []);
    setStatus("");
    await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("conversation_id", conversationId)
      .neq("sender_id", userId)
      .is("read_at", null);
  }, [userId]);

  useEffect(() => {
    if (!userId || !vehicleId || !vehicle?.ownerId) {
      Promise.resolve().then(() => setStatus("Esta publicacion de muestra todavia no tiene chat real."));
      return;
    }

    if (vehicle.ownerId === userId) {
      Promise.resolve().then(() => setStatus("No podes abrir un chat de compra sobre tu propia publicacion."));
      return;
    }

    let active = true;

    async function openConversation() {
      const { data: existing, error: readError } = await supabase
        .from("conversations")
        .select("*")
        .eq("vehicle_id", vehicleId)
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
        .maybeSingle();

      if (!active) return;
      if (readError) {
        setStatus(readError.message);
        return;
      }

      let nextConversation = existing;
      if (!nextConversation) {
        const { data, error } = await supabase
          .from("conversations")
          .insert({
            vehicle_id: vehicleId,
            buyer_id: userId,
            seller_id: vehicle.ownerId,
          })
          .select()
          .single();

        if (error) {
          setStatus(error.message);
          return;
        }
        nextConversation = data;
      }

      setConversation(nextConversation);
      await loadMessages(nextConversation.id);
    }

    openConversation();
    return () => {
      active = false;
    };
  }, [loadMessages, userId, vehicle, vehicleId]);

  useEffect(() => {
    if (!conversation?.id) return;

    const channel = supabase
      .channel(`conversation-${conversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          setMessages((current) => current.some((item) => item.id === payload.new.id)
            ? current
            : [...current, payload.new]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation?.id]);

  async function sendMessage(body) {
    const cleanBody = body.trim();
    if (!cleanBody || !conversation?.id || conversation.is_blocked) return false;

    const { error } = await supabase.rpc("send_message_with_assistant", {
      target_conversation: conversation.id,
      message_body: cleanBody,
    });

    if (error) {
      setStatus(error.message);
      return false;
    }

    return true;
  }

  async function blockConversation() {
    if (!conversation?.id) return;
    const { data, error } = await supabase
      .from("conversations")
      .update({ is_blocked: true })
      .eq("id", conversation.id)
      .select()
      .single();

    if (error) setStatus(error.message);
    else setConversation(data);
  }

  async function reportConversation(reason) {
    if (!conversation?.id || !reason.trim()) return false;
    const reportedUserId = conversation.buyer_id === userId
      ? conversation.seller_id
      : conversation.buyer_id;

    const { error } = await supabase.from("reports").insert({
      reporter_id: userId,
      reported_user_id: reportedUserId,
      vehicle_id: vehicleId,
      conversation_id: conversation.id,
      reason: reason.trim(),
    });

    if (error) {
      setStatus(error.message);
      return false;
    }

    await supabase
      .from("conversations")
      .update({ is_reported: true })
      .eq("id", conversation.id);
    setConversation((current) => ({ ...current, is_reported: true }));
    setStatus("Denuncia enviada al equipo de VELOX.");
    return true;
  }

  return {
    blockConversation,
    conversation,
    messages,
    reportConversation,
    sendMessage,
    status,
    userId,
  };
}
