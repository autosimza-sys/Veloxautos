"use client";

import { useEffect, useId, useState } from "react";
import { appointmentActions, appointmentEnd, MAX_APPOINTMENT_DURATION_MINUTES } from "./appointment-model";
import { statusLabel, useAppointments } from "./use-appointments";
import VisitPlanner from './VisitPlanner';

const actionLabels = { accepted: "Aceptar", rejected: "Rechazar", confirmed: "Confirmar visita", cancelled: "Cancelar visita" };

export default function AgendaPanel(props) {
  // Changing conversation or identity must also discard private local drafts.
  return <AgendaContent key={JSON.stringify([props.conversation?.id, props.userId])} {...props} />;
}

function AgendaContent({ conversation, userId, client }) {
  const agenda = useAppointments({ conversation, userId, client });
  const [open, setOpen] = useState(false);
  const [assistantOpen,setAssistantOpen]=useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [location, setLocation] = useState("");
  const [now, setNow] = useState(Date.now);
  const formId = useId();
  const timezoneId = useId();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "zona local";
  const disabled = !agenda.canMutate || agenda.busy;
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (await agenda.propose({ scheduledAt, durationMinutes, location })) {
      setScheduledAt("");
      setDurationMinutes("");
      setLocation("");
      setOpen(false);
    }
  }

  return (
    <section className="agendaPanel" aria-label="Agenda de visitas" aria-busy={agenda.busy || agenda.loading}>
      <button type="button" className="primary" disabled={disabled} aria-expanded={assistantOpen}
        onClick={()=>setAssistantOpen(current=>!current)}>Asistente para coordinar</button>
      {assistantOpen && <VisitPlanner onPropose={agenda.propose} onClose={()=>setAssistantOpen(false)} disabled={!agenda.canMutate} />}
      <button className="agendaToggle" type="button" disabled={disabled} aria-expanded={open} aria-controls={formId}
        onClick={() => setOpen(current => !current)}>
        Coordinar visita
      </button>
      <button type="button" disabled={!agenda.canRead || agenda.loading || agenda.busy} onClick={() => agenda.refresh()}>
        Actualizar agenda
      </button>
      <p id={timezoneId}>Zona horaria: {timezone}. Se usa la hora local de tu navegador.</p>
      {conversation?.is_blocked && <p>La conversación está bloqueada. Podés cancelar visitas pendientes.</p>}

      {open && (
        <form className="agendaForm" id={formId} onSubmit={submit}>
          <label>
            Fecha y hora
            <input required type="datetime-local" aria-describedby={timezoneId} disabled={disabled}
              value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} />
          </label>
          <label>
            Duración en minutos
            <input required type="number" min="1" max={MAX_APPOINTMENT_DURATION_MINUTES} step="1" disabled={disabled}
              value={durationMinutes} onChange={event => setDurationMinutes(event.target.value)} />
          </label>
          <label>
            Lugar
            <input required disabled={disabled} value={location} onChange={event => setLocation(event.target.value)} />
          </label>
          <button className="primary" type="submit" disabled={disabled}>{agenda.busy ? "Proponiendo..." : "Proponer"}</button>
          <button type="button" disabled={agenda.busy} onClick={() => setOpen(false)}>Cerrar propuesta</button>
        </form>
      )}

      {agenda.loading && <p>Cargando agenda...</p>}
      {agenda.loaded && !agenda.appointments.length && <p>Todavía no hay visitas propuestas.</p>}
      {agenda.appointments.map(appointment => {
        const date = new Date(appointment.scheduled_at);
        const validDate = Number.isFinite(date.getTime());
        const end = appointmentEnd(appointment.scheduled_at, appointment.duration_minutes);
        const historical = appointment.status === "cancelled" || appointment.status === "rejected";
        const expired = validDate && date.getTime() <= now;
        return (
          <article className="appointment" key={appointment.id}>
            <div>
              <strong>Inicio: {validDate ? date.toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" }) : "Fecha inválida"}</strong>
              <small>{end ? `Fin: ${end.toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" })}`
                : historical ? "Fin no registrado" : "Fin: Falta definir duración"}</small>
              <small>{end ? `Duración: ${appointment.duration_minutes} minutos`
                : historical ? "Duración no registrada" : "Duración pendiente"}</small>
              <span>{appointment.location}</span>
              <small>{statusLabel(appointment.status)}{expired ? " · Horario pasado" : ""}</small>
              {appointment.status === "proposed" && <small>{appointment.proposed_by === userId
                ? "Esperando que la otra persona acepte tu propuesta."
                : "Al aceptar, queda registrada tu confirmación."}</small>}
              {appointment.status === "accepted" && <small>{appointment.proposed_by === userId
                ? "La otra persona aceptó. Falta tu confirmación final."
                : "Tu confirmación quedó registrada. Esperando a quien propuso la visita."}</small>}
              <small>Comprador: {appointment.buyer_confirmed_at ? "confirmó" : "pendiente"}</small>
              <small>Vendedor: {appointment.seller_confirmed_at ? "confirmó" : "pendiente"}</small>
            </div>
            <div className="appointmentActions">
              {appointmentActions(appointment, conversation, userId, now).map(action => (
                <button type="button" key={action}
                  disabled={action === "cancelled" ? !agenda.canCancel || agenda.busy : disabled}
                  onClick={() => agenda.changeStatus(appointment.id, action)}>
                  {actionLabels[action]}
                </button>
              ))}
            </div>
          </article>
        );
      })}
      {agenda.status && <p className="chatStatus" role="status" aria-live="polite">{agenda.status}</p>}
    </section>
  );
}
