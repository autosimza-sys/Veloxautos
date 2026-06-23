# Etapa 8 - Asistente de venta

## Cambios realizados

- Se agrego un motor de respuestas basado en reglas y contexto real del vehiculo.
- Responde disponibilidad, permuta, financiacion, ubicacion, horarios, kilometraje, precio y estado.
- Las respuestas automaticas quedan identificadas como `Asistente VELOX`.
- Si la pregunta no coincide con una regla, queda para respuesta humana.
- El vendedor dispone de una configuracion persistente para activar o desactivar el asistente.
- El chat incluye accesos rapidos para las preguntas frecuentes.

## Archivos modificados

- `features/sales-assistant/SalesAssistantSection.jsx`
- `features/chat/ChatPreview.jsx`
- `features/chat/use-chat.js`
- `features/vehicles/vehicle-api.js`
- `app/page.jsx`
- `app/globals.css`

## Migracion

- `supabase/migrations/202606230006_sales_assistant.sql`

## Riesgos detectados

La primera version no usa un modelo de IA externo. Esto reduce costos y evita respuestas inventadas. La futura IA solo debera intervenir cuando ninguna regla pueda resolver la consulta.

## Proximo paso

Agregar agenda interna vinculada a las conversaciones para proponer, aceptar, rechazar y confirmar visitas.
