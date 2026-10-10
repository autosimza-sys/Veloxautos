"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase-client";
import { appointmentActions, appointmentEnd, isConversationMember, parseAppointmentDuration, parseAppointmentTime, statusLabel } from "./appointment-model";
import { appointmentRequest } from "./appointment-request";

export { statusLabel } from "./appointment-model";

const emptyView = { appointments: [], status: "", busy: false, loading: false, loaded: false };

function transitionError(error) {
  if (/intervalo.*superpone/i.test(error?.message || "")) {
    return "El intervalo se superpone con otra reserva de uno de los participantes. Elegí otro horario o ajustá la duración.";
  }
  if (/horario.*reservad/i.test(error?.message || "")) {
    return "Ese horario ya está reservado para el comprador o el vendedor. Elegí otro horario.";
  }
  if (error?.code === "40001" || /state changed|stale|(?:estado|visita).*cambi|expected_status/i.test(error?.message || "")) {
    return "La visita cambió desde la última actualización. Revisá el estado actualizado antes de continuar.";
  }
  if (error?.code === "42501") return "No tenés permiso para hacer ese cambio. Revisá el estado actualizado de la visita.";
  return "No pudimos guardar el cambio. Revisá la conexión y volvé a intentar.";
}

export function useAppointments({ conversation, userId, client = supabase, requestStorage, requestCrypto = globalThis.crypto }) {
  const [view, setView] = useState(emptyView);
  // A scope owns both its request sequence and synchronous mutation lock. A
  // response from an old conversation/session cannot publish into a newer one.
  const scopeRef = useRef(null);
  const conversationId = conversation?.id;
  const member = isConversationMember(conversation, userId);
  const blocked = Boolean(conversation?.is_blocked);
  const canRead = Boolean(client && member);
  const scopeKey = JSON.stringify([conversationId, userId, conversation?.buyer_id, conversation?.seller_id, blocked]);

  const publish = useCallback((scope, patch) => {
    if (!scope.active || scopeRef.current !== scope) return;
    setView(current => {
      if (!scope.active || scopeRef.current !== scope) return current;
      const previous = current.scope === scope ? current : emptyView;
      return {
        ...previous, ...(typeof patch === "function" ? patch(previous) : patch), scope,
        scopeKey: scope.key, client: scope.client,
      };
    });
  }, []);

  const refresh = useCallback(async ({ preserveStatus = false } = {}) => {
    const scope = scopeRef.current;
    if (!canRead || !scope?.active || scope.key !== scopeKey || scope.client !== client) return false;
    const request = ++scope.request;
    publish(scope, { loading: true, ...(preserveStatus ? {} : { status: "" }) });
    try {
      const { data, error } = await client.from("appointments").select("*")
        .eq("conversation_id", conversationId).order("scheduled_at", { ascending: false });
      if (!scope.active || scopeRef.current !== scope || request !== scope.request) return false;
      if (error) throw error;
      scope.rows = data || [];
      publish(scope, { appointments: scope.rows, loading: false, loaded: true });
      return true;
    } catch {
      if (!scope.active || scopeRef.current !== scope || request !== scope.request) return false;
      const message = "No pudimos actualizar la agenda. Revisá la conexión y usá Actualizar agenda.";
      publish(scope, current => ({ loading: false,
        status: preserveStatus && current.status ? `${current.status} ${message}` : message,
      }));
      return false;
    }
  }, [canRead, client, conversationId, publish, scopeKey]);

  useEffect(() => {
    const scope = { active: true, key: scopeKey, client, request: 0, busy: false, rows: [] };
    scopeRef.current = scope;
    // Keep initialization asynchronous and mask previous scope data in render.
    Promise.resolve().then(() => {
      if (scope.active) void refresh();
    });
    let channel;
    if (canRead) {
      try {
        channel = client.channel(`appointments-${conversationId}-${userId}`);
        channel.on("postgres_changes", {
            event: "*", schema: "public", table: "appointments",
            filter: `conversation_id=eq.${conversationId}`,
          }, () => { if (scope.active && !scope.busy) void refresh({ preserveStatus: true }); });
        channel.subscribe();
      } catch {
        // Realtime is an enhancement. Initial, post-write and manual reads work
        // independently, including when subscriptions are unavailable.
      }
    }
    return () => {
      scope.active = false;
      scope.request += 1;
      if (channel) {
        try { Promise.resolve(client.removeChannel(channel)).catch(() => {}); } catch { /* Already disconnected. */ }
      }
    };
  }, [canRead, client, conversationId, refresh, scopeKey, userId]);

  function getScope() {
    const scope = scopeRef.current;
    return scope?.active && scope.key === scopeKey && scope.client === client ? scope : null;
  }

  function mutationScope({ cancelling = false } = {}) {
    const scope = getScope();
    if (!scope || scope.busy) return null;
    if (!client || !member || (blocked && !cancelling)) {
      publish(scope, { status: !client ? "Falta configurar la conexión de la agenda."
        : blocked ? "La conversación está bloqueada. Podés cancelar visitas pendientes."
          : "Ingresá con una cuenta participante de esta conversación para coordinar visitas." });
      return null;
    }
    return scope;
  }

  function begin(scope) {
    scope.busy = true;
    // A read begun before a write must not replace the resulting state.
    scope.request += 1;
    publish(scope, { busy: true, status: "", loading: false });
  }

  function finish(scope) {
    scope.busy = false;
    publish(scope, { busy: false });
  }

  async function propose({ scheduledAt, durationMinutes, location }) {
    const scope = mutationScope();
    if (!scope) return false;
    const date = parseAppointmentTime(scheduledAt);
    if (!date) {
      publish(scope, { status: "Elegí una fecha y hora válidas, posteriores al momento actual." });
      return false;
    }
    const duration = parseAppointmentDuration(durationMinutes);
    if (!duration || !appointmentEnd(date, duration)) {
      publish(scope, { status: "Indicá una duración en minutos enteros positivos, hasta 2147483647 (límite técnico)." });
      return false;
    }
    const cleanLocation = typeof location === "string" ? location.trim() : "";
    if (!cleanLocation) {
      publish(scope, { status: "Indicá un lugar para la visita." });
      return false;
    }
    begin(scope);
    let dispatched = false;
    try {
      const intention = await appointmentRequest({
        userId, conversationId, scheduledAt: date.toISOString(), durationMinutes: duration, location: cleanLocation,
      }, requestStorage, {
        cryptoProvider: requestCrypto, isCurrent: () => getScope() === scope,
        createIfMissing: date.getTime() > Date.now(),
      });
      if (!intention || getScope() !== scope) return false;
      dispatched = true;
      const { data, error } = await client.rpc("propose_appointment", {
        target_conversation: conversationId, appointment_scheduled_at: date.toISOString(),
        appointment_duration_minutes: duration, appointment_location: cleanLocation,
        proposal_request_id: intention.id,
      });
      if (getScope() !== scope) return false;
      if (error) {
        publish(scope, { status: transitionError(error) });
        await refresh({ preserveStatus: true });
        return false;
      }
      const created = Array.isArray(data) ? data[0] : data;
      if (!created || typeof created.id !== "string" || !created.id || created.proposed_by !== userId ||
          created.conversation_id !== conversationId || new Date(created.scheduled_at).getTime() !== date.getTime() ||
          created.duration_minutes !== duration || created.location !== cleanLocation ||
          !["proposed", "accepted", "confirmed", "rejected", "cancelled"].includes(created.status)) {
        publish(scope, { status: "No pudimos verificar la propuesta. Conservamos su referencia para que puedas reintentar sin duplicarla." });
        await refresh({ preserveStatus: true });
        return false;
      }
      const referenceCleared = intention.complete();
      scope.rows = [created, ...scope.rows.filter(item => item.id !== created.id)];
      const confirmedStatus = created.status === "proposed" && !intention.reused
        ? "Horario propuesto. La otra persona debe aceptarlo antes de tu confirmación final."
        : `Propuesta registrada. Estado actual: ${statusLabel(created.status).toLowerCase()}.`;
      publish(scope, { appointments: scope.rows, status: referenceCleared ? confirmedStatus
        : `${confirmedStatus} La visita quedó registrada, pero no pudimos liberar su referencia local. Permití el almacenamiento antes de crear otra igual.` });
      await refresh({ preserveStatus: true });
      // A verified proposal remains successful if its refresh fails; otherwise
      // the form would invite the user to create an accidental duplicate.
      return getScope() === scope;
    } catch (error) {
      if (!dispatched) {
        publish(scope, { status: error?.code?.startsWith("APPOINTMENT_") ? error.message
          : "No pudimos preparar una referencia segura para la propuesta. No se envió. Intentá nuevamente." });
        return false;
      }
      publish(scope, { status: "No pudimos confirmar el envío. Conservamos su referencia: revisá la conexión y reintentá con los mismos datos para no duplicarla." });
      await refresh({ preserveStatus: true });
      return false;
    } finally { finish(scope); }
  }

  async function changeStatus(id, nextStatus) {
    const scope = mutationScope({ cancelling: nextStatus === "cancelled" });
    if (!scope) return false;
    const appointment = scope.rows.find(item => item.id === id);
    if (!appointment || !appointmentActions(appointment, conversation, userId).includes(nextStatus)) {
      publish(scope, { status: "Este cambio no está disponible. Actualizá la agenda y revisá el estado, la fecha y quién propuso la visita." });
      return false;
    }
    begin(scope);
    try {
      const { data, error } = await client.rpc("transition_appointment", {
        target_appointment: id, expected_status: appointment.status, next_status: nextStatus,
      });
      if (getScope() !== scope) return false;
      if (error) {
        publish(scope, { status: transitionError(error) });
        await refresh({ preserveStatus: true });
        return false;
      }
      // Use the authoritative RPC result immediately, then reconcile the list.
      const updated = Array.isArray(data) ? data[0] : data;
      if (updated?.id !== id || updated.conversation_id !== conversationId || updated.status !== nextStatus) {
        publish(scope, { status: "No pudimos verificar el cambio. Actualizá la agenda y revisá el estado de la visita." });
        await refresh({ preserveStatus: true });
        return false;
      }
      scope.rows = scope.rows.map(item => item.id === id ? updated : item);
      publish(scope, { appointments: scope.rows, status: nextStatus === "accepted"
        ? "Visita aceptada. Tu confirmación quedó registrada; falta la de quien la propuso."
        : `Visita ${statusLabel(nextStatus).toLowerCase()}.` });
      await refresh({ preserveStatus: true });
      return getScope() === scope;
    } catch {
      publish(scope, { status: "No pudimos confirmar el cambio. Revisá la conexión y actualizá la agenda antes de volver a intentar." });
      await refresh({ preserveStatus: true });
      return false;
    } finally { finish(scope); }
  }

  const currentView = view.scopeKey === scopeKey && view.client === client ? view : emptyView;
  const unavailable = !client ? "Falta configurar la conexión de la agenda."
    : !member ? "Ingresá con una cuenta participante de esta conversación para coordinar visitas." : "";
  return {
    appointments: currentView.appointments, busy: currentView.busy,
    loading: currentView.loading, loaded: currentView.loaded,
    status: currentView.status || unavailable,
    canRead, canMutate: canRead && !blocked, canCancel: canRead,
    changeStatus, propose, refresh,
  };
}
