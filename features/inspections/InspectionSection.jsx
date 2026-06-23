"use client";

import { useState } from "react";
import { useInspections } from "./use-inspections";

const scoreItems = ["motor", "caja", "estructura", "frenos", "electronica", "interior"];

function createReportForm() {
  return {
    inspectionDate: new Date().toISOString().slice(0, 10),
    odometer: "",
    observations: "",
    result: "approved",
    scores: Object.fromEntries(scoreItems.map((item) => [item, 7])),
  };
}

export default function InspectionSection({ profile, session, vehicle }) {
  const inspections = useInspections({ profile, session, vehicle });
  const [selectedRequest, setSelectedRequest] = useState("");
  const [form, setForm] = useState(createReportForm);
  const [dashboardFile, setDashboardFile] = useState(null);
  const [detailFiles, setDetailFiles] = useState([]);
  const [videoFile, setVideoFile] = useState(null);

  const currentVehicleRequest = inspections.requests.find((item) => item.vehicle_id === vehicle.id);
  const currentReport = currentVehicleRequest
    ? inspections.reports[currentVehicleRequest.id]
    : null;

  async function submitReport(event) {
    event.preventDefault();
    const saved = await inspections.submitReport({
      requestId: selectedRequest,
      form,
      dashboardFile,
      detailFiles,
      videoFile,
    });
    if (saved) {
      setForm(createReportForm());
      setDashboardFile(null);
      setDetailFiles([]);
      setVideoFile(null);
      setSelectedRequest("");
    }
  }

  return (
    <section className="section inspectionSection" id="revision-mecanica">
      <div className="sectionTitle">
        <p className="eyebrow">Revision mecanica VELOX</p>
        <h2>Un informe profesional, privado y trazable.</h2>
      </div>

      {!profile && <p className="warning">Inicia sesion para solicitar una revision.</p>}

      {profile && !["mechanic", "admin"].includes(profile.role) && (
        <div className="inspectionRequestCard">
          <div>
            <strong>{vehicle.brand} {vehicle.model}</strong>
            <p>Puede solicitarla quien vende o quien evalua comprar. El informe solo sera visible para quien la solicito.</p>
          </div>
          <button
            className="primary"
            disabled={Boolean(currentVehicleRequest)}
            onClick={inspections.requestInspection}
          >
            {currentVehicleRequest ? `Estado: ${currentVehicleRequest.status}` : "Solicitar revision"}
          </button>
          {currentReport && (
            <div className="privateInspectionReport">
              <span>Informe privado | {new Date(currentReport.inspection_date).toLocaleDateString("es-AR")}</span>
              <strong>{currentReport.result === "approved" ? "Aprobado" : "Con observaciones"}</strong>
              <p>Kilometraje verificado: {Number(currentReport.odometer).toLocaleString("es-AR")} km</p>
              <p>{currentReport.observations || "Sin observaciones adicionales."}</p>
              <div className="reportScores">
                {Object.entries(currentReport.scores || {}).map(([key, value]) => (
                  <span key={key}>{key}: {value}/10</span>
                ))}
              </div>
              <div className="reportMedia">
                {(currentReport.inspection_media || []).map((media) => media.signedUrl && (
                  media.kind === "video"
                    ? <video controls src={media.signedUrl} key={media.id} />
                    : <img src={media.signedUrl} alt={media.kind} key={media.id} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {profile?.role === "admin" && (
        <div className="inspectionAdmin">
          <h3>Asignaciones</h3>
          {inspections.requests.map((request) => (
            <div className="assignmentRow" key={request.id}>
              <span>{request.vehicle_id.slice(0, 8)} | {request.status}</span>
              <select
                value={request.assigned_mechanic || ""}
                onChange={(event) => inspections.assignMechanic(request.id, event.target.value)}
              >
                <option value="">Asignar mecanico</option>
                {inspections.mechanics.map((mechanic) => (
                  <option value={mechanic.id} key={mechanic.id}>{mechanic.display_name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {profile?.role === "mechanic" && (
        <div className="mechanicWorkspace">
          <div className="mechanicAssignments">
            <h3>Vehiculos asignados</h3>
            {inspections.assignments.map((assignment) => (
              <button
                className={selectedRequest === assignment.request_id ? "active" : ""}
                key={assignment.request_id}
                onClick={() => {
                  setSelectedRequest(assignment.request_id);
                  setForm((current) => ({ ...current, odometer: assignment.declared_kilometers }));
                }}
              >
                <strong>{assignment.brand} {assignment.model} {assignment.version}</strong>
                <span>{assignment.year} | {assignment.request_status}</span>
                <small>Dueno: {assignment.owner_name} | {assignment.owner_phone || "sin telefono"}</small>
              </button>
            ))}
          </div>

          {selectedRequest && (
            <form className="mechanicReport" onSubmit={submitReport}>
              <div className="assistantFieldGrid">
                <label>Fecha<input required type="date" value={form.inspectionDate} onChange={(event) => setForm({ ...form, inspectionDate: event.target.value })} /></label>
                <label>Kilometros verificados<input required min="0" type="number" value={form.odometer} onChange={(event) => setForm({ ...form, odometer: event.target.value })} /></label>
                {scoreItems.map((item) => (
                  <label key={item}>
                    {item}
                    <input min="1" max="10" type="number" value={form.scores[item]} onChange={(event) => setForm({
                      ...form,
                      scores: { ...form.scores, [item]: Number(event.target.value) },
                    })} />
                  </label>
                ))}
              </div>
              <label>Observaciones<textarea value={form.observations} onChange={(event) => setForm({ ...form, observations: event.target.value })} /></label>
              <div className="inspectionFiles">
                <label>Foto del tablero<input required accept="image/*" type="file" onChange={(event) => setDashboardFile(event.target.files?.[0] || null)} /></label>
                <label>Fotos de detalles<input multiple accept="image/*" type="file" onChange={(event) => setDetailFiles(Array.from(event.target.files || []).slice(0, 6))} /></label>
                <label>Video opcional<input accept="video/*" type="file" onChange={(event) => setVideoFile(event.target.files?.[0] || null)} /></label>
              </div>
              <label>Resultado
                <select value={form.result} onChange={(event) => setForm({ ...form, result: event.target.value })}>
                  <option value="approved">Aprobar</option>
                  <option value="observed">Observar</option>
                </select>
              </label>
              <button className="primary" type="submit">Guardar informe</button>
            </form>
          )}
        </div>
      )}

      {inspections.status && <p className="authStatus">{inspections.status}</p>}
    </section>
  );
}
