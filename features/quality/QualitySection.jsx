export default function QualitySection({ vehicle }) {
  const quality = vehicle.quality ?? Math.round((vehicle.score || 1) * 10);
  const recommendations = vehicle.recommendations || [];

  return (
    <section className="section twoCols" id="calidad">
      <div className="panel">
        <p className="eyebrow">Checklist declarado</p>
        <h2>Informacion declarada por el propietario</h2>
        <p className="warning">No representa una verificacion profesional de VELOX.</p>
        <div className="checklist">
          {Object.entries(vehicle.checklist).map(([key, value]) => (
            <span key={key}>
              <b>{key}</b>
              {value}
            </span>
          ))}
        </div>
      </div>
      <div className="panel">
        <p className="eyebrow">Calidad de publicacion</p>
        <h2>{quality}% completa</h2>
        <div className="qualityTrack"><span style={{ width: `${quality}%` }} /></div>
        <div className="qualityImprovements">
          {recommendations.length ? recommendations.map((item) => (
            <p key={item}>{item}</p>
          )) : <p>La publicacion tiene la informacion necesaria para generar confianza.</p>}
        </div>
      </div>
    </section>
  );
}
