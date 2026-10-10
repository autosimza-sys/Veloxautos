# Bandeja de conversaciones y CRM privado

Fecha: 3 de octubre de 2026. Implementación local; no aplicada a Supabase real ni desplegada.

## Contratos y permisos

Migración nueva: `202610030003_conversation_crm.sql`, después de las reparaciones `001` y publicación atómica `002` de octubre. No modifica sus archivos, asignaciones de créditos ni políticas de lectura de perfiles, vehículos o mensajes.

- `conversations.lead_status`: texto `NOT NULL`, valor inicial `new`, `CHECK` para `new`, `interested`, `visit_scheduled`, `visited`, `closed`, `lost`.
- `lead_updated_at`: fecha del último cambio de estado; las conversaciones previas se inicializan con su `created_at`. Reaplicar la migración conserva progreso y fechas. Reintentar el mismo estado conserva la fecha.
- Las nuevas conversaciones sólo admiten `INSERT(vehicle_id,buyer_id,seller_id)` desde clientes. Estado, fecha, UUID y flags iniciales quedan a cargo del servidor. Se mantienen el control de vehículo/vendedor y RLS de participantes existentes.
- El `UPDATE` directo conserva únicamente `is_reported`/`is_blocked` y sus protecciones previas. No permite reescribir participantes, vehículo, UUID, fechas ni estado CRM.

### Bandeja del participante

`get_my_conversations()` no recibe IDs. Requiere una cuenta activa y sólo devuelve conversaciones donde `auth.uid()` es comprador o vendedor. Un administrador ajeno no recibe esas conversaciones mediante esta función.

Retorna una lista con exactamente: `id`, `vehicle_id`, `buyer_id`, `seller_id`, `is_blocked`, `is_reported`, `created_at`, `lead_status`, `vehicle_brand`, `vehicle_model`, `counterparty_name`.

El nombre es el nombre comercial, nombre visible o etiqueta genérica, sin teléfono. Las conversaciones ya existentes siguen en la bandeja aunque estén bloqueadas o su vehículo esté pausado, para no perder su historial. La función no modifica permisos para enviar mensajes.

### CRM administrativo

`get_admin_leads()` sólo entrega datos a un administrador activo. Retorna una lista con: `id`, `vehicle_id`, `buyer_id`, `seller_id`, `is_blocked`, `is_reported`, `created_at`, `lead_status`, `lead_updated_at`, `vehicle_brand`, `vehicle_model`, `vehicle_year`, `vehicle_zone`, `vehicle_status`, `buyer_name`, `seller_name`.

`set_lead_status(target_conversation uuid,new_status text)` sólo permite a un administrador activo actualizar el estado. Retorna una lista de una fila `{id,lead_status,lead_updated_at}`. No modifica identidad ni moderación. Rechaza estados inválidos/nulos, cuentas bloqueadas/no administrativas y conversaciones inexistentes. El piloto no permite al vendedor editar estados CRM.

Las tres funciones fijan `search_path` vacío, niegan `EXECUTE` a `PUBLIC`/`anon` y comprueban la cuenta en la base. Los permisos se vuelven a evaluar en cada llamada, incluida la revocación del rol administrativo.

## Interfaz

- `/velox-admin` es un wrapper fino; `features/admin/AdminDashboard.jsx` contiene el panel con dependencias inyectables para pruebas offline.
- La pestaña CRM consume únicamente el RPC de metadatos. No consulta mensajes, no muestra previsualizaciones de cuerpos y no solicita teléfonos de compradores/vendedores.
- El detalle muestra los nombres mínimos, vehículo/zona/estado de publicación, fechas, estado de lead y señales de bloqueo/denuncia.
- La UI distingue carga/error/lista vacía y ofrece reintento. El estado sólo cambia visualmente tras una respuesta válida del servidor. Bloquea envíos duplicados y evita que una respuesta tardía modifique el lead seleccionado posteriormente.
- Al cambiar/cerrar sesión, elimina datos privados visibles e invalida respuestas en vuelo. No realiza consultas asíncronas dentro del callback de autenticación de Supabase.
- Acciones de publicaciones del admin coordinadas con migración `202610030005_owner_listing_management.sql`: usan `set_vehicle_listing_status({target_vehicle,next_status})`. Retirar pasa a `deleted`, conserva medios/conversaciones y permite restaurar. No hay `DELETE` de filas ni limpieza de Storage desde el panel. Un lote informa éxitos y fallos individuales y conserva seleccionados los fallidos. Un borrador requiere el flujo de publicación con crédito.

## Verificación

Pruebas escritas primero y observadas fallando antes de implementar:

- 18 tests SQL/PGlite en `tests/backend/conversation-crm.test.mjs`: 0/18 antes, 18/18 después.
- 6 tests iniciales React/jsdom de CRM fallando antes de la integración, luego pasando.
- 3 regresiones de retiro administrativo escritas antes del reemplazo de acciones, luego pasando.

Resultado focalizado: 18 tests SQL + 9 tests UI, todos pasan. `npm run lint` sin errores ni advertencias después de la integración. El checkpoint agregado del hito debe registrar el resultado final de toda la suite y del build tras terminar los cambios paralelos.

Cobertura SQL: perfiles y vehículos privados siguen privados al comprador; aislamiento de conversaciones propias; admin ajeno sin acceso directo a conversaciones/mensajes; shapes exactos sin teléfono/cuerpo; anónimo, bloqueado, no participante y rol revocado; estados válidos e inválidos; identidad inmutable; inserción con defaults; migración reaplicable con datos preservados.

Cobertura UI: carga segura vía RPC, fallo/reintento, respuesta vacía, doble cambio, cambio de selección durante guardado, logout durante respuesta pendiente, retiro recuperable, fallo parcial de lote y ausencia de confirmación falsa.

No ejecutado: E2E visual/browser, Supabase/PostgREST/Realtime reales ni staging. PGlite comprueba SQL/RLS en un entorno local sintético; jsdom no verifica diseño visual, navegación real o comportamiento de red de Supabase. El piloto requiere esos gates antes de publicar.

## Límite pendiente de moderación

La denuncia se señaliza para revisión pendiente. Este CRM no habilita lectura universal del contenido privado ni una nueva vía para resolver denuncias. Si la moderación necesita contenido, se requiere un diseño y autorización específicos, acceso acotado al caso y trazabilidad; no debe resolverse ampliando `SELECT` global de mensajes. Las políticas administrativas de perfiles previas a esta migración no se redefinieron: esta implementación reduce los datos solicitados por la UI y no afirma revocar otros accesos administrativos ya existentes.
