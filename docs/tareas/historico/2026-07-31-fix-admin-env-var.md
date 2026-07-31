# Tarea en curso

## Fix: `getSupabaseAdmin()` leía `SUPABASE_URL` en vez de `NEXT_PUBLIC_SUPABASE_URL`

**Origen:** Debugger — fix simple, causa raíz confirmada por verificación de
integración manual real contra Supabase (fuera de los tests con mocks).

**Causa raíz:** `lib/supabase/admin.ts` leía `process.env.SUPABASE_URL`, una
variable que nunca existió en el proyecto — el plan (`docs/tecnico/plan-ejecucion-v1.md`)
solo define `NEXT_PUBLIC_SUPABASE_URL`. Con `.env.local` correctamente
configurado, `getSupabaseAdmin()` lanzaba en el primer uso real y
`/api/track` devolvía 500.

**Solución aplicada:** `admin.ts` ahora lee `process.env.NEXT_PUBLIC_SUPABASE_URL`
(misma variable que `public.ts`), con comentarios actualizados explicando por
qué la URL no es secreta y no necesita variable de servidor separada.

**Archivos modificados:**
- `lib/supabase/admin.ts` — variable de entorno corregida + comentarios actualizados.
- `lib/supabase/admin.test.ts` (nuevo) — 4 tests con `vi.stubEnv()`: construye
  sin lanzar con las vars correctas, lanza si falta `NEXT_PUBLIC_SUPABASE_URL`,
  lanza si falta `SUPABASE_SERVICE_ROLE_KEY`, y no se confunde si existe una
  variable `SUPABASE_URL` (sin prefijo) suelta — regresión directa del bug.
- `docs/LESSONS.md` — nueva entrada sobre tests con mocks no verificando
  nombres reales de env vars.
- `CHANGELOG.md` — entrada del fix.

**Quality gates (todas en verde):**
- `pnpm typecheck` — 0 errores.
- `pnpm lint` — 0 errores/warnings.
- `pnpm test` — 36/36 tests pasan (32 previos + 4 nuevos de `admin.test.ts`).
- `pnpm build` — build de producción completa sin errores.

**No se ha tocado:** `DEBT.md` no requiere cambios — la deuda existente sobre
"verificación contra Supabase real pendiente" sigue siendo válida en general
(este fix resuelve un síntoma concreto encontrado durante esa verificación,
no cierra la verificación completa). `docs/bugs/BUGS.md` no se ha tocado —
esa entrada la escribe el Debugger, no el Implementador.

---

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
