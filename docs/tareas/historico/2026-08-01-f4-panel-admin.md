# Tarea en curso

**Título:** F4 — Panel admin
**Tipo:** Feature
**Estado:** Implementación
**Iniciada:** 2026-07-31

## Prompt clarificado

Implementar F4 — Panel admin del reto, sobre la estructura ya prevista en
`arquitectura.md` (`app/admin/`, `lib/auth/admin-session.ts`, `middleware.ts`)
y el comportamiento de `funcionalidades.md`, con dos ajustes de alcance
decididos en esta clarificación (ver más abajo).

### Autenticación
- `POST /api/admin/login`: recibe la contraseña, la compara contra
  `ADMIN_PASSWORD` (comparación resistente a timing, mismo patrón que
  `TRACK_TOKEN` en `/api/track`), y si coincide fija una cookie `HttpOnly`
  firmada con HMAC (`ADMIN_SESSION_SECRET`).
- `middleware.ts` protege todo `/admin/*` excepto `/admin/login`: sin cookie
  válida → redirige a login.
- Página `/admin/login`: un solo campo de contraseña (admin único, sin
  usuario).
- Botón de cerrar sesión (borra la cookie).
- Duración/renovación de la cookie: decisión técnica del Arquitecto (ver
  ejemplo de trade-off discutido con el usuario — TTL corto molesta en pleno
  reto, TTL largo amplía la ventana de exposición si se pierde el móvil;
  recomendación informal: TTL de días con renovación, a validar por
  Arquitecto y Seguridad).

### Sección Actividad (rediseñada tras clarificación)
- Muestra el estado actual del intento activo (fase, hora de inicio, mensaje
  de llegada si aplica).
- **Fase `antes`** → botón **Iniciar** (antes → durante).
- **Fase `durante`** → botón **Finalizar** (pide/prellena mensaje de llegada
  con `mensaje_llegada_default` de `lib/textos/defaults.ts`, editable) → pasa
  a `llegada`. También disponible **Reiniciar** aquí, para abortar un intento
  en marcha.
- **Fase `llegada`** → dos botones distintos:
  - **Retomar**: deshace el Finalizar. Cambia la fase de vuelta a `durante`
    **sobre el mismo intento** (mismo `id`), sin crear ni cerrar nada;
    `ended_at` vuelve a `null`. Todo el histórico de posiciones sigue intacto,
    sin discontinuidad. Reversible sin más coste que otro Finalizar — no pide
    confirmación.
  - **Reiniciar**: cierra este intento (`cerrado = true`, congelado para
    siempre, nunca se borra de BD) y abre uno nuevo en blanco, en `antes`. Es
    el "empezar de cero". Pide confirmación (es la acción que de verdad cierra
    una etapa).
- Iniciar también pide confirmación por simetría con las demás transiciones
  de estado en vivo.

### Sección Posición (alcance reducido tras clarificación)
- Muestra la última posición del intento activo (lat/lon, hora,
  batería/precisión si hay).
- Lista del histórico de posiciones (orden `ts` desc, "cargar más" de 20 en
  20 — mismo patrón que el muro de comentarios de F3) con acción
  **descartar** en cualquier fila, no solo la última (DT-006 capa 2,
  `descartado = true`, reversible).
- **Fuera de alcance, explícitamente retirado en esta clarificación**:
  "Fichar mi posición ahora" (geolocalización manual de respaldo). El usuario
  confía plenamente en OwnTracks y prefiere no construir esa red de
  seguridad. Requiere actualizar `funcionalidades.md` y el checklist de F4 en
  `roadmap.md` al cerrar la tarea.

### Sección Intenciones
- Lista paginada (mismo patrón "cargar más" de 20) de intenciones con texto y
  nombre/anónima.
- **Eliminar**: borrado real (`DELETE`), no soft-delete — la tabla
  `intenciones` no tiene columna de ocultamiento (a diferencia de
  `comentarios`/`posiciones`) y son mensajes privados que tiene sentido
  borrar de verdad al leerlos. Pide confirmación.

### Sección Comentarios
- Lista con filtro todos/públicos/ocultos.
- Acciones: ocultar, mostrar (revertir), eliminar (hard delete, pide
  confirmación).

