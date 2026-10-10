# Agenda por intervalos e idempotencia: hito 3 local

3 de octubre de 2026. Extiende el checkpoint `appointments.md`; la migración 004 queda intacta. Trabajo sólo local: sin despliegue, Supabase real, gastos, cuentas nuevas ni pruebas de navegador.

## Contrato nuevo

- Cada propuesta exige inicio y duración positiva en minutos enteros, elegidos explícitamente. El formulario de duración empieza vacío. No se configura un valor comercial predeterminado ni un margen de traslado.
- El límite 2147483647 minutos corresponde exclusivamente al tipo `INTEGER` de PostgreSQL. Se rechazan desbordamientos y finales no finitos; no representa una recomendación de duración.
- La reserva cubre `[inicio, fin)`: incluye el inicio y excluye el final. Visitas adyacentes son válidas. La duración es inmutable; para cambiarla se cancela y propone otra visita.
- Se mantienen las reglas de consentimiento de 004 y la salida segura por cancelación del participante activo cuando la conversación/contraparte está bloqueada. El caller bloqueado sigue sin poder actuar.

## Base de datos

Migración nueva: `202610030008_appointment_intervals.sql`.

`duration_minutes` no tiene default. Las visitas activas siempre requieren minutos positivos. Una visita histórica `cancelled`/`rejected` puede conservar `NULL`, mostrado como “Duración no registrada”. No se inventan datos ni se exige acordar una duración para historia ya cerrada. El trigger exige duración explícita en toda inserción, y el CHECK rechaza `NULL` en estados activos.

La tabla privada de reservas conserva una fila por participante y añade `reserved_during tstzrange`, derivada de la duración inmutable. La restricción `EXCLUDE USING gist (user_id WITH =, reserved_during WITH &&)` impide solapamientos parciales, contención e igualdad de intervalos de cualquier persona, incluso si cambia entre comprador y vendedor en distintas conversaciones. El motor arbitra conflictos concurrentes, sin depender de una consulta previa de disponibilidad. Cancelar elimina ambas reservas en la misma transacción.

Dependencia nueva: extensión PostgreSQL `btree_gist`. Ya estaba empaquetada en PGlite; las fixtures ahora registran ese paquete y la migración ejecuta `CREATE EXTENSION IF NOT EXISTS`. No se descargó una dependencia nueva ni se modificó package.json para esto. Antes de staging hay que verificar disponibilidad y permisos de la extensión.

## Propuesta idempotente

Contrato RPC:

`propose_appointment(target_conversation, appointment_scheduled_at, appointment_duration_minutes, appointment_location, proposal_request_id)`.

Devuelve la fila actual de `appointments`, con `duration_minutes`; el frontend calcula el fin usando esos datos. No expone claves ni payloads de la tabla privada de intentos.

- Clave durable en PostgreSQL: autor + UUID. Un advisory lock serializa reintentos; la clave primaria exacta es la protección transaccional final.
- Se bloquean y verifican conversación/perfiles después de cualquier espera. Un replay no saltea un bloqueo de cuenta o conversación.
- Un UUID reutilizado con otra conversación, instante, duración o lugar se rechaza. Los instantes con distintos offsets equivalentes se comparan como el mismo `timestamptz`.
- Repetir el mismo intento devuelve la misma visita y su estado actual; no vuelve a proponer, no reserva de nuevo y no exige que un horario previamente registrado siga siendo futuro.
- Si una eliminación confiable borró la visita, permanece una referencia vacía del intento: reintentarlo informa la eliminación y no crea otra visita.
- La creación de visita y registro del intento son atómicos. Se revoca INSERT directo de clientes, por lo que requiere despliegue coordinado con el frontend nuevo.

## Navegador y recuperación

El navegador guarda sólo hash SHA-256 de la intención y UUID en `sessionStorage`, sin fecha/lugar ni otros datos crudos. El hash incluye autor, conversación, inicio UTC, duración y lugar normalizado.

