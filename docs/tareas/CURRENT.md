# Tarea en curso

_Sin tarea activa._

Última cerrada: **F2 — Datos e ingesta** (código completo, sin verificar contra
Supabase real — bloqueado por F0), archivada en `historico/`.

⚠️ **Antes de dar F2 por terminada de verdad**, cuando exista el proyecto
Supabase: aplicar `supabase/migrations/0001_esquema_inicial.sql`, poner las env
vars, y probar `/api/track` con una petición real (curl u OwnTracks) contra la
BD viva. El código está testeado con mocks, no con integración real.

Siguiente en el roadmap: **F3 — Web pública**. También bloqueada por F0
(necesita Supabase para leer datos reales, MapTiler para el mapa).

⚠️ Deuda de prioridad Media pendiente antes de desplegar: rate limiting en
`/api/track` (ver `DEBT.md`). Y la capa 2 de DT-006 (botón "descartar
cualquier punto" en el panel admin) llega en F4.

---

Este archivo es la pizarra compartida entre todos los agentes del pipeline: los
subagentes corren aislados y no ven la conversación, así que lo único que
comparten es lo que está escrito aquí. Lo gobierna el Orquestador, que lo crea al
empezar cada tarea con la plantilla del framework y lo archiva al cerrarla.
