# Agenda de visitas: checkpoint local

Fecha: 3 de octubre de 2026. Rama local: `audit/pilot-hardening`.

## Resultado

Agenda corregida y verificada de forma aislada. No se aplicaron migraciones a Supabase, no se publicó ni desplegó, no se gastó dinero y no se realizó QA de navegador. La base de pruebas es PGlite con usuarios y datos sintéticos; la red queda deshabilitada por `tests/no-live-services.mjs`.

### Comportamiento definido

1. Cualquiera de los dos participantes puede proponer fecha/hora futura y lugar no vacío. El autor de la propuesta no puede aceptarla ni rechazarla.
2. La contraparte puede aceptar o rechazar. Aceptar registra su consentimiento y reserva ese instante; todavía falta la confirmación final del autor.
3. El autor confirma la visita aceptada. `confirmed` exige consentimiento de comprador y vendedor. El servidor genera los timestamps; el navegador no los puede escribir.
4. Cualquiera puede cancelar una visita propuesta, aceptada o confirmada. Rechazada/cancelada son estados terminales. Para cambiar fecha/lugar se cancela y se crea otra propuesta.
5. Aceptar/confirmar un horario pasado está prohibido. Las visitas vencidas todavía pueden rechazarse/cancelarse para cerrar pendientes.
6. Una conversación bloqueada o una cuenta bloqueada de cualquiera de las partes impide proponer, aceptar, confirmar y rechazar. Se conserva una salida segura: un participante activo autenticado puede cancelar visitas vigentes aunque la conversación o la contraparte esté bloqueada, liberando ambas reservas. Un caller bloqueado nunca puede modificar visitas. Usuarios externos y administradores que no participan no acceden a esta agenda privada. Una cuenta bloqueada no puede leerla.

## Persistencia y concurrencia

Archivo: `supabase/migrations/202610030004_appointment_integrity.sql`.

- Copia server-side de comprador/vendedor desde la conversación; identidad, autor, conversación, fecha, lugar y timestamps de consentimiento no editables por clientes.
- Reemplaza actualizaciones directas por `transition_appointment(target_appointment, expected_status, next_status)`, disponible sólo para usuarios autenticados participantes.
- La transición bloquea la fila con `FOR UPDATE`; un estado esperado obsoleto no pisa la decisión nueva.
- El trigger valida estados, autoría y cuentas; bloquea las filas de conversación y perfiles en modo compartido mientras comprueba los valores bloqueados, evitando una comprobación de autorización previa obsoleta.
- Tabla privada `velox_private.appointment_reservations` con dos filas por visita aceptada/confirmada y `UNIQUE(user_id, scheduled_at)`: PostgreSQL impide dos reservas de una misma persona en exactamente el mismo instante, incluso si es compradora en una conversación y vendedora en otra. Las altas se ordenan por participante y se realizan dentro de la misma transacción que el estado/consentimiento. Ningún cliente, ni administrador desde el navegador, puede leer o modificar esta tabla. Los índices parciales originales por comprador/vendedor se conservan como defensa redundante. La garantía descansa en claves únicas, no en una consulta de disponibilidad susceptible a carreras.
- Cancelar libera la reserva. Un conflicto revierte estado y consentimiento del segundo intento juntos.
- `timestamptz` compara instantes: 15:00 UTC y 12:00 UTC−03 se consideran el mismo horario.

### Límite deliberado

El esquema no tiene duración de visita. No se asumieron 30, 60 minutos ni otro intervalo comercial. Distintos instantes, incluso separados por un minuto, son válidos. El control implementado cubre coincidencias exactas de cualquier participante, incluido el cruce de roles; no es todavía un calendario de intervalos, tiempos de traslado o disponibilidad horaria. Definir una duración/buffer y tratar solapamientos por intervalo requiere una decisión de producto y una migración posterior.

## UI, fallos y recuperación

Archivos: `features/agenda/AgendaPanel.jsx`, `use-appointments.js`, `appointment-model.js`.

- Fecha `datetime-local` interpretada en la zona local del navegador, con nombre IANA visible y formato `es-AR`. No se presupone que el dispositivo esté en Mendoza.
- Rechaza valores vacíos, fechas imposibles y horas locales inexistentes durante un salto DST. Se conserva el comportamiento estándar de `Date` para una hora repetida al finalizar DST; el instante convertido queda almacenado en UTC.
- Botones por participante/estado, Cancelar para estados vigentes incluso en conversaciones bloqueadas, confirmaciones de ambas partes visibles, texto de espera y hora vencida. `canCancel` se separa de las demás mutaciones. El servidor comprueba que el caller siga activo; la UI no infiere el estado privado de la contraparte.
- Busy tanto en controles como en una referencia síncrona para impedir doble clic antes del siguiente render.
- Carga inicial, recarga después de mutaciones y botón Actualizar agenda funcionan sin Realtime. Realtime sólo mejora la actualización; no es requisito para ver un cambio propio.
- Las respuestas tardías del chat/cuenta anterior no restauran datos ni borradores privados. Las lecturas anteriores a una escritura no pisan el resultado reciente.
- Los errores de red, permiso, estado obsoleto y reserva ocupada se muestran; un RPC sin fila autoritativa válida no anuncia éxito.
- Si una inserción confirmó éxito pero falló la recarga, se cierra el formulario para no sugerir un segundo envío. Si se perdió la respuesta de la inserción, se indica actualizar antes de reintentar. No se agregó un identificador de idempotencia de propuesta para reintentos tras respuesta perdida.

