# Reconciliación de permisos observados

4 de octubre de 2026. Preparación y comprobación local. No se ejecutó este delta en un servicio real.

## Problema reproducido

Las políticas permisivas de PostgreSQL se combinan con OR. Por eso una política adicional puede dejar sin efecto la restricción de otra, aunque la tabla tenga RLS. Un esquema existente tenía nueve políticas adicionales y una versión de `is_admin()` que ya no comprobaba `is_blocked`.

El fixture `tests/backend/fixtures/observed-policy-drift.sql` conserva sólo definiciones técnicas de ese drift, sin cuentas, datos personales, identificadores de proyecto ni credenciales. Se instala después de las migraciones históricas y antes de las candidatas. Nueve de las once comprobaciones iniciales fallaron antes de implementar el delta.

## Delta acotado

`20261004040715_reconcile_policy_drift.sql`:

- Restaura `is_admin()` con comprobación de cuenta activa, nombres cualificados y `search_path` vacío. No cambia el rol de ninguna persona.
- Activa RLS en `plans` también para una instalación nueva. El esquema observado ya lo tenía activo; el esquema histórico local no. No agrega políticas ni permisos de cliente para esta tabla de configuración.
- Retira por nombre `vehicle_media_public_read` y `vehicle_media_auth_upload` de `storage.objects`. La segunda permitía subir a la carpeta propia a cualquier cuenta autenticada, incluidos compradores o vendedores bloqueados. Conserva las políticas de propietario activo.
- Retira `admin_select_messages`, `admin_select_conversations`, `admin_update_conversations` y `admin_update_vehicles`. Conserva el CRM y las operaciones administrativas acotadas del nuevo cliente; un administrador que participa en un chat sigue viendo ese chat.
- Conserva las tres políticas redundantes de perfiles (`profiles_admin_read_all`, `profiles_own_read`, `profiles_own_update`) y cualquier política ajena no identificada. Su presencia no autoriza automáticamente su definición: el preflight compara las expresiones y muestra cambios para revisión.
- Hace privados `vehicle-media` e `inspection-media`, porque las URLs de un bucket público evitan las restricciones RLS de lectura. El frontend correspondiente usa firmas temporales.
- Establece un máximo de ingestión de 25 MiB y los seis MIME ya aceptados por el producto. Conserva límites y listas anteriores más restrictivos; expande `image/*` sólo a las imágenes soportadas. Una configuración vacía/incompatible o un bucket ausente aborta la transacción, sin ampliar permisos automáticamente.

Las pruebas SQL verifican lectura de objetos activos frente a pausados/no vinculados, subidas por rol/bloqueo/carpeta, aislamiento de chats, CRM, conservación de roles y políticas ajenas, repetición del delta y rollback ante configuración incompatible. PGlite comprueba las propiedades SQL de los buckets; no acredita que un servicio Storage real haya rechazado una petición HTTP.

## Preflight y secuencia

Ejecutar primero el preflight de sólo lectura. Sus filas usan PASS, BLOCKED, REVIEW o NOT_INSTALLED. Inventaría todas las tablas/políticas/grants relevantes y mantiene visibles las definiciones divergentes. No borra políticas desconocidas ni confunde datos ocultos por RLS con ausencia de problemas.

También comprueba los ocho triggers críticos: presencia, habilitación, tabla, función vinculada y definición. Que exista el cuerpo de un guard no demuestra que el trigger lo ejecute. Las listas MIME con elementos NULL quedan bloqueadas. La revisión independiente reprodujo ambos huecos del preflight antes de cerrar sus regresiones.

Validación: regresión completa de 469 casos, lint y build aprobados; tras esos dos ajustes del preflight, sus 12 pruebas afectadas y lint se verificaron nuevamente. Los comandos y resultados constan en `verification-policy-drift.txt` y `verification-preflight-final.txt`. El último ajuste no cambió aplicación, migraciones ni dependencias.

Resolver todos los blockers y revisar cada diferencia antes de aplicar **cualquier** migración candidata. Las migraciones contienen commits separados. En particular, 004 se detiene ante consentimiento legacy no verificable y 008 ante visitas activas sin duración; no debe usarse ese fallo tardío como sustituto del preflight. Una fecha de visita pasada no demuestra cancelación ni consentimiento y no cambia el gate.

No reejecutar el esquema ni migraciones históricas sobre la base existente para corregir drift. La migración histórica 202606230001 degrada todos los administradores a registrados; otras contienen CREATE no idempotentes. La ausencia de historial exige reconciliación revisada con los objetos actuales, no una repetición automática.

Ensayar el cliente, migraciones nuevas, permisos de Storage y corte separado `finalize-client-cutover.sql` en staging. Revisar compatibilidad de URLs firmadas, subida de tipos/tamaños admitidos y funciones administrativas. Mantener respaldos y una estrategia de rollback; estos archivos no son una autorización para ejecutar cambios remotos.

## Gates que siguen abiertos

Auth, PostgREST, Storage, Realtime, concurrencia entre conexiones independientes y navegador requieren evidencia real. La preparación de un stack nativo oficial se detuvo por resolución de hosts de descarga; no se modificaron los controles de red para superarlo. No se afirma que los checks de SQL sustituyan esos servicios.

El máximo por archivo no evita abuso por volumen de cargas. Siguen pendientes cuotas y controles antiabuso del entorno. Los objetos no vinculados se preservan: su limpieza necesita comprobar referencias y autorización, nunca un borrado general.
