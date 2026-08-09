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
│   │   └── actions.ts        # F4: server actions de admin (incluye minuto a minuto, DT-013)
│   └── api/
│       ├── track/route.ts    # F2: ingesta OwnTracks; filtro geográfico DT-006 solo en
│       │                     # modo guiado, se salta en modo libre (DT-016)
│       ├── progreso/route.ts     # F3: GET, caché TTL en memoria (DT-007); bifurca por
│       │                         # modo del intento activo desde DT-016 (guiado/libre);
│       │                         # rama guiado pagina el histórico completo con
│       │                         # obtenerTodasLasFilas (DT-018), rama libre (polling) solo
│       │                         # pide la última posición (order+limit(1))
│       ├── comentarios/route.ts  # F3: GET paginado + POST
│       ├── intenciones/route.ts  # F3: POST (cliente admin)
│       ├── admin/login/route.ts  # F4
│       ├── fase/route.ts         # auto-refresco de fase: GET mínimo, sin caché (DT-012)
│       └── minuto-a-minuto/route.ts  # DT-013: GET paginado (offset/limit) + poll incremental (despuesDeId)
├── components/
│   ├── mapa/Mapa.tsx         # F3: overlay SVG (patrón de la POC); prop puntoResaltado (DT-013);
│   │                         # prop variante "ruta"|"libre" (DT-016, modo libre sin traza de fondo)
│   ├── publico/              # F3: hero, stats, formularios, hilo
│   │   ├── RefrescoAlCambiarFase.tsx  # auto-refresco: polling 30 s a /api/fase, reload si cambia (DT-012)
│   │   ├── MinutoAMinuto.tsx  # DT-013: feed en directo, paginado + poll opcional, clic → mapa
│   │   ├── DistanciaRestante.tsx  # DT-016: cifra de distancia restante (modo libre), hermano de Mojon.tsx
│   │   ├── ModoDuranteLibre.tsx   # DT-016: "durante" del modo libre (sin condicionales en ModoDurante.tsx)
│   │   └── ModoLlegadaLibre.tsx   # DT-016: "llegada" del modo libre (sin condicionales en ModoLlegada.tsx)
│   └── admin/               # F4: secciones del panel
│       ├── ComposerMinutoAMinuto.tsx  # DT-013: texto + foto opcional; DT-017: envía con
│       │                              # onSubmit propio (no <form action={fn}>: React 19
│       │                              # resetearía el input de fichero al fallar), comprime
│       │                              # la foto antes de enviar, reintenta y muestra el
│       │                              # error sin perder texto ni foto
│       ├── EntradaMinutoAMinuto.tsx   # DT-013: fila con editar inline (solo texto) + eliminar
│       ├── SeccionMinutoAMinuto.tsx   # DT-013: lista del intento activo (Server Component)
│       └── ActividadAcciones.tsx      # DT-016: selector de modo (guiado/libre) + destino antes de Iniciar
├── lib/
│   ├── types.ts              # tipos de dominio (contrato para todas las capas); ProgresoPublico
│   │                          # es unión discriminada por `modo` desde DT-016 (ProgresoPublicoGuiado
│   │                          # | ProgresoPublicoLibre)
│   ├── cielo.ts               # F3: bandaHoraria() — tinte del mapa por hora real
│   ├── rate-limit.ts          # F5: rate limiting en memoria de proceso (DT-011), usado por todos los endpoints públicos
│   ├── progreso-cache.ts      # DT-014: caché compartida de ProgresoPublico (antes vivía
│   │                          # solo en app/api/progreso/route.ts, DT-007); GET /api/progreso
│   │                          # la lee/escribe, crearMinutoAMinuto solo la lee (snapshot
│   │                          # de posición coherente con lo que ve el mapa público)
│   ├── imagen/                # DT-017: preparación de la foto en el navegador
│   │   ├── limites-subida.ts     # tamaño máximo y formatos aceptados; los comparten
│   │   │                         # cliente y servidor (por debajo del corte de ~4,5 MB
│   │   │                         # que aplica el edge de Vercel)
│   │   ├── escalera-compresion.ts # dominio puro: peldaños calidad→dimensiones, elección
│   │   │                          # del primero que cabe (la codificación entra como parámetro)
│   │   └── preparar-foto.ts      # solo cliente: decodifica con <img> (orientación EXIF),
│   │                             # recodifica a JPEG en canvas, degrada al original si falla
│   ├── envio/                 # DT-017: envío de formularios del panel a sus Server Actions
│   │   ├── errores-de-envio.ts   # dominio puro: qué fallo se reintenta y qué se enseña
│   │   └── reintentar.ts         # dominio puro: reintento con espera creciente (espera inyectada)
│   ├── traza/
│   │   ├── traza.geojson         # traza de CÁLCULO (7.951 puntos, sin simplificar, DT-015)
│   │   ├── traza-mapa.geojson    # traza de PINTADO (Douglas-Peucker 3 m, ~2.101 pts)
│   │   ├── proyeccion.ts         # dominio puro: prepararTraza + calcularProgreso (modo guiado, cerrado);
│   │   │                         # calcularProgreso proyecta con ventana deslizante (±30 segmentos
│   │   │                         # alrededor del último índice, DT-018) con fallback a escaneo completo
│   │   ├── proyeccion.test.ts    # tests unitarios con fixtures sintéticas
│   │   ├── proyeccion.ventana.test.ts  # DT-018: equivalencia numérica con/sin ventana a escala de
│   │   │                         # miles de puntos, desvío que se sale de la ventana, hueco largo,
│   │   │                         # rendimiento con histórico de un día completo (~7.200 puntos)
│   │   ├── progreso-publico.ts   # F3: aProgresoPublico() — proyección segura al cliente (rama guiado)
│   │   ├── progreso-libre.ts     # DT-016: calcularProgresoLibre() — dominio puro del modo libre
│   │   │                         # (distancia haversine al destino, sin corredor ni validación)
│   │   ├── cargar-traza.ts       # carga traza.geojson (cálculo) server-side
│   │   ├── cargar-traza-mapa.ts  # F3: carga traza-mapa.geojson (pintado) server-side
│   │   └── umbrales.ts           # constantes del dominio (EN_RUTA_MAX_M, etc.; VENTANA_PROYECCION_SEGMENTOS
│   │                             # y VENTANA_PROYECCION_FALLBACK_MAX_M de la ventana deslizante, DT-018)
│   ├── supabase/             # F2
│   │   ├── admin.ts          # cliente service role (solo servidor)
│   │   ├── public.ts         # cliente anon (peticiones públicas)
│   │   ├── paginacion.ts     # DT-018: obtenerTodasLasFilas() — fetch paginado genérico con .range()
│   │   │                     # en bucle (PostgREST corta a 1000 filas sin Range explícito), tope de
│   │   │                     # seguridad + log; usado por progreso/route.ts (rama guiado) y page.tsx
│   │   └── storage.ts        # DT-013: subida de fotos a Storage (validación MIME/tamaño
│   │                         # con los límites de lib/imagen/limites-subida.ts, DT-017)
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
| Server Actions | `app/admin/actions.ts` | Mutaciones del panel. Autenticadas con cookie. Los fallos esperados de `crearMinutoAMinuto` se devuelven (`ResultadoPublicacion`), no se lanzan: Next redacta en producción el mensaje de todo error lanzado en el servidor (DT-017). |
| UI | `app/` + `components/` | Sin lógica de negocio. Consume `lib/`. |

