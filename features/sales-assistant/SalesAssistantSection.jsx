const knownQuestions = [
  "Disponibilidad",
  "Permuta",
  "Financiacion",
  "Ubicacion",
  "Horarios",
  "Kilometraje",
  "Precio",
  "Estado general",
];

export default function SalesAssistantSection({ vehicle }) {
  return (
    <section className="section salesAssistantSection" id="asistente-venta">
      <div>
        <p className="eyebrow">Asistente de venta</p>
        <h2>Responde con datos, no con promesas.</h2>
        <p>
          VELOX usa la informacion de esta publicacion para resolver preguntas repetidas.
          Las consultas abiertas quedan para el vendedor.
        </p>
      </div>
      <div className="assistantContext">
        <div><span>Vehiculo</span><strong>{vehicle.brand} {vehicle.model}</strong></div>
        <div><span>Zona</span><strong>{vehicle.zone}</strong></div>
        <div><span>Permuta</span><strong>{vehicle.acceptsTrade ? "Acepta" : "No acepta"}</strong></div>
        <div><span>Financiacion</span><strong>{vehicle.acceptsFinancing ? "Disponible" : "No disponible"}</strong></div>
      </div>
      <div className="assistantKnowledge">
        {knownQuestions.map((question) => <span key={question}>{question}</span>)}
      </div>
    </section>
  );
}

