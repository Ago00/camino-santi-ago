# Tarea en curso

**Título:** F3 — Web pública
**Tipo:** Feature
**Estado:** Implementación
**Iniciada:** 2026-07-31

## Prompt clarificado

Implementar F3 — Web pública del reto, sobre `app/page.tsx` (actualmente
placeholder de F1). Tres modos según `intentos.fase` activo, leídos
server-side desde Supabase:

- **antes**: scrollytelling vertical (hilo del Camino con hitos: reto,
  recorrido en modo "resumen", quién camina, por intenciones, formulario
  intenciones, formulario comentarios, cierre).
- **durante**: mapa en directo (traza + tramo andado + posición), mojón con
  km restantes y % (barra monótona), stats (tiempo en marcha, km andados,
  ritmo medio), formularios de intención/comentario, muro de comentarios
  públicos paginado.
- **llegada**: mapa y stats congelados en el momento de llegar + mensaje de
  llegada editable, formularios siguen disponibles, muro de comentarios.

Componentes a construir, siguiendo el patrón validado en el mockup
(`design-sandbox/app/camino/page.tsx` + `MapaReal.tsx`) pero con datos e
integraciones reales:

1. **Mapa** (`components/mapa/Mapa.tsx`): MapLibre GL con overlay SVG
   recalculado en `move` (patrón POC, no capas GL `line`/`circle`). Tiles de
   **MapTiler** (no CARTO Voyager del mockup). Traza de pintado =
   `traza-mapa.geojson` exclusivamente. Cielo-reloj: tinte por hora real del
   sistema (no toggle manual). Modo previa (tocar para ampliar a pantalla
   completa) + modo resumen (ruta entera, sin posición, para "antes").
2. **Stats + Mojón**: consumen un nuevo tipo `ProgresoPublico` (cierra
   DEBT.md pendiente) que expone solo `porcentaje`, `kmAvanzados`,
   `kmRestantes`, `odometroKm`, `estado`, y de la última posición solo
   `lat/lon/ts` — nunca `batt/acc/intento_id/fuente/descartado`. Se proyecta
   explícitamente en el servidor (Server Component), nunca en cliente.
3. **Peregrino animado**: idéntico patrón del mockup (deambula libre, dibuja
   huellas, se enfada 3 s al pincharlo). Cara de dibujo por defecto.
4. **Formulario de intenciones** → `POST /api/intenciones` (nuevo route
   handler, validación Zod, inserta con service role).
5. **Formulario de comentarios** → `POST /api/comentarios` (nuevo route
   handler, validación Zod; visibilidad pública/privada la elige el autor;
   nunca puede fijar `oculto=true`).
6. **Muro de comentarios paginado**: lista los públicos y no ocultos, más
   recientes primero, con paginación (ej. "cargar más" de 20 en 20) —
   confirmado con el usuario.
7. **Sistema de textos**: `lib/textos/` con función que, dada una clave,
   devuelve el valor de `textos` (BD) si existe o el default de
   `lib/textos/defaults.ts` si no. Solo lectura en F3 — la edición es F4.

## Alcance
- **Incluye**: todo lo listado en el checklist de F3 del roadmap; el tipo
  `ProgresoPublico` (cierra deuda de seguridad pendiente); los dos nuevos
  route handlers; paginación del muro de comentarios.
- **Excluye explícitamente**: "Minuto a minuto"/`Directo` (v2, aunque
  aparece en el mockup) — no se implementa. Panel admin (F4). Edición de
  textos (F4). Rate limiting de los nuevos endpoints (deuda ya registrada
  para F5, aplica igual a `/api/track`).

## Comportamiento en casos límite
- Sin intento activo en BD: tratar como fase `antes`.
- `textos`: si falta la clave en BD, cae al valor por defecto.
- Mapa en `antes`: modo resumen, sin marcador de posición actual.
- `durante`: polling client-side cada 30 s para reflejar nueva posición.

## Supuestos asumidos
- Cielo-reloj por franjas horarias fijas (día 8–20h, atardecer 20–21:30h,
  noche 21:30–6h, amanecer 6–8h) — efecto cosmético, sin cálculo astronómico.
- Polling en "durante": 30 s.
- Muro de comentarios: paginación "cargar más", tamaño de página 20.
- Tiles: MapTiler en vez de CARTO Voyager del mockup (decisión ya cerrada
  del plan).

## Diseño
**Aprobado.** Mockup: `design-sandbox/app/camino/page.tsx` + `MapaReal.tsx`.