### Sección Textos
- Lista las 6 claves de `CLAVES_TEXTOS` (`lib/textos/defaults.ts`) con su
  valor actual (BD si hay override, si no el default) y un campo editable por
  clave que hace upsert en la tabla `textos`.

## Alcance
- **Incluye**: todo lo anterior + `middleware.ts` + `lib/auth/admin-session.ts`
  + `app/admin/actions.ts` (server actions) + tests del dominio/endpoints que
  correspondan.
- **Excluye explícitamente**: "Fichar mi posición ahora" (retirado en esta
  clarificación); rate limiting en login (se agrupa con la deuda ya
  registrada de F5 para los demás endpoints); F5 completo (deploy, prueba
  real andando); calibración de mojones (DEBT.md).

## Nota para el Arquitecto
Retomar/Reiniciar sobre `llegada` es una extensión de la decisión ya cerrada
en `PLAN-EJECUCION-v1.md` ("Reiniciar cierra intento y abre otro en antes;
nada se borra nunca de BDD") — no la contradice (sigue habiendo un único
intento activo, sigue sin borrarse nada), pero añade una transición nueva
(`llegada` → `durante` sobre el mismo intento) que no estaba prevista.
Regístralo en `decisiones-tecnicas.md` como ampliación, análogo a cómo DT-005
amplió a DT-002.

## Diseño
Mockup: N/A — se decidió saltar la fase de diseño (panel funcional de un solo
usuario, comportamiento ya completamente especificado; sin decisión visual de
producto pendiente).

## Diseño
Mockup: N/A

## Decisión técnica / Diagnóstico

**Aprobado por el usuario, 2026-07-31. Registrado en `decisiones-tecnicas.md` como DT-010.**

**Hallazgo previo:** `middleware.ts` está deprecado en Next.js 16.0.0 →
renombrado a `proxy.ts` (función exportada `proxy()`). `arquitectura.md`
tenía esto desactualizado (escrito en F1, antes de instalar Next 16 real).
Ya corregido en `arquitectura.md`. Proxy usa runtime Node.js por defecto en
Next 16 — sin restricción para `node:crypto`. Las Server Actions se sirven
como POST a su propia ruta: **cada acción en `app/admin/actions.ts` debe
verificar la sesión ella misma**, no confiar solo en `proxy.ts`.

**Sesión de admin (Opción A elegida):** `lib/auth/admin-session.ts`, cookie
`HttpOnly` con payload `{ exp: timestamp }` en base64url, firmado
HMAC-SHA256 (`ADMIN_SESSION_SECRET`), verificado con `timingSafeEqual` —
mismo patrón que `/api/track` con `TRACK_TOKEN`. Sin dependencia nueva
(`jose` descartado: un solo admin, sin roles, no aporta nada). TTL 7 días,
renovada en cada petición válida a `/admin/*` desde `proxy.ts`.

**Estructura de ficheros:**
- `app/admin/login/page.tsx`, `app/admin/page.tsx` (Server Component, tabs
  vía `?tab=actividad|posicion|intenciones|comentarios|textos`, cada sección
  es su propio Server Component en `components/admin/` que solo pide sus
  propios datos)
- `app/admin/actions.ts` — server actions, cada una verifica sesión:
  `iniciarReto`, `finalizarReto(mensaje)`, `reiniciarReto`, `retomarReto`,
  `descartarPosicion(id)`, `eliminarIntencion(id)`, `ocultarComentario(id)`,
  `mostrarComentario(id)`, `eliminarComentario(id)`, `guardarTexto(clave, valor)`
- `app/api/admin/login/route.ts` — compara `ADMIN_PASSWORD` con
  `timingSafeEqual`, fija la cookie de sesión
- `lib/auth/admin-session.ts` — `crearSesion()` / `verificarSesion(cookie)`
- `proxy.ts` — protege `/admin/*` excepto `/admin/login`
- Confirmación de acciones destructivas (Iniciar, Finalizar, Reiniciar,
  eliminar intención/comentario): wrapper cliente mínimo con
  `window.confirm()`, sin modal a medida (no hubo fase de diseño). Retomar no
  pide confirmación (reversible con otro Finalizar).
- Listas paginadas (Posición, Intenciones): mismo patrón offset/limit de 20
  que `app/api/comentarios/route.ts`, resuelto como Server Component +
  `?offset=` (sin nuevo route handler público).