El guard de doble clic cubre también el hash asíncrono. Cambiar sesión/chat durante ese paso impide enviar desde el contexto anterior. Una respuesta perdida conserva la referencia; reintentar los mismos datos tras recargar la misma pestaña reutiliza el UUID. Si no puede persistir/verificar la referencia antes de enviar, el envío se bloquea con aviso visible, en vez de depender de un fallback volátil.

Después de un ACK válido se limpia la referencia para permitir una nueva intención legítima con contenido idéntico. Si falla la limpieza, se conserva el éxito de la visita y se avisa. La referencia confirmada se reconoce en memoria para que una nueva intención pueda generar/persistir otro UUID; si tampoco puede persistirlo no se envía. Tras recarga con limpieza fallida, la recuperación conservadora puede devolver la visita anterior, sin duplicarla.

`sessionStorage` conserva referencias entre recargas de una misma pestaña; no promete recuperarlas tras cerrar la pestaña, borrar datos del sitio o usar otro dispositivo. El retry durable de servidor requiere conservar el UUID. Una política global de duración, buffers, recordatorios externos y disponibilidad comercial queda fuera de este cambio.

## Verificación y límites

Verificación focalizada final: **134/134 PASS** (77 backend + 57 UI/helper), ESLint focalizado y `git diff --check` PASS. Ejecutada en serie para limitar memoria de las instancias PGlite.

Pruebas backend aisladas: 27 nuevas de intervalos/idempotencia y 50 de agenda adaptadas al nuevo RPC con duración explícita sintética. Cubren parcial/inclusión/igualdad, fronteras adyacentes, cruce de roles, cancelación, bloqueos, rollback sin reserva parcial, permisos, persistencia del intento entre transacciones, payload conflictivo, referencia tras eliminación, duración/desbordamiento y preflight de historia. Los valores de 1/30/45 minutos son datos sintéticos elegidos por cada test, nunca defaults de producto.

Comando focalizado:

```sh
node --import ./tests/no-live-services.mjs --import tsx --test --test-concurrency=1 tests/appointments*.test.mjs tests/backend/appointments.test.mjs tests/backend/appointment-intervals.test.mjs
```

PGlite ejecutó las restricciones GiST reales. No se presenta esa prueba como concurrencia de varias conexiones PostgreSQL independientes, ni como QA visual. No se ejecutó build en este subtrabajo; la integración agregada pertenece al cierre del hito.

## Gates antes de aplicar

1. Respaldar y revisar el esquema real, acceso a `btree_gist` y permiso para crear la extensión. No eludir un permiso denegado.
2. Revisar cada visita activa legacy sin duración. La migración aborta sin asignar defaults. Resolver duraciones explícitas con autorización o cerrar correctamente la visita según la decisión de sus participantes. Preservar historia terminal sin inventar minutos.
3. Revisar reservas que se solaparían con las duraciones acordadas. Agregar la exclusión falla atómicamente si existen; no elige ganadores ni borra filas.
4. Coordinar migración 008 con frontend RPC-aware. Repetir las pruebas de RLS, usuario bloqueado, cancelación segura y no duplicación con sesiones reales de prueba.
5. Prueba multi-sesión: aceptar dos visitas con intervalos parcialmente superpuestos para una misma persona, también cruzando roles. Con la primera transacción abierta, la segunda debe esperar y fallar tras el commit; si la primera revierte, puede continuar. Probar fronteras adyacentes y cancelación que libera ambas reservas.
6. Probar dos solicitudes simultáneas del mismo autor/UUID: una sola visita; payload distinto debe fallar. Probar pérdida de respuesta, recarga de la misma pestaña y retry. Repetir bloqueo de cuenta/conversación durante la espera.
7. QA visual con duración vacía, distintos husos del navegador, errores de almacenamiento/red, cleanup posterior al ACK y nueva intención con los mismos datos. Verificar que un histórico terminal sin duración no invite a definirla.