Decisiones tomadas en esta iteración:
- Muro de comentarios paginado: patrón "cargar más" (offset), página de 20
  en producción (mockup usa 3 para poder ver el botón).
- Logo en "Llegada" corregido: usa el logo nuevo (S2, mojón + monigote
  rojiblanco) en vez del logo antiguo (vieira suelta).

## Decisión técnica / Diseño

**Aprobada por Santi (2026-07-31).** Registrada en `docs/tecnico/decisiones-tecnicas.md` como DT-007. Resumen:

- **Datos vivos en "durante"**: polling del cliente a `GET /api/progreso` y
  `GET /api/comentarios` cada 30 s (no Supabase Realtime).
- **Coste de `calcularProgreso`**: caché en memoria de proceso con TTL de
  15-20 s dentro de `app/api/progreso/route.ts`. No se toca `proyeccion.ts`,
  el esquema ni `/api/track` — eso queda fuera de alcance de F3 (ver DEBT.md
  actualizado).
- **Principio de mínimo privilegio**: `/api/progreso` y `/api/comentarios`
  usan el cliente **anon** (`lib/supabase/public.ts`, sujeto a RLS) — ya
  tienen acceso legítimo. Solo `/api/intenciones` usa el cliente **admin**
  (service role), porque `intenciones` no tiene ninguna política RLS para
  anon.

**Arquitectura de archivos a crear:**

```
lib/types.ts                        + tipo ProgresoPublico
lib/traza/progreso-publico.ts       (nuevo, puro) aProgresoPublico(Progreso) → ProgresoPublico
lib/cielo.ts                        (nuevo, puro) bandaHoraria(Date) → "dia"|"atardecer"|"noche"|"amanecer"
                                     (franjas fijas: día 8-20h, atardecer 20-21:30h, noche 21:30-6h, amanecer 6-8h)
lib/textos/defaults.ts              (nuevo) textos por defecto tipados
lib/textos/obtener-textos.ts        (nuevo, server) lee tabla `textos`, fusiona con defaults

app/page.tsx                        Server Component: lee intento activo (público, RLS),
                                     progreso inicial + textos, renderiza ModoAntes/Durante/Llegada
app/api/progreso/route.ts           GET, cliente anon, caché en memoria 15-20s, devuelve ProgresoPublico
app/api/comentarios/route.ts        GET paginado (offset, tamaño 20, anon/RLS) + POST (anon, Zod;
                                     RLS ya impide fijar oculto=true)
app/api/intenciones/route.ts        POST (admin/service role — RLS no da acceso a anon; Zod)

components/mapa/Mapa.tsx            MapLibre + estilo base MapTiler (NEXT_PUBLIC_MAPTILER_KEY) +
                                     overlay SVG recalculado en `move` (patrón POC/lección validada,
                                     NO usar capas GL line/circle). Traza de pintado = traza-mapa.geojson
                                     exclusivamente (nunca traza.geojson). Modo previa (tocar = ampliar
                                     a pantalla completa) + modo resumen (ruta entera, sin posición).
components/publico/
  ModoAntes.tsx / ModoDurante.tsx / ModoLlegada.tsx
  Mojon.tsx, Stats.tsx
  IntencionForm.tsx, ComentarioForm.tsx, MuroComentarios.tsx (paginado, "cargar más", página=20)
  PeregrinoLibre.tsx (deambula libre, huellas, se enfada 3s al pincharlo — cara de dibujo, sin foto real)
```

**Nuevas dependencias a instalar:** `maplibre-gl`, `motion`.

**Excluido explícitamente de F3:** "Minuto a minuto"/`Directo` (v2, aparece
en el mockup pero no se implementa). Panel admin (F4). Edición de textos
(F4). Rate limiting (deuda ya registrada para F5).

**Mockup de referencia (spec visual cerrada):**
`design-sandbox/app/camino/page.tsx` + `MapaReal.tsx` — el Implementador
debe seguirlo fielmente en estructura visual, colores, tipografía y
animaciones, adaptando los datos ficticios a los reales.

## Archivos modificados

**Dependencias:** `package.json`/`pnpm-lock.yaml` — `maplibre-gl`, `motion`.

**Tipos y dominio puro (nuevos):**
- `lib/types.ts` (modificado) — añade `UltimaPosicionPublica`, `ProgresoPublico`
- `lib/traza/progreso-publico.ts` + `.test.ts` — `aProgresoPublico()`
- `lib/cielo.ts` + `.test.ts` — `bandaHoraria()`
- `lib/traza/cargar-traza-mapa.ts` — carga `traza-mapa.geojson` server-side
  (necesario porque Turbopack no reconoce `.geojson` como módulo importable;
  ver nota de implementación más abajo)

