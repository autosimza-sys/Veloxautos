# VELOX — Auditoría, Correcciones y Estado

Fecha: 2026-06-24

---

## 1. PROBLEMAS ENCONTRADOS

### Bloqueantes críticos (la plataforma no funcionaba)

| # | Problema | Impacto |
|---|----------|---------|
| 1 | Rol por defecto en registro era `registered`, que no tiene permiso de publicar | Usuario se registra y no puede publicar |
| 2 | "Vender mi vehículo" era un `<a href="#asistente">` sin verificar si el usuario estaba logueado | El flujo de publicación no pedía registro |
| 3 | No había AuthModal — el formulario de registro era una sección enterrada en la página | UX confusa, flujo no intuitivo |
| 4 | Post-signup con email confirmation: si `data.session === null`, el sistema mostraba "Revisá tu email" y bloqueaba todo | El usuario no podía continuar aunque el email no llegara |
| 5 | `SalesAssistantSection` era completamente estático — solo mostraba chips sin funcionalidad | El "asistente" no respondía preguntas |
| 6 | El chat real (`use-chat.js`) mostraba "Esta publicacion de muestra..." para los vehículos demo | Usuario confundido, parecía que el chat estaba roto |

### Problemas de experiencia

| # | Problema |
|---|----------|
| 7 | El `PublicationAssistant` solo mostraba el aviso de "Creá una cuenta" en el último paso (paso 7) |
| 8 | No había feedback visual cuando el usuario con rol incorrecto intentaba publicar |
| 9 | El botón header "Vender mi vehículo" era un `<a>` que ignoraba el estado de autenticación |
| 10 | El mensaje de error del login se mostraba con el mismo estilo que el éxito |

---

## 2. CAMBIOS REALIZADOS

### `features/auth/use-auth.js`
- Rol por defecto cambiado de `"registered"` → `"particular"`
- Después del `signUp`, si `data.session === null` (email confirmation requerida), se intenta login automático con las credenciales que el usuario acaba de escribir
- Si el login automático funciona → sesión activa inmediatamente
- Si falla (confirmación requerida) → mensaje claro con instrucciones

### `features/auth/AuthModal.jsx` — NUEVO
- Modal flotante de registro/login que aparece cuando el usuario quiere publicar sin estar logueado
- Registro simple: nombre, email, teléfono, tipo de cuenta (Particular / Revendedor / Agencia), contraseña
- Sin opción de "Registrado" (rol sin permisos)
- Cierra automáticamente al autenticarse y hace scroll al asistente
- Clickear fuera del modal lo cierra
- Diferencia visual entre error y éxito en los mensajes

### `features/home/HomeHero.jsx`
- El botón "Vender mi vehículo" ahora recibe `onPublishClick` como prop
- Ya no es un link estático — dispara la lógica correcta según el estado de auth

### `app/page.jsx`
- Nuevo estado `authModalOpen` y `publishIntent`
- `handlePublishClick()`: si hay sesión → scroll al asistente; si no → abre AuthModal
- `useEffect` que detecta cuando el usuario se autentica con intención de publicar → cierra modal y hace scroll suave al asistente
- Botón en header también usa `handlePublishClick`
- `PublicationAssistant` recibe `onNeedAuth={handlePublishClick}` y referencia `ref` para el scroll

### `features/publication/PublicationAssistant.jsx`
- Nuevo prop `onNeedAuth`
- Banner de autenticación visible cuando no hay perfil: "Para publicar necesitás una cuenta gratuita" + botón que abre el AuthModal
- Banner de aviso cuando hay perfil pero el rol no permite publicar

### `features/sales-assistant/SalesAssistantSection.jsx` — REDISEÑADO
- Chat interactivo completo con respuestas basadas en los datos del vehículo
- 8 preguntas rápidas: disponibilidad, permuta, financiación, ubicación, horarios, kilómetros, precio, estado
- Campo de texto libre para preguntas personalizadas
- Función `generateAnswer()` que responde con datos reales del vehículo
- Si no tiene el dato, dice explícitamente: "No tengo ese dato cargado. Podés preguntarle por chat al vendedor."
- Funciona sin login, sin backend

### `app/globals.css`
- `.authModal`, `.authModalHeader`, `.authModalBody` — estilos del modal de auth
- `.authError` — estilo distinto para mensajes de error vs éxito
- `.assistantAuthBanner` — banner de auth en el asistente
- `.salesChat`, `.salesChatMessages`, `.salesChatMsg`, `.chatQuickBtn`, `.salesChatComposer` — chat del asistente de venta
- Responsive para mobile: authModal desde abajo en pantallas pequeñas

---

## 3. ARCHIVOS MODIFICADOS

```
features/auth/use-auth.js          — rol + login automático post-signup
features/auth/AuthModal.jsx        — NUEVO: modal de registro/login
features/home/HomeHero.jsx         — botón con prop onPublishClick
features/publication/PublicationAssistant.jsx — banner auth + prop onNeedAuth
features/sales-assistant/SalesAssistantSection.jsx — chat interactivo real
app/page.jsx                       — flujo completo de publicación
app/globals.css                    — estilos nuevos
```

