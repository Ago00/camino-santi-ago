-- Foto de llegada opcional (ver docs/tecnico/decisiones-tecnicas.md, DT-024).
--
-- Columna nueva en `intentos`: URL pública del objeto subido al mismo bucket
-- de Storage que ya usa el feed "minuto a minuto" (`minuto-a-minuto`, ver
-- supabase/migrations/0002_minuto_a_minuto.sql) desde el modal "Finalizar"
-- del panel admin, con el prefijo `llegada-` en el nombre del objeto para no
-- colisionar con las fotos del feed. Nullable: la mayoría de finalizaciones
-- no llevan foto, y "Retomar" (llegada → durante, mismo intento) no debe
-- perder una foto ya subida si se vuelve a Finalizar sin tocarla.
--
-- Este fichero NO se ha aplicado nunca contra el proyecto Supabase real —
-- queda listo para que se aplique manualmente (editor SQL o `supabase db
-- push`), igual que 0001_esquema_inicial.sql, 0002_minuto_a_minuto.sql,
-- 0003_modo_intento.sql y 0004_visitas_web.sql (ver DEBT.md: 0003 y 0004
-- siguen sin confirmarse aplicadas).

alter table intentos
  add column foto_llegada_url text;
