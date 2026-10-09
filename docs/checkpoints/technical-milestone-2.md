# Velox: checkpoint técnico 2

Estado histórico: el [candidato local del hito3](release-candidate.md) cierra los límites de intervalos y reintentos que este documento enumera.

3 de octubre de 2026. Continúa el hito1 (`a916845`) en copia aislada. Sin push, despliegue, SQL externo, cuentas nuevas ni gastos.

## Recorridos completados localmente

- Bandeja propia para consultas recibidas y enviadas. Vendedor y comprador abren una conversación existente, leen, responden, bloquean y denuncian. El propio cambio se refresca aunque Realtime falle.
- CRM administrativo con seis estados, metadatos mínimos y mutaciones estrechas. No pide cuerpos de mensajes ni teléfonos. No se amplió la política histórica de perfiles administrativos; tampoco se afirma haberla revocado.
- Inventario del vendedor: editar datos básicos, pausar, reactivar y retirar de modo recuperable. Conserva filas, imágenes, conversaciones y créditos. Admin usa el mismo retiro seguro y reporta fallos parciales de lotes.
- Agenda con propuestas futuras, aceptación por contraparte y confirmación del autor. Reserva por persona e instante exacto, también cuando cambia entre comprador y vendedor. La cancelación libera ambas reservas; un participante activo puede cancelar después de bloquear una conversación o contraparte, sin rehabilitar otras mutaciones.
- Revisión mecánica con solicitud abierta idempotente, staging privado y RPC atómica de informe+archivos+estado final. Valores y resultado explícitos; no copia kilómetros declarados como verificados. Cierre final inmutable y borradores por solicitud conservados ante errores/cambio de selección.
- Integración en página: enlaces a mensajes/inventario, módulos sólo para sesión/rol correspondiente, mecánico/admin acceden a tareas aunque no haya vehículo público seleccionado. Eliminado el bloque público de estadísticas administrativas ficticias/pendientes.

## Contratos y cambios de base

Migraciones nuevas, revisables y no aplicadas externamente:

- `003_conversation_crm`: RPC de bandeja/metadatos CRM y edición de estado administrativa.
- `004_appointment_integrity`: consentimiento explícito, reservas privadas únicas por usuario/instante y transición con estado esperado.
- `005_owner_listing_management`: escritura directa/DELETE de vehículos retirada a browser; edición y estados por RPC whitelist.
- `006_inspection_submission`: solicitud idempotente, archivos y cierre atómico; escritura directa de informes/medios retirada a browser.

El rollout debe coordinar versiones SQL y frontend. No desplegar un cliente antiguo contra los permisos nuevos.

## Evidencia

Ver `verification-2.txt` para conteo final y comando agregado. Se corrieron pruebas SQL reales en PGlite sobre esquema/migraciones versionadas y pruebas React DOM con mocks locales. La suite prohíbe red e ignora credenciales reales.

Hubo revisión independiente de privacidad, permisos y recuperación. Encontró y se corrigió:

- Reapertura de una inspección final que rompía el cierre trazable.
- Borrado de borrador al cambiar/reseleccionar revisión durante error o envío; validación nativa de un archivo ya retenido.
- Mensaje de éxito ocultando recarga fallida, con repetición de solicitud.
- Reservas que no detectaban cruce de roles comprador/vendedor.
- Imposibilidad de cancelar reserva al bloquear la conversación.

No se verificó layout/browser real. No se ejecutaron PostgREST, Auth, Storage firmado, Realtime ni concurrencia entre conexiones PostgreSQL reales. Esos puntos no son PASS.

## Gates obligatorios para salir

1. Acceso autorizado a staging que corresponda al proyecto real. Verificar historia de migraciones, permisos extra y exposición de `velox_private`. El repo público no demuestra la configuración aplicada.
2. Preflight de datos existentes. `004` aborta ante visitas legacy aceptadas/confirmadas sin consentimiento verificable; no lo inventa. `006` aborta ante informes parciales/sin cierre o solicitudes abiertas duplicadas. No se borran ni fusionan datos automáticamente.
3. Respaldo y ensayo de migración, plan de reversión compatible y deploy coordinado. Cortar acceso al RPC legacy de publicación como describe backend-audit.md. No inferir éxito de migraciones anteriores por README.
4. E2E de comprador, vendedor, mecánico, administrador, tercero, anónimo y bloqueado. Dos navegadores y dos conexiones reales para verificar carreras, revocaciones, solicitudes perdidas, firma de archivos y Realtime.
5. QA visual móvil/escritorio, manejo de teclado, formularios completos y navegaciones de ida/vuelta. Las pruebas jsdom no sustituyen esto.
6. Cuota/plan actual de Vercel verificados. No hay autorización de compra/cambio de plan.
7. Reglas de lanzamiento aprobadas: condiciones comerciales/créditos, atención de soporte y moderación, disponibilidad/duración de visitas y datos reales iniciales. El alcance/cifras históricas no autorizan gastos.

## Límites funcionales que siguen explícitos

- Fotos/videos de una publicación existente no se editan en inventario. Los datos básicos sí.
- No hay duración ni buffer de visitas: sólo se impide el mismo instante exacto. No se inventó un intervalo comercial.
- Envío de chat y propuesta de visita no tienen idempotencia de petición persistente; ante respuesta perdida se indica actualizar antes de reintentar, sin reintentos automáticos.
- Denuncias llegan a señalización CRM; no hay lectura universal de contenido privado ni un flujo completo de resolución/moderación.
- Informe final no se sobrescribe. Una corrección posterior necesita procedimiento de revisión/versionado autorizado.
- Archivos staged tras fallo quedan privados y pueden ser huérfanos; limpieza posterior debe comprobar referencias antes de borrar.
- No se considera lista la salida a producción mientras gates externos permanezcan pendientes.

## Reproducir y continuar

```sh
npm ci --ignore-scripts
npm run verify
npm audit --omit=dev
```

El script `scripts/staging-preflight.sql` es sólo lectura y no repara datos. Usarlo exclusivamente dentro de un proyecto staging autorizado. No pedir contraseñas/keys en chat ni copiar secretos al repositorio.

Próximo paso útil: ensayar configuración/migraciones y E2E en staging real con permisos y herramientas adecuadas, conservando estos checkpoints. No saltar a producción para intentar probar.