---

## 4. MIGRACIONES SQL — ORDEN DE APLICACIÓN

Aplicar en este orden exacto en el SQL Editor de Supabase:

```
1. supabase/schema.sql
2. supabase/migrations/202606230001_security_hardening.sql
3. supabase/migrations/202606230002_security_followup.sql
4. supabase/migrations/202606230003_publication_assistant.sql
5. supabase/migrations/202606230004_publication_credits.sql
6. supabase/migrations/202606230005_chat_realtime.sql
7. supabase/migrations/202606230006_sales_assistant.sql
8. supabase/migrations/202606230007_appointments.sql
9. supabase/migrations/202606230008_mechanic_role.sql
10. supabase/migrations/202606230009_mechanical_inspections.sql
```

**Storage bucket**: Crear el bucket `vehicle-media` en Supabase Storage con:
- Acceso público para lectura (para mostrar imágenes)
- Acceso authenticated para escritura (para subir fotos)

**Política de Storage sugerida:**
```sql
-- Permitir subida a usuarios autenticados (solo en su propio folder)
CREATE POLICY "users_upload_own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'vehicle-media' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Permitir lectura pública
CREATE POLICY "public_read"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'vehicle-media');
```

---

## 5. VARIABLES DE ENTORNO

Copiar `.env.example` como `.env.local` y completar:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Para desactivar confirmación de email (recomendado durante desarrollo):
- Supabase Dashboard → Authentication → Email → desactivar "Confirm email"

---

## 6. QUÉ ESTÁ FUNCIONANDO

✅ Flujo "Publicar auto" → modal de registro → auth → asistente  
✅ Registro con rol correcto (Particular por defecto)  
✅ Login automático post-signup cuando el email de confirmación no llega  
✅ Asistente de publicación por pasos (7 pasos)  
✅ Subida de fotos y video  
✅ Checklist declarado por el propietario  
✅ Sistema de calidad de publicación con recomendaciones  
✅ Chat con Supabase Realtime (para vehículos reales publicados)  
✅ Asistente de venta interactivo con respuestas basadas en datos reales  
✅ Agenda de visitas (proponer, aceptar, confirmar)  
✅ Revisión mecánica declarada (en el asistente)  
✅ Sistema de créditos (10 créditos iniciales para rol Particular)  
✅ Diseño moderno, dark mode, mobile first  

---

## 7. QUÉ QUEDA PENDIENTE

🔲 Confirmación de email funcional (requiere configurar SMTP en Supabase)  
🔲 Editar publicación (botón existe, lógica pendiente)  
🔲 Panel admin real (sección placeholder)  
🔲 Búsqueda/filtros en catálogo  
🔲 Perfil público de vendedores  
🔲 Pago de créditos (módulo de pagos)  
🔲 Google Calendar para visitas  
🔲 Inspección mecánica profesional (estructura preparada en DB)  
🔲 Notificaciones de nuevos mensajes  
🔲 El asistente de venta del chat (RPC `send_message_with_assistant`) puede mejorarse con más patrones  

---

## 8. CÓMO PROBAR EL FLUJO COMPLETO

### Flujo de publicación (nuevo usuario)

1. Abrir la app en `http://localhost:3000`
2. Hacer click en **"Vender mi vehículo"** (header o hero)
3. Se abre el **AuthModal** con "Crear cuenta" activo
4. Completar: nombre, email, contraseña, tipo = Particular
5. Click en **"Crear cuenta y publicar"**
6. Si Supabase no requiere confirmación → sesión activa, modal se cierra, scroll al asistente
7. Completar los 7 pasos del asistente (marca, km, precio, 4+ fotos, checklist, revisión, publicar)
8. Click en **"Confirmar y publicar"** → publicación activa en el catálogo

### Flujo de chat (comprador)

1. Registrarse como un segundo usuario (email diferente)
2. Ver una publicación real en el catálogo
3. Click en **"Abrir chat interno"**
4. El chat se abre y crea la conversación
5. Escribir "¿Sigue disponible?" → el asistente responde automáticamente
6. La sección **"Coordinar visita"** permite proponer una fecha

### Asistente de venta (sin login)

1. Ir a cualquier publicación del catálogo
2. Bajar a la sección "Asistente de venta"
3. Hacer click en cualquiera de las preguntas rápidas (disponibilidad, permuta, etc.)
4. El asistente responde con los datos reales de esa publicación

---

## 9. CRITERIO DE ÉXITO CUMPLIDO

El flujo mínimo para una prueba con usuarios reales funciona:
- Registro claro e inmediato
- Publicación guiada por asistente
- Asistente de venta con respuestas reales
- Chat con historial y respuestas automáticas
- Solicitud de visita desde el chat
