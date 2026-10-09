# Hitos 2–3: bandeja de conversaciones y envío idempotente

Fecha: 2026-10-03. Cambios locales; no publicación, migraciones remotas ni llamadas a servicios reales.

## Entrega

- `ChatInbox({ session })` lista las conversaciones propias de comprador y vendedor mediante `get_my_conversations()`. Permite entrar sin seleccionar antes un vehículo del catálogo y actualizar la lista. Los estados de carga, lista vacía, error y sesión ausente son explícitos.
- `ChatPreview` acepta una conversación existente y conserva la entrada anterior por vehículo. La entrada existente nunca crea una conversación. Recarga los participantes y el estado bajo RLS antes de consultar mensajes.
- El comprador que inicia desde catálogo reutiliza su conversación; si otra pestaña gana la creación, recupera la fila protegida por la restricción única. La apertura descartada por React StrictMode no crea una fila extra.
- Enviar, bloquear y denunciar usan una exclusión sincrónica para evitar doble clic y mutaciones simultáneas. Un bloqueo confirmado no puede ser revertido visualmente por un refresco antiguo.
- Después de un envío confirmado se recupera el historial desde la base, incluyendo respuestas automáticas, sin depender de Realtime. Si el refresco falla después del envío, se distingue el éxito del envío del fallo de lectura para no invitar a duplicarlo.
- Realtime escucha inserciones y actualizaciones de mensajes (incluidos recibos leídos) y cambios de conversación. Hay actualización manual; un fallo de suscripción lo informa sin impedir enviar o leer mediante esa actualización.
- Sólo se marcan leídos los IDs recibidos, ajenos y aún no leídos que el cliente realmente cargó. Un fallo al confirmar lectura conserva el historial y muestra una advertencia.
- La denuncia usa el vehículo y el interlocutor de la conversación existente. Una denuncia guardada cuya actualización de bandera falla sigue informándose como enviada. Que la otra persona ya haya denunciado no impide presentar una denuncia propia.
- Las respuestas tardías no restauran mensajes, conversaciones o borradores de otra identidad/selección. Cerrar sesión descarta selección y modal; volver a ingresar no los reabre.
- El modal integra `useModalFocus`: foco inicial, ciclo de Tab, Escape, fondo, restauración del foco y del scroll. El borrador se reinicia al cambiar de conversación. Campos y estados tienen nombres/roles accesibles.
- Se reutiliza la agenda endurecida del hito. Al bloquear el chat se mantiene visible su historial de visitas y se aplican las reglas de seguridad de la agenda. El cliente inyectable se propaga a AgendaPanel.

## Contrato backend

RPC sin argumentos `get_my_conversations()`:

`id, vehicle_id, buyer_id, seller_id, is_blocked, is_reported, created_at, lead_status, vehicle_brand, vehicle_model, counterparty_name`

El endpoint no debe devolver teléfonos ni mensajes de otras conversaciones. La interfaz filtra defensivamente la membresía, pero la protección efectiva es SQL/RLS. Para abrir y refrescar se requiere SELECT de `conversations` por ID y de `messages` por `conversation_id`; para los envíos el cliente usa `send_message_idempotent`; se conservan el UPDATE limitado de moderación y el INSERT autorizado en `reports`.

## Hito 3: intención persistente y transacción

Nuevo RPC `send_message_idempotent(target_conversation uuid, message_body text, message_request_id uuid)` en `202610030007_message_idempotency.sql`:

- Devuelve el JSON original de `send_message_with_assistant`: `message_id`, `automated` y, cuando corresponda, `automated_message_id`. Una repetición autorizada devuelve exactamente el mismo JSON.
- Una tabla privada `velox_private.message_requests` vincula autor + UUID a la conversación, al SHA-256 del contenido normalizado a Unicode NFC y al resultado. No guarda una segunda copia del texto. No ofrece permisos ni políticas de lectura a clientes, incluso al autor o admin.
- Un advisory lock transaccional por autor/UUID y el lock de conversación serializan la intención. Mensaje humano, respuesta automática y registro del resultado forman una sola transacción. Fallar cualquier parte revierte todas.
- Reutilizar un UUID del mismo autor con cuerpo o conversación diferente se rechaza. Otro autor tiene un espacio independiente. Un UUID nuevo permite enviar legítimamente el mismo texto.
- Cada intento, incluidos los reintentos, vuelve a validar identidad, participación y bloqueos antes de consultar el resultado privado. Revocar acceso no deja una vía de lectura en el ledger. La migración no amplía SELECT de conversaciones o mensajes.
- El cuerpo legacy se conserva salvo normalizar primero Unicode NFC y luego vocales acentuadas para reconocer intenciones: `kilómetros`, `dónde` y `cuándo` reconocen su intención incluso cuando el teclado produce Unicode NFD; el ruido no provoca respuestas de disponibilidad. La disponibilidad sigue dependiendo del estado de la publicación.

Cliente `message-request.js`:

