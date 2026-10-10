"use client";

import { useRef, useState } from "react";
import { useInspections } from "./use-inspections";
import { createInspectionForm, INSPECTION_SCORES } from "./inspection-api";

const scoreItems = INSPECTION_SCORES;

export default function InspectionSection({ profile, session, vehicle, client }) {
  const inspections = useInspections({ profile, session, vehicle, client });
  const [selectedRequest, setSelectedRequest] = useState("");
  const [form, setForm] = useState(createInspectionForm);
  const [dashboardFile, setDashboardFile] = useState(null);
  const [detailFiles, setDetailFiles] = useState([]);
  const [videoFile, setVideoFile] = useState(null);
  const drafts = useRef(new Map());

  const currentVehicleRequest = inspections.requests.find((item) => item.vehicle_id === vehicle?.id);
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
      drafts.current.delete(selectedRequest);
      setForm(createInspectionForm());
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

      {profile && vehicle && !["mechanic", "admin"].includes(profile.role) && (
        <div className="inspectionRequestCard">
          <div>
            <strong>{vehicle.brand} {vehicle.model}</strong>
            <p>Puede solicitarla quien vende o quien evalua comprar. El informe lo ven quien lo solicitó, el mecánico asignado y administración.</p>
          </div>
          <button
            className="primary"
            disabled={inspections.busy || inspections.isLoading || Boolean(inspections.loadError) || Boolean(currentVehicleRequest)}
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
                disabled={inspections.busy || ["completed", "observed", "cancelled"].includes(request.status)}
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
            {inspections.assignments.filter(assignment => ["assigned", "in_progress"].includes(assignment.request_status)).map((assignment) => (
              <button
                className={selectedRequest === assignment.request_id ? "active" : ""}
                key={assignment.request_id}
                disabled={inspections.busy}
                onClick={() => {
                  if (inspections.busy || selectedRequest === assignment.request_id) return;
                  if (selectedRequest) drafts.current.set(selectedRequest, { form, dashboardFile, detailFiles, videoFile });
                  const draft = drafts.current.get(assignment.request_id);
                  setSelectedRequest(assignment.request_id);
                  setForm(draft?.form || createInspectionForm());
                  setDashboardFile(draft?.dashboardFile || null);
                  setDetailFiles(draft?.detailFiles || []);
                  setVideoFile(draft?.videoFile || null);
                }}
              >
                <strong>{assignment.brand} {assignment.model} {assignment.version}</strong>
                <span>{assignment.year} | {assignment.request_status}</span>
                <small>Dueno: {assignment.owner_name} | {assignment.owner_phone || "sin telefono"}</small>
              </button>
            ))}
          </div>

          {selectedRequest && (
            <form className="mechanicReport" key={selectedRequest} onSubmit={submitReport}>
              <fieldset disabled={inspections.busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              <div className="assistantFieldGrid">
                <label>Fecha<input required type="date" value={form.inspectionDate} onChange={(event) => setForm({ ...form, inspectionDate: event.target.value })} /></label>
                <label>Kilometros verificados<input required min="0" type="number" value={form.odometer} onChange={(event) => setForm({ ...form, odometer: event.target.value })} /></label>
                {scoreItems.map((item) => (
                  <label key={item}>
                    {item}
                    <input required min="1" max="10" type="number" value={form.scores[item]} onChange={(event) => setForm({
                      ...form,
                      scores: { ...form.scores, [item]: event.target.value },
                    })} />
                  </label>
                ))}
              </div>
              <label>Observaciones<textarea value={form.observations} onChange={(event) => setForm({ ...form, observations: event.target.value })} /></label>
              <div className="inspectionFiles">
                <label>Foto del tablero<input required={!dashboardFile} accept="image/*" type="file" onChange={(event) => setDashboardFile(event.target.files?.[0] || null)} /></label>
                <label>Fotos de detalles<input multiple accept="image/*" type="file" onChange={(event) => setDetailFiles(Array.from(event.target.files || []))} /></label>
                <label>Video opcional<input accept="video/*" type="file" onChange={(event) => setVideoFile(event.target.files?.[0] || null)} /></label>
              </div>
              {dashboardFile && <p>Foto de tablero seleccionada: {dashboardFile.name}</p>}
              {detailFiles.length > 0 && <p>Fotos de detalles seleccionadas: {detailFiles.map(file => file.name).join(", ")}</p>}
              {videoFile && <p>Video seleccionado: {videoFile.name}</p>}
              <label>Resultado
                <select required value={form.result} onChange={(event) => setForm({ ...form, result: event.target.value })}>
                  <option value="">Seleccionar resultado</option>
                  <option value="approved">Aprobar</option>
                  <option value="observed">Observar</option>
                </select>
              </label>
              <button className="primary" type="submit" disabled={inspections.busy}>{inspections.busy ? "Guardando..." : "Guardar informe"}</button>
              </fieldset>
            </form>
          )}
        </div>
      )}

      {inspections.isLoading && <p role="status">Cargando revisiones...</p>}
      <button type="button" className="secondary" onClick={inspections.refresh} disabled={inspections.busy}>Actualizar revisiones</button>
      {inspections.status && <p className="authStatus">{inspections.status}</p>}
    </section>
  );
}
