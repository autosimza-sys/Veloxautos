# Etapa 7 - Chat real

## Cambios realizados

- Se elimino el chat de demostracion.
- El comprador crea o recupera una conversacion real por vehiculo.
- Los mensajes se guardan en Supabase y se actualizan con Realtime.
- Se agregaron historial, fecha, estado enviado/leido, bloqueo y denuncias.
- No se deriva la conversacion a WhatsApp.

## Archivos modificados

- `features/chat/ChatPreview.jsx`
- `features/chat/use-chat.js`
- `app/page.jsx`
- `app/globals.css`

## Migracion

- `supabase/migrations/202606230005_chat_realtime.sql`

## Riesgos detectados

Las notificaciones fuera de la pagina todavia no estan implementadas. El historial y el tiempo real funcionan dentro de la aplicacion; email y push quedan para una etapa posterior.

## Proximo paso

Agregar el asistente de venta basado en reglas y contexto del vehiculo dentro del chat real.
