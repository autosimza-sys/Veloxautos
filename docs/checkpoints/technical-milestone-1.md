# Velox: checkpoint técnico 1

Fecha: 3 de octubre de 2026. Cambios aislados, sin push ni deploy.

Estado histórico del primer hito. El [hito2](technical-milestone-2.md) completa varios recorridos indicados aquí como pendientes; los gates externos siguen abiertos.

## Base y alcance

- Base pública: `autosimza-sys/Veloxautos`, `main`, `5dacc7c125234d8d3e98840c4dec506818510180`.
- Rama local: `audit/pilot-hardening`.
- También se obtuvo y comparó `codex/velox-assisted-platform` (`24a4bbcf1e4f293aade4e5d282506aff22722c96`). Su diff con main contiene versiones anteriores de frontend; no se fusionó a ciegas ni se sobrescribieron archivos externos.
- El sitio desplegado no puede darse por idéntico a main: la copia de `app/page.jsx` del commit base terminaba físicamente a mitad de `onClose` y no compilaba.
- No había tests, AGENTS.md ni skills ECC en el checkout. Se aplicó disciplina de reproducción, pruebas y revisión, sin afirmar que se ejecutaron herramientas ausentes.

## Cambios

1. Restaurado JSX truncado y eliminada configuración ESLint de Next obsoleta. Corregido efecto de autenticación admin sin desactivar reglas.
2. Catálogo vacío/error sin stock ficticio. Placeholder neutral para fotos faltantes. Precios y kilómetros se descartan al cambiar de sesión; respuestas viejas no restauran datos privados. Fotos firmadas en una llamada por catálogo, en vez de una por foto.
3. Modal con Escape, Back/Forward, retención/restauración de foco y bloqueo de scroll. CTA para chatear permite registrarse. Se quitó botón editar que no hacía nada.
4. Auth con evento síncrono y carga de perfil fuera del callback, protección contra perfil tardío tras logout, envío único, contraseña retirada del formulario tras éxito, errores recuperables. No se intenta entrar automáticamente cuando falta confirmación de correo.
5. Créditos separados por usuario, vencimiento respetado y estado de error sin atribuirlo falsamente a migraciones pendientes. No se habilita publicación sin saldo confirmado.
6. Asistente de venta con reglas puras compartidas, tildes y datos desconocidos; estado real en disponibilidad. No se activó servicio externo de IA.
7. Publicación con 0% inicial, autorevisión explícita, validación de campos/MIME/tamaño, protección de doble envío, liberación de previews y borrador conservado ante error.
8. Migración001: RLS media/chat/inspecciones y escalación de rol corregidas. Migración002: vehículo, vínculos de medios, débito y registro de idempotencia en una transacción.
9. Frontend usa nueva RPC y rutas por hash de contenido. Reintentos conservan el UUID de la intención; se guarda sólo huella y UUID en sessionStorage para reconstruir el mismo intento tras recargar. Si el navegador bloquea storage, sólo hay fallback de memoria. No se conserva el borrador ni los archivos: el usuario debe reingresarlos idénticos tras recargar.
10. No se borran imágenes tras respuesta incierta: el commit puede haber ocurrido. Se requiere posterior limpieza segura de archivos huérfanos, identificando primero cuáles no tienen referencias. No ejecutar un borrado indiscriminado.
11. Next actualizado de 16.2.6 a 16.3.8, dependencias fijadas y transitivas vulnerables actualizadas. Scripts de test/verify y CI reproducible preparados. CI aún no se ejecutó en GitHub.

## Evidencia y límites

Baseline original:
- `npm ci --ignore-scripts --cache /tmp/velox-npm-cache`: PASS. El primer intento con caché por defecto falló por ruta no escribible; no fue fallo del proyecto.
- Lint: FAIL, 6 errores y 2 warnings.
- Build: FAIL, `app/page.jsx:175`, Expected '}', got eof.
- Tests originales: no existían.
- Pruebas nuevas antes de corrección: reglas 23 fallos/27, publicación 10/10 fallos; seguridad SQL 14 fallos/23 al reproducir el primer lote. Los casos añadidos después amplían cobertura.
- Audit prod previo: 5 avisos, incluyendo 1 crítico y 3 altos. No prueba explotabilidad del despliegue estático.

