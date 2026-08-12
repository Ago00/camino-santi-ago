-- Contador de tráfico reseteable: pestaña "Tráfico" del panel admin (ver
-- docs/tecnico/decisiones-tecnicas.md, DT-023).
--
-- Fila única de configuración (`id` fijo con `check`, patrón habitual para
-- tablas de una sola fila en Postgres). `cuenta_desde` es el corte a partir
-- del cual una visita de `visitas_web` cuenta en el panel: el botón "Reset"
-- de la pestaña "Tráfico" la adelanta a `now()`, sin borrar ninguna fila de
-- `visitas_web` — solo deja de contarlas, de forma reversible en el sentido
-- de que el dato en bruto sigue existiendo.
--
-- Mismo patrón de privacidad que `visitas_web` (migración 0004): RLS
-- activado y CERO políticas para `anon` — ninguna fila de esta tabla es
-- visible desde el cliente público, solo el service role (servidor) lee o
-- escribe.
--
-- Este fichero NO se ha aplicado nunca contra el proyecto Supabase real —
-- queda listo para que se aplique manualmente (editor SQL o `supabase db
-- push`), igual que se hizo con 0001_esquema_inicial.sql, 0002_minuto_a_minuto.sql,
-- 0003_modo_intento.sql y 0004_visitas_web.sql (ver DEBT.md: ninguna de esas
-- tres últimas tiene confirmada su aplicación en producción).

create table config_trafico (
  id            int primary key default 1 check (id = 1), -- fila única
  cuenta_desde  timestamptz not null default '2020-01-01T00:00:00Z',
  created_at    timestamptz not null default now()
);

insert into config_trafico (id) values (1);

alter table config_trafico enable row level security;
-- Sin políticas para anon: RLS activado y ninguna policy equivale a cero
-- acceso, igual que `visitas_web`.
