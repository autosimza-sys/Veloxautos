"use client";

import { useEffect, useState } from "react";
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
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const quality = vehicle.quality ?? Math.round((vehicle.score || 1) * 10);
  const recommendations = vehicle.recommendations || [];

  const photos = (vehicle.media || [])
    .filter((m) => m.media_type === "photo")
    .sort((a, b) => a.sort_order - b.sort_order);
  const videos = (vehicle.media || []).filter((m) => m.media_type === "video");
  const allMedia = [...photos, ...videos];

  const displayMedia = allMedia.length > 0
    ? allMedia
    : [{ media_type: "photo", storage_path: vehicle.image, sort_order: 0 }];

  const mainSrc = displayMedia[0]?.storage_path || vehicle.image;

  function openLightbox(index) { setLightboxIndex(index); }
  function closeLightbox() { setLightboxIndex(null); }
  function goPrev(e) { e.stopPropagation(); setLightboxIndex((i) => (i - 1 + displayMedia.length) % displayMedia.length); }
  function goNext(e) { e.stopPropagation(); setLightboxIndex((i) => (i + 1) % displayMedia.length); }

  // Keyboard navigation
  useEffect(() => {
    if (lightboxIndex === null) return;
    function onKey(e) {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") setLightboxIndex((i) => (i - 1 + displayMedia.length) % displayMedia.length);
      if (e.key === "ArrowRight") setLightboxIndex((i) => (i + 1) % displayMedia.length);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, displayMedia.length]);

  return (
    <>
      <section className="detailLayout">
        <div className="gallery">
          <div className="galleryMain" onClick={() => openLightbox(0)}>
            <img src={mainSrc} alt={`${vehicle.brand} ${vehicle.model}`} />
            {displayMedia.length > 1 && (
              <span className="galleryBadge">
                📷 {displayMedia.length} fotos — ver todas
              </span>
            )}
          </div>
          {displayMedia.length > 1 && (
            <div className="galleryThumbs">
              {displayMedia.slice(0, 5).map((item, index) => (
                <button
                  key={index}
                  className={`galleryThumb${index === 0 ? " active" : ""}`}
                  type="button"
                  onClick={() => openLightbox(index)}
                >
                  {item.media_type === "video" ? (
                    <div className="thumbVideoIcon">▶</div>
                  ) : (
                    <img src={item.storage_path} alt={`foto ${index + 1}`} />
                  )}
                  {index === 4 && displayMedia.length > 5 && (
                    <div className="thumbMoreOverlay">+{displayMedia.length - 5}</div>
                  )}
                </button>
              ))}
            </div>
          )}
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

      {lightboxIndex !== null && (
        <div className="galleryLightbox" onClick={closeLightbox}>
          <button className="lightboxClose" type="button" onClick={closeLightbox}>✕</button>

          {displayMedia.length > 1 && (
            <>
              <button className="lightboxNav lightboxPrev" type="button" onClick={goPrev}>‹</button>
              <button className="lightboxNav lightboxNext" type="button" onClick={goNext}>›</button>
            </>
          )}

          <div className="lightboxInner" onClick={(e) => e.stopPropagation()}>
            {displayMedia[lightboxIndex]?.media_type === "video" ? (
              <video
                key={lightboxIndex}
                src={displayMedia[lightboxIndex].storage_path}
                controls
                autoPlay
                className="lightboxMedia"
              />
            ) : (
              <img
                key={lightboxIndex}
                src={displayMedia[lightboxIndex]?.storage_path}
                alt={`foto ${lightboxIndex + 1}`}
                className="lightboxMedia"
              />
            )}
            <div className="lightboxFooter">
              <span className="lightboxCounter">{lightboxIndex + 1} / {displayMedia.length}</span>
              <div className="lightboxDots">
                {displayMedia.map((_, i) => (
                  <button
                    key={i}
                    className={`lightboxDot${i === lightboxIndex ? " active" : ""}`}
                    type="button"
                    onClick={() => setLightboxIndex(i)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
