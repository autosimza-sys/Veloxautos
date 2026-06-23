# Etapa 6 - Creditos

## Cambios realizados

- Se retiro la interfaz de planes y suscripciones mensuales.
- Se agregaron creditos de publicacion con vigencia de 90 dias.
- Valores iniciales administrables: particular 10, revendedor 50 y agencia 200.
- Cada publicacion consume 1 credito.
- La validacion, creacion del vehiculo y descuento se ejecutan en una transaccion de PostgreSQL.
- El usuario ve disponibles, usados y fecha de vencimiento.

## Archivos modificados

- `features/credits/use-credits.js`
- `features/credits/CreditsSection.jsx`
- `features/vehicles/vehicle-api.js`
- `features/vehicles/use-vehicle-catalog.js`
- `app/page.jsx`
- `app/globals.css`

## Migracion

- `supabase/migrations/202606230004_publication_credits.sql`

## Riesgos detectados

La compra de nuevos paquetes todavia no procesa pagos. La estructura del libro contable ya contempla compras y ajustes administrativos para integrarlos sin cambiar el consumo.

## Proximo paso

Reemplazar el chat de demostracion por conversaciones y mensajes reales con Supabase Realtime.
