import Info from "../../components/Info";
import { formatMoney } from "../../lib/velox-data";
import { qualityLabel } from "../publication/publication-quality";

export default function VehicleDetail({
  canChat,
  canSeePrice,
  isSeller,
  onOpenChat,
  vehicle,
}) {
  const quality = vehicle.quality ?? Math.round((vehicle.score || 1) * 10);
  const recommendations = vehicle.recommendations || [];

  return (
    <section className="detailLayout">
      <div className="gallery">
        <img src={vehicle.image} alt={`${vehicle.brand} ${vehicle.model}`} />
      </div>
      <div className="detail">
        <p className="eyebrow">{vehicle.sellerType} | {vehicle.seller}</p>
        <h2>{vehicle.brand} {vehicle.model}</h2>
        <p>{vehicle.description}</p>
        <div className="specs">
          <Info label="Version" value={vehicle.version} />
          <Info label="Ano" value={vehicle.year} />
          <Info
            label="Km"
            value={vehicle.km == null ? "Visible al registrarse" : `${vehicle.km.toLocaleString("es-AR")} km`}
          />
          <Info label="Zona" value={vehicle.zone} />
          <Info
            label="Precio"
            value={canSeePrice && vehicle.price ? formatMoney(vehicle.price) : "Bloqueado"}
          />
          <Info label="Calidad" value={`${quality}% | ${qualityLabel(quality)}`} />
        </div>
        {recommendations.length > 0 && (
          <div className="detailRecommendations">
            <strong>Como mejorar esta publicacion</strong>
            {recommendations.slice(0, 3).map((recommendation) => (
              <p key={recommendation}>{recommendation}</p>
            ))}
          </div>
        )}
        <div className="actions">
          <button className="primary" disabled={!canChat} onClick={onOpenChat}>
            {canChat ? "Abrir chat interno" : "Registrate para chatear"}
          </button>
          {isSeller && <button className="secondary">Editar publicacion</button>}
        </div>
      </div>
    </section>
  );
}
