# Créditos gratuitos con reposición — 13/10/2026

Federico definió un saldo que disminuye por uso y se repone gratis durante la promoción común de 90 días. Reponer créditos no abre otros 90 días. El ejemplo de 100 iniciales y 50 por publicación todavía requiere confirmación; no se aprobaron precios en pesos ni una fecha de lanzamiento.

## Implementación

- La migración `202610130002_promotional_credit_refill.sql` agrega costo por publicación, reposición y revisión de política. Los valores por defecto conservan el comportamiento anterior: 1 crédito y sin reposición. Aplicar la migración no inicia una campaña ni cambia saldos.
- Administración guarda la regla antes de lanzar. Inicio y extensión siguen siendo decisiones explícitas. Al iniciar, el costo y la reposición quedan fijos durante esa campaña y sus extensiones. Se validan lotes suficientes para cubrir una publicación.
- Durante `[inicio, fin)`, si falta saldo se suma un lote del rol; si la publicación deja cero se suma un lote inmediatamente. Los movimientos `promo_refill` y `publication` se guardan por separado. `used` conserva el consumo acumulado. No hay recarga por consultar, entrar o salir de la cuenta.
- Se preservan saldos históricos superiores al lote aprobado. Todas las cuentas nuevas comparten el fin de campaña. No se concede vigencia propia de 90 días a altas tardías.
- Reintentar una operación confirmada devuelve el mismo auto, incluso después del vencimiento. Errores transaccionales revierten publicación, débito y recargas. Compradores, administradores sin rol vendedor y cuentas bloqueadas no pueden usar créditos para publicar.
- La interfaz muestra costo antes de confirmar, saldo, usados acumulados y los últimos 20 movimientos privados. Las FAQ de créditos explican el comportamiento sin fijar números pendientes.
- La migración `202610130003_credit_refill_faq.sql` cambia sólo cuatro respuestas del catálogo. No altera la evidencia histórica de 720 consultas.

## Validación

22 casos nuevos de backend y 7 casos de interfaz sin servicios externos verifican permisos, saldos, historial, fechas y recargas. La prueba de FAQ compara la respuesta de la base con el catálogo de la interfaz.

Ensayo PostgreSQL 17.11 local con conexiones independientes: 14 comprobaciones aprobadas. Veinte llamadas con diez identificadores únicos generaron diez autos, diez débitos de 50 y cinco recargas de 100; saldo final 100. Se probaron vencimiento mientras una llamada esperaba un bloqueo, alta concurrente al inicio y reversión por fallo de medios. No se realizaron llamadas de IA ni pagos.

Respaldo previo: `backup-20261013-035808`, finalizado 07:00:43 UTC; SHA256 de base `36db00c369bb5e1b054941e4edc323a3403442b6a997f88b127b60358dd4814e`; 24 objetos de medios con hashes locales verificados. Este respaldo concreto aún no tiene ensayo de restauración completo; el ensayo de migración usa una copia local restaurada previamente.

## Publicación y recuperación

Aplicar ambas migraciones después de las verificaciones; desplegar luego la interfaz compatible. Comparar cantidad de usuarios, autos y medios, además de hashes de saldos y movimientos, para comprobar que la ampliación no cambió datos comerciales.

Si hace falta revertir, usar otra migración que restaure funciones compatibles con la política realmente vigente. Conservar columnas, movimientos y saldos; nunca borrar recargas ni restaurar todo un backup sobre actividad posterior. Si ya se activó una tarifa distinta, no volver silenciosamente al costo de 1 crédito.

## Fuera de esta entrega

La campaña continúa sin activar hasta definir fecha y parámetros. Los importes de 8.000/10.000 pesos son ideas futuras. No hay cobro, deuda, compra automática ni facturación. FAQ, chat humano, agenda y avisos no tienen débito adicional. Esta entrega no agrega créditos comerciales de IA ni aumenta su límite operativo de US$10 al mes.

El costo mostrado es el de la configuración consultada; no se implementó una cotización reservada por operación. Un inicio de campaña simultáneo puede cambiar del costo histórico a la política de lanzamiento. Antes de habilitar ventas de créditos debe exigirse una revisión de cotización del servidor y separar saldos comprados de promocionales.
