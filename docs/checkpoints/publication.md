# Checkpoint: asistente de publicación

Fecha: 2026-10-03. Cambios locales en `audit/pilot-hardening`.

## Resultado

- El formulario vacío empieza en **0%**, sin año preseleccionado ni estado mecánico positivo por defecto. Los 20 puntos de datos básicos se ganan con campos efectivamente completados y válidos.
- Cada ítem de autorevisión requiere una respuesta del vendedor. Se conserva el conjunto de opciones existente y se agrega `no revisado` (etiqueta «Sin revisar / No lo se») para permitir una respuesta honesta sin afirmar una revisión.
- El porcentaje mide completitud de la publicación, no calidad mecánica. Responder explícitamente que algo no se revisó cuenta como completar ese campo.
- La descripción sugerida sólo usa hechos proporcionados. No convierte kilometraje ausente en cero ni inventa motor, caja, interior o historial de choques.
- Si el vendedor vuelve atrás y corrige un dato, se actualiza una descripción sugerida que no haya editado. Se preserva su texto personalizado.
- La validación comprueba campos de texto no vacíos, año entero entre 1886 y el año actual + 1, kilómetros enteros desde 0 y precio entero mayor que 0. Kilómetros/precio tienen máximo 2.147.483.647 por compatibilidad con las columnas `integer` actuales.
- Las fotos requieren JPEG/PNG/WebP, contenido no vacío y máximo 3 MiB. El video opcional acepta MP4/WebM/QuickTime, contenido no vacío y máximo 25 MiB. Los límites conservan los tamaños ya usados por la UI; ahora también se comprueba el MIME.
- Para continuar se requieren las cuatro perspectivas marcadas obligatorias en la guía: frontal, ambos laterales e interior. Se rechazan tipos duplicados, tipos desconocidos o más de ocho fotos.
- Un bloqueo síncrono con ref evita publicaciones duplicadas aun con clics dentro del mismo ciclo de render. El botón muestra «Publicando...» y los campos y la navegación quedan deshabilitados durante la solicitud.
- Un resultado `false` o una excepción conserva el borrador y habilita un reintento explícito. Tras un éxito se reinician los siete pasos y el progreso vuelve a 0%.
- Los object URLs se liberan exactamente una vez al reemplazar, eliminar, publicar correctamente o desmontar el componente.
- Los clics repetidos en Continuar no saltean pasos. Volver conserva los datos. Se preservaron las clases y el espaciado responsive existentes.
- El banner y el resumen aceptan `publishAccessMessage` para distinguir falta de saldo, carga, error y expiración del rechazo por rol. `canPublish` sigue bloqueando el envío; se conserva el fallback anterior cuando no se suministra un mensaje.

## Verificación test-first

Comando de pruebas: `node --import tsx --test tests/publication.test.mjs`.

- Baseline previo a implementación: 10/10 pruebas fallaron. Incluía 33% inicial, defaults mecánicos, validación numérica/media, flujo y limpieza de previews.
- Se agregó una regresión sobre volver a editar una declaración: falló antes de corregir la actualización de la descripción sugerida.
- Regresión adicional test-first: el vendedor sin créditos veía un rechazo por rol. La prueba falló antes de conectar el mensaje de acceso y luego pasó.
- Resultado final: **17/17 pruebas aprobadas**.
- Se recorren los **7 pasos** con datos ficticios y archivos de prueba en React/jsdom; `onPublish` es simulado. Se verifican 0 km, cuatro fotos, autorevisión explícita, payload, doble clic, publicación exitosa, error, respuesta `false`, reintento y pérdida de permiso antes de confirmar.
- `npx eslint features/publication/PublicationAssistant.jsx features/publication/publication-quality.js tests/publication.test.mjs`: aprobado, sin desactivar reglas.
- `git diff --check`: aprobado.

## Alcance y límites

- No se modificaron `vehicle-api`, SQL, package ni servicios. No se publicaron datos reales, no hubo llamadas al backend, gastos, push o deploy.
- La comprobación MIME de navegador no inspecciona firmas binarias y no es una barrera de seguridad del servidor. Storage/backend deben aplicar sus propias políticas y validaciones.
- El flujo se probó con DOM simulado; el smoke visual en navegador y build completos corresponden al checkpoint general.
- El nuevo string `no revisado` se guarda dentro del JSON de checklist existente y no agrega columnas. La comprobación sobre una base real requiere el flujo de validación del backend correspondiente.
- Los borradores siguen en memoria del componente. La recuperación tras cerrar o recargar la página no forma parte de este cambio.

## Archivos

- `features/publication/PublicationAssistant.jsx`
- `features/publication/publication-quality.js`
- `tests/publication.test.mjs`
- `docs/checkpoints/publication.md`
