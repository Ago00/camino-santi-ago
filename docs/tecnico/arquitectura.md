# Arquitectura

## Visión general

Next.js 16 con App Router. Todo el dominio de negocio vive en `lib/`. La UI
en `app/` y `components/`. Las capas de infraestructura (BD, auth, endpoints)
en sus propios módulos bajo `lib/` y `app/api/`.

## Estructura de carpetas

```
camino-santi-ago/
├── app/
│   ├── page.tsx              # web pública (F3: antes/durante/llegada)
│   ├── layout.tsx
│   ├── globals.css
│   ├── admin/
│   │   ├── login/page.tsx    # F4
│   │   ├── page.tsx          # F4: panel admin
│   │   └── actions.ts        # F4: server actions de admin
│   └── api/
│       ├── track/route.ts    # F2: ingesta OwnTracks
│       ├── progreso/route.ts     # F3: GET, caché TTL en memoria (DT-007)
│       ├── comentarios/route.ts  # F3: GET paginado + POST
│       ├── intenciones/route.ts  # F3: POST (cliente admin)
│       └── admin/login/route.ts  # F4
├── components/
│   ├── mapa/Mapa.tsx         # F3: overlay SVG (patrón de la POC)
│   ├── publico/              # F3: hero, stats, formularios, hilo
│   └── admin/               # F4: secciones del panel
├── lib/
│   ├── types.ts              # tipos de dominio (contrato para todas las capas)
│   ├── cielo.ts               # F3: bandaHoraria() — tinte del mapa por hora real
│   ├── traza/
│   │   ├── traza.geojson         # traza de CÁLCULO (7.121 puntos, sin simplificar)
│   │   ├── traza-mapa.geojson    # traza de PINTADO (Douglas-Peucker 3 m, ~2.011 pts)
│   │   ├── proyeccion.ts         # dominio puro: prepararTraza + calcularProgreso
│   │   ├── proyeccion.test.ts    # tests unitarios con fixtures sintéticas
│   │   ├── progreso-publico.ts   # F3: aProgresoPublico() — proyección segura al cliente
│   │   ├── cargar-traza.ts       # carga traza.geojson (cálculo) server-side
│   │   ├── cargar-traza-mapa.ts  # F3: carga traza-mapa.geojson (pintado) server-side
│   │   └── umbrales.ts           # constantes del dominio (EN_RUTA_MAX_M, etc.)
│   ├── supabase/             # F2
│   │   ├── admin.ts          # cliente service role (solo servidor)
│   │   └── public.ts         # cliente anon (peticiones públicas)
│   ├── textos/               # F3
│   │   ├── defaults.ts       # textos por defecto (override desde BD)
│   │   └── obtener-textos.ts # server: fusiona defaults con la tabla `textos`
│   ├── auth/                 # F4
│   │   └── admin-session.ts  # firma/verificación cookie HMAC
│   └── admin/                 # F4
│       └── navegacion.ts     # estado de navegación (?tab=, ?filtroComentarios=)
│                              # y sus validadores — fuera de components/admin/
│                              # porque esos ficheros son "use client" (ver
│                              # comentario en el propio fichero)
├── proxy.ts                  # F4: protege /admin/* (Next 16: "middleware" se
│                             # renombró a "proxy", ver DT-010)
├── docs/
│   ├── traza-camino-portugues.geojson  # fuente original (CC BY-SA 4.0 Xunta)
│   ├── producto/
│   ├── tecnico/
│   ├── tareas/
│   └── bugs/
├── scripts/
│   └── simplificar-traza.ts  # genera traza.geojson y traza-mapa.geojson
├── CHANGELOG.md
├── DEBT.md
├── CLAUDE.md
└── AGENTS.md
```

## Capas y sus responsabilidades

| Capa | Ubicación | Regla |
|---|---|---|
| Dominio puro | `lib/traza/proyeccion.ts` | Sin I/O, sin efectos laterales. Tests con fixtures sintéticas. |
| Tipos | `lib/types.ts` | Solo tipos. Sin lógica, sin cliente de BD. |
| Constantes de dominio | `lib/traza/umbrales.ts` | Cada umbral con su porqué. |
| Infraestructura BD | `lib/supabase/` | Solo clientes. Sin lógica de negocio. |
| Endpoints | `app/api/` | Validación Zod en la frontera. Sin lógica de negocio. |
| Server Actions | `app/admin/actions.ts` | Mutaciones del panel. Autenticadas con cookie. |
| UI | `app/` + `components/` | Sin lógica de negocio. Consume `lib/`. |

## La regla no negociable de las dos trazas

**Hay exactamente dos representaciones de la traza y tienen responsabilidades
distintas. Mezclarlas es el bug más caro posible.**

| | `lib/traza/traza.geojson` | `lib/traza/traza-mapa.geojson` |
|---|---|---|
| Propósito | CÁLCULO de progreso | PINTADO en el mapa (cliente) |
| Puntos | 7.121 (sin simplificar) | ~2.011 (Douglas-Peucker 3 m) |
| Longitud | ~104,97 km (real, corredor extendido DT-005) | ~104,68 km (acortada por DP) |
| Dónde se usa | `proyeccion.ts`, solo servidor | Se envía al navegador en F3 |
| Puede usarse para calcular % | SÍ | **NO — su longitud no es válida** |

Douglas-Peucker corta esquinas y acorta la línea ~291 m. Si el cálculo usara
la traza simplificada, Santi llegaría al Obradoiro y la web le diría que le
faltan 291 m — el peor fallo posible en el peor momento.

`proyeccion.ts` se ejecuta en servidor. Al cliente solo viajan los números del
`Progreso`, nunca la traza de cálculo.

## Dominio puro

`lib/traza/proyeccion.ts` expone exactamente dos funciones:

```ts
prepararTraza(geojson): TrazaPreparada      // km acumulados por vértice, una vez
calcularProgreso(historico, traza): Progreso
```

La traza entra como parámetro — nunca se lee desde dentro. Esto permite tests
con trazas sintéticas de 3 puntos y evita recalcular distancias acumuladas
en cada petición.

## Invariantes de sesión

- Solo puede haber un `Intento` con `cerrado = false` a la vez (índice único en BD).
- Las posiciones con `descartado = true` no participan en ningún cálculo.
- La `Fase` del intento activo determina qué muestra la web pública.
- Las intenciones son siempre privadas: ninguna política RLS de anon las alcanza.

## Variables de entorno requeridas (F2+)

Ver `docs/tecnico/plan-ejecucion-v1.md` para la lista completa:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `TRACK_TOKEN`, `ADMIN_PASSWORD`,
`ADMIN_SESSION_SECRET`, `NEXT_PUBLIC_MAPTILER_KEY`.
