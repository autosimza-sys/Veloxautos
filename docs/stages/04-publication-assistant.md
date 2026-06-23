# Etapa 4 - Asistente de publicacion

## Cambios realizados

- Se reemplazo el formulario tradicional por un flujo conversacional de 7 pasos.
- Se agrego guia visual para 8 tipos de fotos y un minimo obligatorio de 4.
- Se agrego video opcional, eliminacion de archivos y limites de 3 MB por foto y 25 MB por video.
- La publicacion guarda todas las fotos y el video en el bucket privado `vehicle-media`.
- Se agregaron recomendaciones, descripcion sugerida y revision final antes de publicar.
- Se preparo la tabla `publication_drafts` con RLS para guardar avances del usuario.

## Archivos principales

- `features/publication/PublicationAssistant.jsx`
- `features/publication/publication-quality.js`
- `features/vehicles/vehicle-api.js`
- `features/vehicles/use-vehicle-catalog.js`
- `app/page.jsx`
- `app/globals.css`

## Migracion

- `supabase/migrations/202606230003_publication_assistant.sql`

## Verificacion

- `npm.cmd run lint`
- `npm.cmd run build`

## Riesgo pendiente

La tabla de borradores queda preparada en esta etapa. El guardado automatico del progreso se conectara despues de integrar el consumo transaccional de creditos, para evitar estados parciales entre borrador y publicacion.

## Proximo paso

Unificar el score numerico existente bajo el concepto visible `Calidad de publicacion` y mostrar mejoras accionables en catalogo y detalle.
