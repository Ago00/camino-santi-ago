-- Minuto a minuto: feed en directo con fotos (ver docs/tecnico/decisiones-tecnicas.md, DT-013).
--
-- Mismo patrón que `posiciones` (migración 0001): tabla scoped por
-- `intento_id`, RLS de `anon` limitada al intento activo, cero escritura
-- para `anon` (todas las mutaciones van por Server Actions con service role,
-- que bypassa RLS de BD y de Storage por diseño de Supabase).
--
-- Este fichero NO se ha aplicado nunca contra un proyecto Supabase real —
-- queda listo para que se aplique manualmente (editor SQL o `supabase db
-- push`), igual que se hizo con 0001_esquema_inicial.sql.

create table minuto_a_minuto (
  id          bigint generated always as identity primary key,
  intento_id  bigint not null references intentos(id),
  texto       text not null check (char_length(texto) between 1 and 500),
  foto_url    text,               -- URL pública de Storage; null = sin foto
  lat         double precision,   -- snapshot de la última posición conocida al publicar
  lon         double precision,   -- puede quedar null si aún no hay ninguna posición
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index minuto_a_minuto_intento_idx on minuto_a_minuto (intento_id, created_at desc);

alter table minuto_a_minuto enable row level security;

-- Mismo criterio que `posiciones`: el feed de un intento cerrado deja de ser
-- visible para anon. "Reiniciar" (app/admin/actions.ts) cierra el intento
-- actual y abre uno nuevo, así que el feed se resetea automáticamente sin
-- código adicional.
create policy "select_intento_activo" on minuto_a_minuto for select
  using (exists (select 1 from intentos where intentos.id = minuto_a_minuto.intento_id and not intentos.cerrado));

-- Storage: bucket público para las fotos adjuntas. Sin políticas de Storage
-- para anon (ni siquiera de lectura explícita) porque el bucket es público:
-- la URL pública de cada objeto ya es accesible sin autenticación. Todas las
-- subidas pasan por Server Actions con el cliente service role (lib/supabase/storage.ts),
-- que bypassa RLS de Storage igual que bypassa RLS de BD.
insert into storage.buckets (id, name, public) values ('minuto-a-minuto', 'minuto-a-minuto', true);
