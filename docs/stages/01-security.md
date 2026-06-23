# Etapa 1 - Seguridad

Estado: completada el 23 de junio de 2026.

## Cambios

- Roles privilegiados no editables desde el cliente.
- Administradores heredados removidos.
- Perfiles privados con lectura propia o administrativa.
- Catalogo servido por RPC con precio y kilometraje ocultos para anonimos.
- Vehiculos completos limitados a propietario o administrador.
- Bucket `vehicle-media` privado.
- URLs publicas antiguas migradas a rutas privadas.
- URLs de imagen firmadas por tiempo limitado.
- Participantes de conversaciones inmutables.
- Mensajes bloqueados cuando una conversacion esta bloqueada.
- Solo `read_at` puede actualizarse en mensajes.
- Variables locales protegidas mediante `.gitignore`.

## Archivos

- `app/page.jsx`
- `.gitignore`
- `supabase/migrations/202606230001_security_hardening.sql`
- `supabase/migrations/202606230002_security_followup.sql`

## Verificacion

- Build Next.js completada.
- Bucket privado: verdadero.
- Administradores heredados: 0.
- Usuario autenticado puede actualizar rol: falso.
- Usuario autenticado puede modificar telefono propio: verdadero.
- Usuario autenticado puede cambiar comprador de conversacion: falso.
- Usuario autenticado puede bloquear conversacion: verdadero.
- Usuario autenticado puede modificar cuerpo de mensaje: falso.
- Usuario autenticado puede marcar mensaje leido: verdadero.
- API anonima:
  - perfiles visibles: 0;
  - filas privadas de vehiculos visibles: 0;
  - precios expuestos: falso;
  - kilometros expuestos: falso.

## Riesgo pendiente

No existe un administrador real. Su alta se implementara mediante una operacion confiable del servidor, nunca mediante una actualizacion desde el navegador.
