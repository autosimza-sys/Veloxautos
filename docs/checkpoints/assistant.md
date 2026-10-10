# Checkpoint: asistente de venta

Fecha: 2026-10-03. Trabajo local en `audit/pilot-hardening`.

## Resultado

- Las reglas de la UI y del servicio usan una sola implementación pura: `lib/assistant-rules.js`.
- Se reconocen tildes, mayúsculas y Unicode descompuesto, incluyendo «kilómetros», «dónde» y «recorrió».
- «¿Sigue haciendo ruidos?» ya no se responde como una pregunta de disponibilidad.
- La disponibilidad se basa en el estado explícito de publicación. Una publicación activa exige confirmar disponibilidad con el vendedor; un estado ausente o desconocido nunca produce un «sí».
- Permuta y financiación distinguen `true`, `false` y datos no informados, tanto en respuestas como en las etiquetas de la UI y el prompt del servicio opcional.
- Los datos faltantes no se transforman en negativas, restricciones de registro ni revisiones mecánicas completadas. La descripción y el checklist se presentan como declaraciones del vendedor.
- Se mantienen kilómetros/precio cero, se formatean cadenas numéricas y se descartan números inválidos o negativos.
- Las preguntas de horario o datos concretos tienen prioridad sobre el verbo genérico «ver».
- El chat se reinicia por identidad del vehículo con una sesión React con `key`. No usa `setState` en un efecto ni IDs basados en reloj; preguntas repetidas reciben IDs únicos y deterministas.
- El campo de pregunta y el historial tienen etiquetas accesibles. El texto aclara que para consultar al vendedor hay que abrir el chat de la publicación.
- La UI no importa `lib/assistant.js`, por lo que el servicio opcional y su configuración quedan fuera de esa dependencia del cliente.

## Pruebas ejecutadas

Desarrollo test-first, con Node 24 y sin dependencias nuevas:

1. Baseline: `node --test tests/assistant.test.mjs` produjo 23 fallos y 4 éxitos sobre las primeras 27 pruebas, antes de cambiar la implementación.
2. Baseline ESLint focalizado: 3 errores (`set-state-in-effect`, dos de `purity`) y 1 warning de dependencias.
3. Regresión adicional: una prueba sobre «¿Puedo ver los kilómetros?» falló antes de corregir la prioridad de la intención concreta.
4. Final: `node --test tests/assistant.test.mjs` — 37/37 pruebas aprobadas.
5. Final: `npx eslint lib/assistant.js lib/assistant-rules.js features/sales-assistant/SalesAssistantSection.jsx tests/assistant.test.mjs` — aprobado, sin desactivar reglas.
6. Final: `git diff --check` — aprobado.

Las pruebas del servicio opcional sustituyen `fetch` y usan una clave ficticia. Comprueban los datos no informados del prompt, fallback ante error y ausencia de solicitudes para preguntas vacías o vehículos faltantes. No hubo solicitudes a Anthropic ni costos.

Node emite el aviso `MODULE_TYPELESS_PACKAGE_JSON` porque el proyecto no declara un tipo de módulo. No impide las pruebas; no se modificó `package.json` desde este bloque de trabajo.

## Límites e integración

- La verificación de compilación completa y smoke UI corresponde al checkpoint general; este checkpoint no los presenta como ejecutados.
- Smoke UI recomendado: múltiples clics rápidos, pregunta escrita, borrador sin enviar, cambio de vehículo y vuelta, actualización de la misma ficha, render sin vehículo. El cambio de vehículo debe eliminar mensajes y borrador previos.
- `mapVehicleFromDb` debe conservar el estado real y los flags ausentes. Se informó al responsable del catálogo para que no convierta datos ausentes a `false` antes de llegar al asistente.
- El RPC SQL `send_message_with_assistant` mantiene una implementación separada en las migraciones existentes. Se informó al responsable de seguridad para revisar la disponibilidad y la normalización del chat real. No se cambiaron migraciones en este bloque.
- No se habilitó ninguna API, integración, servicio, publicación, push ni despliegue. La calidad de respuestas de un modelo externo no se validó; sólo se probó su contrato con dobles locales.
- La clasificación continúa siendo por reglas, sin comprensión general ni garantía de resolver preguntas con varias intenciones. La fuente de verdad es el registro suministrado, que puede haber cambiado desde su carga.

## Archivos

- `lib/assistant.js`
- `lib/assistant-rules.js`
- `features/sales-assistant/SalesAssistantSection.jsx`
- `tests/assistant.test.mjs`
- `docs/checkpoints/assistant.md`
