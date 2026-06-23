"use client";

import { useEffect, useState } from "react";
import { demoVehicles } from "../../lib/velox-data";
import { createVehiclePublication, fetchVehicleCatalog } from "./vehicle-api";

export function useVehicleCatalog({ onPublished, profile, session }) {
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(demoVehicles[0]);
  const [catalogStatus, setCatalogStatus] = useState("");
  const [publishStatus, setPublishStatus] = useState("");

  useEffect(() => {
    loadVehicles();
  }, [session?.access_token]);

  async function loadVehicles() {
    setCatalogStatus("");
    try {
      const nextVehicles = await fetchVehicleCatalog();
      setVehicles(nextVehicles);
      if (nextVehicles.length) setSelectedVehicle(nextVehicles[0]);
    } catch (error) {
      setCatalogStatus(`No se pudo leer el catalogo: ${error.message}`);
    }
  }

  async function publishVehicle({ form, photoFiles, videoFile }) {
    if (!session?.user || !profile) {
      setPublishStatus("Primero tenes que crear cuenta o entrar.");
      return false;
    }

    setPublishStatus("Publicando...");
    try {
      const createdVehicle = await createVehiclePublication({
        form,
        photoFiles,
        videoFile,
        profile,
        user: session.user,
      });
      setVehicles((current) => [
        createdVehicle,
        ...current.filter((item) => item.id !== createdVehicle.id),
      ]);
      setSelectedVehicle(createdVehicle);
      setPublishStatus("Publicacion activa. Ya aparece en el catalogo.");
      await loadVehicles();
      await onPublished?.();
      return true;
    } catch (error) {
      setPublishStatus(error.message);
      return false;
    }
  }

  return {
    catalogStatus,
    catalogVehicles: vehicles.length ? vehicles : demoVehicles,
    publishStatus,
    publishVehicle,
    selectedVehicle,
    setSelectedVehicle,
  };
}
