"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase-client";

export function useAppointments({ conversation, userId }) {
  const [appointments, setAppointments] = useState([]);
  const [status, setStatus] = useState("");
  const conversationId = conversation?.id;

  useEffect(() => {
    if (!conversationId) return;

    supabase
      .from("appointments")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("scheduled_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setStatus(error.message);
        else setAppointments(data || []);
      });

    const channel = supabase
      .channel(`appointments-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          supabase
            .from("appointments")
            .select("*")
            .eq("conversation_id", conversationId)
            .order("scheduled_at", { ascending: false })
            .then(({ data }) => setAppointments(data || []));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  async function propose({ scheduledAt, location }) {
    const { error } = await supabase.from("appointments").insert({
      conversation_id: conversationId,
      proposed_by: userId,
      scheduled_at: new Date(scheduledAt).toISOString(),
      location: location.trim(),
    });

    if (error) {
      setStatus(error.message);
      return false;
    }
    setStatus("Horario propuesto.");
    return true;
  }

  async function changeStatus(id, nextStatus) {
    const { error } = await supabase
      .from("appointments")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) setStatus(error.message);
    else setStatus(`Visita ${statusLabel(nextStatus).toLowerCase()}.`);
  }

  return { appointments, changeStatus, propose, status };
}

export function statusLabel(status) {
  const labels = {
    proposed: "Propuesta",
    accepted: "Aceptada",
    rejected: "Rechazada",
    confirmed: "Confirmada",
    cancelled: "Cancelada",
  };
  return labels[status] || status;
}

