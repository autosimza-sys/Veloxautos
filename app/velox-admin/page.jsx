"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase-client";

export default function AdminPage() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [status, setStatus] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { window.location.href = "/"; return; }

    const { data: prof } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();

    if (!prof || prof.role !== "admin") { window.location.href = "/"; return; }

    setProfile(prof);
    await loadVehicles();
    setLoading(false);
  }

  async function loadVehicles() {
    setStatus("");
    const { data, error } = await supabase
      .from("vehicles")
      .select(`
        id, brand, model, version, year, kilometers, price,
        zone, score, accepts_trade, accepts_financing,
        created_at, owner_id,
        profiles ( display_name, role, business_name )
      `)
      .order("created_at", { ascending: false });

    if (error) { setStatus("Error: " + error.message); return; }
    setVehicles(data || []);
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === vehicles.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(vehicles.map(v => v.id)));
    }
  }

  async function deleteVehicle(id) {
    if (!confirm("¿Eliminar esta publicación?")) return;
    setDeleting(true);
    await supabase.from("vehicle_media").delete().eq("vehicle_id", id);
    const { error } = await supabase.from("vehicles").delete().eq("id", id);
    setDeleting(false);
    if (error) { setStatus("Error: " + error.message); return; }
    setVehicles(v => v.filter(x => x.id !== id));
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
    setStatus("✓ Publicación eliminada.");
  }

  async function deleteSelected() {
    if (!confirm(`¿Eliminar ${selected.size} publicaciones?`)) return;
    setDeleting(true);
    const ids = [...selected];
    for (const id of ids) {
      await supabase.from("vehicle_media").delete().eq("vehicle_id", id);
      await supabase.from("vehicles").delete().eq("id", id);
    }
    setDeleting(false);
    setVehicles(v => v.filter(x => !ids.includes(x.id)));
    setSelected(new Set());
    setStatus(`✓ ${ids.length} publicaciones eliminadas.`);
  }

  if (loading) {
    return (
      <div className="adminLoading">
        <div className="adminBrand">
          <span className="mark">VX</span>
          <span>VELOX Admin</span>
        </div>
        <p>Verificando acceso...</p>
      </div>
    );
  }

  const sellerName = (v) =>
    v.profiles?.business_name || v.profiles?.display_name || "—";

  const formatMoney = (n) =>
    n ? `$${Number(n).toLocaleString("es-AR")}` : "—";

  const formatDate = (d) =>
    new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });

  const scoreNum = (v) => Math.round((v.score || 1) * 10);

  return (
    <div className="adminShell">
      {/* ── Topbar ───────────────────────────────────────────── */}
      <header className="adminTopbar">
        <div className="adminBrand">
          <span className="mark">VX</span>
          <span>VELOX Admin</span>
        </div>
        <div className="adminUser">
          <span className="adminUserName">{profile.display_name}</span>
          <a href="/" className="adminBackLink">← Volver al sitio</a>
        </div>
      </header>

      <main className="adminMain">

        {/* ── Stats ────────────────────────────────────────────── */}
        <div className="adminStats">
          <div className="adminStatCard">
            <span>Publicaciones</span>
            <strong>{vehicles.length}</strong>
          </div>
          <div className="adminStatCard">
            <span>Seleccionadas</span>
            <strong>{selected.size}</strong>
          </div>
          <div className="adminStatCard">
            <span>CRM</span>
            <strong style={{ color: "var(--muted)", fontSize: "13px" }}>Próximamente</strong>
          </div>
          <div className="adminStatCard">
            <span>IA Bot</span>
            <strong style={{ color: "var(--muted)", fontSize: "13px" }}>Próximamente</strong>
          </div>
        </div>

        {/* ── Status message ───────────────────────────────────── */}
        {status && (
          <div className="adminStatusBar">
            {status}
            <button onClick={() => setStatus("")} className="adminStatusClose">✕</button>
          </div>
        )}

        {/* ── Bulk action toolbar ──────────────────────────────── */}
        {selected.size > 0 && (
          <div className="adminBulkBar">
            <span>{selected.size} publicación{selected.size !== 1 ? "es" : ""} seleccionada{selected.size !== 1 ? "s" : ""}</span>
            <div className="adminBulkActions">
              <button
                className="adminBtnDanger"
                onClick={deleteSelected}
                disabled={deleting}
              >
                {deleting ? "Eliminando..." : `Eliminar ${selected.size} seleccionadas`}
              </button>
              <button
                className="adminBtnSecondary"
                onClick={() => setSelected(new Set())}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* ── Table ────────────────────────────────────────────── */}
        {vehicles.length === 0 ? (
          <div className="adminEmptyState">
            <p>No hay publicaciones en la base de datos.</p>
            <span>Las publicaciones que hagan los usuarios aparecerán aquí.</span>
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
                      title="Seleccionar todo"
                    />
                  </th>
                  <th>Vehículo</th>
                  <th>Zona</th>
                  <th>Vendedor</th>
                  <th>Precio</th>
                  <th>Score</th>
                  <th>Fecha</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => {
                  const score = scoreNum(v);
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
                        <span className="adminVehicleName">
                          {v.brand} {v.model}
                        </span>
                        <span className="adminVehicleSub">
                          {v.version} · {v.year} · {v.kilometers?.toLocaleString("es-AR")} km
                        </span>
                      </td>
                      <td className="adminTdMuted">{v.zone || "—"}</td>
                      <td className="adminTdMuted">{sellerName(v)}</td>
                      <td className="adminTdPrice">{formatMoney(v.price)}</td>
                      <td>
                        <span
                          className="adminScoreBadge"
                          style={{
                            background: score >= 70
                              ? "rgba(16,185,129,0.12)"
                              : score >= 40
                              ? "rgba(245,158,11,0.12)"
                              : "rgba(244,63,94,0.12)",
                            color: score >= 70
                              ? "var(--green)"
                              : score >= 40
                              ? "var(--gold)"
                              : "var(--danger)",
                          }}
                        >
                          {score}%
                        </span>
                      </td>
                      <td className="adminTdMuted">{formatDate(v.created_at)}</td>
                      <td>
                        <button
                          className="adminBtnDangerSm"
                          onClick={() => deleteVehicle(v.id)}
                          disabled={deleting}
                          title="Eliminar publicación"
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Footer ───────────────────────────────────────────── */}
        <footer className="adminFooter">
          VELOX Admin · acceso restringido · {new Date().getFullYear()}
        </footer>
      </main>
    </div>
  );
}
