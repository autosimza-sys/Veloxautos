"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase-client";

const STATUS_LABELS = {
  draft:   { label: "Borrador",  color: "#7a91b8" },
  active:  { label: "Activa",    color: "#10b981" },
  paused:  { label: "Pausada",   color: "#f59e0b" },
  deleted: { label: "Eliminada", color: "#f43f5e" },
};

const LEAD_LABELS = {
  new:             "Nuevo",
  interested:      "Interesado",
  visit_scheduled: "Visita pactada",
  visited:         "Visitó",
  closed:          "Cerrado",
  lost:            "Perdido",
};

const LEAD_COLORS = {
  new:             "#7a91b8",
  interested:      "#0ea5e9",
  visit_scheduled: "#f59e0b",
  visited:         "#a78bfa",
  closed:          "#10b981",
  lost:            "#f43f5e",
};

export default function AdminPage() {
  const [profile, setProfile]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState("vehicles");
  const [vehicles, setVehicles]   = useState([]);
  const [selected, setSelected]   = useState(new Set());
  const [leads, setLeads]         = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [convMessages, setConvMessages] = useState([]);
  const [status, setStatus]       = useState("");
  const [busy, setBusy]           = useState(false);

  useEffect(() => { checkAuth(); }, []);

  /* ── Auth ──────────────────────────────────────────────── */
  async function checkAuth() {
    if (!supabase) { setStatus("Supabase no configurado."); setLoading(false); return; }
    try {
      // Timeout de 10s para no colgarse nunca
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout de conexión. Recargá la página.")), 10000)
      );

      const sessionResult = await Promise.race([
        supabase.auth.getSession(),
        timeout,
      ]);

      const session = sessionResult?.data?.session;
      if (!session) { window.location.href = "/"; return; }

      const { data: prof, error: profError } = await supabase
        .from("profiles").select("*").eq("id", session.user.id).single();

      if (profError) throw new Error("Error perfil: " + profError.message);
      if (!prof || prof.role !== "admin") {
        setStatus("Acceso denegado. Tu cuenta no tiene permisos de admin.");
        setLoading(false);
        return;
      }
      setProfile(prof);
      // Cargar datos en paralelo, sin bloquear si alguno falla
      await Promise.allSettled([loadVehicles(), loadLeads()]);
    } catch (err) {
      setStatus("Error: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  /* ── Vehicles ──────────────────────────────────────────── */
  async function loadVehicles() {
    const { data, error } = await supabase
      .from("vehicles")
      .select(`id, brand, model, version, year, kilometers, price, zone,
               score, status, accepts_trade, accepts_financing, created_at, owner_id,
               profiles ( display_name, role, business_name )`)
      .order("created_at", { ascending: false });
    if (error) { setStatus("Error vehicles: " + error.message); return; }
    setVehicles(data || []);
  }

  async function setVehicleStatus(id, newStatus) {
    setBusy(true);
    const { error } = await supabase.from("vehicles")
      .update({ status: newStatus }).eq("id", id);
    setBusy(false);
    if (error) { setStatus("Error: " + error.message); return; }
    setVehicles(v => v.map(x => x.id === id ? { ...x, status: newStatus } : x));
    setStatus(`✓ Estado actualizado a "${STATUS_LABELS[newStatus]?.label}".`);
  }

  async function deleteVehicle(id) {
    if (!confirm("Esta acción eliminará la publicación y sus medios asociados. ¿Confirmás?")) return;
    setBusy(true);
    // Intentar borrar imágenes de Storage
    const { data: media } = await supabase.from("vehicle_media").select("storage_path").eq("vehicle_id", id);
    if (media?.length) {
      const paths = media.map(m => m.storage_path).filter(p => p && !p.startsWith("http"));
      if (paths.length) await supabase.storage.from("vehicle-media").remove(paths);
    }
    await supabase.from("vehicle_media").delete().eq("vehicle_id", id);
    const { error } = await supabase.from("vehicles").delete().eq("id", id);
    setBusy(false);
    if (error) { setStatus("Error: " + error.message); return; }
    setVehicles(v => v.filter(x => x.id !== id));
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
    setStatus("✓ Publicación eliminada con sus medios.");
  }

  async function deleteSelected() {
    if (!selected.size) return;
    if (!confirm(`Esta acción eliminará ${selected.size} publicaciones seleccionadas y sus medios asociados. ¿Confirmás?`)) return;
    setBusy(true);
    const ids = [...selected];
    for (const id of ids) {
      const { data: media } = await supabase.from("vehicle_media").select("storage_path").eq("vehicle_id", id);
      if (media?.length) {
        const paths = media.map(m => m.storage_path).filter(p => p && !p.startsWith("http"));
        if (paths.length) await supabase.storage.from("vehicle-media").remove(paths);
      }
      await supabase.from("vehicle_media").delete().eq("vehicle_id", id);
      await supabase.from("vehicles").delete().eq("id", id);
    }
    setBusy(false);
    setVehicles(v => v.filter(x => !ids.includes(x.id)));
    setSelected(new Set());
    setStatus(`✓ ${ids.length} publicaciones eliminadas.`);
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleAll() {
    setSelected(selected.size === vehicles.length ? new Set() : new Set(vehicles.map(v => v.id)));
  }

  /* ── CRM / Leads ───────────────────────────────────────── */
  async function loadLeads() {
    // Query simple sin FK hints — evita errores de constraint name
    const { data: convs, error } = await supabase
      .from("conversations")
      .select(`id, lead_status, is_blocked, is_reported, created_at,
               buyer_id, seller_id, vehicle_id,
               vehicles ( brand, model, year, zone ),
               messages ( id, body, sender_id, created_at )`)
      .order("created_at", { ascending: false });

    if (error) {
      setStatus("CRM: " + error.message);
      return;
    }
    if (!convs?.length) { setLeads([]); return; }

    // Obtener perfiles únicos en una sola query
    const profileIds = [...new Set([
      ...convs.map(c => c.buyer_id).filter(Boolean),
      ...convs.map(c => c.seller_id).filter(Boolean),
    ])];
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, display_name, phone")
      .in("id", profileIds);

    const profileMap = {};
    (profileRows || []).forEach(p => { profileMap[p.id] = p; });

    const enriched = convs.map(c => ({
      ...c,
      buyer:  profileMap[c.buyer_id]  || null,
      seller: profileMap[c.seller_id] || null,
    }));

    setLeads(enriched);
  }

  async function setLeadStatus(convId, newStatus) {
    const { error } = await supabase.from("conversations")
      .update({ lead_status: newStatus }).eq("id", convId);
    if (error) { setStatus("Error: " + error.message); return; }
    setLeads(l => l.map(x => x.id === convId ? { ...x, lead_status: newStatus } : x));
    if (activeConv?.id === convId) setActiveConv(c => ({ ...c, lead_status: newStatus }));
  }

  async function openConversation(conv) {
    setActiveConv(conv);
    const { data } = await supabase
      .from("messages")
      .select("*, profiles ( display_name )")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true });
    setConvMessages(data || []);
  }

  /* ── Helpers ───────────────────────────────────────────── */
  const fmt$  = n => n ? `$${Number(n).toLocaleString("es-AR")}` : "—";
  const fmtDt = d => new Date(d).toLocaleDateString("es-AR", { day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit" });
  const score = v => Math.round((v.score || 1) * 10);
  const seller= v => v.profiles?.business_name || v.profiles?.display_name || "—";
  const lastMsg = conv => {
    const msgs = conv.messages || [];
    if (!msgs.length) return "Sin mensajes";
    const last = msgs.sort((a,b) => new Date(b.created_at)-new Date(a.created_at))[0];
    return last.body.length > 60 ? last.body.slice(0, 60) + "…" : last.body;
  };

  /* ── Loading / Access denied ───────────────────────────── */
  if (loading) return (
    <div className="adminLoading">
      <div className="adminBrand"><span className="mark">VX</span><span>VELOX Admin</span></div>
      <p style={{ color: "var(--muted)" }}>Verificando acceso...</p>
    </div>
  );

  if (!profile) return (
    <div className="adminLoading">
      <div className="adminBrand"><span className="mark">VX</span><span>VELOX Admin</span></div>
      <p style={{ color: "var(--danger)", marginTop: 12 }}>{status || "Acceso denegado."}</p>
      <a href="/" style={{ marginTop: 16, color: "var(--blue-2)", fontSize: 14 }}>← Volver al sitio</a>
    </div>
  );

  /* ── Render ────────────────────────────────────────────── */
  return (
    <div className="adminShell">
      {/* Topbar */}
      <header className="adminTopbar">
        <div className="adminBrand"><span className="mark">VX</span><span>VELOX Admin</span></div>
        <div className="adminUser">
          <span className="adminUserName">{profile.display_name}</span>
          <a href="/" className="adminBackLink">← Volver al sitio</a>
        </div>
      </header>

      <main className="adminMain