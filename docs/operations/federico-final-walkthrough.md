# Recorrido final de Federico — pendiente de aceptación humana

Esta es una guía preparada, no un recorrido realizado ni una aprobación de
lanzamiento. Usar sólo cuentas de prueba existentes y autorizadas. No crear
cuentas, mandar correos, mensajes externos, cobrar ni activar la campaña.
Los accesos se completan por el mecanismo seguro; nunca copiar claves/tokens
al chat, capturas, Git o planillas.

Antes de la prueba alojada: respaldo recuperable, preflight, candidato aplicado
de forma coordinada y acceso real verificados. Si falta uno, registrar bloqueado
y hacer sólo la demostración aislada que corresponda. No cargar 500 autos ni
probar saturación en producción. La matriz tiene resultados pendientes.

| Rol | Comprobación | Resultado humano |
|---|---|---|
| Visitante | Home y /demo libres; el chat real requiere cuenta; precios/km ocultos y filtros privados no habilitados | Pendiente |
| Particular | Ingreso con su cuenta existente; borrador propio, declaración del estado, cuatro fotos guiadas y publicación válida | Pendiente |
| Reventa | Mismo circuito; ver únicamente su inventario y saldo, sin acceder al borrador ajeno | Pendiente |
| Agencia | Mismo circuito, catálogo propio y condiciones declaradas; no heredar condiciones de AutoSi | Pendiente |
| Comprador | Consultar hechos concretos, distinguir faltantes, revisar/aceptar una visita autorizada y cancelar | Pendiente |
| Bloqueado | No publicar, subir archivos o modificar datos ajenos; mensajes claros sin exponer contenido privado | Pendiente |
| Admin | /velox-admin con permiso real; sólo metadatos permitidos, sin leer conversaciones privadas fuera del alcance | Pendiente |

## 1. Entrada y recuperación

- Entrar/salir con una cuenta sintética existente; cambiar de cuenta debe ocultar
  inmediatamente borradores, conversaciones y datos privados del usuario anterior.
- /recuperar-cuenta sólo con casilla controlada previamente autorizada, después
  de resolver Site URL, allowlist y SMTP. Si falta esa casilla o configuración,
  marcar bloqueado: un HTTP 200 no prueba recepción o recuperación.
- Comprobar recepción, retorno a Velox, enlace vencido/reutilizado, cambio de
  contraseña por canal seguro, rechazo de la anterior y comportamiento de
  sesiones. No hacer esto sobre la cuenta real de otra persona ni registrar
  credenciales en la evidencia.

## 2. Publicar y declarar el estado

- Con cada rol vendedor autorizado, anotar saldo/costo cotizado que realmente
  muestra el candidato. No asumir 50/40/30 ni configurar nuevos valores.
- Completar datos sintéticos inequívocos y cuatro fotos de prueba guiadas. Marcar
  desconocido/no revisado cuando corresponda; no convertir declaración del dueño
  en certificación mecánica ni garantía.
- Retroceder/continuar conservando el borrador durante la misma sesión. Probar
  validación de dato obligatorio/foto inválida sin publicar ni descontar crédito.
- Publicar una vez; anotar identificador y saldo. Si hay fallo de conexión, usar
  el mismo intento sin cambiar datos/archivos y comprobar que no duplica el auto
  ni el descuento. Nunca borrar archivos desde el navegador para resolverlo.
- Pausar una publicación de prueba propia y comprobar que sale del catálogo
  público; reactivar sólo dentro del piloto autorizado. Conservar datos originales.

## 3. Buscar y preguntar

- Buscar marca/modelo/zona y combinar filtros permitidos. Cero coincidencias
  debe ofrecer volver a todos, sin afirmar que no existe ningún publicado.
- Usar siguiente/anterior si el conjunto autorizado tiene más de 24 resultados.
  Si no hay segunda página, el botón deshabilitado es correcto: no fabricar stock.
- Preguntar precio/km/permuta y comparar literalmente con la declaración de esa
  unidad. Preguntar por un dato ausente y comprobar que queda faltante/derivado.
- Revisar una respuesta incierta y una confirmada por su dueño en pruebas; no
  reutilizarla para otra unidad ni dar por contestadas las 197 brechas históricas.
- Suspensión o agotamiento de IA debe conservar FAQ/chat. No hacer llamadas
  pagas para esta aceptación: usar mocks/servicios aislados cuando haga falta.

## 4. Visita y aviso interno

- Revisar días/horas/lugar explícitamente autorizados por el vendedor. Fuera de
  esa autorización, no confirmar una visita ni inventar disponibilidad.
- El comprador debe revisar y aceptar fecha/hora/lugar. Con autorización vigente
  se puede confirmar sin una segunda aprobación manual del vendedor; sin ella,
  la propuesta debe seguir el circuito que corresponda.
- Entrar como vendedor de prueba y comprobar el aviso privado dentro de Velox,
  que es el único canal implementado. No esperar ni enviar WhatsApp o correo.
- Reintentar el mismo envío no debe duplicar la visita/aviso. Cancelar y verificar
  el estado para ambas partes; revocar autorización y comprobar que ya no permite
  nuevas reservas en esa ventana.

## 5. Registrar la aceptación

Para cada fila: fecha/hora Argentina, candidato/entorno, rol de prueba, acción,
resultado esperado/observado y evidencia sin datos privados. Usar PASS, FAIL o
BLOQUEADO; no cerrar un FAIL con CI ni sustituir la aceptación humana por esta guía.
No capturar tokens en URL, datos reales, pantallas con claves o contenido ajeno.

Federico determina la aceptación y los parámetros comerciales pendientes. Este
documento no fija lanzamiento, plazo gratuito, tarifas, cobros o extensiones.
