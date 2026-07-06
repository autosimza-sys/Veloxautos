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
    if (!confirm(`Esta acción eliminará ${selected.size} publicaciones seleccionadas. ¿Confirmás?`)) return;
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
    const { data: convs, error } = await supabase
      .from("conversations")
      .select(`id, lead_status, is_blocked, is_reported, created_at,
               buyer_id, seller_id, vehicle_id,
               vehicles ( brand, model, year, zone ),
               messages ( id, body, sender_id, created_at )`)
      .order("created_at", { ascending: false });

    if (error) { setStatus("CRM: " + error.message); return; }
    if (!convs?.length) { setLeads([]); return; }

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

  /* ── Estadísticas ──────────────────────────────────────── */
  const totalVehicles  = vehicles.length;
  const activeVehicles = vehicles.filter(v => v.status === "active").length;
  const totalLeads     = leads.length;
  const closedLeads    = leads.filter(l => l.lead_status === "closed").length;

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

      <main className="adminMain">

        {/* Stats */}
        <div className="adminStats">
          <div className="adminStatCard">
            <span>Total publicaciones</span>
            <strong>{totalVehicles}</strong>
          </div>
          <div className="adminStatCard">
            <span>Publicaciones activas</span>
            <strong style={{ color: "var(--green)" }}>{activeVehicles}</strong>
          </div>
          <div className="adminStatCard">
            <span>Conversaciones CRM</span>
            <strong>{totalLeads}</strong>
          </div>
          <div className="adminStatCard">
            <span>Leads cerrados</span>
            <strong style={{ color: "var(--gold)" }}>{closedLeads}</strong>
          </div>
        </div>

        {/* Status bar */}
        {status && (
          <div className="adminStatusBar">
            <span>{status}</span>
            <button className="adminStatusClose" onClick={() => setStatus("")}>✕</button>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
          {[["vehicles", "Publicaciones"], ["crm", "CRM / Leads"]].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: "10px 20px",
                border: 0,
                borderBottom: tab === key ? "2px solid var(--blue-2)" : "2px solid transparent",
                background: "transparent",
                color: tab === key ? "white" : "var(--muted)",
                fontWeight: 700,
                fontSize: 14,
                transition: "color 150ms",
                marginBottom: -1,
              }}
            >
              {label}
              {key === "vehicles" && totalVehicles > 0 && (
                <span style={{ marginLeft: 8, padding: "2px 7px", background: "var(--surface2)", borderRadius: 999, fontSize: 12, color: "var(--muted)" }}>
                  {totalVehicles}
                </span>
              )}
              {key === "crm" && totalLeads > 0 && (
                <span style={{ marginLeft: 8, padding: "2px 7px", background: "var(--surface2)", borderRadius: 999, fontSize: 12, color: "var(--muted)" }}>
                  {totalLeads}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab: Vehículos ── */}
        {tab === "vehicles" && (
          <div style={{ display: "grid", gap: 16 }}>

            {/* Bulk action bar */}
            {selected.size > 0 && (
              <div className="adminBulkBar">
                <span>{selected.size} publicación{selected.size !== 1 ? "es" : ""} seleccionada{selected.size !== 1 ? "s" : ""}</span>
                <div className="adminBulkActions">
                  <button className="adminBtnDanger" disabled={busy} onClick={deleteSelected}>
                    🗑 Eliminar seleccionadas
                  </button>
                  <button className="adminBtnSecondary" onClick={() => setSelected(new Set())}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Table */}
            {vehicles.length === 0 ? (
              <div className="adminEmptyState">
                <p>Sin publicaciones</p>
                <span>Cuando los vendedores publiquen vehículos, aparecerán acá.</span>
              </div>
            ) : (
              <div className="adminTableWrap">
                <table className="adminTable">
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          checked={selected.size === vehicles.length && vehicles.length > 0}
                          onChange={toggleAll}
                        />
                      </th>
                      <th>Vehículo</th>
                      <th>Vendedor</th>
                      <th>Precio</th>
                      <th>Score</th>
                      <th>Estado</th>
                      <th>Fecha</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicles.map(v => {
                      const st = STATUS_LABELS[v.status] || STATUS_LABELS.draft;
                      const sc = score(v);
                      const scoreColor = sc >= 70 ? "var(--green)" : sc >= 45 ? "var(--gold)" : "var(--danger)";
                      return (
                        <tr key={v.id} className={selected.has(v.id) ? "adminRowSelected" : ""}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selected.has(v.id)}
                              onChange={() => toggleSelect(v.id)}
                            />
                          </td>
                          <td>
                            <span className="adminVehicleName">{v.brand} {v.model}</span>
                            <span className="adminVehicleSub">{v.version} · {v.year} · {Number(v.kilometers || 0).toLocaleString("es-AR")} km</span>
                          </td>
                          <td className="adminTdMuted">{seller(v)}</td>
                          <td className="adminTdPrice">{fmt$(v.price)}</td>
                          <td>
                            <span
                              className="adminScoreBadge"
                              style={{ background: `${scoreColor}22`, color: scoreColor }}
                            >
                              {sc}%
                            </span>
                          </td>
                          <td>
                            <span style={{ color: st.color, fontWeight: 700, fontSize: 13 }}>
                              ● {st.label}
                            </span>
                          </td>
                          <td className="adminTdMuted">{fmtDt(v.created_at)}</td>
                          <td>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {v.status !== "active" && (
                                <button
                                  className="adminBtnSecondary"
                                  disabled={busy}
                                  style={{ fontSize: 12, padding: "5px 10px", color: "var(--green)", borderColor: "rgba(16,185,129,0.3)" }}
                                  onClick={() => setVehicleStatus(v.id, "active")}
                                >
                                  Activar
                                </button>
                              )}
                              {v.status !== "paused" && (
                                <button
                                  className="adminBtnSecondary"
                                  disabled={busy}
                                  style={{ fontSize: 12, padding: "5px 10px" }}
                                  onClick={() => setVehicleStatus(v.id, "paused")}
                                >
                                  Pausar
                                </button>
                              )}
                              <button
                                className="adminBtnDangerSm"
                                disabled={busy}
                                onClick={() => deleteVehicle(v.id)}
                              >
                                Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: CRM ── */}
        {tab === "crm" && (
          <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 20, minHeight: 500 }}>

            {/* Lista de leads */}
            <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
              {leads.length === 0 ? (
                <div className="adminEmptyState">
                  <p>Sin conversaciones</p>
                  <span>Las consultas de compradores aparecerán acá.</span>
                </div>
              ) : leads.map(conv => {
                const leadColor = LEAD_COLORS[conv.lead_status] || LEAD_COLORS.new;
                const isActive = activeConv?.id === conv.id;
                return (
                  <button
                    key={conv.id}
                    onClick={() => openConversation(conv)}
                    style={{
                      display: "grid",
                      gap: 4,
                      padding: "12px 14px",
                      border: `1px solid ${isActive ? "var(--blue-2)" : "var(--border)"}`,
                      borderRadius: "var(--radius)",
                      background: isActive ? "rgba(37,99,235,0.08)" : "var(--surface)",
                      textAlign: "left",
                      transition: "border-color 150ms, background 150ms",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: "white" }}>
                        {conv.vehicles?.brand} {conv.vehicles?.model}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: leadColor, background: `${leadColor}22`, padding: "2px 8px", borderRadius: 999 }}>
                        {LEAD_LABELS[conv.lead_status] || "Nuevo"}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      {conv.buyer?.display_name || "Comprador"} → {conv.seller?.display_name || "Vendedor"}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--subtle)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {lastMsg(conv)}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--subtle)" }}>{fmtDt(conv.created_at)}</span>
                    {conv.is_blocked && <span style={{ fontSize: 11, color: "var(--danger)" }}>● Bloqueada</span>}
                    {conv.is_reported && <span style={{ fontSize: 11, color: "var(--gold)" }}>⚑ Denunciada</span>}
                  </button>
                );
              })}
            </div>

            {/* Detalle de conversación */}
            {activeConv ? (
              <div style={{ display: "grid", alignContent: "start", gap: 16, padding: "20px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <div>
                    <h3 style={{ fontSize: 17, fontWeight: 800 }}>
                      {activeConv.vehicles?.brand} {activeConv.vehicles?.model} ({activeConv.vehicles?.year})
                    </h3>
                    <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                      Comprador: <strong style={{ color: "var(--text)" }}>{activeConv.buyer?.display_name || "—"}</strong>
                      {activeConv.buyer?.phone && ` · ${activeConv.buyer.phone}`}
                    </p>
                    <p style={{ color: "var(--muted)", fontSize: 13 }}>
                      Vendedor: <strong style={{ color: "var(--text)" }}>{activeConv.seller?.display_name || "—"}</strong>
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>Estado lead:</span>
                    <select
                      value={activeConv.lead_status || "new"}
                      onChange={e => setLeadStatus(activeConv.id, e.target.value)}
                      style={{
                        padding: "6px 10px",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--surface2)",
                        color: "var(--text)",
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      {Object.entries(LEAD_LABELS).map(([val, lbl]) => (
                        <option key={val} value={val}>{lbl}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Mensajes */}
                <div style={{ display: "grid", gap: 8, maxHeight: 360, overflowY: "auto", padding: "4px 0" }}>
                  {convMessages.length === 0 && (
                    <p style={{ color: "var(--muted)", fontSize: 14, textAlign: "center", padding: "20px 0" }}>Sin mensajes en esta conversación.</p>
                  )}
                  {convMessages.map(msg => (
                    <div key={msg.id} style={{
                      padding: "10px 14px",
                      borderRadius: "var(--radius)",
                      background: msg.sender_id === activeConv.buyer_id ? "var(--surface2)" : "rgba(37,99,235,0.10)",
                      borderLeft: msg.is_automated ? "3px solid var(--gold)" : "none",
                    }}>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
                        {msg.profiles?.display_name || "Usuario"}
                        {msg.is_automated && <span style={{ marginLeft: 6, color: "var(--gold)" }}>● Asistente</span>}
                        <span style={{ float: "right" }}>{fmtDt(msg.created_at)}</span>
                      </div>
                      <p style={{ fontSize: 14 }}>{msg.body}</p>
                    </div>
                  ))}
                </div>

                {activeConv.is_blocked && (
                  <p style={{ color: "var(--danger)", fontSize: 13, fontWeight: 700 }}>⛔ Conversación bloqueada</p>
                )}
                {activeConv.is_reported && (
                  <p style={{ color: "var(--gold)", fontSize: 13, fontWeight: 700 }}>⚑ Conversación denunciada — revisión pendiente</p>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", color: "var(--subtle)", fontSize: 14 }}>
                Seleccioná una conversación para ver el detalle
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <footer className="adminFooter">
          VELOX Admin · {profile.display_name} · {new Date().getFullYear()}
        </footer>

      </main>
    </div>
  );
}
