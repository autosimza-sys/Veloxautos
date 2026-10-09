const activeStatuses = new Set(["proposed", "accepted", "confirmed"]);

export function isConversationMember(conversation, userId) {
  return Boolean(userId && conversation?.id &&
    (conversation.buyer_id === userId || conversation.seller_id === userId));
}

// datetime-local is deliberately interpreted in the browser's timezone. Check
// every component because Date otherwise normalizes impossible dates silently.
export function parseAppointmentTime(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(value);
  const [year, month, day, hour, minute] = value.split(/[-T:]/).map(Number);
  if (!Number.isFinite(date.getTime()) || date.getFullYear() !== year || date.getMonth() !== month - 1 ||
      date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute) return null;
  return date;
}

export const MAX_APPOINTMENT_DURATION_MINUTES = 2_147_483_647;

export function parseAppointmentDuration(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value.trim()))) return null;
  const duration = Number(value);
  return Number.isInteger(duration) && duration > 0 && duration <= MAX_APPOINTMENT_DURATION_MINUTES ? duration : null;
}

export function appointmentEnd(scheduledAt, durationMinutes) {
  const duration = parseAppointmentDuration(durationMinutes);
  const start = new Date(scheduledAt).getTime();
  if (!duration || !Number.isFinite(start)) return null;
  const end = new Date(start + duration * 60_000);
  return Number.isFinite(end.getTime()) ? end : null;
}

export function appointmentActions(appointment, conversation, userId, now = Date.now()) {
  if (!isConversationMember(conversation, userId) || appointment.conversation_id !== conversation.id) return [];
  const future = Boolean(appointmentEnd(appointment.scheduled_at, appointment.duration_minutes)) &&
    new Date(appointment.scheduled_at).getTime() > now;
  const ownProposal = appointment.proposed_by === userId;
  const actions = [];
  if (appointment.status === "proposed" && !ownProposal) {
    if (future) actions.push("accepted");
    actions.push("rejected");
  }
  if (appointment.status === "accepted" && ownProposal && future) actions.push("confirmed");
  if (activeStatuses.has(appointment.status)) actions.push("cancelled");
  return actions;
}

export function statusLabel(status) {
  const labels = {
    proposed: "Propuesta", accepted: "Aceptada", rejected: "Rechazada",
    confirmed: "Confirmada", cancelled: "Cancelada",
  };
  return labels[status] || status;
}
