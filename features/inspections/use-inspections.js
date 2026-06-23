"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase-client";

export function useInspections({ profile, session, vehicle }) {
  const [requests, setRequests] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [mechanics, setMechanics] = useState([]);
  const [reports, setReports] = useState({});
  const [status, setStatus] = useState("");
  const userId = session?.user?.id;
  const role = profile?.role;

  const refresh = useCallback(async () => {
    if (!userId) return;

    const { data, error } = await supabase
      .from("inspection_requests")
      .select("*")
      .order("requested_at", { ascending: false });

    if (error) {
      setStatus("La revision mecanica se activara al aplicar la migracion pendiente.");
      return;
    }

    setRequests(data || []);

    if (data?.length) {
      const requestIds = data.map((item) => item.id);
      const { data: reportRows } = await supabase
        .from("inspection_reports")
        .select("*, inspection_media(*)")
        .in("request_id", requestIds);

      const resolvedReports = await Promise.all((reportRows || []).map(async (report) => ({
        ...report,
        inspection_media: await Promise.all((report.inspection_media || []).map(async (media) => {
          const { data: signed } = await supabase.storage
            .from("inspection-media")
            .createSignedUrl(media.storage_path, 60 * 60);
          return { ...media, signedUrl: signed?.signedUrl || "" };
        })),
      })));
      setReports(Object.fromEntries(resolvedReports.map((report) => [report.request_id, report])));
    }

    if (role === "mechanic" || role === "admin") {
      const { data: context } = await supabase.rpc("get_assigned_inspection_context");
      setAssignments(context || []);
    }

    if (role === "admin") {
      const { data: mechanicRows } = await supabase
        .from("profiles")
        .select("id, display_name")
        .eq("role", "mechanic")
        .eq("is_blocked", false);
      setMechanics(mechanicRows || []);
    }
  }, [role, userId]);

  useEffect(() => {
    if (!userId) return;
    const timeoutId = window.setTimeout(() => refresh(), 0);
    return () => window.clearTimeout(timeoutId);
  }, [refresh, userId]);

  async function requestInspection() {
    const { error } = await supabase.from("inspection_requests").insert({
      vehicle_id: vehicle.id,
      requested_by: userId,
    });

    if (error) setStatus(error.message);
    else {
      setStatus("Revision solicitada. VELOX asignara un mecanico.");
      await refresh();
    }
  }

  async function assignMechanic(requestId, mechanicId) {
    const { error } = await supabase
      .from("inspection_requests")
      .update({ assigned_mechanic: mechanicId, status: "assigned" })
      .eq("id", requestId);

    if (error) setStatus(error.message);
    else {
      setStatus("Mecanico asignado.");
      await refresh();
    }
  }

  async function submitReport({ requestId, form, dashboardFile, detailFiles, videoFile }) {
    const photos = [dashboardFile, ...detailFiles].filter(Boolean);
    if (photos.some((file) => file.size > 3 * 1024 * 1024)) {
      setStatus("Cada foto puede pesar como maximo 3 MB.");
      return false;
    }
    if (videoFile && videoFile.size > 25 * 1024 * 1024) {
      setStatus("El video puede pesar como maximo 25 MB.");
      return false;
    }

    const { data: report, error: reportError } = await supabase
      .from("inspection_reports")
      .insert({
        request_id: requestId,
        mechanic_id: userId,
        inspection_date: form.inspectionDate,
        odometer: Number(form.odometer),
        scores: form.scores,
        observations: form.observations,
        result: form.result,
      })
      .select()
      .single();

    if (reportError) {
      setStatus(reportError.message);
      return false;
    }

    const files = [
      ...(dashboardFile ? [{ file: dashboardFile, kind: "dashboard" }] : []),
      ...detailFiles.map((file) => ({ file, kind: "detail" })),
      ...(videoFile ? [{ file: videoFile, kind: "video" }] : []),
    ];

    for (let index = 0; index < files.length; index += 1) {
      const item = files[index];
      const extension = item.file.name.split(".").pop() || "bin";
      const path = `${userId}/${requestId}/${Date.now()}-${index}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("inspection-media")
        .upload(path, item.file, { contentType: item.file.type, upsert: false });

      if (uploadError) {
        setStatus(`Informe guardado, pero fallo un archivo: ${uploadError.message}`);
        continue;
      }

      await supabase.from("inspection_media").insert({
        report_id: report.id,
        kind: item.kind,
        storage_path: path,
      });
    }

    await supabase
      .from("inspection_requests")
      .update({
        status: form.result === "approved" ? "completed" : "observed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    setStatus("Informe mecanico guardado.");
    await refresh();
    return true;
  }

  return {
    assignments,
    assignMechanic,
    mechanics,
    refresh,
    requestInspection,
    requests,
    reports,
    status,
    submitReport,
  };
}
