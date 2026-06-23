# Etapa 9 - Agenda interna

## Cambios realizados

- Se agregaron visitas vinculadas a cada conversacion.
- Comprador o vendedor pueden proponer fecha, hora y lugar.
- La otra parte puede aceptar o rechazar.
- Una propuesta aceptada puede confirmarse.
- Los cambios se actualizan en tiempo real dentro del chat.
- No se agrego dependencia con Google Calendar.

## Archivos modificados

- `features/agenda/AgendaPanel.jsx`
- `features/agenda/use-appointments.js`
- `features/chat/ChatPreview.jsx`
- `app/globals.css`

## Migracion

- `supabase/migrations/202606230007_appointments.sql`

## Riesgos detectados

Todavia no hay recordatorios por email o push. La estructura ya permite agregar notificaciones sin modificar el modelo de citas.

## Proximo paso

Implementar la estructura y experiencia de solicitud, asignacion e informe de revision mecanica VELOX.
