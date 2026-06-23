# Etapa 10 - Revision mecanica VELOX

## Cambios realizados

- Compradores y vendedores pueden solicitar una revision sobre un vehiculo.
- El administrador puede asignar un mecanico registrado.
- El mecanico ve unidad, ano, kilometraje declarado y contacto del propietario.
- El informe incluye fecha, kilometraje verificado, seis puntajes, observaciones y resultado.
- Se agregaron foto obligatoria de tablero, fotos de detalles y video opcional.
- El solicitante puede ver el informe y sus archivos mediante enlaces privados temporales.
- La informacion profesional no se publica en el catalogo.

## Archivos modificados

- `features/inspections/InspectionSection.jsx`
- `features/inspections/use-inspections.js`
- `lib/roles.js`
- `app/page.jsx`
- `app/globals.css`

## Migraciones

- `supabase/migrations/202606230008_mechanic_role.sql`
- `supabase/migrations/202606230009_mechanical_inspections.sql`

Estas dos migraciones deben ejecutarse en orden porque PostgreSQL requiere confirmar el nuevo valor `mechanic` del enum antes de utilizarlo.

## Riesgos detectados

El cobro del servicio de revision todavia no esta conectado a una pasarela de pago. La privacidad, solicitud, asignacion e informe ya quedan separadas para agregar el pago antes de confirmar la visita.

## Proximo paso

Aplicar en Supabase las migraciones pendientes `003` a `009`, ejecutar una prueba integral con cuentas comprador, vendedor, administrador y mecanico, y desplegar la version validada.
