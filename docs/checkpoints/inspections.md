# Integridad de informes mecánicos

Cambios locales del 3 de octubre de 2026. No se aplicó SQL a Supabase ni se subieron archivos reales.

## Fallos reproducidos

El frontend insertaba el informe antes de subir los archivos, omitía errores de inserción de medios y finalmente anunciaba éxito aunque las fotos hubieran fallado. El formulario partía de resultado aprobado, seis valoraciones de 7 y copiaba los kilómetros declarados del vendedor al campo de kilómetros verificados. Los datos privados cargados no se vaciaban por usuario/rol; errores de red se atribuían sin evidencia a migraciones faltantes.

El primer lote SQL nuevo falló antes de añadir la RPC. Con la migración006, tests SQL y API/DOM de inspecciones pasan en aislamiento. El gate agregado contiene el resultado final exacto.

## Contrato nuevo

`submit_inspection_report(target_request uuid, report_payload jsonb, media_payload jsonb)` devuelve una fila `inspection_reports`.

`request_inspection(target_vehicle uuid)` crea o devuelve la solicitud abierta del solicitante para ese vehículo. El índice parcial impide duplicados abiertos; un error posterior de refresco no habilita otra solicitud. El preflight también detecta solicitudes legacy duplicadas, sin fusionarlas ni borrarlas.

- Únicamente mecánico activo actualmente asignado. Perfil, autorización y solicitud bloqueados durante la operación.
- Archivos previamente subidos a `inspection-media`, rutas `mechanic_id/request_id/kind-hash.ext`; firma/lectura continúa privada. La regla de subida permite staging antes de crear el informe, sólo dentro de una asignación vigente.
- Resultado y seis puntuaciones explícitos; odómetro no negativo, fecha válida no futura. Dashboard obligatorio, hasta seis detalles, video opcional. Validación de existencia, propiedad, MIME y tamaño desde metadata de Storage.
- Informe, vínculos de medios y estado final se confirman en una transacción. Una falla de vínculo revierte todo el registro nuevo.
- Una solicitud tiene un único informe. Repetición idéntica devuelve el existente; cambios posteriores son rechazados. Sin cobros ni borrado.
- El cierre de una revisión con informe es inmutable: no se puede reabrir, reasignar ni vaciar su fecha desde el cliente.
- Se revocan INSERT/UPDATE/DELETE directos de informes/medios a authenticated. Una solicitud no puede marcarse completed/observed sin informe correspondiente y foto de tablero.
- El cliente conserva entradas ante error y usa rutas deterministas. No elimina archivos tras respuesta incierta. Archivo huérfano queda privado, pendiente de limpieza controlada posterior.
- Los borradores por solicitud conservan formulario y archivos durante cambios de selección después de un error; durante envío se bloquea cambiar de revisión. El archivo retenido no obliga a volver a elegirlo en el input nativo. Los borradores viven sólo en memoria de esta página.
- Cache por usuario/rol y cancelación de respuestas tardías. No persisten solicitudes/informes de otra sesión. Los defaults de evaluación quedan vacíos.

## Pruebas

- SQL/PGlite: staging privado previo, compromiso atómico, repetición, file missing, roles, scores, modificación final rechazada, rollback por falla deliberada después de insertar reporte.
- API simulada: no hay valores favorables por defecto, archivo falla sin crear informe, respuesta perdida/retry idéntico, datos inválidos sin transmisión.
- React DOM: logout limpia registros privados, error de red honesto, ficha mecánica empieza sin copiar kilómetros/aprobación/calificaciones.

```sh
node --import ./tests/no-live-services.mjs --import tsx --test tests/inspections*.test.mjs tests/backend/inspections-workflow.test.mjs
```

## Gates

- Migración006 y frontend requieren despliegue coordinado, porque el flujo antiguo deja de tener INSERT directo de informes.
- Preflight SQL aborta y revierte la migración si existen informes legacy sin foto de tablero, sin fecha de cierre o con estado/resultado incoherentes. Revisar y reparar explícitamente antes de aplicar. No se inventan evaluaciones ni se transforman automáticamente en completos. La corrección de un informe final existente necesita un procedimiento trazable autorizado; no se ofrece un editor que sobrescriba el original.
- No se inspeccionan bytes internamente, sólo MIME/tamaño declarados por Storage. Firma, subidas reales, revocación, autorización concurrente y calidad de datos requieren staging.
- La prueba no acredita profesionalidad del mecánico ni cumplimiento normativo de una inspección. La asignación del responsable continúa siendo decisión administrativa humana.
- No se envió informe ni contenido a terceros. Son fixtures sintéticos.