- Sin cambios de esquema SQL — todo lo pedido cabe en columnas existentes.

**Documentación a actualizar al cerrar:** `arquitectura.md` (ya corregido:
`proxy.ts`, `lib/auth/`, `components/admin/`), `decisiones-tecnicas.md` (ya
tiene DT-010), `funcionalidades.md`/`roadmap.md` (retirar "fichar posición
manual", documentar Retomar), `DEBT.md` (cerrar DT-006 capa 2; añadir login a
la lista de endpoints sin rate limiting pendiente de F5), `CHANGELOG.md`.

## Archivos modificados

**Nuevos:**
- `lib/auth/admin-session.ts` + `lib/auth/admin-session.test.ts`
- `app/api/admin/login/route.ts` + `app/api/admin/login/route.test.ts`
- `proxy.ts` + `proxy.test.ts`
- `app/admin/actions.ts` + `app/admin/actions.test.ts`
- `app/admin/login/page.tsx`
- `app/admin/page.tsx`
- `lib/admin/navegacion.ts` (extraído de `TabsAdmin.tsx`/`FiltroComentarios.tsx`:
  Next 16 trata todo lo exportado de un módulo `"use client"` como límite
  cliente-servidor, incluidas funciones puras — bloqueo menor resuelto en la
  propia implementación, ver detalle en el código)
- `components/admin/TabsAdmin.tsx`
- `components/admin/BotonCerrarSesion.tsx`
- `components/admin/BotonConfirmable.tsx`
- `components/admin/ActividadAcciones.tsx`
- `components/admin/SeccionActividad.tsx`
- `components/admin/SeccionPosicion.tsx`
- `components/admin/DescartarPosicionBoton.tsx`
- `components/admin/EnlacePaginacion.tsx`
- `components/admin/SeccionIntenciones.tsx`
- `components/admin/EliminarIntencionBoton.tsx`
- `components/admin/SeccionComentarios.tsx`
- `components/admin/FiltroComentarios.tsx`
- `components/admin/AccionesComentario.tsx`
- `components/admin/SeccionTextos.tsx`
- `components/admin/CampoTexto.tsx`

**Modificados:**
- `docs/tecnico/arquitectura.md` (fila `lib/admin/navegacion.ts`)
- `docs/producto/funcionalidades.md` (Retomar, descartar cualquier punto,
  retirada "fichar posición ahora")
- `docs/producto/roadmap.md` (F4 → hecho, checklist actualizado)
- `DEBT.md` (cierre de la entrada de envenenamiento del ancla —capa 2
  completa—, ampliación de la entrada de rate limiting con
  `/api/admin/login`)
- `CHANGELOG.md` (entrada 2026-08-01)

## Quality gates

- **Typecheck** (`pnpm typecheck`): verde, 0 errores.
- **Lint** (`pnpm lint`): verde, 0 errores/warnings.
- **Tests** (`pnpm test`): verde, 125/125 tests en 14 ficheros (36 tests
  nuevos de esta tarea: 11 de `admin-session.test.ts`, 7 de
  `api/admin/login/route.test.ts`, 5 de `proxy.test.ts`, 19 de
  `app/admin/actions.test.ts` — el resto son los ya existentes de F1-F3, sin
  regresiones).
- **Build de producción** (`pnpm build`): verde, compila y genera todas las
  rutas nuevas (`/admin`, `/admin/login`, `/api/admin/login`) y el Proxy
  correctamente detectado.
- **Verificación visual/funcional real** (obligatoria por
  `docs/LESSONS.md`): levantado el dev server local con credenciales de
  prueba, login correcto/incorrecto probados vía `curl`, `proxy.ts`
  verificado redirigiendo sin sesión/con cookie manipulada, y las 5
  secciones (`?tab=actividad|posicion|intenciones|comentarios|textos`)
  renderizadas contra Supabase real, mostrando datos reales existentes
  (intenciones y comentarios de pruebas de F3). Encontrado y corregido en el
  proceso un bloqueo menor real (ver más abajo). Credenciales de prueba
  retiradas de `.env.local` al terminar (no se commitean).

## Bloqueo menor resuelto durante la implementación

