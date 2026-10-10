"use client";

import { useState } from "react";
import { canManageOwnListings, ownerListingForm, useOwnerListings } from "./use-owner-listings";
import SellerFaqPanel from '../faq/SellerFaqPanel';
import SellerVisitAuthorization from '../agenda/SellerVisitAuthorization';
import {supabase} from '../../lib/supabase-client';

const STATUS_LABELS = { active: "Activa", paused: "Pausada", deleted: "Retirada", draft: "Borrador" };
const FIELDS = [
  ["brand", "Marca"], ["model", "Modelo"], ["version", "Versión"],
  ["year", "Año", "number", 1886, new Date().getFullYear() + 1],
  ["kilometers", "Kilómetros", "number", 0, 2147483647],
  ["price", "Precio (ARS)", "number", 1, 2147483647], ["zone", "Zona"],
  ["partialPlate", "Patente parcial"], ["viewLocation", "Lugar para visitas"], ["availableHours", "Horarios disponibles"],
];

export default function OwnerListings(props) {
  if (!canManageOwnListings(props.session, props.profile)) return null;
  // Remount private forms on any account/token change so unsaved data can never
  // carry over into the next account, even before an asynchronous load finishes.
  return <OwnerListingsContent key={`${props.session.user.id}:${props.session.access_token || ""}`} {...props} client={props.client === undefined ? supabase : props.client} />;
}

function OwnerListingsContent(props) {
  const { listings, isLoading, loadError, actionError, actionMessage, busyId, refresh, editListing, changeStatus } = useOwnerListings(props);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(null);
  const [withdrawId, setWithdrawId] = useState(null);

  function startEditing(vehicle) {
    setWithdrawId(null);
    setEditingId(vehicle.id);
    setForm(ownerListingForm(vehicle));
  }

  return (
    <section className="section" id="mis-publicaciones" aria-labelledby="owner-listings-title" style={{ paddingBlock: 36 }}>
      <div className="sectionTitle">
        <p className="eyebrow">Tu inventario</p>
        <h2 id="owner-listings-title">Mis publicaciones</h2>
        <p>Editar, pausar o reactivar una publicación existente no consume créditos.</p>
        <p>La edición de fotos y videos no está disponible en esta versión.</p>
      </div>
      <button type="button" className="secondary" onClick={refresh} disabled={Boolean(busyId) || isLoading}>Actualizar mis publicaciones</button>
      {isLoading && <p role="status">Cargando tus publicaciones...</p>}
      {loadError && <div role="alert" className="warning"><p>{loadError}</p><button type="button" className="secondary" onClick={refresh}>Reintentar</button></div>}
      {actionError && <p role="alert" className="warning">{actionError}</p>}
      {actionMessage && <p role="status" className="authStatus">{actionMessage}</p>}
      {!isLoading && !loadError && !listings.length && <p className="emptyState">Todavía no tenés publicaciones propias.</p>}
      <div style={{ display: "grid", gap: 16, marginTop: 20 }}>
        {listings.map(vehicle => (
          <article key={vehicle.id} className="panel" aria-label={`${vehicle.brand} ${vehicle.model}`}>
            <h3>{vehicle.brand} {vehicle.model} {vehicle.version}</h3>
            <p>{vehicle.year} · {Number(vehicle.kilometers).toLocaleString("es-AR")} km · {Number(vehicle.price).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })}</p>
            <p>{vehicle.zone} · <strong>{STATUS_LABELS[vehicle.status] || "Estado desconocido"}</strong></p>
            {editingId === vehicle.id ? (
              <form className="publishCard" aria-label={`Editar ${vehicle.brand} ${vehicle.model}`} onSubmit={async event => {
                event.preventDefault();
                if (await editListing(vehicle.id, form)) { setEditingId(null); setForm(null); }
              }}>
                <fieldset disabled={Boolean(busyId)} style={{ border: 0, display: "grid", gap: 14 }}>
                  <legend>Datos de la publicación</legend>
                  <div className="formGrid">
                    {FIELDS.map(([field, label, type = "text", min, max]) => (
                      <label key={field}>{label}
                        <input type={type} min={min} max={max} step={type === "number" ? 1 : undefined}
                          required={["brand", "model", "version", "year", "kilometers", "price", "zone"].includes(field)}
                          value={form[field]} onChange={event => setForm(previous => ({ ...previous, [field]: event.target.value }))} />
                      </label>
                    ))}
                  </div>
                  <label>Descripción<textarea rows={4} value={form.description} onChange={event => setForm(previous => ({ ...previous, description: event.target.value }))} /></label>
                  <div className="switches">
                    <label><input type="checkbox" checked={form.acceptsTrade} onChange={event => setForm(previous => ({ ...previous, acceptsTrade: event.target.checked }))} />Acepta permutas</label>
                    <label><input type="checkbox" checked={form.acceptsFinancing} onChange={event => setForm(previous => ({ ...previous, acceptsFinancing: event.target.checked }))} />Acepta financiación</label>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    <button className="primary" type="submit">{busyId === vehicle.id ? "Guardando..." : "Guardar cambios"}</button>
                    <button className="secondary" type="button" onClick={() => { setEditingId(null); setForm(null); }}>Cancelar edición</button>
                  </div>
                </fieldset>
              </form>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
                <button className="secondary" type="button" disabled={Boolean(busyId)} onClick={() => startEditing(vehicle)}>Editar datos</button>
                {vehicle.status === "active" && <button className="secondary" type="button" disabled={Boolean(busyId)} onClick={() => changeStatus(vehicle.id, "paused")}>Pausar publicación</button>}
                {["paused", "deleted"].includes(vehicle.status) && <button className="primary" type="button" disabled={Boolean(busyId)} onClick={() => changeStatus(vehicle.id, "active")}>Reactivar publicación</button>}
                {["active", "paused"].includes(vehicle.status) && withdrawId !== vehicle.id && <button className="secondary" type="button" disabled={Boolean(busyId)} onClick={() => { setEditingId(null); setForm(null); setWithdrawId(vehicle.id); }}>Retirar publicación</button>}
              </div>
            )}
            {vehicle.status === "draft" && <p className="warning">Este borrador debe pasar por el flujo de publicación con crédito para activarse.</p>}
            <SellerFaqPanel vehicleId={vehicle.id} client={props.client} />
            <SellerVisitAuthorization vehicleId={vehicle.id} client={props.client} listingActive={vehicle.status==='active'} />
            {withdrawId === vehicle.id && <div className="warning" style={{ marginTop: 12 }}>
              <p>Se ocultará del catálogo. El registro y sus fotos se conservan; podés reactivarla después.</p>
              <button className="secondary" type="button" disabled={Boolean(busyId)} onClick={async () => { if (await changeStatus(vehicle.id, "deleted")) setWithdrawId(null); }}>Confirmar retiro</button>{" "}
              <button className="secondary" type="button" disabled={Boolean(busyId)} onClick={() => setWithdrawId(null)}>Cancelar retiro</button>
            </div>}
          </article>
        ))}
      </div>
    </section>
  );
}
