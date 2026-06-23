"use client";

import { useEffect, useState } from "react";
import { checklistOptions } from "../../lib/velox-data";

function createInitialForm() {
  return {
    brand: "",
    model: "",
    version: "",
    year: new Date().getFullYear(),
    kilometers: "",
    price: "",
    zone: "",
    partialPlate: "",
    description: "",
    acceptsTrade: false,
    acceptsFinancing: false,
    viewLocation: "",
    availableHours: "",
    checklist: {
      motor: "bueno",
      caja: "buena",
      trenDelantero: "sin ruidos",
      amortiguadores: "normales",
      cubiertas: "media vida",
      frenos: "normales",
      aire: "funciona perfecto",
      interiores: "buenos",
      vidrios: "originales",
      pintura: "original",
      choques: "nunca chocado",
    },
  };
}

export default function PublishSection({
  canPublish,
  onPublish,
  profile,
  publishStatus,
}) {
  const [form, setForm] = useState(createInitialForm);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");

  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  function handlePhotoChange(event) {
    const file = event.target.files?.[0] || null;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : "");
  }

  async function submit(event) {
    event.preventDefault();
    const published = await onPublish({ form, photoFile });
    if (!published) return;
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(null);
    setPhotoPreview("");
    setForm(createInitialForm());
    event.currentTarget.reset();
  }

  return (
    <section className="section publishSection" id="publicar">
      <div>
        <p className="eyebrow">Publicacion real</p>
        <h2>Publicar vehiculo</h2>
        <p>Los datos se guardan en Supabase y la imagen se entrega mediante una URL privada temporal.</p>
        {!profile && <p className="warning">Primero crea cuenta o entra para publicar.</p>}
        {profile && !canPublish && (
          <p className="warning">Tu cuenta puede comprar y chatear, pero no tiene permiso para publicar.</p>
        )}
      </div>

      <form className="publishCard" onSubmit={submit}>
        <div className="formGrid">
          <Field label="Marca" required value={form.brand} onChange={(value) => setForm({ ...form, brand: value })} />
          <Field label="Modelo" required value={form.model} onChange={(value) => setForm({ ...form, model: value })} />
          <Field label="Version exacta" required value={form.version} onChange={(value) => setForm({ ...form, version: value })} />
          <Field label="Ano" required type="number" value={form.year} onChange={(value) => setForm({ ...form, year: value })} />
          <Field label="Kilometros" required type="number" value={form.kilometers} onChange={(value) => setForm({ ...form, kilometers: value })} />
          <Field label="Precio" required type="number" value={form.price} onChange={(value) => setForm({ ...form, price: value })} />
          <Field label="Zona" required value={form.zone} onChange={(value) => setForm({ ...form, zone: value })} />
          <Field label="Patente parcial" value={form.partialPlate} onChange={(value) => setForm({ ...form, partialPlate: value })} />
        </div>

        <label>
          Foto principal
          <input type="file" accept="image/*" onChange={handlePhotoChange} />
        </label>
        {photoPreview && <img className="photoPreview" src={photoPreview} alt="Preview de foto" />}

        <label>
          Descripcion
          <textarea
            required
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </label>

        <div className="formGrid">
          {Object.entries(checklistOptions).map(([key, options]) => (
            <label key={key}>
              {key}
              <select
                value={form.checklist[key]}
                onChange={(event) => setForm({
                  ...form,
                  checklist: { ...form.checklist, [key]: event.target.value },
                })}
              >
                {options.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          ))}
        </div>

        <div className="switches">
          <label>
            <input
              type="checkbox"
              checked={form.acceptsTrade}
              onChange={(event) => setForm({ ...form, acceptsTrade: event.target.checked })}
            />
            Acepta permuta
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.acceptsFinancing}
              onChange={(event) => setForm({ ...form, acceptsFinancing: event.target.checked })}
            />
            Acepta financiacion
          </label>
        </div>

        <div className="formGrid">
          <Field label="Donde se puede ver" value={form.viewLocation} onChange={(value) => setForm({ ...form, viewLocation: value })} />
          <Field label="Horarios disponibles" value={form.availableHours} onChange={(value) => setForm({ ...form, availableHours: value })} />
        </div>

        <button className="primary" type="submit" disabled={!profile || !canPublish}>
          Publicar ahora
        </button>
        {publishStatus && <p className="authStatus">{publishStatus}</p>}
      </form>
    </section>
  );
}

function Field({ label, onChange, required = false, type = "text", value }) {
  return (
    <label>
      {label}
      <input
        required={required}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