Al verificar `/admin` en el navegador (vía curl con cookie de sesión válida)
apareció un 500: `Attempted to call esTabValida() from the server but
esTabValida is on the client`. Causa: `esTabValida()` y `TABS_ADMIN` estaban
exportados desde `components/admin/TabsAdmin.tsx`, que lleva `"use client"`
a nivel de módulo — Next.js 16 trata TODO lo exportado de un módulo
`"use client"` como límite cliente-servidor, incluidas funciones puras sin
ningún hook (no solo el `export default`). `app/admin/page.tsx` (Server
Component) no puede invocar esa función directamente.

Solución aplicada (bloqueo menor, sin impacto de arquitectura, resuelto sin
consultar): se extrajo la lógica pura de navegación (`TABS_ADMIN`,
`TabAdmin`, `esTabValida`, `FiltroComentario`, `esFiltroComentarioValido`) a
un módulo nuevo sin directiva, `lib/admin/navegacion.ts`. Los componentes
cliente (`TabsAdmin.tsx`, `FiltroComentarios.tsx`) importan de ahí en vez de
definirlo ellos mismos. Verificado tras el fix: `pnpm build`, `pnpm test`, y
verificación visual repetida con éxito (200 en las 5 pestañas).

## Historial de revisión

### Reviewer — 2026-08-01 — ✅ Aprobado

**Resumen:** Pasa. Implementación fiel a lo aprobado en DT-010 y al prompt clarificado: las 10 Server Actions verifican sesión de forma independiente, Retomar/Reiniciar están correctamente separados (con y sin confirmación, respectivamente), `intenciones` usa DELETE real mientras `posiciones`/`comentarios` usan soft-delete, "Fichar mi posición ahora" no aparece en ningún archivo de código, y la extracción de `lib/admin/navegacion.ts` es lógica de navegación de UI (no de dominio), justificada y bien documentada.

**Bloqueantes:** ninguno.

**Recomendaciones (registradas en `DEBT.md`):**
- `components/admin/EnlacePaginacion.tsx`: el comentario de cabecera dice "es un Link" pero el componente usa `<button onClick>` + `router.push()`. Ajustar el comentario, sin impacto funcional.

**Nota sobre verificación de quality gates:** el Reviewer no dispuso de herramienta de ejecución de comandos en esta revisión y no pudo re-ejecutar `pnpm typecheck/lint/test/build` de forma independiente; la verificación se hizo por lectura exhaustiva de todo el código de la tarea (sesión, login, proxy, las 10 actions, los 15 componentes, páginas, tipos y tests) sin encontrar indicios de `any`, tipos eludidos, o comportamiento que hiciera sospechar fallos en las gates reportadas en verde por el Implementador.

**Veredicto:** ✅ Aprobado — pasa a Seguridad.

### Seguridad (OWASP Top 10) — 2026-08-01 — ✅ Sin vulnerabilidades

Revisadas las 10 server actions (todas verifican sesión independientemente
salvo `cerrarSesion`, justificado), la cookie HMAC-SHA256 con
`timingSafeEqual` (sin dependencias nuevas), ausencia de SQL concatenado,
validación server-side de mensaje de llegada y clave de texto (`esClaveDeTexto`),
ausencia de secretos con prefijo `NEXT_PUBLIC_`, errores sin fuga de detalles
internos, y RLS de las 5 tablas (ninguna policy de `UPDATE`/`DELETE`/`INSERT`
sin restricción para `anon`; `intenciones` sigue con cero acceso anon).
`pnpm audit`: sin vulnerabilidades de ninguna severidad.

**Issues:** ninguno.

**Observaciones no bloqueantes** (deuda ya gestionada, no hallazgos nuevos):
falta de rate limiting en `/api/admin/login` (ya en `DEBT.md`, agrupada con
F5); `textos.valor` sin `check` de longitud en el esquema SQL — superficie
solo alcanzable por el admin ya autenticado, no es un fallo de integridad
expuesto a input no confiable.

**Veredicto:** ✅ Sin vulnerabilidades — tarea lista para cerrar.

---

**Verificación independiente del Orquestador (2026-08-01):** `pnpm typecheck`,
`pnpm lint` y `pnpm test` (125/125, 14 ficheros) re-ejecutados directamente —
verde, confirmado fuera del reporte del Implementador/Reviewer.
