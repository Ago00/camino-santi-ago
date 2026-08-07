-- Modo de intento configurable: guiado / libre (ver docs/tecnico/decisiones-tecnicas.md, DT-016).
--
-- Añade a `intentos` el modo del intento (fijado al pulsar "Iniciar",
-- inmutable durante su vida — cambiarlo exige "Reiniciar") y el destino del
-- modo libre (lat/lon), solo relevante cuando modo = 'libre'.
--
-- Este fichero NO se ha aplicado nunca contra un proyecto Supabase real —
-- queda listo para que se aplique manualmente (editor SQL o `supabase db
-- push`), igual que se hizo con 0001_esquema_inicial.sql y
-- 0002_minuto_a_minuto.sql.

alter table intentos
  add column modo text not null default 'guiado' check (modo in ('guiado', 'libre')),
  add column destino_lat double precision,
  add column destino_lon double precision;
