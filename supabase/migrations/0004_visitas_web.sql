-- Visitas a la web pública: pestaña "Tráfico" del panel admin (ver
-- docs/tecnico/decisiones-tecnicas.md, DT-022).
--
-- Una fila por petición matcheada en proxy.ts a la ruta pública "/" (F3):
-- ruta, timestamp, id de visitante anónimo (cookie funcional, sin datos
-- personales ni fingerprinting) y referer si vino en la cabecera.
--
-- Mismo patrón de privacidad que `intenciones` (migración 0001): RLS
-- activado y CERO políticas para `anon` — ninguna fila de esta tabla es
-- visible desde el cliente público, solo el service role (servidor) lee o
-- escribe. La inserción va siempre desde `proxy.ts` con `getSupabaseAdmin()`,
-- nunca desde el cliente anon directo.
--
-- Este fichero NO se ha aplicado nunca contra el proyecto Supabase real —
-- queda listo para que se aplique manualmente (editor SQL o `supabase db
-- push`), igual que se hizo con 0001_esquema_inicial.sql, 0002_minuto_a_minuto.sql
-- y 0003_modo_intento.sql (ver DEBT.md: 0003 sigue sin confirmarse aplicada).

create table visitas_web (
  id            bigint generated always as identity primary key,
  ruta          text not null,
  ts            timestamptz not null default now(),
  visitante_id  text not null,      -- id anónimo de la cookie funcional (proxy.ts)
  referer       text,               -- cabecera Referer de la petición; null = directo
  created_at    timestamptz not null default now()
);

create index visitas_web_ts_idx on visitas_web (ts asc);

alter table visitas_web enable row level security;
-- Sin políticas para anon: RLS activado y ninguna policy equivale a cero
-- acceso, igual que `intenciones`.
