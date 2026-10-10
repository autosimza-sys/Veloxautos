"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase-client";
import { isParticipant } from "./chat-data";

export function useChatInbox({ session, client = supabase }) {
  const userId = session?.user?.id;
  const scopeRef = useRef(null);
  const [state, setState] = useState({ userId, conversations: [], loading: Boolean(userId), status: "" });

  const refresh = useCallback(async () => {
    const scope = scopeRef.current;
    if (!scope?.active || scope.userId !== userId || !userId) return;
    const request = ++scope.request;
    const current = () => scope.active && scopeRef.current === scope && scope.request === request;
    setState(previous => ({ ...previous, userId, loading: true, status: "" }));
    if (!client) {
      setState({ userId, conversations: [], loading: false, status: "El chat no está disponible en este entorno." });
      return;
    }
    try {
      const { data, error } = await client.rpc("get_my_conversations");
      if (!current()) return;
      if (error) throw error;
      const conversations = (data || []).filter(row => isParticipant(row, userId));
      setState({ userId, conversations, loading: false, status: "" });
    } catch {
      if (current()) setState(previous => ({ ...previous, loading: false, status: "No pudimos cargar tus conversaciones. Revisá tu conexión y volvé a actualizar." }));
    }
  }, [client, userId]);

  useEffect(() => {
    const scope = { active: true, userId, request: 0 };
    scopeRef.current = scope;
    Promise.resolve().then(() => {
      if (!scope.active) return;
      setState({ userId, conversations: [], loading: Boolean(userId), status: "" });
      if (userId) void refresh();
    });
    return () => { scope.active = false; };
  }, [refresh, userId]);

  const visible = state.userId === userId ? state : { conversations: [], loading: Boolean(userId), status: "" };
  return { ...visible, refresh };
}
