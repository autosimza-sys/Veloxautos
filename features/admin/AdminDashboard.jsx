"use client";

import Link from "next/link";
import LaunchPromotionPanel from './LaunchPromotionPanel';
import { useCallback, useEffect, useRef, useState } from "react";

const STATUS_LABELS = {
  draft:   { label: "Borrador",  color: "#7a91b8" },
  active:  { label: "Activa",    color: "#10b981" },
  paused:  { label: "Pausada",   color: "#f59e0b" },
  deleted: { label: "Retirada", color: "#f43f5e" },
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

export default function AdminDashboard({ client, router }) {
  const [profile, setProfile]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState("vehicles");
  const [vehicles, setVehicles]   = useState([]);
  const [selected, setSelected]   = useState(new Set());
  const [leads, setLeads]         = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsLoaded, setLeadsLoaded] = useState(false);
  const [leadsError, setLeadsError] = useState("");
  const [leadBusy, setLeadBusy] = useState(false);
  const leadSaveRef = useRef(false);
  const authEpoch = useRef(0);
  const leadsRequest = useRef(0);
  const invalidateAuth = useCallback(() => ++authEpoch.current, []);
  const [status, setStatus]       = useState("");
  const [busy, setBusy]           = useState(false);
  const vehicleSaveRef = useRef(false);

  /* ── Vehicles ──────────────────────────────────────────── */
  const loadVehicles = useCallback(async (epoch = authEpoch.current) => {
    const { data, error } = await client
      .from("vehicles")
      .select(`id, brand, model, version, year, kilometers, price, zone,
               score, status, accepts_trade, accepts_financing, created_at, owner_id,
               profiles ( display_name, role, business_name )`)
      .order("created_at", { ascending: false });
    if (epoch !== authEpoch.current) return;
    if (error) { setStatus("Error vehicles: " + error.message); return; }
    setVehicles(data || []);
  }, [client]);

  async function requestVehicleStatus(id, newStatus) {
    const { data, error } = await client.rpc("set_vehicle_listing_status", {
      target_vehicle: id, next_status: newStatus,
    });
    if (error) throw error;
    const updated = Array.isArray(data) ? data[0] : data;
    if (updated?.id !== id || updated?.status !== newStatus) {
      throw new Error("No se confirmó el cambio de publicación. Recargá para verificarlo.");
    }
    return updated;
  }

  async function setVehicleStatus(id, newStatus) {
    if (vehicleSaveRef.current) return;
    vehicleSaveRef.current = true;
    setBusy(true);
    const epoch = authEpoch.current;
    try {
      const updated = await requestVehicleStatus(id, newStatus);
      if (epoch !== authEpoch.current) return;
      setVehicles(current => current.map(vehicle => vehicle.id === id ? { ...vehicle, ...updated } : vehicle));
      setSelected(current => { const next = new Set(current); next.delete(id); return next; });
      setStatus(`✓ Estado actualizado a "${STATUS_LABELS[newStatus]?.label}".`);
    } catch (error) {
      if (epoch === authEpoch.current) setStatus("Error: " + (error?.message || "Revisá tu conexión."));
    } finally {
      if (epoch === authEpoch.current) { vehicleSaveRef.current = false; setBusy(false); }
    }
  }

  async function retireVehicle(id) {
    if (vehicleSaveRef.current || !confirm("¿Retirar esta publicación del catálogo? Podrás restaurarla y conservará sus medios y conversaciones.")) return;
    await setVehicleStatus(id, "deleted");
  }

  async function retireSelected() {
    if (vehicleSaveRef.current || !selected.size) return;
    if (!confirm(`¿Retirar ${selected.size} publicaciones seleccionadas del catálogo? Podrás restaurarlas; conservarán sus medios y conversaciones.`)) return;
    vehicleSaveRef.current = true;
    setBusy(true);
    const epoch = authEpoch.current;
    const confirmed = new Map();
    const failures = [];
    for (const id of selected) {
      if (epoch !== authEpoch.current) return;
      try {
        confirmed.set(id, await requestVehicleStatus(id, "deleted"));
      } catch (error) {
        const vehicle = vehicles.find(item => item.id === id);
        failures.push(`${vehicle?.brand || "Publicación"} ${vehicle?.model || ""}: ${error?.message || "Sin confirmación"}`);
      }
    }
    if (epoch !== authEpoch.current) return;
    setVehicles(current => current.map(vehicle => confirmed.has(vehicle.id) ? { ...vehicle, ...confirmed.get(vehicle.id) } : vehicle));
    setSelected(current => new Set([...current].filter(id => !confirmed.has(id))));
    setStatus(`${confirmed.size} retirada${confirmed.size === 1 ? "" : "s"}. ${failures.length} sin retirar.${failures.length ? " " + failures.join("; ") : " Podés restaurarlas cuando corresponda."}`);
    vehicleSaveRef.current = false;
    setBusy(false);
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleAll() {
    const available = vehicles.filter(vehicle => !["draft", "deleted"].includes(vehicle.status));
    setSelected(selected.size === available.length ? new Set() : new Set(available.map(vehicle => vehicle.id)));
  }

  /* ── CRM / Leads ───────────────────────────────────────── */
  const loadLeads = useCallback(async (epoch = authEpoch.current) => {
    const request = ++leadsRequest.current;
    setLeadsLoading(true);
    setLeadsError("");
    try {
      const { data, error } = await client.rpc("get_admin_leads");
      if (epoch !== authEpoch.current || request !== leadsRequest.current) return;
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error("Respuesta CRM inválida.");
      setLeads(data);
      setLeadsLoaded(true);
      setActiveConv(current => data.find(lead => lead.id === current?.id) || null);
    } catch (error) {
      if (epoch !== authEpoch.current || request !== leadsRequest.current) return;
      setLeads([]);
      setActiveConv(null);
      setLeadsLoaded(false);
      setLeadsError("No se pudo cargar el CRM: " + (error?.message || "Revisá tu conexión."));
    } finally {
      if (epoch === authEpoch.current && request === leadsRequest.current) setLeadsLoading(false);
    }
  }, [client]);

  async function setLeadStatus(convId, newStatus) {
    if (leadSaveRef.current || !Object.hasOwn(LEAD_LABELS, newStatus)) return;
    leadSaveRef.current = true;
    setLeadBusy(true);
    const epoch = authEpoch.current;
    try {
      const { data, error } = await client.rpc("set_lead_status", {
        target_conversation: convId, new_status: newStatus,
      });
      if (epoch !== authEpoch.current) return;
      if (error) throw error;
      const updated = data?.[0];
      if (updated?.id !== convId || updated?.lead_status !== newStatus || !updated?.lead_updated_at) {
        throw new Error("No se confirmó el cambio. Recargá el CRM para verificarlo.");
      }
      setLeads(current => current.map(lead => lead.id === convId ? { ...lead, ...updated } : lead));
      setActiveConv(current => current?.id === convId ? { ...current, ...updated } : current);
      setStatus(`✓ Lead actualizado a "${LEAD_LABELS[newStatus]}".`);
    } catch (error) {
      if (epoch === authEpoch.current) setStatus("Error CRM: " + (error?.message || "Revisá tu conexión."));
    } finally {
      if (epoch === authEpoch.current) {
        leadSaveRef.current = false;
        setLeadBusy(false);
      }
    }
  }

  useEffect(() => {
    let active = true;
    let timeoutId;
    let authTimer;
    function resetPrivateState() {
      setProfile(null);
      setStatus("");
      setBusy(false);
      vehicleSaveRef.current = false;
      setVehicles([]);
      setLeads([]);
      setActiveConv(null);
      setSelected(new Set());
      setLeadsLoaded(false);
      setLeadsLoading(false);
      setLeadsError("");
      setLeadBusy(false);
      leadSaveRef.current = false;
    }
    async function checkAuth(sessionOverride, epoch) {
      if (!client) {
        await Promise.resolve();
        if (active) { setStatus("Supabase no configurado."); setLoading(false); }
        return;
      }
      try {
        const sessionResult = sessionOverride === undefined ? await Promise.race([
          client.auth.getSession(),
          new Promise((_, reject) => {
            timeoutId = window.setTimeout(() => reject(new Error("Timeout de conexión. Recargá la página.")), 10000);
          }),
        ]) : { data: { session: sessionOverride } };
        window.clearTimeout(timeoutId);
        if (!active || epoch !== authEpoch.current) return;
        const session = sessionResult?.data?.session;
        if (!session) { router.replace("/"); return; }
        const { data: prof, error } = await client.from("profiles")
          .select("id, display_name, role, is_blocked").eq("id", session.user.id).single();
        if (!active || epoch !== authEpoch.current) return;
        if (error) throw new Error("Error perfil: " + error.message);
        if (!prof || prof.role !== "admin" || prof.is_blocked) {
          setStatus("Acceso denegado. Tu cuenta no tiene permisos de admin.");
          return;
        }
        setProfile(prof);
        setLoading(false);
        await Promise.all([loadVehicles(epoch), loadLeads(epoch)]);
      } catch (error) {
        if (active && epoch === authEpoch.current) setStatus("Error: " + error.message);
      } finally {
        window.clearTimeout(timeoutId);
        if (active && epoch === authEpoch.current) setLoading(false);
      }
    }
    const epoch = invalidateAuth();
    checkAuth(undefined, epoch);
    const subscription = client?.auth.onAuthStateChange?.((event, session) => {
      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
      const nextEpoch = invalidateAuth();
      window.clearTimeout(authTimer);
      window.clearTimeout(timeoutId);
      resetPrivateState();
      setLoading(true);
      // Never await Supabase profile/RPC calls inside the auth callback lock.
      authTimer = window.setTimeout(() => checkAuth(session, nextEpoch), 0);
    })?.data?.subscription;
    return () => {
      active = false;
      invalidateAuth();
      window.clearTimeout(timeoutId);
      window.clearTimeout(authTimer);
      subscription?.unsubscribe();
    };
  }, [client, loadVehicles, loadLeads, router, invalidateAuth]);

  /* ── Helpers ───────────────────────────────────────────── */
  const fmt$  = n => n ? `$${Number(n).toLocaleString("es-AR")}` : "—";
  const fmtDt = d => new Date(d).toLocaleDateString("es-AR", { day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit" });
  const score = v => Math.round((v.score || 1) * 10);
  const seller= v => v.profiles?.business_name || v.profiles?.display_name || "—";
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
      <Link href="/" style={{ marginTop: 16, color: "var(--blue-2)", fontSize: 14 }}>← Volver al sitio</Link>
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
          <Link href="/" className="adminBackLink">← Volver al sitio</Link>
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
            <strong>{leadsLoaded ? totalLeads : "—"}</strong>
          </div>
          <div className="adminStatCard">
            <span>Leads cerrados</span>
            <strong style={{ color: "var(--gold)" }}>{leadsLoaded ? closedLeads : "—"}</strong>
          </div>
        </div>

        {/* Status bar */}
        {status && (
          <div className="adminStatusBar">
            <span>{status}</span>
            <button className="adminStatusClose" aria-label="Cerrar aviso" onClick={() => setStatus("")}>✕</button>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, borderBottom: "1px solid var(--border)", paddingBottom: 0 }}>
          {[["vehicles", "Publicaciones"], ["crm", "CRM / Leads"], ["promotion", "Promoción"]].map(([key, label]) => (
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

        {tab === 'promotion' && <LaunchPromotionPanel client={client} />}
        {/* ── Tab: Vehículos ── */}
        {tab === "vehicles" && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>

            {/* Bulk action bar */}
            {selected.size > 0 && (
              <div className="adminBulkBar">
                <span>{selected.size} {selected.size === 1 ? "publicación seleccionada" : "publicaciones seleccionadas"}</span>
                <div className="adminBulkActions">
                  <button className="adminBtnDanger" disabled={busy} onClick={retireSelected}>
                    Retirar seleccionadas
                  </button>
                  <button className="adminBtnSecondary" disabled={busy} onClick={() => setSelected(new Set())}>
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
                          aria-label="Seleccionar todas las publicaciones"
                          disabled={busy}
                          checked={selected.size > 0 && selected.size === vehicles.filter(vehicle => !["draft", "deleted"].includes(vehicle.status)).length}
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
                              aria-label={`Seleccionar ${v.brand} ${v.model}`}
                              disabled={busy || ["draft", "deleted"].includes(v.status)}
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
                              {!["active", "draft"].includes(v.status) && (
                                <button
                                  className="adminBtnSecondary"
                                  disabled={busy}
                                  style={{ fontSize: 12, padding: "5px 10px", color: "var(--green)", borderColor: "rgba(16,185,129,0.3)" }}
                                  onClick={() => setVehicleStatus(v.id, "active")}
                                >
                                  {v.status === "deleted" ? "Restaurar" : "Activar"}
                                </button>
                              )}
                              {!["paused", "draft", "deleted"].includes(v.status) && (
                                <button
                                  className="adminBtnSecondary"
                                  disabled={busy}
                                  style={{ fontSize: 12, padding: "5px 10px" }}
                                  onClick={() => setVehicleStatus(v.id, "paused")}
                                >
                                  Pausar
                                </button>
                              )}
                              {!["deleted", "draft"].includes(v.status) && (
                                <button className="adminBtnDangerSm" disabled={busy} onClick={() => retireVehicle(v.id)}>
                                  Retirar
                                </button>
                              )}
                              {v.status === "draft" && <span className="adminTdMuted">Requiere publicación con crédito</span>}
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 20, minHeight: 500 }}>

            {/* Lista de leads */}
            <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
              <button className="adminBtnSecondary" disabled={leadsLoading || leadBusy} onClick={() => loadLeads()}>
                {leadsError ? "Reintentar CRM" : "Actualizar CRM"}
              </button>
              {leadsLoading ? <p role="status">Cargando leads...</p> : leadsError ? (
                <p role="alert" style={{ color: "var(--danger)" }}>{leadsError}</p>
              ) : leads.length === 0 ? (
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
                    onClick={() => setActiveConv(conv)}
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
                        {conv.vehicle_brand} {conv.vehicle_model}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 800, color: leadColor, background: `${leadColor}22`, padding: "2px 8px", borderRadius: 999 }}>
                        {LEAD_LABELS[conv.lead_status] || "Nuevo"}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      {conv.buyer_name || "Comprador"} → {conv.seller_name || "Vendedor"}
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
                      {activeConv.vehicle_brand} {activeConv.vehicle_model} ({activeConv.vehicle_year})
                    </h3>
                    <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 4 }}>
                      Comprador: <strong style={{ color: "var(--text)" }}>{activeConv.buyer_name || "—"}</strong>
                    </p>
                    <p style={{ color: "var(--muted)", fontSize: 13 }}>
                      Vendedor: <strong style={{ color: "var(--text)" }}>{activeConv.seller_name || "—"}</strong>
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>Estado lead:</span>
                    <select
                      aria-label="Estado lead"
                      disabled={leadBusy || leadsLoading}
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

                <div style={{ display: "grid", gap: 8, color: "var(--muted)", fontSize: 13 }}>
                  <p>Zona: {activeConv.vehicle_zone || "—"} · Publicación: {STATUS_LABELS[activeConv.vehicle_status]?.label || "—"}</p>
                  <p>Consulta creada: {fmtDt(activeConv.created_at)}</p>
                  <p>Estado actualizado: {fmtDt(activeConv.lead_updated_at)}</p>
                  <p>Mensajes privados: disponibles solo para los participantes de la conversación.</p>
                </div>

                {activeConv.is_blocked && (
                  <p style={{ color: "var(--danger)", fontSize: 13, fontWeight: 700 }}>⛔ Conversación bloqueada</p>
                )}
                {activeConv.is_reported && (
                  <p style={{ color: "var(--gold)", fontSize: 13, fontWeight: 700 }}>⚑ Conversación denunciada. Revisión de moderación pendiente; este CRM solo muestra metadatos.</p>
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
