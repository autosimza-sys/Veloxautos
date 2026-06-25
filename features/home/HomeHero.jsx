export default function HomeHero({ onPublishClick }) {
  return (
    <>
      <section className="salesHero">
        <div className="salesHeroOverlay" />
        <div className="salesHeroContent">
          <p className="eyebrow">Tu especialista digital en venta de vehiculos</p>
          <h1>Vende tu vehiculo con ayuda de IA</h1>
          <p className="salesHeroLead">
            Publica mejor. Responde menos.<br />
            Coordina visitas. Genera mas confianza.
          </p>
          <div className="actions">
            <button className="primary heroPrimary" type="button" onClick={onPublishClick}>
              Vender mi vehiculo
            </button>
            <a className="secondary heroSecondary" href="#catalogo">Buscar vehiculos</a>
          </div>
          <div className="heroProof">
            <span>Publicacion guiada</span>
            <span>Respuestas automaticas</span>
            <span>Agenda interna</span>
          </div>
        </div>
      </section>

      <section className="assistantPromise" id="como-funciona">
        <div className="promiseIntro">
          <p className="eyebrow">Velox trabaja con vos</p>
          <h2>De la primera foto a la visita confirmada.</h2>
        </div>
        <div className="promiseSteps">
          <article>
            <strong>01</strong>
            <h3>Te ayuda a publicar</h3>
            <p>Ordena los datos, detecta fotos faltantes y mejora la presentacion.</p>
          </article>
          <article>
            <strong>02</strong>
            <h3>Atiende las consultas</h3>
            <p>Responde preguntas frecuentes con las condiciones que vos definis.</p>
          </article>
          <article>
            <strong>03</strong>
            <h3>Coordina encuentros</h3>
            <p>Propone horarios y organiza visitas sin sacar la conversacion de Velox.</p>
          </article>
        </div>
      </section>
    </>
  );
}
