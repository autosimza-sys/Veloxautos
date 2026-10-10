# Velox: candidato local para staging

4 de octubre de 2026. Candidato revisado tras comparar políticas y funciones con un esquema existente. **No es una autorización de salida a producción.** Este trabajo de código no aplicó cambios a bases externas ni publicó el frontend.

El [delta de permisos](policy-drift.md) reproduce políticas adicionales que invalidaban las garantías del candidato anterior. Restaura la comprobación de administrador activo, retira seis políticas identificadas por nombre y configura privacidad y límites de ingestión de los dos buckets. No modifica roles, archivos ni consentimiento de visitas.

## Qué quedó cerrado

- Chat: `send_message_idempotent` y registro privado por autor/UUID. Una respuesta perdida y su reintento producen el mismo mensaje y respuesta automática. Cliente, fingerprint SQL y asistente normalizan NFC/NFD consistentemente. Se preserva el orden pregunta → respuesta sin depender de UUIDs aleatorios.
- Propuestas: `propose_appointment` con UUID persistente, payload comparado, replay del estado actual y protección contra recreación tras borrado administrativo.
- Agenda: duración explícita requerida, sin valor comercial precargado ni buffer. Exclusión GiST por persona/intervalo `[inicio, fin)`, incluidas intersecciones parciales, contención, cruce de roles y fronteras adyacentes. Cancelar libera ambas reservas; se conserva la cancelación segura después de bloqueos.
- Persistencia: sólo hashes/UUIDs en sessionStorage. Fallo antes de persistir impide enviar; error de limpieza posterior al ACK conserva el éxito, avisa y permite una nueva intención segura. Recuperación de la misma pestaña comprobada con memoria de módulo realmente aislada.
- Historia: visitas canceladas/rechazadas pueden conservar duración ausente con texto explícito. No se inventan minutos ni consentimiento para visitas activas legacy.
- Registro: elegir cuenta Registrado se conserva; un rol desconocido nunca se convierte en vendedor o admin.
- Eficiencia: firma de medios en lote (fixture de 80 fotos: una llamada de firma); carga diferida de módulos de cuenta; índices de búsqueda del catálogo y medios. No se afirma una mejora de latencia de producción sin medirla allí.

## Evidencia del candidato

Ver `verification-policy-drift.txt` para la regresión completa de este delta (lint, 469/469 tests y build), `verification-preflight-final.txt` para la comprobación específica de los últimos ajustes del preflight y `verification-candidate.txt` para el resultado histórico del 3 de octubre. Después de la regresión completa sólo se ajustó el preflight de lectura y sus pruebas; no cambió el código de la aplicación ni sus dependencias. Los procesos de tests se limitan a uno simultáneo para no agotar memoria con varias instancias PGlite; la suite bloquea fetch externo y elimina credenciales de servicios.

- Pruebas reales de SQL/RLS/GiST en PostgreSQL embebido PGlite.
- React DOM/jsdom, helpers de persistencia, fallos de red/ACK y aislamiento de sesiones.
- Integración cliente real de chat → SQL con respuesta perdida después del commit, recarga y recuperación.
- Corte de permisos legacy probado: deniega rutas antiguas y permite mensaje/publicación nuevos a través de wrappers.
- Revisión independiente sin bloqueadores críticos abiertos en el alcance local.
- Build estático para `/` y `/velox-admin`; no se incluyeron endpoints Anthropic ni identificadores de claves privadas en los bundles inspeccionados.
- Audit de dependencias de producción: 0 avisos al cerrar. Permanecen 5 avisos transitivos de herramientas ESLint sin solución compatible verificada; no se confunden con dependencias de cliente.

No se contaron como aprobados: browser/E2E visual, Supabase Auth/Storage/PostgREST/Realtime reales, rendimiento de hosting ni concurrencia entre conexiones PostgreSQL independientes.

## Secuencia de staging y gates pendientes

