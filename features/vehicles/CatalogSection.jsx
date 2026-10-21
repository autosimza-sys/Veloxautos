"use client";

import { useMemo, useState } from "react";
import { formatMoney } from "../../lib/velox-data";
import { qualityLabel } from "../publication/publication-quality";

const PRICE_RANGES = [
  { label: "Hasta $15M",    max: 15_000_000 },
  { label: "$15M — $30M",   min: 15_000_000, max: 30_000_000 },
  { label: "$30M — $50M",   min: 30_000_000, max: 50_000_000 },
  { label: "Más de $50M",   min: 50_000_000 },
];

const KM_RANGES = [
  { label: "Hasta 30.000",   max: 30_000 },
  { label: "30.000 — 80.000", min: 30_000, max: 80_000 },
  { label: "Más de 80.000",  min: 80_000 },
];

export default function CatalogSection({
  onFiltersChange, brands: serverBrands, years: serverYears, hasNextPage, hasPreviousPage, onNextPage, onPreviousPage,
  canSeePrice,
  catalogStatus,
  isLoading,
  onRetry,
  onSelect,
  selectedVehicle,
  vehicles,
}) {
  const [search, setSearch] = useState("");
  const [filterBrand, setFilterBrand] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [filterPrice, setFilterPrice] = useState("");
  const [filterKm, setFilterKm] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Unique sorted brands
  const brands = useMemo(() => {
    const set = new Set(vehicles.map((v) => v.brand).filter(Boolean));
    return serverBrands || Array.from(set).sort();
  }, [vehicles, serverBrands]);

  // Unique sorted years
  const years = useMemo(() => {
    const set = new Set(vehicles.map((v) => v.year).filter(Boolean));
    return serverYears || Array.from(set).sort((a, b) => b - a);
  }, [vehicles, serverYears]);

  // Filter logic
  const filtered = useMemo(() => {
    if (onFiltersChange) return vehicles;
    const q = search.toLowerCase().trim();

    return vehicles.filter((v) => {
      // Text search
      if (q) {
        const haystack = `${v.brand} ${v.model} ${v.version} ${v.zone} ${v.year}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      // Brand
      if (filterBrand && v.brand !== filterBrand) return false;

      // Year
      if (filterYear && String(v.year) !== filterYear) return false;

      // Price range
      if (canSeePrice && filterPrice !== "") {
        if (v.price == null) return false;
        const range = PRICE_RANGES[Number(filterPrice)];
        if (range) {
          if (range.min != null && v.price < range.min) return false;
          if (range.max != null && v.price > range.max) return false;
        }
      }

      // Km range
      if (canSeePrice && filterKm !== "") {
        if (v.km == null) return false;
        const range = KM_RANGES[Number(filterKm)];
        if (range) {
          if (range.min != null && v.km < range.min) return false;
          if (range.max != null && v.km > range.max) return false;
        }
      }

      return true;
    });
  }, [vehicles, search, filterBrand, filterYear, filterPrice, filterKm, canSeePrice, onFiltersChange]);

  const hasFilters = search || filterBrand || filterYear || (canSeePrice && (filterPrice !== "" || filterKm !== ""));

  function updateFilter(key, value) {
    const values = { search, filterBrand, filterYear, filterPrice, filterKm, [key]: value };
    ({ search: setSearch, filterBrand: setFilterBrand, filterYear: setFilterYear,
      filterPrice: setFilterPrice, filterKm: setFilterKm })[key](value);
    const next = {};
    if (values.search.trim()) next.search = values.search.trim();
    if (values.filterBrand) next.brand = values.filterBrand;
    if (values.filterYear) next.year = Number(values.filterYear);
    for (const [field, range] of canSeePrice ? [
      ["Price", PRICE_RANGES[values.filterPrice]], ["Km", KM_RANGES[values.filterKm]],
    ] : []) {
      if (range?.min != null) next[`min${field}`] = range.min;
      if (range?.max != null) next[`max${field}`] = range.max;
    }
    onFiltersChange?.(next);
  }

  function clearFilters() {
    onFiltersChange?.({});
    setSearch("");
    setFilterBrand("");
    setFilterYear("");
    setFilterPrice("");
    setFilterKm("");
  }

  return (
    <section className="section" id="catalogo">
      <div className="catalogHeader">
        <div>
          <p className="eyebrow">Catálogo</p>
          <h2>Publicaciones de calidad</h2>
        </div>
        <button
          className={`filterToggle${filtersOpen ? " active" : ""}`}
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
        >
          <FilterIcon />
          {hasFilters ? "Filtros activos" : "Filtrar"}
        </button>
      </div>

      {/* Search bar */}
      <div className="catalogSearch">
        <span className="searchIcon">
          <SearchIcon />
        </span>
        <input
          className="catalogSearchInput"
          placeholder="Buscar por marca, modelo, zona..."
          aria-label="Buscar vehículos"
          value={search}
          onChange={(e) => updateFilter("search", e.target.value)}
        />
        {search && (
          <button className="searchClear" type="button" onClick={() => updateFilter("search", "")}>✕</button>
        )}
      </div>

      {/* Filter panel */}
      {filtersOpen && (
        <div className="filterPanel">
          <div className="filterGrid">
            <label className="filterLabel">
              Marca
              <select
                value={filterBrand}
                onChange={(e) => updateFilter("filterBrand", e.target.value)}
              >
                <option value="">Todas</option>
                {brands.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>

            <label className="filterLabel">
              Año
              <select
                value={filterYear}
                onChange={(e) => updateFilter("filterYear", e.target.value)}
              >
                <option value="">Todos</option>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>

            <label className="filterLabel">
              Precio
              <select
                disabled={!canSeePrice}
                value={filterPrice}
                onChange={(e) => updateFilter("filterPrice", e.target.value)}
              >
                <option value="">{canSeePrice ? "Cualquier precio" : "Ingresá para filtrar por precio"}</option>
                {PRICE_RANGES.map((r, i) => (
                  <option key={i} value={i}>{r.label}</option>
                ))}
              </select>
            </label>

            <label className="filterLabel">
              Kilómetros
              <select
                disabled={!canSeePrice}
                value={filterKm}
                onChange={(e) => updateFilter("filterKm", e.target.value)}
              >
                <option value="">{canSeePrice ? "Sin límite" : "Ingresá para filtrar por km"}</option>
                {KM_RANGES.map((r, i) => (
                  <option key={i} value={i}>{r.label}</option>
                ))}
              </select>
            </label>
          </div>

          {hasFilters && (
            <button className="clearFilters" type="button" onClick={clearFilters}>
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* Results summary */}
      {hasFilters && (
        <p className="filterResults">
          {filtered.length === 0
            ? "Ningún vehículo coincide con los filtros."
            : `${filtered.length} vehículo${filtered.length === 1 ? "" : "s"} en esta página`}
        </p>
      )}

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="catalogGrid">
          {filtered.map((vehicle) => {
            const quality = vehicle.quality ?? Math.round((vehicle.score || 1) * 10);
            return (
              <button
                className={vehicle.id === selectedVehicle?.id ? "vehicleCard active" : "vehicleCard"}
                key={vehicle.id}
                onClick={() => onSelect(vehicle)}
              >
                <img src={vehicle.image} alt={`${vehicle.brand} ${vehicle.model}`} />
                <div>
                  <span className="score">{quality}% | {qualityLabel(quality)}</span>
                  <h3>{vehicle.brand} {vehicle.model}</h3>
                  <p>{vehicle.version} · {vehicle.year} · {vehicle.zone}</p>
                  <div className="cardMeta">
                    {canSeePrice && vehicle.km != null && (
                      <span className="cardTag">{vehicle.km.toLocaleString("es-AR")} km</span>
                    )}
                    {vehicle.acceptsTrade && (
                      <span className="cardTag permuta">Permuta ✓</span>
                    )}
                  </div>
                  <b>{canSeePrice && vehicle.price ? formatMoney(vehicle.price) : "Registrate para ver el precio"}</b>
                </div>
              </button>
            );
          })}
        </div>
      ) : isLoading ? (
        <p role="status">Cargando catálogo...</p>
      ) : catalogStatus ? (
        <div className="emptyState" role="status">
          <p>{catalogStatus}</p>
          <button className="secondary" type="button" onClick={onRetry}>Reintentar</button>
        </div>
      ) : vehicles.length === 0 && !hasFilters ? (
        <div className="emptyState"><p>Todavía no hay vehículos publicados.</p></div>
      ) : (
        <div className="emptyState">
          <p>No encontramos vehículos con esos filtros.</p>
          <button className="secondary" type="button" onClick={clearFilters}>Ver todos</button>
        </div>
      )}

      {onFiltersChange && <nav aria-label="Páginas del catálogo">
        <button type="button" disabled={isLoading || !hasPreviousPage} onClick={onPreviousPage}>Anterior</button>
        <button type="button" disabled={isLoading || !hasNextPage} onClick={onNextPage}>Siguiente</button>
      </nav>}
    </section>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="11" y1="18" x2="13" y2="18" />
    </svg>
  );
}