Verificación integrada: ver `verification.txt` junto a este checkpoint. Todos los tests utilizan fixtures locales y direcciones reservadas. SQL se ejecuta en PGlite con Auth/Storage simulados, no en Supabase externo.

Audit final de producción: 0 vulnerabilidades reportadas al 3 de octubre de 2026. Audit completo conserva 5 avisos altos del árbol de herramientas ESLint/fast-glob/micromatch/braces, una vulnerabilidad de entrada de patrones anidados sin versión upstream corregida compatible. No se distribuyen en el cliente. No se aplicó el downgrade sugerido de eslint-config-next a 14 porque rompería la alineación de Next 16. Revisar upstream y usar patrones de proyecto confiables.

QA visual/E2E: BLOQUEADO, no PASS. Chromium no pudo crear sockets IPC, incluso al intentar la ejecución permitida fuera de sandbox. El navegador cloud rechazó la ruta localhost con ERR_BLOCKED_BY_CLIENT. No se intentó eludirlo. Se conservan 4 pruebas Playwright para un entorno compatible; los comportamientos clave se comprobaron con React DOM/jsdom, que no prueba layout real.

Escaneo de secretos en fuentes: no se encontró credencial real ni `.env.local`; única coincidencia fue la clave explícitamente ficticia de un test con fetch simulado. No hubo carga de datos reales ni llamadas a API de pago.

## Reproducir

```sh
npm ci --ignore-scripts
npm run verify
npm audit --omit=dev
# En un entorno con Chromium permitido:
npx playwright install --with-deps chromium
npm run test:e2e
# Para usar Chromium ya instalado:
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
# Reproducir los defectos SQL previos (salida no cero esperada):
VELOX_TEST_LEGACY=1 node --test tests/backend/security.test.mjs
```

No usar credenciales de producción para pruebas. Playwright fuerza variables Supabase vacías. Para probar datos/configuración reales se necesita staging autorizado.

## Gates antes de salir

Verificar la cuota y el plan actuales del hosting antes de publicar; no inferir disponibilidad ni comprar capacidad sin autorización.


- Validar esquema REAL/migraciones/RLS/grants/buckets y sus políticas adicionales. Un permiso permisivo agregado fuera del repo puede invalidar garantías.
- Aplicar migraciones a staging, desplegar frontend compatible y revocar coordinadamente el RPC legacy antes de considerar cerrada atomicidad. El SQL exacto y orden están en backend-audit.md.
- Probar Auth/email, Storage firmado, Realtime, dos vendedores/compradores simultáneos y concurrencia real; PGlite no lo sustituye.
- Verificación visual móvil/escritorio, E2E en browser apto y accesibilidad final.
- Bandeja vendedor: falta recorrido completo para responder al comprador. CRM requiere definir/crear `lead_status` y permisos mínimos; quedó marcado pendiente sin ampliar lectura privada.
- Agenda: confirmar prevención de solapamientos y estados/acciones por participante. Edición/pausa/cierre de publicaciones por vendedor sigue pendiente.
- Revisión de condiciones comerciales, consentimiento/privacidad, soporte y datos reales de lanzamiento. No hay autorización para gastos ni un alcance comercial validado por esta auditoría.
- Acceso de publicación y aprobación de deploy. Ningún cambio de este hito está publicado.

## Recuperación y próximo paso

Conservar branch y archivos; no resetear trabajo. Ejecutar `git status`, leer este checkpoint y `backend-audit.md`, repetir `npm run verify` antes de nuevos cambios. Hito siguiente: bandeja vendedor/CRM y agenda, en copia aislada, con la misma disciplina de pruebas. Producción permanece fuera de alcance hasta autorización.