1. Confirmar acceso y proyecto staging correcto; mantener credenciales privadas fuera de archivos públicos y chats. `.env.example` muestra sólo las dos variables públicas del cliente. Nunca usar service_role en NEXT_PUBLIC.
2. Ejecutar `scripts/staging-preflight.sql` **antes de aplicar la primera migración**. Revisar todos los estados BLOCKED, REVIEW y NOT_INSTALLED, historial, respaldos, políticas, owners y grants. Las migraciones tienen commits separados: un fallo en 004 no revierte cambios anteriores. Mantener `velox_private` fuera de esquemas expuestos por PostgREST. Un inventario sin alertas conocidas no sustituye revisión ni pruebas reales.
3. Verificar buckets privados, allowlists de MIME, límites de tamaño/cuota y controles antiabuso/rate-limit en el servicio real. El delta configura un máximo de 25 MiB para medios, preservando valores anteriores más estrictos; las fotos conservan el máximo de 3 MiB en el RPC. Un límite por archivo no impide el abuso por cantidad de archivos ni reemplaza cuotas/rate-limit.
4. Resolver datos legacy que abortan preflights: consentimientos faltantes, informes parciales, solicitudes abiertas duplicadas, visitas activas sin duración o reservas incompatibles. No borrar ni inventar datos para hacer pasar la migración.
5. Ensayar las migraciones nuevas 202610030001–009 y `20261004040715_reconcile_policy_drift.sql` con frontend compatible. No reejecutar las migraciones históricas 20260623: algunas no son idempotentes y una degrada administradores. 008 exige disponibilidad/permiso de `btree_gist`; se probó localmente también instalada en schema `extensions`. No eludir un permiso denegado.
6. Después de verificar el cliente nuevo, ejecutar por separado `scripts/finalize-client-cutover.sql` en staging. Retira EXECUTE legacy de publicación/chat e INSERT directo de mensajes, incluidas columnas. No ejecutarlo en producción sin aprobación del release; los clientes antiguos deberán recargar.
7. Probar comprador, vendedor, mecánico, admin, tercero, anónimo y bloqueado con cuentas sintéticas reales. Ensayar pérdida de respuesta, replay, emails, firma/caducidad de medios, Realtime y permisos revocados.
8. Probar dos conexiones independientes aceptando intervalos superpuestos y dos envíos/propuestas del mismo autor/UUID a la vez. Comprobar espera, rollback, ningún doble registro y liberación correcta al cancelar.
9. E2E visual móvil/escritorio: teclado/foco/Back, formularios, navegación repetida, carga de módulos diferidos y comportamiento offline. La ruta de navegador local estuvo bloqueada; jsdom no reemplaza este gate.
10. Verificar cuota/plan actuales del hosting y reglas comerciales/soporte. Una configuración global de duración, buffers y paquetes de créditos requiere decisión explícita. No hay autorización de compra o cambio de plan.
11. Sólo tras esos resultados y la aprobación de publicación se puede considerar “listo para salir”. Conservar rollback/backups y comprobar commit desplegado + estado real del servicio.

## Límites que no se ocultaron

- sessionStorage sobrevive a recargas de una pestaña; no garantiza recuperar UUID al borrar datos, cerrar la pestaña o cambiar dispositivo. Cambiar contenido/fecha/duración es otra intención.
- Inventario no edita imágenes/videos existentes; sí datos básicos y estados recuperables.
- No se amplió moderación a mensajes privados universales. El flujo de resolución de denuncias requiere definición acotada.
- Un informe mecánico final no se sobrescribe. Su corrección requiere revisión/versionado autorizado.
- Los archivos staged no referenciados quedan privados. Preparar limpieza controlada con chequeo de referencias, sin borrado indiscriminado.
- No hay inferencia de disponibilidad comercial, validación de identidad profesional ni aprobación legal derivadas de los tests.

## Reproducir

```sh
npm ci --ignore-scripts
npm run verify
npm audit --omit=dev
# En un entorno que permita Chromium:
npx playwright install --with-deps chromium
npm run test:e2e
```

Para publicar más adelante, usar el snapshot/patch final o la rama candidata de un solo commit basada en main. No copiar `.env.local`, caches, fixtures con información real ni historia de trabajo privada al repositorio público.

Fuentes de implementación: [Next.js lazy loading](https://nextjs.org/docs/app/guides/lazy-loading), [PostgreSQL índices multicolumna](https://www.postgresql.org/docs/current/indexes-multicolumn.html). Los resultados de rendimiento/seguridad de producción requieren verificación en ese entorno.
