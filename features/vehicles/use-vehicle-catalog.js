"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createVehiclePublication, fetchVehicleCatalogPage } from "./vehicle-api";
import { publicationRequest } from "../publication/publication-request";

const EMPTY_FILTERS = Object.freeze({});

export function useVehicleCatalog({ onPublished, profile, session, loadCatalog = fetchVehicleCatalogPage, createPublication = createVehiclePublication }) {
  const token = session?.access_token || null;
  const [query, setQuery] = useState(null);
  const currentQuery = query?.token === token ? query : null;
  const filters = currentQuery?.filters || EMPTY_FILTERS;
  const cursor = currentQuery?.cursor || null;
  const queryKey = JSON.stringify([filters, cursor]);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [publicationResult, setPublicationResult] = useState(null);
  const publishStatus = publicationResult?.token === token ? publicationResult.message : "";
  function setPublishStatus(message) { setPublicationResult({ token, message }); }
  const publishing = useRef(false);
  const refresh = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    let active = true;
    loadCatalog({ filters, cursor }).then(
      page => {
        const data = Array.isArray(page) ? { vehicles: page } : page;
        if (active) setResult({ token, revision, queryKey, ...data, error: "" });
      },
      () => {
        if (active) setResult({
          token, revision, queryKey, vehicles: [],
          error: "No pudimos cargar el catálogo. Revisá la conexión e intentá de nuevo.",
        });
      },
    );
    return () => { active = false; };
  }, [token, revision, loadCatalog, queryKey, filters, cursor]);

  // Session-scoped data disappears immediately on logout, before the next fetch.
  const currentResult = result?.token === token && result?.revision === revision && result?.queryKey === queryKey ? result : null;
  const vehicles = currentResult?.vehicles || [];
  const selectedVehicle = vehicles.find(vehicle => vehicle.id === selectedId) || vehicles[0] || null;

  async function publishVehicle({ form, photoFiles, videoFile, publicationQuote }) {
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
        form, photoFiles, videoFile, profile, user: session.user, publicationQuote,
        requestId: request.id,
      });
      setSelectedId(createdVehicle.id);
      setPublishStatus("Publicacion activa. Ya aparece en el catalogo.");
      setQuery({ token, filters, cursor: null, history: [] });
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
    filters,
    brands: currentResult?.brands,
    years: currentResult?.years,
    hasNextPage: Boolean(currentResult?.nextCursor),
    hasPreviousPage: Boolean(currentQuery?.history?.length),
    setFilters: next => setQuery({ token, filters: next, cursor: null, history: [] }),
    nextPage: () => {
      if (currentResult?.nextCursor) setQuery({ token, filters, cursor: currentResult.nextCursor,
        history: [...(currentQuery?.history || []), cursor] });
    },
    previousPage: () => {
      const history = [...(currentQuery?.history || [])];
      if (history.length) setQuery({ token, filters, cursor: history.pop(), history });
    },
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
