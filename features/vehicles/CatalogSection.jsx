import { formatMoney } from "../../lib/velox-data";
import { qualityLabel } from "../publication/publication-quality";

export default function CatalogSection({
  canSeePrice,
  catalogStatus,
  onSelect,
  selectedVehicle,
  vehicles,
}) {
  return (
    <section className="section" id="catalogo">
      <div className="sectionTitle">
        <p className="eyebrow">Catalogo</p>
        <h2>Publicaciones de calidad</h2>
      </div>

      <div className="catalogGrid">
        {vehicles.map((vehicle) => {
          const quality = vehicle.quality ?? Math.round((vehicle.score || 1) * 10);
          return (
            <button
              className={vehicle.id === selectedVehicle.id ? "vehicleCard active" : "vehicleCard"}
              key={vehicle.id}
              onClick={() => onSelect(vehicle)}
            >
              <img src={vehicle.image} alt={`${vehicle.brand} ${vehicle.model}`} />
              <div>
                <span className="score">{quality}% | {qualityLabel(quality)}</span>
                <h3>{vehicle.brand} {vehicle.model}</h3>
                <p>{vehicle.version} | {vehicle.year} | {vehicle.zone}</p>
                <b>{canSeePrice && vehicle.price ? formatMoney(vehicle.price) : "Precio visible al registrarse"}</b>
              </div>
            </button>
          );
        })}
      </div>

      {catalogStatus && <p className="authStatus">{catalogStatus}</p>}
    </section>
  );
}
