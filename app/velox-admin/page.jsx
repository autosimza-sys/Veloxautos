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

      <main className="adminMain">
        {/* Stats */}
        <div className="adminStats">
          <div className="adminStatCard">
            <span>Publicaciones</span>
            <strong>{vehicles.length}</strong>
          </div>
          <div className="adminStatCard">
            <span>Activas</span>
            <strong style={{ color: "var(--green)" }}>{vehicles.filter(v => v.status === "active").length}</strong>
          </div>
          <div className="adminStatCard">
            <span>Leads / Consultas</span>
            <strong>{leads.length}</strong>
          </div>
          <div className="adminStatCard">
            <span>Nuevos leads</span>
            <strong style={{ color: "var(--cyan)" }}>{leads.filter(l => l.lead_status === "new").length}</strong>
          </div>
        </div>

        {/* Status bar */}
        {status && (
          <div className="adminStatusBar">
            {status}
            <button className="adminStatusClose" onClick={() => setStatus("")}>✕</button>
          </div>
        )}

        {/* Tabs */}
        <div className="adminTabs">
          <button className={`adminTab${tab === "vehicles" ? " active" : ""}`} onClick={() => setTab("vehicles")}>
            Publicaciones ({vehicles.length})
          </button>
          <button className={`adminTab${tab === "crm" ? " active" : ""}`} onClick={() => setTab("crm")}>
            CRM / Leads ({leads.length})
          </button>
        </div>

        {/* ── TAB: Publicaciones ─────────────────────────── */}
        {tab === "vehicles" && (
          <>
            {selected.size > 0 && (
              <div className="adminBulkBar">
                <span>{selected.size} seleccionada{selected.size !== 1 ? "s" : ""}</span>
                <div className="adminBulkActions">
                  <button className="adminBtnDanger" onClick={deleteSelected} disabled={busy}>
                    {busy ? "Eliminando..." : `Eliminar ${selected.size} seleccionadas`}
                  </button>
                  <button className="adminBtnSecondary" onClick={() => setSelected(new Set())}>Cancelar</button>
                </div>
              </div>
            )}

            {vehicles.length === 0 ? (
              <div className="adminEmptyState">
                <p>No hay publicaciones.</p>
                <span>Cuando los usuarios publiquen, aparecerán aquí.</span>
              </div>
            ) : (
              <div className="adminTableWrap">
                <table className="adminTable">
                  <thead>
                    <tr>
                      <th><input type="checkbox" checked={selected.size === vehicles.length && vehicles.length > 0} onChange={toggleAll} /></th>
                      <th>Vehículo</th>
                      <th>Zona</th>
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
                      const sc = score(v);
                      const st = STATUS_LABELS[v.status] || STATUS_LABELS.draft;
                      return (
                        <tr key={v.id} className={selected.has(v.id) ? "adminRowSelected" : ""}>
                          <td><input type="checkbox" checked={selected.has(v.id)} onChange={() => toggleSelect(v.id)} /></td>
                          <td>
                            <span className="adminVehicleName">{v.brand} {v.model}</span>
                            <span className="adminVehicleSub">{v.version} · {v.year} · {v.kilometers?.toLocaleString("es-AR")} km</span>
                          </td>
                          <td className="adminTdMuted">{v.zone || "—"}</td>
                          <td className="adminTdMuted">{seller(v)}</td>
                          <td className="adminTdPrice">{fmt$(v.price)}</td>
                          <td>
                            <span className="adminScoreBadge" style={{
                              background: sc >= 70 ? "rgba(16,185,129,.12)" : sc >= 40 ? "rgba(245,158,11,.12)" : "rgba(244,63,94,.12)",
                              color: sc >= 70 ? "var(--green)" : sc >= 40 ? "var(--gold)" : "var(--danger)",
                            }}>{sc}%</span>
                          </td>
                          <td>
                            <span className="adminStatusBadge" style={{ background: st.color + "22", color: st.color }}>
                              {st.label}
                            </span>
                          </td>
                          <td className="adminTdMuted">{fmtDt(v.created_at)}</td>
                          <td>
                            <div className="adminActionRow">
                              {v.status !== "active"  && <button className="adminBtnAction approve" onClick={() => setVehicleStatus(v.id, "active")}  disabled={busy}>Aprobar</button>}
                              {v.status !== "paused"  && <button className="adminBtnAction pause"   onClick={() => setVehicleStatus(v.id, "paused")}  disabled={busy}>Pausar</button>}
                              {v.status !== "deleted" && <button className="adminBtnAction reject"  onClick={() => setVehicleStatus(v.id, "deleted")} disabled={busy}>Rechazar</button>}
                              <button className="adminBtnDangerSm" onClick={() => deleteVehicle(v.id)} disabled={busy}>Borrar</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── TAB: CRM ───────────────────────────────────── */}
        {tab === "crm" && (
          <div className="crmLayout">
            {/* Lead list */}
            <div className="crmList">
              {leads.length === 0 ? (
                <div className="adminEmptyState">
                  <p>Sin consultas todavía.</p>
                  <span>Los leads aparecerán cuando los compradores abran el chat.</span>
                </div>
              ) : leads.map(conv => (
                <button
                  key={conv.id}
                  className={`crmLeadCard${activeConv?.id === conv.id ? " active" : ""}`}
                  onClick={() => openConversation(conv)}
                >
                  <div className="crmLeadTop">
                    <span className="crmLeadVehicle">
                      {conv.vehicles?.brand} {conv.vehicles?.model} {conv.vehicles?.year}
                    </span>
                    <span className="crmLeadBadge" style={{ background: (LEAD_COLORS[conv.lead_status] || "#7a91b8") + "22", color: LEAD_COLORS[conv.lead_status] || "#7a91b8" }}>
                      {LEAD_LABELS[conv.lead_status] || "Nuevo"}
                    </span>
                  </div>
                  <div className="crmLeadBuyer">{conv.buyer?.display_name || "Comprador"}</div>
                  <div className="crmLeadMsg">{lastMsg(conv)}</div>
                  <div className="crmLeadDate">{fmtDt(conv.created_at)}</div>
                </button>
              ))}
            </div>

            {/* Conversation detail */}
            <div className="crmDetail">
              {!activeConv ? (
                <div className="crmDetailEmpty">
                  <p>Seleccioná un lead para ver la conversación</p>
                </div>
              ) : (
                <>
                  <div className="crmDetailHeader">
                    <div>
                      <strong>{activeConv.vehicles?.brand} {activeConv.vehicles?.model} {activeConv.vehicles?.year}</strong>
                      <span>{activeConv.vehicles?.zone}</span>
                    </div>
                    <div className="crmDetailMeta">
                      <span>Comprador: <b>{activeConv.buyer?.display_name}</b></span>
                      {activeConv.buyer?.phone && <span>Tel: {activeConv.buyer.phone}</span>}
                      <span>Vendedor: <b>{activeConv.seller?.display_name}</b></span>
                    </div>
                    <div className="crmStatusSelect">
                      <label>Estado del lead</label>
                      <select
                        value={activeConv.lead_status || "new"}
                        onChange={e => setLeadStatus(activeConv.id, e.target.value)}
                      >
                        {Object.entries(LEAD_LABELS).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="crmMessages">
                    {convMessages.length === 0 ? (
                      <p className="crmNoMessages">Sin mensajes todavía.</p>
                    ) : convMessages.map(msg => (
                      <div key={msg.id} className={`crmMsg${msg.sender_id === activeConv.buyer_id ? " buyer" : " seller"}`}>
                        <span className="crmMsgSender">{msg.profiles?.display_name || (msg.sender_id === activeConv.buyer_id ? "Comprador" : "Vendedor")}</span>
                        <p>{msg.body}</p>
                        <span className="crmMsgTime">{fmtDt(msg.created_at)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <footer className="adminFooter">
          VELOX Admin · acceso restringido · {new Date().getFullYear()}
        </footer>
      </main>
    </div>
  );
}
