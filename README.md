# VELOX

VELOX es una plataforma asistida para vender vehiculos.

Propuesta de valor:

> Publica tu vehiculo y deja que VELOX te ayude a venderlo.

La aplicacion guia la publicacion, mejora su calidad, responde consultas repetidas, coordina visitas y prepara revisiones mecanicas privadas.

## Estado actual

Implementado:

- autenticacion con Supabase;
- seguridad RLS y storage privado;
- home orientada a vender con asistencia;
- asistente de publicacion de 7 pasos;
- 4 a 8 fotos y video opcional;
- calidad de publicacion y recomendaciones;
- creditos de publicacion por 90 dias;
- chat real con Supabase Realtime;
- bloqueo, denuncias y leido/no leido;
- asistente de venta basado en reglas;
- agenda interna de visitas;
- solicitud, asignacion e informe de revision mecanica;
- documentacion por etapas en `docs/stages`.

## Tecnologia

- Next.js 16;
- React 19;
- Supabase Auth;
- PostgreSQL y RLS;
- Supabase Storage;
- Supabase Realtime;
- Vercel para produccion.

## Estructura

```txt
app/                 Pagina principal y estilos
components/          Componentes compartidos
features/            Modulos funcionales
lib/                 Cliente Supabase, roles y datos
supabase/migrations/ Migraciones de base de datos
docs/stages/         Informe de cada etapa
```

## Ver la aplicacion

Vista local estable:

```txt
http://127.0.0.1:3001
```

Para iniciar el modo desarrollo:

```powershell
cd C:\Users\autos\Documents\Codex\2026-05-03\ya-tengo-en-vercel-u-github\velox-next
npm.cmd run dev -- --hostname 0.0.0.0 --port 3000
```

## Variables privadas

El archivo `.env.local` contiene:

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

`.env.local` esta excluido de GitHub mediante `.gitignore`.

## Migraciones Supabase

Aplicadas correctamente en Supabase el 23 de junio de 2026:

```txt
202606230001_security_hardening.sql
202606230002_security_followup.sql
202606230003_publication_assistant.sql
202606230004_publication_credits.sql
202606230005_chat_realtime.sql
202606230006_sales_assistant.sql
202606230007_appointments.sql
202606230008_mechanic_role.sql
202606230009_mechanical_inspections.sql
```

La auditoria posterior confirmo tablas, funciones, rol `mechanic` y bucket privado de inspecciones.

## Creditos

- Particular: 10 publicaciones durante 90 dias.
- Revendedor: 50 publicaciones durante 90 dias.
- Agencia: 200 publicaciones durante 90 dias.
- Cada publicacion consume 1 credito.
- Los valores pueden modificarse en `credit_settings`.

## Privacidad

- visitantes no reciben precio ni kilometraje desde la base;
- perfiles personales no son publicos;
- fotos y videos usan buckets privados;
- los informes mecanicos solo los ve quien los solicito, el mecanico asignado y el administrador;
- los cambios de rol no pueden hacerse desde el navegador;
- no existen credenciales administrativas escritas en el frontend.

## Verificacion tecnica

Comandos ejecutados correctamente:

```powershell
npm.cmd run lint
npm.cmd run build
```

La salida de produccion se genera en `out/`.

## Trabajo de Federico

Federico no necesita programar. Su tarea es:

- probar los recorridos;
- decidir reglas comerciales;
- detectar textos confusos;
- validar con compradores y vendedores reales;
- informar errores concretos.

Los cambios tecnicos, migraciones y despliegues deben quedar documentados y ejecutarse de forma controlada.