**Textos (nuevos):**
- `lib/textos/defaults.ts`
- `lib/textos/obtener-textos.ts` + `.test.ts`

**Route handlers (nuevos):**
- `app/api/progreso/route.ts` + `.test.ts`
- `app/api/comentarios/route.ts` + `.test.ts`
- `app/api/intenciones/route.ts` + `.test.ts`

**UI:**
- `app/page.tsx` (reescrito) — Server Component con los 3 modos
- `app/layout.tsx` (modificado) — fuente Fraunces
- `components/mapa/Mapa.tsx` (nuevo)
- `components/publico/ModoAntes.tsx`, `ModoDurante.tsx`, `ModoLlegada.tsx`,
  `Mojon.tsx`, `Stats.tsx`, `IntencionForm.tsx`, `ComentarioForm.tsx`,
  `MuroComentarios.tsx`, `PeregrinoLibre.tsx` (todos nuevos)

**Configuración:**
- `next.config.ts` — revertido a su estado original (se probó y descartó un
  loader de Turbopack para `.geojson`, ver nota abajo)

**Fix post-Reviewer (verificado por el Orquestador con `pnpm build`):**
- `app/page.tsx` — añadido `export const dynamic = "force-dynamic";`. Next.js
  estaba prerenderizando `/` como estática en build (`○`) porque no detectaba
  ninguna API dinámica ni `fetch` con `cache: "no-store"` en el uso del
  cliente Supabase; el HTML habría quedado congelado en producción con la
  fase y el progreso leídos en el momento del `pnpm build`, rompiendo el
  propósito central de F3 (seguimiento en directo). Confirmado con
  `node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md`
  (modelo vigente en este proyecto, que no activa `cacheComponents` en
  `next.config.ts`): `export const dynamic = 'force-dynamic'` es la forma
  correcta de forzar render dinámico por petición. Revisados también los 4
  route handlers (`/api/progreso`, `/api/comentarios`, `/api/intenciones`,
  `/api/track`): ninguno usa `fetch` internamente (todos usan el cliente
  Supabase directo) y el build ya los marcaba correctamente como `ƒ`
  dinámicos — no tenían el mismo problema. Tras el fix, `pnpm build` confirma
  `/` como `ƒ` (dynamic, server-rendered on demand).

**Documentación:**
- `CHANGELOG.md`, `DEBT.md`, `docs/producto/roadmap.md` (F3 marcada hecha)

**Nota de implementación (bloqueo menor resuelto sin desviarse del alcance):**
Turbopack no reconoce ficheros `.geojson` como módulo importable de forma
nativa (a diferencia de `resolveJsonModule` de TypeScript, que sí compila).
Un `import trazaMapa from ".../traza-mapa.geojson"` directo en
`components/mapa/Mapa.tsx` pasaba `tsc`/`eslint` pero rompía `next build`.
Se resolvió cargando `traza-mapa.geojson` server-side con `fs` (nuevo
`cargarTrazaDeMapa()`, análogo a `cargar-traza.ts` ya existente) y pasando
las coordenadas ya parseadas como prop `trazaCoords` a `Mapa.tsx` desde
`app/page.tsx` y cada modo. No cambia la regla de las dos trazas (AGENTS.md):
`Mapa.tsx` sigue usando exclusivamente `traza-mapa.geojson`, nunca
`traza.geojson`.

## Quality gates

Todas en verde (re-verificadas tras el fix de renderizado dinámico):

- **`pnpm typecheck`** — 0 errores.
- **`pnpm lint`** — 0 errores, 0 warnings.
- **`pnpm test`** — 78/78 tests en verde (9 ficheros), incluidos los nuevos
  de `bandaHoraria`, `aProgresoPublico`, `obtenerTextos` (con mocks de
  Supabase) y los 3 route handlers nuevos.
- **`pnpm build`** — compila y genera todas las rutas correctamente; `/`
  ahora aparece como `ƒ` (Dynamic, server-rendered on demand) en vez de `○`
  (Static) — ver nota de fix en "Archivos modificados".

Verificación adicional: servidor `next dev` levantado contra el proyecto
Supabase real (`.env.local` ya configurado desde F0/F2) — `GET /` responde
200 y renderiza el modo "antes" (sin intento activo en BD todavía).

## Historial de revisión
(pendiente — a rellenar por el Reviewer)
