"use client";

import { useState } from "react";
import { statusLabel, useAppointments } from "./use-appointments";

export default function AgendaPanel({ conversation, userId }) {
  const agenda = useAppointments({ conversation, userId });
  const [open, setOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [location, setLocation] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (await agenda.propose({ scheduledAt, location })) {
      setScheduledAt("");
      setLocation("");
      setOpen(false);
    }
  }

  return (
    <section className="agendaPanel">
      <button className="agendaToggle" type="button" onClick={() => setOpen((current) => !current)}>
        Coordinar visita
      </button>

      {open && (
        <form className="agendaForm" onSubmit={submit}>
          <label>
            Fecha y hora
            <input required type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
          </label>
          <label>
            Lugar
            <input required value={location} onChange={(event) => setLocation(event.target.value)} />
          </label>
          <button className="primary" type="submit">Proponer</button>
        </form>
      )}

      {agenda.appointments.map((appointment) => (
        <article className="appointment" key={appointment.id}>
          <div>
            <strong>{new Date(appointment.scheduled_at).toLocaleString("es-AR")}</strong>
            <span>{appointment.location}</span>
            <small>{statusLabel(appointment.status)}</small>
          </div>
          <div className="appointmentActions">
            {appointment.status === "proposed" && (
              <>
                <button type="button" onClick={() => agenda.changeStatus(appointment.id, "accepted")}>Aceptar</button>
                <button type="button" onClick={() => agenda.changeStatus(appointment.id, "rejected")}>Rechazar</button>
              </>
            )}
            {appointment.status === "accepted" && (
              <button type="button" onClick={() => agenda.changeStatus(appointment.id, "confirmed")}>Confirmar</button>
            )}
          </div>
        </article>
      ))}
      {agenda.status && <p className="chatStatus">{agenda.status}</p>}
    </section>
  );
}

