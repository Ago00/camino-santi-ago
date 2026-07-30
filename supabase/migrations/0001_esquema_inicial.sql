-- Esquema inicial de camino-santi-ago (F2 — Datos e ingesta)
--
-- Fuente de verdad: docs/tecnico/plan-ejecucion-v1.md, sección "Esquema Supabase"
-- y tabla "RLS". No reinterpretar aquí — cualquier cambio de esquema pasa primero
-- por ese documento.
--
-- Este fichero NO se ha ejecutado nunca contra un proyecto Supabase real (no
-- existe todavía, ver F0 en docs/producto/roadmap.md). Es SQL revisado a mano
-- para ser válido y ejecutable tal cual el día que exista el proyecto.
--
-- Convención de carpeta: supabase/migrations/NNNN_slug.sql (numeración secuencial
-- de 4 dígitos), la misma que usa la CLI oficial de Supabase.

-- ---------------------------------------------------------------------------
-- Tabla: intentos
-- ---------------------------------------------------------------------------

create table intentos (
  id              bigint generated always as identity primary key,
  fase            text not null default 'antes' check (fase in ('antes','durante','llegada')),
  cerrado         boolean not null default false,   -- true al Reiniciar
  started_at      timestamptz,
  ended_at        timestamptz,
  mensaje_llegada text,
  created_at      timestamptz not null default now()
);

-- Solo un intento abierto a la vez.
create unique index intentos_activo_unico on intentos ((true)) where not cerrado;

-- ---------------------------------------------------------------------------
-- Tabla: posiciones
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Tabla: intenciones
-- ---------------------------------------------------------------------------

create table intenciones (
  id         bigint generated always as identity primary key,
  texto      text not null check (char_length(texto) between 1 and 1000),
  nombre     text,                                  -- null = anónima
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tabla: comentarios
-- ---------------------------------------------------------------------------

create table comentarios (
  id          bigint generated always as identity primary key,
  nombre      text not null check (char_length(nombre) between 1 and 80),
  texto       text not null check (char_length(texto) between 1 and 1000),
  visibilidad text not null default 'publico' check (visibilidad in ('publico','privado')),
  oculto      boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tabla: textos
-- ---------------------------------------------------------------------------

create table textos (
  clave      text primary key,
  valor      text not null default '',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Tabla de referencia (docs/tecnico/plan-ejecucion-v1.md):
--
-- | Tabla        | anon (público)                                              | service role |
-- |--------------|--------------------------------------------------------------|--------------|
-- | intentos     | SELECT solo el activo (not cerrado)                         | ALL          |
-- | posiciones   | SELECT solo not descartado del intento activo               | ALL          |
-- | intenciones  | ninguna política (cero acceso)                              | ALL          |
-- | comentarios  | SELECT publico and not oculto; INSERT sin poder fijar oculto| ALL          |
-- | textos       | SELECT                                                       | ALL          |
--
-- service role bypassa RLS por defecto en Supabase (no necesita políticas
-- explícitas): las únicas políticas que se declaran aquí son para el rol anon.
-- ---------------------------------------------------------------------------

-- intentos ------------------------------------------------------------------

alter table intentos enable row level security;

create policy intentos_select_activo
  on intentos
  for select
  to anon
  using (not cerrado);

-- posiciones ------------------------------------------------------------------

alter table posiciones enable row level security;

create policy posiciones_select_activo_no_descartado
  on posiciones
  for select
  to anon
  using (
    not descartado
    and intento_id in (select id from intentos where not cerrado)
  );

-- intenciones -----------------------------------------------------------------
-- Sin políticas públicas: RLS activado y ninguna policy para anon equivale a
-- cero acceso. La inserción de intenciones se hace vía route handler con
-- service role, nunca con el cliente anon directo.

alter table intenciones enable row level security;

-- comentarios -----------------------------------------------------------------

alter table comentarios enable row level security;

create policy comentarios_select_publico_no_oculto
  on comentarios
  for select
  to anon
  using (visibilidad = 'publico' and not oculto);

-- INSERT público permitido, pero sin poder fijar oculto=true: la columna
-- oculto se restringe mediante with check, forzando el valor por defecto.
create policy comentarios_insert_publico
  on comentarios
  for insert
  to anon
  with check (oculto = false);

-- textos ------------------------------------------------------------------

alter table textos enable row level security;

create policy textos_select_publico
  on textos
  for select
  to anon
  using (true);
