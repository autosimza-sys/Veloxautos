"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase-client";
import { isSellerRole } from "../../lib/roles";
import { validatePublicationStep } from "../publication/publication-quality";

const OWNER_COLUMNS = "id,owner_id,status,brand,model,version,year,kilometers,price,zone,partial_plate,description,accepts_trade,accepts_financing,view_location,available_hours,created_at,updated_at";

export function canManageOwnListings(session, profile) {
  return Boolean(session?.user?.id && profile?.id === session.user.id
    && isSellerRole(profile.role) && !profile.is_blocked);
}

export async function fetchOwnerListings({ userId, client = supabase } = {}) {
  if (!userId) throw new Error("Falta iniciar sesión.");
  if (!client) throw new Error("La conexión a tus publicaciones no está configurada.");
  const { data, error } = await client.from("vehicles").select(OWNER_COLUMNS)
    .eq("owner_id", userId).order("created_at", { ascending: false });
  if (error) throw error;
  // Defense in depth: the RLS policy is authoritative, but a stale/mis-scoped
  // response must never populate another account's private UI.
  return (data || []).filter(vehicle => vehicle.owner_id === userId);
}

export function ownerListingForm(vehicle) {
  return {
    brand: vehicle.brand, model: vehicle.model, version: vehicle.version,
    year: String(vehicle.year), kilometers: String(vehicle.kilometers), price: String(vehicle.price),
    zone: vehicle.zone, partialPlate: vehicle.partial_plate || "", description: vehicle.description || "",
    acceptsTrade: vehicle.accepts_trade, acceptsFinancing: vehicle.accepts_financing,
    viewLocation: vehicle.view_location || "", availableHours: vehicle.available_hours || "",
  };
}

export async function updateOwnerListing({ id, form, client = supabase }) {
  if (!client) throw new Error("La conexión a tus publicaciones no está configurada.");
  if (!id || ![0, 1, 2].every(step => validatePublicationStep(step, form))
    || ["partialPlate", "description", "viewLocation", "availableHours"].some(field => typeof form[field] !== "string")
    || typeof form.acceptsTrade !== "boolean" || typeof form.acceptsFinancing !== "boolean") {
    throw new Error("Revisá marca, modelo, versión, año, kilómetros, precio y zona antes de guardar.");
  }
  const { data, error } = await client.rpc("update_vehicle_listing", {
    target_vehicle: id,
    payload: {
      brand: form.brand.trim(), model: form.model.trim(), version: form.version.trim(),
      year: Number(form.year), kilometers: Number(form.kilometers), price: Number(form.price), zone: form.zone.trim(),
      partial_plate: form.partialPlate.trim(), description: form.description.trim(),
      accepts_trade: form.acceptsTrade, accepts_financing: form.acceptsFinancing,
      view_location: form.viewLocation.trim(), available_hours: form.availableHours.trim(),
    },
  });
  if (error) throw error;
  if (!data || data.id !== id) throw new Error("No pudimos confirmar los cambios.");
  return data;
}

export async function changeOwnerListingStatus({ id, status, client = supabase }) {
  if (!client) throw new Error("La conexión a tus publicaciones no está configurada.");
  if (!id || !["active", "paused", "deleted"].includes(status)) throw new Error("Estado de publicación inválido.");
  const { data, error } = await client.rpc("set_vehicle_listing_status", { target_vehicle: id, next_status: status });
  if (error) throw error;
  if (!data || data.id !== id || data.status !== status) throw new Error("No pudimos confirmar el estado.");
  return data;
}

export function useOwnerListings({ session, profile, onChanged, client = supabase }) {
  const allowed = canManageOwnListings(session, profile);
  const userId = session?.user?.id || "";
  const scope = allowed ? `${userId}:${session.access_token || ""}:${profile.role}` : "";
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  const [action, setAction] = useState(null);
  const lifecycle = useRef(null);
  const inFlight = useRef(null);
  const refresh = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    const marker = {};
    lifecycle.current = marker;
    return () => {
      if (lifecycle.current === marker) lifecycle.current = null;
      inFlight.current = null;
    };
  }, [scope, client]);

  useEffect(() => {
    if (!scope) return;
    let active = true;
    fetchOwnerListings({ userId, client }).then(
      listings => { if (active) setResult({ scope, revision, listings, error: "" }); },
      () => { if (active) setResult({ scope, revision, listings: [], error: "No pudimos cargar tus publicaciones. Revisá la conexión e intentá de nuevo." }); },
    );
    return () => { active = false; };
  }, [scope, userId, revision, client]);

  const current = scope && result?.scope === scope && result.revision === revision ? result : null;
  const currentAction = scope && action?.scope === scope ? action : null;

  async function mutate(id, execute, message) {
    if (!allowed || inFlight.current || !current?.listings.some(vehicle => vehicle.id === id)) return false;
    const marker = lifecycle.current;
    const request = {};
    inFlight.current = request;
    setAction({ scope, busyId: id, error: "", message: "" });
    try {
      const updated = await execute();
      if (marker !== lifecycle.current) return false;
      if (updated.owner_id !== userId) throw new Error("Respuesta de publicación inválida.");
      setResult(previous => previous?.scope === scope ? {
        ...previous, listings: previous.listings.map(vehicle => vehicle.id === id ? updated : vehicle),
      } : previous);
      setAction({ scope, busyId: null, error: "", message });
      // A confirmed mutation remains successful if refreshing another screen fails.
      try { await onChanged?.(updated); } catch {
        if (marker === lifecycle.current) setAction({ scope, busyId: null, error: "", message: `${message} Recargá el catálogo para ver los cambios allí.` });
      }
      return true;
    } catch (error) {
      if (marker !== lifecycle.current) return false;
      const validation = error.message?.startsWith("Revisá") ? error.message
        : "No pudimos confirmar el cambio. Recargá tus publicaciones para comprobar el estado o volvé a intentarlo.";
      setAction({ scope, busyId: null, error: validation, message: "" });
      return false;
    } finally {
      if (inFlight.current === request) inFlight.current = null;
    }
  }

  return {
    allowed, listings: current?.listings || [], isLoading: Boolean(scope && !current),
    loadError: current?.error || "", actionError: currentAction?.error || "",
    actionMessage: currentAction?.message || "", busyId: currentAction?.busyId || null,
    refresh,
    editListing: (id, form) => mutate(id, () => updateOwnerListing({ id, form, client }), "Cambios guardados."),
    changeStatus: (id, status) => mutate(id, () => changeOwnerListingStatus({ id, status, client }), {
      active: "Publicación reactivada.", paused: "Publicación pausada.", deleted: "Publicación retirada. Podés reactivarla cuando quieras.",
    }[status] || "Estado guardado."),
  };
}