- El helper cliente y el wrapper SQL canonicalizan el cuerpo a NFC antes de calcular la intención y enviarlo/guardarlo. NFC y NFD visualmente equivalentes recuperan el mismo UUID/resultado; quitar una tilde, cambiar mayúsculas o espacios interiores sigue siendo otro contenido.
- `sessionStorage` conserva sólo SHA-256 de autor/conversación/texto y un UUID. Mantiene la misma intención ante `throw`, error SDK con `status: 0`, respuesta incompleta, remount, logout/reingreso y recarga de la misma pestaña. No hay reintentos automáticos.
- No se envía si no se puede guardar y verificar el UUID. Un ACK autoritativo requiere IDs UUID y el contrato de respuesta; sólo entonces se retira el mapping, aun si el modal ya se cerró. Repetir el texto tras éxito crea una intención nueva.
- Un ACK tardío sólo puede limpiar su propio UUID. Si `removeItem` falla tras un ACK válido, el envío sigue confirmado y se avisa del problema. El runtime no reutiliza ese UUID confirmado para un mensaje nuevo; primero persiste otro. Tras crash/recarga sin limpieza, el UUID anterior permite confirmar el original sin duplicarlo.
- Al recuperar un UUID pendiente y recibir ACK válido, se muestra «Envío confirmado», sin afirmar que el intento anterior llegó ni que se creó otro mensaje.
- Cambiar el texto durante una confirmación incierta es otra intención. Cerrar la pestaña o borrar sus datos puede perder el UUID; no se garantiza recuperación entre pestañas/dispositivos independientes. Nunca se persiste el cuerpo del chat para restaurar el borrador.

## Gate de corte coordinado antes del piloto

007 conserva temporalmente las rutas anteriores por compatibilidad. Antes de afirmar idempotencia en todos los clientes:

1. Aplicar y validar 007 en staging; desplegar sólo clientes que preservan UUID y usan el nuevo RPC.
2. Confirmar que no quedan clientes antiguos que llamen al RPC legacy o inserten directamente en `messages`.
3. Revocar EXECUTE de `public.send_message_with_assistant(uuid,text)` para los roles cliente, incluidos grants heredados de PUBLIC. Revocar INSERT directo de `public.messages`, tanto privilegio de tabla como grants por columnas (actualmente `conversation_id`, `sender_id`, `body`), sin retirar SELECT ni el UPDATE autorizado de recibos leídos.
4. Probar denegación de ambas rutas antiguas y éxito/idempotencia del wrapper. El definer puede llamar a la función interna sin EXECUTE del cliente. Las pruebas locales verifican este corte y que reaplicar 007 no reabre los grants revocados.
5. Verificar en PostgreSQL/Supabase real la contención entre sesiones, PostgREST, JWT, RLS, recibos, bloqueos y Realtime antes de habilitar usuarios reales. El código local no constituye autorización para aplicar cambios remotos.

## Verificación local

- Desarrollo test-first: se registró el fallo por ausencia del hook de bandeja antes de implementarlo.
- 28 pruebas de `tests/chat-inbox.test.mjs`, todas correctas. Cubren ambos lados, conversación ajena/no disponible, logout, solicitudes fuera de orden, envío, bloqueo, denuncia, recibos, Realtime caído, StrictMode, creación concurrente, agenda real bloqueada y navegación/foco repetidos.
- 15 pruebas de `tests/chat-request.test.mjs`: persistencia, fallo de ACK y almacenamiento, nuevo envío tras confirmación y reload verdaderamente aislado. No se usa un query-string de import como falsa pérdida de memoria: tsx lo canonicaliza; el test usa un módulo ESM aislado y comprueba identidad distinta.
- 3 pruebas de `tests/chat-message-integration.test.mjs` atraviesan el cliente real y SQL/PGlite, pierden la respuesta después de ejecutar la transacción y confirman tras reload: un mensaje humano, una respuesta automática, y un UUID nuevo sólo después del ACK.
- 45 pruebas de `tests/backend/message-idempotency.test.mjs`: permisos/RLS, mismatch, autores, rollback, bloqueo/revocación, normalización NFC/NFD y tildes, corte legacy y replay de migración.
- `npx eslint features/chat tests/chat*.mjs tests/backend/message-idempotency.test.mjs`: correcto, sin advertencias del área.
- Referencia hito 2: `npm test` tuvo 293 pruebas correctas a las 03:21 UTC. La verificación agregada del hito 3 corresponde al integrador; no se reutiliza ese resultado antiguo como gate actual. El runner bloquea red y limpia credenciales de servicios.
- Build y verificación agregada final quedan en el checkpoint general del integrador.
- Pruebas visuales/E2E en navegador: no ejecutadas, ruta bloqueada. jsdom no demuestra apariencia o comportamiento real de Supabase Realtime.

## Límites explícitos

- El camino nuevo recupera la misma intención sin duplicados ante respuesta perdida. Esto no significa entrega exactamente una vez en todos los caminos mientras legacy/INSERT directo sigan habilitados, ni conserva el UUID al borrar datos o cerrar definitivamente la pestaña. PGlite serializa una sola conexión; contención real entre sesiones sigue pendiente.
- La bandeja usa actualización manual y después de cerrar un chat; no muestra contadores de no leídos ni una previsualización del último mensaje.
- Realtime de conversaciones debe verificarse con la configuración real de publicación. El refresco manual y la validación del servidor siguen siendo necesarios.
- Validar en staging, con cuentas separadas, las políticas, permisos, recibos, bloqueo y refresco reales antes de habilitar el piloto.
