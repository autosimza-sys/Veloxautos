"use client";

import { useMemo, useState } from "react";
import { checklistOptions } from "../../lib/velox-data";
import {
  PHOTO_GUIDE,
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
  onPublish,
  profile,
  publishStatus,
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(createPublicationForm);
  const [photos, setPhotos] = useState([]);
  const [videoFile, setVideoFile] = useState(null);
  const [videoName, setVideoName] = useState("");
  const [mediaError, setMediaError] = useState("");

  const recommendations = useMemo(
    () => getPublicationRecommendations({ form, photos, videoFile }),
    [form, photos, videoFile],
  );
  const quality = useMemo(
    () => getPublicationQuality({ form, photos, videoFile }),
    [form, photos, videoFile],
  );

  function next() {
    if (step === 4 && !form.description) {
      setForm((current) => ({ ...current, description: buildDescription(current) }));
    }
    setStep((current) => Math.min(steps.length - 1, current + 1));
  }

  function back() {
    setStep((current) => Math.max(0, current - 1));
  }

  function addPhoto(kind, file) {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      setMediaError("Cada foto puede pesar como maximo 3 MB.");
      return;
    }
    setMediaError("");
    const previous = photos.find((photo) => photo.kind === kind);
    if (previous) URL.revokeObjectURL(previous.preview);
    setPhotos((current) => [
      ...current.filter((photo) => photo.kind !== kind),
      { kind, file, preview: URL.createObjectURL(file) },
    ]);
  }

  function removePhoto(kind) {
    const target = photos.find((photo) => photo.kind === kind);
    if (target) URL.revokeObjectURL(target.preview);
    setPhotos((current) => current.filter((photo) => photo.kind !== kind));
  }

  function addVideo(file) {
    if (file && file.size > 25 * 1024 * 1024) {
      setMediaError("El video puede pesar como maximo 25 MB.");
      return;
    }
    setMediaError("");
    setVideoFile(file || null);
    setVideoName(file?.name || "");
  }

  function removeVideo() {
    setVideoFile(null);
    setVideoName("");
  }

  async function publish() {
    const published = await onPublish({
      form,
      photoFiles: photos.map(({ kind, file }) => ({ kind, file })),
      videoFile,
    });
    if (!published) return;
    photos.forEach((photo) => URL.revokeObjectURL(photo.preview));
    setForm(createPublicationForm());
    setPhotos([]);
    setVideoFile(null);
    setVideoName("");
    setMediaError("");
    setStep(0);
  }

  const canContinue = validateStep(step, form, photos);

  return (
    <section className="assistantWorkspace" id="asistente">
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

        <div className="assistantAnswer">
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
              canPublish={canPublish}
              form={form}
              photos={photos}
              profile={profile}
              publishStatus={publishStatus}
              quality={quality}
            />
          )}
        </div>

        <div className="assistantActions">
          <button className="secondary" type="button" disabled={step === 0} onClick={back}>
            Volver
          </button>
          {step < steps.length - 1 ? (
            <button className="primary" type="button" disabled={!canContinue} onClick={next}>
              Continuar
            </button>
          ) : (
            <button className="primary" type="button" disabled={!canPublish || photos.length < 4} onClick={publish}>
              Confirmar y publicar
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
                  <input hidden type="file" accept="image/*" onChange={(event) => addPhoto(guide.id, event.target.files?.[0])} />
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
          <input hidden type="file" accept="video/*" onChange={(event) => addVideo(event.target.files?.[0])} />
        </label>
        {videoName && <button className="textDanger" type="button" onClick={removeVideo}>Eliminar video</button>}
      </div>
      {mediaError && <p className="warning">{mediaError}</p>}
      <p className="assistantHint">{photos.length}/8 fotos cargadas. Necesitas al menos 4.</p>
    </div>
  );
}

function ChecklistStep({ form, setForm }) {
  return (
    <div>
      <p className="ownerDeclaration">Informacion declarada por el propietario. No es una certificacion profesional.</p>
      <div className="assistantFieldGrid checklistFields">
        {Object.entries(checklistOptions).map(([key, options]) => (
          <label key={key}>
            <span>{humanize(key)}</span>
            <select
              value={form.checklist[key]}
              onChange={(event) => setForm({
                ...form,
                checklist: { ...form.checklist, [key]: event.target.value },
              })}
            >
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

function PublishStep({ canPublish, form, photos, profile, publishStatus, quality }) {
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
      {!profile && <p className="warning">Crea una cuenta antes de confirmar la publicacion.</p>}
      {profile && !canPublish && <p className="warning">Tu cuenta no tiene creditos o permiso de publicacion.</p>}
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

function validateStep(step, form, photos) {
  if (step === 0) return Boolean(form.brand && form.model && form.version && form.year);
  if (step === 1) return Number(form.kilometers) >= 0 && form.kilometers !== "";
  if (step === 2) return Number(form.price) > 0 && Boolean(form.zone);
  if (step === 3) return photos.length >= 4;
  return true;
}

function humanize(value) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}
