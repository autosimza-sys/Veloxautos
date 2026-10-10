"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createVehiclePublication, fetchVehicleCatalog } from "./vehicle-api";
import { publicationRequest } from "../publication/publication-request";

export function useVehicleCatalog({ onPublished, profile, session, loadCatalog = fetchVehicleCatalog, createPublication = createVehiclePublication }) {
  const token = session?.access_token || null;
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [publishStatus, setPublishStatus] = useState("");
  const publishing = useRef(false);
  const refresh = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    let active = true;
    loadCatalog().then(
      vehicles => {
        if (active) setResult({ token, revision, vehicles, error: "" });
      },
      () => {
        if (active) setResult({
          token, revision, vehicles: [],
          error: "No pudimos cargar el catálogo. Revisá la conexión e intentá de nuevo.",
        });
      },
    );
    return () => { active = false; };
  }, [token, revision, loadCatalog]);

  // Session-scoped data disappears immediately on logout, before the next fetch.
  const currentResult = result?.token === token && result?.revision === revision ? result : null;
  const vehicles = currentResult?.vehicles || [];
  const selectedVehicle = vehicles.find(vehicle => vehicle.id === selectedId) || vehicles[0] || null;

  async function publishVehicle({ form, photoFiles, videoFile }) {
    if (!session?.user || !profile) {
      setPublishStatus("Primero tenes que crear cuenta o entrar.");
      return false;
    }
    if (publishing.current) return false;
    publishing.current = true;
    setPublishStatus("Publicando...");
    try {
      let storage;
      try { storage = window.sessionStorage; } catch { /* Memory fallback for restricted browsers. */ }
      const request = await publicationRequest({ userId: session.user.id, form, photoFiles, videoFile }, storage);
      const createdVehicle = await createPublication({
        form, photoFiles, videoFile, profile, user: session.user,
        requestId: request.id,
      });
      setSelectedId(createdVehicle.id);
      setPublishStatus("Publicacion activa. Ya aparece en el catalogo.");
      refresh();
      request.complete();
      try { await onPublished?.(); } catch {
        setPublishStatus("Publicación activa. El saldo de créditos se actualizará al recargar.");
      }
      return true;
    } catch (error) {
      setPublishStatus(error.message);
      return false;
    } finally {
      publishing.current = false;
    }
  }

  return {
    catalogStatus: currentResult?.error || "",
    catalogVehicles: vehicles,
    isLoading: !currentResult,
    publishStatus,
    publishVehicle,
    refresh,
    selectedVehicle,
    setSelectedVehicle: vehicle => setSelectedId(vehicle?.id || null),
  };
}
