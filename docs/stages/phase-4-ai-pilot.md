# Fase 4: IA para consultas imprevistas

Autorización del titular, 2026-10-10: hasta US$10 por mes. Todavía no dispone de API.
Esta entrega prepara la conexión y el control de consumo; no acredita calidad
de respuestas de un modelo real ni habilita la promoción general de 90 días.

## Comportamiento

1. Las reglas y las respuestas aprobadas por el vendedor resuelven primero.
2. La API acepta sólo el ID de un mensaje ya persistido y valida su autor.
3. La base comprueba publicación, participantes, bloqueos y asistente habilitado.
4. Se arma una ficha acotada sin domicilio de visita, teléfonos ni historial.
5. Se reserva presupuesto mensual antes de llamar al proveedor. Repetir una
   solicitud nunca vuelve a consumir. Se mantienen además los límites diarios.
6. Un error, límite o falta de información deriva al vendedor. La IA no tiene
   herramientas para confirmar visitas, descuentos, financiación ni ventas.
7. Las visitas siguen requiriendo la disponibilidad y el consentimiento ya
   implementados; las notificaciones permanecen dentro de Velox.

## Control de consumo

Una reserva equivale a US$0,025 del techo conservador: con US$10 se permiten
hasta 400 intentos mensuales de IA, sujetos también a los límites diarios.
No es el precio cobrado por respuesta ni un saldo para vender a los vendedores.
Las respuestas de reglas no gastan este cupo.

Se limita el cuerpo a 8.000 bytes UTF-8 y la salida a 350 tokens de Haiku 4.5.
Tarifas revisadas el 2026-10-10: US$1/M entrada y US$5/M salida. La reserva
incluye margen; no se reintegra ante un timeout o un resultado incierto.
El acumulado sobrevive a borrar mensajes/usuarios y se comparte entre
despliegues que usen la misma base. Renueva el primer día de cada mes UTC.
No permite configurar más de US$10; bajar el tope conserva lo ya reservado.
La revisión de precios vence el 2026-11-10: desde entonces la IA queda
indisponible hasta revisar y actualizar la política en código.

El límite cubre llamadas cursadas por esta aplicación bajo estas tarifas.
No controla compras manuales, otros proyectos o cargos ajenos a este flujo.
El presupuesto del proveedor es una defensa adicional; Vercel documenta que
es un límite blando, por eso no reemplaza la reserva atómica de Velox.

## Activación pendiente

- Aplicar la migración aditiva 202610100001_ai_monthly_budget.sql.
- Habilitar crédito en el proveedor. Vercel permite la identidad OIDC del
  despliegue sin abrir otra cuenta de IA, pero esta cuenta pide verificar tarjeta.
  Confirmar si Haiku 4.5 entra en los modelos del crédito gratuito; no asumirlo.
- Configurar la credencial privada de Supabase sólo en el backend de producción.
- Configurar VELOX_AI_PROVIDER=vercel, modelo anthropic/claude-haiku-4.5,
  presupuesto 10, cupos sugeridos 5 por usuario/día y 30 globales/día.
  Mantener VELOX_AI_ENABLED=false hasta la prueba acotada.
- Alternativa directa: proveedor anthropic, modelo claude-haiku-4-5-20251001
  y ANTHROPIC_API_KEY privada.
- Probar con cuentas y publicaciones sintéticas: pregunta desconocida,
  dato ausente, instrucciones maliciosas, visita, repetición y proveedor caído.
  Revisar respuestas reales y consumo antes de habilitar el piloto general.

Nunca colocar claves en NEXT_PUBLIC_*, el repositorio, documentos o el chat.
Para desactivar: VELOX_AI_ENABLED=false y redesplegar. Conservar el registro de
reservas; no eliminarlo como mecanismo de rollback.

## Evidencia y límites

Pruebas locales: contrato de API, proveedor simulado, límites, privacidad del
contexto, rechazo de llamadas/herramientas, respuestas truncadas y duplicados.
Migración probada con todas las migraciones anteriores en PGlite y en PostgreSQL
17 nativo con dos conexiones simultáneas: un permiso y un rechazo para un cupo
de una sola consulta. No se usaron servicios de IA ni datos reales para esa prueba.
La batería completa y el despliegue se registran en el PR de esta entrega.

Fuentes técnicas:
- https://vercel.com/docs/ai-gateway/authentication-and-byok/oidc
- https://vercel.com/docs/ai-gateway/observability-and-spend/budgets
- https://vercel.com/ai-gateway/models/claude-haiku-4.5
- https://platform.claude.com/docs/en/about-claude/pricing
