# Etapa 5 - Calidad y recomendaciones

## Cambios realizados

- El concepto visible `Score VELOX` fue reemplazado por `Calidad de publicacion`.
- La calidad se calcula con fotos, video, descripcion, disponibilidad y autorevision.
- El catalogo muestra porcentaje y estado: necesita datos, en progreso, buena o muy completa.
- El detalle y el panel de calidad muestran recomendaciones accionables.
- La autorevision conserva el aviso de que es informacion declarada por el propietario.

## Archivos modificados

- `features/publication/publication-quality.js`
- `features/vehicles/vehicle-api.js`
- `features/vehicles/CatalogSection.jsx`
- `features/vehicles/VehicleDetail.jsx`
- `features/quality/QualitySection.jsx`
- `app/globals.css`

## Migraciones

No requiere cambios de base de datos. Se conserva temporalmente la columna historica `score` para compatibilidad y se dejara de exponer en la interfaz.

## Riesgos detectados

Las publicaciones antiguas pueden tener pocas fotos y mostrar una calidad baja. Es el comportamiento esperado: la interfaz indica exactamente como mejorarlas.

## Proximo paso

Reemplazar planes y suscripciones por creditos de publicacion con vigencia de 90 dias y consumo seguro en base de datos.