## Verificación local

Tests-first: la primera suite backend registró 25 fallos de 26 casos; incluía aceptación de fechas pasadas/infinito, lugar vacío, privilegios excesivos y ausencia del nuevo contrato. Luego se incorporaron más regresiones. La revisión detectó un hueco entre roles: los dos casos comprador→vendedor y vendedor→comprador fallaron antes de incorporar la tabla privada de reservas y pasaron después. Otra revisión detectó reservas sin salida al bloquear la conversación/contraparte: ocho regresiones fallaron antes del ajuste de cancelación segura y pasaron después.

Verificación final focalizada:

- 83/83 pruebas: 50 backend PGlite y 33 UI/modelo/hook jsdom/tsx.
- ESLint focalizado: PASS.
- `git diff --check`: PASS.

Comandos:

```sh
node --import ./tests/no-live-services.mjs --import tsx --test tests/appointments*.test.mjs tests/backend/appointments.test.mjs
npx eslint features/agenda tests/appointments.test.mjs tests/backend/appointments.test.mjs
git diff --check
```

Backend cubre participantes/autores, estados legales y terminales, consentimiento de ambos sentidos, rechazos anónimos/ajenos/admin, cuentas/conversación bloqueadas, cancelación segura del participante activo que libera ambos horarios y permite otra conversación, rechazo del caller bloqueado, campos inmutables, horarios inválidos/vencidos, reserva por participante entre conversaciones y cruzando roles, lifecycle/privilegios de la tabla privada, UTC offsets equivalentes, rollback de consentimiento ante choque y reaplicación de la migración. UI cubre permisos, doble clic, errores, estado obsoleto, lecturas/mutaciones tardías, cambio de cuenta/conversación, logout, fallos de Realtime/refresh y timezone/DST.

PGlite no acredita una prueba con conexiones PostgreSQL independientes en paralelo. Se verificaron los índices únicos reales y su efecto transaccional secuencial; la prueba concurrente multi-sesión queda como gate explícito de staging. Tampoco se afirma verificación visual o de dispositivos reales.

## Gates antes de staging/publicación

1. Revisar el estado real del esquema y respaldar datos. Esta migración y el frontend RPC-aware deben desplegarse de forma coordinada: el cliente anterior usa UPDATE directo, permiso que se retira.
2. Inspeccionar visitas legacy `accepted`/`confirmed`. El flujo anterior no permite inferir quién consintió. La migración aborta si faltan consentimientos verificables; no los inventa, no cancela visitas y no borra datos. Es necesario revisar cada caso y acordar reconfirmación/cancelación con las partes mediante un procedimiento autorizado antes del rollout.
3. Revisar datos históricos inválidos y reservas exactas duplicadas. Las restricciones/índices detienen la migración si existen. Resolver con revisión de datos autorizada, nunca eliminando conflictos automáticamente.
4. Ejecutar migraciones y suite completa sobre staging con cuentas sintéticas. Comprobar RLS usando sesiones reales de comprador/vendedor/tercero/bloqueado.
5. Probar dos sesiones independientes aceptando visitas para el mismo comprador y luego para el mismo vendedor al mismo instante. Mantener la primera transacción abierta: la otra debe esperar y, tras el commit, fallar sin cambiar la propuesta ni su consentimiento. Repetir cruzando comprador/vendedor entre conversaciones, con offsets equivalentes, cancelación que libera ambas reservas, doble transición sobre una misma visita y bloqueo concurrente de cuenta/conversación. Verificar que el participante activo pueda cancelar tras el bloqueo y que el caller bloqueado siga denegado.
6. QA visual con Realtime apagado y pérdida de red: proponer → aceptar contraparte → confirmar autor → cancelar, navegación rápida entre chats, logout, recarga, dispositivos en zonas distintas, errores legibles y ausencia de doble envío.

Consulta inicial de preflight (sólo lectura, compatible con esquema legacy):

```sql
select a.id, a.conversation_id, a.proposed_by, a.scheduled_at, a.status,
       c.buyer_id, c.seller_id
from public.appointments a
join public.conversations c on c.id = a.conversation_id
where a.status in ('accepted', 'confirmed')
order by a.scheduled_at;
```