## La regla no negociable de las dos trazas

**Hay exactamente dos representaciones de la traza y tienen responsabilidades
distintas. Mezclarlas es el bug más caro posible.**

| | `lib/traza/traza.geojson` | `lib/traza/traza-mapa.geojson` |
|---|---|---|
| Propósito | CÁLCULO de progreso | PINTADO en el mapa (cliente) |
| Puntos | 7.951 (sin simplificar, DT-015) | ~2.101 (Douglas-Peucker 3 m) |
| Longitud | ~110,43 km (real, corredor extendido DT-005 + DT-015) | ~110,13 km (acortada por DP) |
| Dónde se usa | `proyeccion.ts`, solo servidor | Se envía al navegador en F3 |
| Puede usarse para calcular % | SÍ | **NO — su longitud no es válida** |

Douglas-Peucker corta esquinas y acorta la línea ~298 m. Si el cálculo usara
la traza simplificada, Santi llegaría al Obradoiro y la web le diría que le
faltan 298 m — el peor fallo posible en el peor momento.

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
- El `modo` de un intento (`'guiado' | 'libre'`, DT-016) se fija en `iniciarReto()`
  (transición `antes` → `durante`) y es inmutable durante toda su vida — cambiarlo
  exige "Reiniciar" (que abre un intento nuevo). `destino_lat`/`destino_lon` solo
  se rellenan en modo libre; en modo guiado quedan siempre `null`.

## Variables de entorno requeridas (F2+)

Ver `docs/tecnico/plan-ejecucion-v1.md` para la lista completa:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `TRACK_TOKEN`, `ADMIN_PASSWORD`,
`ADMIN_SESSION_SECRET`, `NEXT_PUBLIC_MAPTILER_KEY`.
