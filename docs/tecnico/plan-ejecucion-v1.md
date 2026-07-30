# Camino de Santi(ago) — Plan de ejecución v1

> Plan aprobado (2026-07-30). Fuente de requisitos: `ESPECIFICACION-v1.md`.
> A partir de aquí, solo ejecutar fase a fase. Cada fase pasa por el pipeline del framework
> (implementador → reviewer → seguridad) según aplique.

## Decisiones cerradas de arquitectura

- **Opción B**: repo nuevo **`camino-santi-ago`** (público, límite Vercel Hobby), proyecto Vercel nuevo,
  proyecto Supabase nuevo. La POC (`camino/` → repo `camino-tracking-poc`) queda congelada como referencia.
- **Dominio**: `*.vercel.app` de momento; dominio propio ampliable después sin reescritura.
- **Textos**: default en código + override desde BDD (tabla `textos` clave→valor, clave libre).
- **Admin**: middleware en `/admin/*` + Server Actions para mutaciones; `/api/track` route handler para el móvil.
- **Intentos**: N intentos internos, solo uno activo; botón Reiniciar (cierra intento y abre otro en `antes`);
  nada se borra nunca de BDD.
- **Mapa**: MapLibre + tiles MapTiler; traza y puntos con **overlay SVG recalculado en `move`**
  (lección POC: las capas GL `line`/`circle` no pintaban fiable). Cuidado con la race condition
  `load` vs props (usar ref con valor reciente).
- **Traza**: `docs/traza-camino-portugues.geojson` ya generada (100,000 km exactos, KML oficial Xunta,
  CC BY-SA 4.0, inicio a 0,794 km antes de O Porriño). Simplificar (Douglas-Peucker) para cliente si pesa.

## Esquema Supabase

```sql
create table intentos (
  id              bigint generated always as identity primary key,
  fase            text not null default 'antes' check (fase in ('antes','durante','llegada')),
  cerrado         boolean not null default false,   -- true al Reiniciar
  started_at      timestamptz,
  ended_at        timestamptz,
  mensaje_llegada text,
  created_at      timestamptz not null default now()
);
-- solo un intento abierto a la vez:
create unique index intentos_activo_unico on intentos ((true)) where not cerrado;

create table posiciones (
  id         bigint generated always as identity primary key,
  intento_id bigint not null references intentos(id),
  lat        double precision not null,
  lon        double precision not null,
  ts         timestamptz not null,
  batt       int,
  acc        real,
  fuente     text not null default 'app' check (fuente in ('app','manual')),
  descartado boolean not null default false,        -- soft-delete reversible
  created_at timestamptz not null default now()
);
create index posiciones_intento_ts_idx on posiciones (intento_id, ts asc) where not descartado;

create table intenciones (
  id         bigint generated always as identity primary key,
  texto      text not null check (char_length(texto) between 1 and 1000),
  nombre     text,                                  -- null = anónima
  created_at timestamptz not null default now()
);

create table comentarios (
  id          bigint generated always as identity primary key,
  nombre      text not null check (char_length(nombre) between 1 and 80),
  texto       text not null check (char_length(texto) between 1 and 1000),
  visibilidad text not null default 'publico' check (visibilidad in ('publico','privado')),
  oculto      boolean not null default false,
  created_at  timestamptz not null default now()
);

create table textos (
  clave      text primary key,
  valor      text not null default '',
  updated_at timestamptz not null default now()
);
```

## RLS

| Tabla | anon (público) | service role (servidor) |
|---|---|---|
| `intentos` | SELECT solo el activo (`not cerrado`) | ALL |
| `posiciones` | SELECT solo `not descartado` del intento activo | ALL |
| `intenciones` | **ninguna política** (cero acceso) | ALL |
| `comentarios` | SELECT `publico and not oculto`; INSERT sin poder fijar `oculto=true` | ALL |
| `textos` | SELECT | ALL |

Escrituras de posiciones (ingesta GPS), todo lo de intenciones, y moderación: **solo** server-side
con service role. Inserción de intenciones y comentarios: vía route handler/server action con
validación Zod (no insert directo anon para intenciones — esa tabla no tiene política alguna).

## Estructura del proyecto

```
camino-santi-ago/
├── app/
│   ├── page.tsx                      # web pública (antes/durante/llegada)
│   ├── admin/
│   │   ├── login/page.tsx
│   │   ├── page.tsx                  # Actividad · Posición · Intenciones · Comentarios · Textos
│   │   └── actions.ts                # server actions
│   └── api/
│       ├── track/route.ts            # ingesta OwnTracks (token + timingSafeEqual, patrón POC)
│       ├── comentarios/route.ts      # POST público
│       ├── intenciones/route.ts      # POST público
│       └── admin/login/route.ts
├── components/
│   ├── mapa/Mapa.tsx                 # overlay SVG (patrón POC)
│   ├── publico/                      # hero, stats, formularios, hilo del camino…
│   └── admin/
├── lib/
│   ├── supabase/{admin,public}.ts
│   ├── traza/
│   │   ├── traza.geojson
│   │   ├── proyeccion.ts             # dominio puro: (histórico, traza) => Progreso
│   │   └── proyeccion.test.ts
│   ├── textos/defaults.ts            # textos por defecto (override desde BDD)
│   ├── auth/admin-session.ts         # firma/verificación cookie HMAC
│   └── types.ts
├── middleware.ts                     # protege /admin/*
├── docs/ (producto, tecnico, tareas, bugs, LESSONS.md, DEBT.md)
├── CHANGELOG.md
└── CLAUDE.md / AGENTS.md
```

**Lógica de progreso** (`proyeccion.ts`, pura y testeada): `@turf/nearest-point-on-line` para
avance + separación; barra monótona (máximo histórico); odómetro = haversine real acumulado;
km restantes return-aware; estados `en-ruta | desvio-menor | desvio-mayor`. Fixtures de test:
en ruta, desvío pequeño, desvío grande, salto GPS imposible, punto descartado.

**Env vars**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`TRACK_TOKEN`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `NEXT_PUBLIC_MAPTILER_KEY`.

## Fases de ejecución

- **F0 — Infraestructura**: repo GitHub `camino-santi-ago` (público) · proyecto Supabase nuevo ·
  proyecto Vercel nuevo conectado al repo · alta MapTiler · env vars. *(Requiere a Santi para las altas.)*
- **F1 — Base**: scaffolding Next.js + estructura de carpetas + traza GeoJSON (simplificada si hace falta)
  + `proyeccion.ts` con tests + tipos de dominio.
- **F2 — Datos e ingesta**: esquema SQL + RLS + `/api/track` + clientes Supabase + verificación con
  OwnTracks real.
- **F3 — Web pública**: página con 3 fases, mapa (overlay SVG, cielo-reloj, mojón km restantes),
  stats, formularios de intenciones/comentarios, textos con default+override, peregrino animado.
- **F4 — Panel admin**: login + middleware + secciones (actividad con Reiniciar, posición,
  intenciones, comentarios, textos).
- **F5 — Cierre**: revisión (reviewer + seguridad OWASP/RLS), deploy producción, prueba real andando
  (como la POC), carga de textos reales.

Orden F1→F5 secuencial; F0 puede solaparse con F1 (el código no necesita las cuentas hasta F2).
