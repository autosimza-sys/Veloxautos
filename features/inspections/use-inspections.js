"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase-client";
import { submitInspectionReport } from "./inspection-api";

export function useInspections({ profile, session, vehicle, client = supabase }) {
  const userId = session?.user?.id || null;
  const role = profile?.role || null;
  const scope = `${userId}:${role}`;
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState(null);
  const [revision, setRevision] = useState(0);
  const [busyScope, setBusyScope] = useState(null);
  const busyRef = useRef(false);
  const refresh = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    if (!userId || !client) return;
    let active = true;
    async function load() {
      try {
        const { data, error } = await client.from("inspection_requests").select("*").order("requested_at", { ascending: false });
        if (error) throw error;
        const requests = data || [];
        let reportRows = [];
        if (requests.length) {
          const response = await client.from("inspection_reports").select("*, inspection_media(*)").in("request_id", requests.map(item => item.id));
          if (response.error) throw response.error;
          reportRows = response.data || [];
        }
        const media = reportRows.flatMap(report => report.inspection_media || []);
        let signed = new Map();
        if (media.length) {
          const response = await client.storage.from("inspection-media").createSignedUrls(media.map(item => item.storage_path), 3600);
          if (response.error) throw response.error;
          signed = new Map((response.data || []).map(item => [item.path, item.signedUrl]));
        }
        const reports = Object.fromEntries(reportRows.map(report => [report.request_id, {
          ...report, inspection_media: (report.inspection_media || []).map(item => ({ ...item, signedUrl: signed.get(item.storage_path) || "" })),
        }]));
        let assignments = [], mechanics = [];
        if (["mechanic", "admin"].includes(role)) {
          const response = await client.rpc("get_assigned_inspection_context");
          if (response.error) throw response.error;
          assignments = response.data || [];
        }
        if (role === "admin") {
          const response = await client.from("profiles").select("id, display_name").eq("role", "mechanic").eq("is_blocked", false);
          if (response.error) throw response.error;
          mechanics = response.data || [];
        }
        if (active) setResult({ scope, requests, reports, assignments, mechanics, error: "" });
      } catch {
        if (active) setResult({ scope, requests: [], reports: {}, assignments: [], mechanics: [], error: "No pudimos cargar las revisiones. Revisá la conexión e intentá de nuevo." });
      }
    }
    load();
    return () => { active = false; };
  }, [client, userId, role, scope, revision]);

  async function perform(action, success) {
    if (!userId || !client || busyRef.current) return false;
    busyRef.current = true;
    setBusyScope(scope);
    try {
      await action();
      setMessage({ scope, text: success });
      refresh();
      return true;
    } catch (error) {
      setMessage({ scope, text: error.message || "No pudimos completar la operación. Revisá la conexión." });
      return false;
    } finally {
      busyRef.current = false;
      setBusyScope(null);
    }
  }

  function requestInspection() {
    if (!vehicle?.id || !current || current.error) return Promise.resolve(false);
    return perform(async () => {
      const { data, error } = await client.rpc("request_inspection", { target_vehicle: vehicle.id });
      if (error) throw error;
      if (!data?.id) throw new Error("No pudimos confirmar la solicitud. Actualizá las revisiones antes de reintentar.");
      setResult(previous => previous?.scope === scope ? {
        ...previous, requests: [...previous.requests.filter(request => request.id !== data.id), data],
      } : previous);
    }, "Revisión solicitada. VELOX asignará un mecánico.");
  }
  function assignMechanic(requestId, mechanicId) {
    if (!mechanicId) return Promise.resolve(false);
    return perform(async () => {
      const { data, error } = await client.from("inspection_requests").update({ assigned_mechanic: mechanicId, status: "assigned" }).eq("id", requestId).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("No se pudo confirmar la asignación. Actualizá la lista.");
    }, "Mecánico asignado.");
  }
  function submitReport(args) {
    return perform(() => submitInspectionReport({ ...args, userId, client }), "Informe mecánico y archivos guardados.");
  }
  const current = userId && result?.scope === scope ? result : null;
  return {
    requests: current?.requests || [], assignments: current?.assignments || [], mechanics: current?.mechanics || [], reports: current?.reports || {},
    status: current?.error || (message?.scope === scope ? message.text : ""),
    loadError: current?.error || "",
    busy: busyScope === scope, isLoading: Boolean(userId && !current),
    refresh, requestInspection, assignMechanic, submitReport,
  };
}
