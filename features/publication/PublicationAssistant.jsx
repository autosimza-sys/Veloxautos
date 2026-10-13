"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { checklistOptions } from "../../lib/velox-data";
import {
  PHOTO_GUIDE,
  PHOTO_MIME_TYPES,
  VIDEO_MIME_TYPES,
  UNREVIEWED,
  validatePublicationMedia,
  validatePublicationStep,
  buildDescription,
  createPublicationForm,
  getPublicationQuality,
  getPublicationRecommendations,
} from "./publication-quality";

const steps = [
  "Vehiculo",
  "Kilometros",
  "Precio",
  "Fotos",
  "Autorevision",
  "Recomendaciones",
  "Publicar",
];

export default function PublicationAssistant({
  canPublish,
  creditCost = 1,
  publicationQuote,
  freeRefill = false,
  onNeedAuth,
  onPublish,
  profile,
  publishAccessMessage,
  publishStatus,
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(createPublicationForm);
  const [photos, setPhotos] = useState([]);
  const [videoFile, setVideoFile] = useState(null);
  const [videoName, setVideoName] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [publicationError, setPublicationError] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const publishingRef = useRef(false);
  const previewUrls = useRef(new Map());
  const suggestedDescription = useRef(null);

  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      urls.forEach(url => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const recommendations = useMemo(
    () => getPublicationRecommendations({ form, photos, videoFile }),
    [form, photos, videoFile],
  );
  const quality = useMemo(
    () => getPublicationQuality({ form, photos, videoFile }),
    [form, photos, videoFile],
  );

  function next() {
    if (publishingRef.current || !validatePublicationStep(step, form, photos)) return;
    if (step === 4 && (!form.description.trim() || form.description === suggestedDescription.current)) {
      const description = buildDescription(form);
      suggestedDescription.current = description;
      setForm({ ...form, description });
    }
    setStep(Math.min(steps.length - 1, step + 1));
  }

  function back() {
    if (!publishingRef.current) setStep(Math.max(0, step - 1));
  }

  function releasePreview(kind) {
    const previous = previewUrls.current.get(kind);
    if (previous) URL.revokeObjectURL(previous);
    previewUrls.current.delete(kind);
  }

  function addPhoto(kind, file) {
    if (!file || publishingRef.current) return;
    const error = validatePublicationMedia(file, "photo");
    if (error) {
      setMediaError(error);
      return;
    }
    setMediaError("");
    releasePreview(kind);
    const preview = URL.createObjectURL(file);
    previewUrls.current.set(kind, preview);
    setPhotos((current) => [
      ...current.filter((photo) => photo.kind !== kind),
      { kind, file, preview },
    ]);
  }

  function removePhoto(kind) {
    if (publishingRef.current) return;
    releasePreview(kind);
    setPhotos((current) => current.filter((photo) => photo.kind !== kind));
    setMediaError("");
  }

  function addVideo(file) {
    if (!file || publishingRef.current) return;
    const error = validatePublicationMedia(file, "video");
    if (error) {
      setMediaError(error);
      return;
    }
    setMediaError("");
    setVideoFile(file);
    setVideoName(file.name);
  }

  function removeVideo() {
    if (publishingRef.current) return;
    setMediaError("");
    setVideoFile(null);
    setVideoName("");
  }

  async function publish() {
    if (publishingRef.current || !canPublish || !validatePublicationStep(6, form, photos)) return;
    if (videoFile && validatePublicationMedia(videoFile, "video")) return;
    publishingRef.current = true;
    setIsPublishing(true);
    setPublicationError("");
    try {
      const published = await onPublish({
        form,
        photoFiles: photos.map(({ kind, file }) => ({ kind, file })),
        videoFile,
        publicationQuote,
      });
      if (!published) return;
      previewUrls.current.forEach(url => URL.revokeObjectURL(url));
      previewUrls.current.clear();
      suggestedDescription.current = null;
      setForm(createPublicationForm());
      setPhotos([]);
      setVideoFile(null);
      setVideoName("");
      setMediaError("");
      setStep(0);
    } catch {
      setPublicationError("No pudimos publicar. Tus datos se conservaron; intenta de nuevo.");
    } finally {
      publishingRef.current = false;
      setIsPublishing(false);
    }
  }

  const canContinue = validatePublicationStep(step, form, photos);

  return (
    <section className="assistantWorkspace" id="asistente">
      {!profile && (
        <div className="assistantAuthBanner">
          <span>Para publicar tu vehículo necesitás una cuenta gratuita.</span>
          <button className="primary" type="button" onClick={onNeedAuth}>
            Crear cuenta o ingresar
          </button>
        </div>
      )}
      {profile && !canPublish && (
        <div className="assistantAuthBanner" style={{ borderColor: "rgba(216,173,84,0.4)", background: "rgba(216,173,84,0.08)" }}>
          <span>{publishAccessMessage || <>Tu cuenta tipo <b>{profile.role}</b> no tiene permiso de publicación. Contactá a soporte para cambiar tu rol a Particular, Revendedor o Agencia.</>}</span>
        </div>
      )}
      <aside className="assistantProgress" aria-label="Progreso de publicacion">
        <p className="eyebrow">Asistente de publicacion</p>
        <strong>{quality}% completa</strong>
        <div className="qualityTrack"><span style={{ width: `${quality}%` }} /></div>
        <ol>
          {steps.map((label, index) => (
            <li className={index === step ? "active" : index < step ? "done" : ""} key={label}>
              <span>{index + 1}</span>
              {label}
            </li>
          ))}
        </ol>
      </aside>

      <div className="assistantConversation">
        <div className="assistantMessage">
          <span className="assistantAvatar">VX</span>
          <div>
            <small>Asistente VELOX</small>
            <p>{assistantMessage(step, photos.length)}</p>
          </div>
        </div>

        <fieldset className="assistantAnswer" disabled={isPublishing} style={{ border: 0, margin: 0, minWidth: 0 }}>
          {step === 0 && <VehicleStep form={form} setForm={setForm} />}
          {step === 1 && (
            <SingleNumberStep
              label="Cuantos kilometros tiene?"
              suffix="km"
              value={form.kilometers}
              onChange={(value) => setForm({ ...form, kilometers: value })}
            />
          )}
          {step === 2 && <PriceStep form={form} setForm={setForm} />}
          {step === 3 && (
            <PhotosStep
              addPhoto={addPhoto}
              addVideo={addVideo}
              mediaError={mediaError}
              photos={photos}
              removePhoto={removePhoto}
              removeVideo={removeVideo}
              videoName={videoName}
            />
          )}
          {step === 4 && <ChecklistStep form={form} setForm={setForm} />}
          {step === 5 && (
            <RecommendationsStep
              form={form}
              quality={quality}
              recommendations={recommendations}
              setForm={setForm}
            />
          )}
          {step === 6 && (
            <PublishStep
              creditCost={creditCost}
              freeRefill={freeRefill}
              canPublish={canPublish}
              form={form}
              photos={photos}
              profile={profile}
              publishAccessMessage={publishAccessMessage}
              publishStatus={publishStatus}
              quality={quality}
            />
          )}
        </fieldset>
        {publicationError && <p className="warning" role="alert">{publicationError}</p>}

        <div className="assistantActions">
          <button className="secondary" type="button" disabled={step === 0 || isPublishing} onClick={back}>
            Volver
          </button>
          {step < steps.length - 1 ? (
            <button className="primary" type="button" disabled={!canContinue || isPublishing} onClick={next}>
              Continuar
            </button>
          ) : (
            <button className="primary" type="button" disabled={!canPublish || !canContinue || isPublishing} onClick={publish}>
              {isPublishing ? "Publicando..." : "Confirmar y publicar"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function VehicleStep({ form, setForm }) {
  return (
    <div className="assistantFieldGrid">
      <Field label="Marca" value={form.brand} onChange={(value) => setForm({ ...form, brand: value })} />
      <Field label="Modelo" value={form.model} onChange={(value) => setForm({ ...form, model: value })} />
      <Field label="Version" value={form.version} onChange={(value) => setForm({ ...form, version: value })} />
      <Field label="Ano" type="number" value={form.year} onChange={(value) => setForm({ ...form, year: value })} />
    </div>
  );
}

function SingleNumberStep({ label, onChange, suffix, value }) {
  return (
    <label className="largeInput">
      <span>{label}</span>
      <div><input autoFocus min="0" type="number" value={value} onChange={(event) => onChange(event.target.value)} /><b>{suffix}</b></div>
    </label>
  );
}

function PriceStep({ form, setForm }) {
  return (
    <div className="assistantStack">
      <label className="largeInput">
        <span>Que precio queres publicar?</span>
        <div><b>$</b><input autoFocus min="0" type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></div>
      </label>
      <Field label="Ubicacion" value={form.zone} onChange={(value) => setForm({ ...form, zone: value })} />
      <p className="assistantHint">Mas adelante VELOX comparara tu valor con referencias minimas, promedio y maximas administradas.</p>
    </div>
  );
}

function PhotosStep({
  addPhoto,
  addVideo,
  mediaError,
  photos,
  removePhoto,
  removeVideo,
  videoName,
}) {
  return (
    <div>
      <div className="photoGuideGrid">
        {PHOTO_GUIDE.map((guide) => {
          const photo = photos.find((item) => item.kind === guide.id);
          return (
            <article className={photo ? "photoGuide complete" : "photoGuide"} key={guide.id}>
              {photo ? (
                <img src={photo.preview} alt={guide.label} />
              ) : (
                <div className="photoPlaceholder">{guide.label.slice(0, 2).toUpperCase()}</div>
              )}
              <div>
                <strong>{guide.label}</strong>
                <small>{guide.tip}</small>
                <label className="fileCommand">
                  {photo ? "Cambiar" : "Subir foto"}
                  <input hidden type="file" accept={PHOTO_MIME_TYPES.join(",")} aria-label={`Foto ${guide.label}`} onChange={(event) => {
                    addPhoto(guide.id, event.target.files?.[0]);
                    event.target.value = "";
                  }} />
                </label>
                {photo && <button className="textDanger" type="button" onClick={() => removePhoto(guide.id)}>Eliminar</button>}
              </div>
            </article>
          );
        })}
      </div>
      <div className="videoUpload">
        <div><strong>Video corto</strong><small>Opcional. Recorre exterior e interior en menos de un minuto.</small></div>
        <label className="secondary fileCommand">
          {videoName || "Elegir video"}
          <input hidden type="file" accept={VIDEO_MIME_TYPES.join(",")} aria-label="Video del vehiculo" onChange={(event) => {
            addVideo(event.target.files?.[0]);
            event.target.value = "";
          }} />
        </label>
        {videoName && <button className="textDanger" type="button" onClick={removeVideo}>Eliminar video</button>}
      </div>
      {mediaError && <p className="warning">{mediaError}</p>}
      <p className="assistantHint">{photos.length}/8 fotos cargadas. Necesitas al menos 4.</p>
      <p className="assistantHint">Obligatorias: frontal, lateral derecho, lateral izquierdo e interior.</p>
    </div>
  );
}

function ChecklistStep({ form, setForm }) {
  return (
    <div>
      <p className="ownerDeclaration">Informacion declarada por el propietario. No es una certificacion profesional.</p>
      <p className="assistantHint">Elegi una respuesta para cada item. Si no conoces el estado, selecciona Sin revisar / No lo se.</p>
      <div className="assistantFieldGrid checklistFields">
        {Object.entries(checklistOptions).map(([key, options]) => (
          <label key={key}>
            <span>{humanize(key)}</span>
            <select
              value={form.checklist[key] || ""}
              onChange={(event) => setForm({
                ...form,
                checklist: { ...form.checklist, [key]: event.target.value },
              })}
            >
              <option value="" disabled>Selecciona una opcion</option>
              <option value={UNREVIEWED}>Sin revisar / No lo se</option>
              {options.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}

function RecommendationsStep({ form, quality, recommendations, setForm }) {
  return (
    <div className="recommendationLayout">
      <div className="qualitySummary">
        <span>Calidad de publicacion</span>
        <strong>{quality}%</strong>
      </div>
      <div className="recommendationList">
        {recommendations.length ? recommendations.map((item) => (
          <p className={`recommendation ${item.level}`} key={item.id}>{item.text}</p>
        )) : <p className="recommendation success">Tu publicacion esta lista para generar confianza.</p>}
      </div>
      <label>
        <span>Descripcion sugerida</span>
        <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
      </label>
      <div className="assistantFieldGrid">
        <Field label="Patente parcial" value={form.partialPlate} onChange={(value) => setForm({ ...form, partialPlate: value })} />
        <Field label="Lugar para verlo" value={form.viewLocation} onChange={(value) => setForm({ ...form, viewLocation: value })} />
        <Field label="Horarios disponibles" value={form.availableHours} onChange={(value) => setForm({ ...form, availableHours: value })} />
      </div>
      <div className="assistantToggles">
        <label><input type="checkbox" checked={form.acceptsTrade} onChange={(event) => setForm({ ...form, acceptsTrade: event.target.checked })} /> Acepta permuta</label>
        <label><input type="checkbox" checked={form.acceptsFinancing} onChange={(event) => setForm({ ...form, acceptsFinancing: event.target.checked })} /> Acepta financiacion</label>
      </div>
    </div>
  );
}

function PublishStep({ canPublish, creditCost, freeRefill, form, photos, profile, publishAccessMessage, publishStatus, quality }) {
  return (
    <div className="publishReview">
      <div>
        <span>Vehiculo</span>
        <strong>{form.brand} {form.model} {form.version}</strong>
      </div>
      <div><span>Ano y km</span><strong>{form.year} | {Number(form.kilometers).toLocaleString("es-AR")} km</strong></div>
      <div><span>Precio</span><strong>${Number(form.price).toLocaleString("es-AR")}</strong></div>
      <div><span>Fotos</span><strong>{photos.length}/8</strong></div>
      <div><span>Calidad</span><strong>{quality}%</strong></div>
      <div><span>Consumo al publicar</span><strong>{creditCost} créditos</strong></div>
      {freeRefill && <p>La recarga es gratuita mientras esté vigente la promoción. No se cobra dinero ni se genera deuda.</p>}
      {!profile && <p className="warning">Crea una cuenta antes de confirmar la publicacion.</p>}
      {profile && !canPublish && <p className="warning">{publishAccessMessage || "Tu cuenta no tiene creditos o permiso de publicacion."}</p>}
      {publishStatus && <p className="authStatus">{publishStatus}</p>}
    </div>
  );
}

function Field({ label, onChange, type = "text", value }) {
  return <label><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function assistantMessage(step, photoCount) {
  const messages = [
    "Empecemos por identificar bien la unidad. Contame marca, modelo, version y ano.",
    "Perfecto. Ahora necesito el kilometraje actual.",
    "Definamos el precio y la zona donde se encuentra.",
    `Las fotos venden antes que el texto. Ya cargaste ${photoCount}; te marco exactamente cuales faltan.`,
    "Ahora revisemos juntos el estado. Esto es informacion declarada por vos, no una certificacion.",
    "Prepare recomendaciones concretas para mejorar confianza y visibilidad.",
    "Revisa el resumen. Cuando confirmes, la publicacion quedara activa.",
  ];
  return messages[step];
}

function humanize(value) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}
