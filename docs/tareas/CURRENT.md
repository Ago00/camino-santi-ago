# Tarea en curso

## Fix: `crearMinutoAMinuto` usa el snapshot de posición de la caché compartida de `/api/progreso`, no una lectura fresca de `posiciones`

**Origen:** Decisión del Arquitecto (Opción A, aprobada por el usuario).

### Problema

`crearMinutoAMinuto` (`app/admin/actions.ts:328-343`) guarda el `lat`/`lon`
de cada entrada nueva de `minuto_a_minuto` leyendo en fresco y sin caché la
última fila de `posiciones`. Pero el mapa público muestra la posición
servida por `GET /api/progreso`, que tiene caché de 20 s en servidor +
polling de 30 s en cliente. Esto puede hacer que una entrada quede con una
coordenada más "adelantada" que lo que el mapa está mostrando como pintado
en ese momento.

### Fix aprobado

1. Extraer el estado de caché de `app/api/progreso/route.ts` (`let cache:
   EntradaCache | null`, `CACHE_TTL_MS = 20_000`, `limpiarCacheProgreso()`)
   a un módulo nuevo compartido `lib/progreso-cache.ts`. Misma forma de
   datos, mismas funciones (lectura, escritura, limpieza para tests).
   `app/api/progreso/route.ts` pasa a usarlo — comportamiento externo sin
   cambios (respuesta HTTP, TTL, rate limiting).
2. En `crearMinutoAMinuto`, sustituir el `SELECT lat, lon FROM posiciones
   ... ORDER BY ts DESC LIMIT 1` por lectura de `cache?.valor.ultimaPosicion`
   del módulo compartido.
   - Caché con `ultimaPosicion` no nulo → usa ese `lat`/`lon`.
   - Sin caché o `ultimaPosicion` nulo → `lat: null, lon: null` (igual que
     hoy con "aún no hay ninguna posición registrada").
   - Sin fallback a lectura fresca de `posiciones`.
   - No comprobar TTL para decidir si usar el valor cacheado.
3. La consulta a `intentos` para `intentoActivo.id` no se toca.

### Alcance — qué NO tocar

- `components/mapa/Mapa.tsx`
- Contrato público de `/api/progreso` (código HTTP, forma de respuesta,
  rate limiting, TTL)
- `editarMinutoAMinuto`, `eliminarMinutoAMinuto`
- Sin correcciones retroactivas de entradas ya publicadas
- Sin columnas ni migraciones de BD nuevas

### Documentación a actualizar

- DT-014 en `docs/tecnico/decisiones-tecnicas.md`
- `CHANGELOG.md`
- `docs/tecnico/arquitectura.md` (si describe el flujo actual)
- Tests: `app/admin/actions.test.ts`, `app/api/progreso/route.test.ts`

---

## Archivos modificados/creados

- `lib/progreso-cache.ts` (nuevo) — módulo de caché compartida
- `lib/progreso-cache.test.ts` (nuevo) — tests del módulo de caché
- `app/api/progreso/route.ts` — usa el módulo compartido en vez de estado local
- `app/admin/actions.ts` — `crearMinutoAMinuto` lee de la caché compartida
- `app/admin/actions.test.ts` — tests actualizados para el nuevo origen del dato
- `app/api/progreso/route.test.ts` — import de `limpiarCacheProgreso` actualizado
- `docs/tecnico/decisiones-tecnicas.md` — nueva DT-014
- `docs/tecnico/arquitectura.md` — referencia al nuevo módulo
- `CHANGELOG.md` — entrada del fix

## Estado de quality gates

- `pnpm typecheck` — verde, cero errores.
- `pnpm lint` — verde, cero errores/warnings.
- `pnpm test` — verde, 208/208 tests (21 ficheros), incluye 5 tests nuevos
  de `lib/progreso-cache.test.ts` y las 4 nuevas assertions de
  `crearMinutoAMinuto` en `app/admin/actions.test.ts`.
- `pnpm build` — verde, compila y genera todas las rutas correctamente
  (incluye `bundle-maplibre-worker` en `prebuild`).

Lista para Reviewer.

---

## Historial de revisión

### Reviewer — 2026-08-02

**Veredicto:** ✅ Aprobado — pasa a Seguridad.

Verificado punto por punto contra la Opción A aprobada:
- `crearMinutoAMinuto` (`app/admin/actions.ts:337`) lee
  `obtenerCacheProgreso()?.valor.ultimaPosicion ?? null` — sin comprobar TTL,
  sin fallback a `posiciones` (confirmado leyendo el diff completo de la
  función, no solo el resumen).
- `app/api/progreso/route.ts` mantiene su comportamiento HTTP externo sin
  cambios (TTL de 20 s, forma de respuesta, rate limiting 60/min).
- `lib/progreso-cache.ts` es la única fuente de estado de caché del proyecto
  (verificado con grep de `let cache`) — sin duplicación.
- DT-014 documenta el riesgo de Vercel (memoria no compartida entre
  instancias serverless) con honestidad, sin minimizarlo, y marca el
  fallback a `null` como comportamiento esperado, no bug.
- Los 4 tests nuevos/adaptados de `crearMinutoAMinuto` en `actions.test.ts`
  cubren caché con posición, `ultimaPosicion` null, caché vacía y valor
  fuera de TTL usado igualmente, con assertions concretas. El workaround del
  spy de `Date.now` se restaura puntualmente (`mockRestore()`), sin
  contaminar otros tests del fichero.
- `CHANGELOG.md`, `arquitectura.md` y `DEBT.md` coherentes con el código
  real.

Sin bloqueantes. Sin recomendaciones nuevas — la deuda generada
(`crearMinutoAMinuto` puede guardar `lat`/`lon` a `null` por caché vacía
entre instancias serverless) ya estaba correctamente registrada por el
Implementador en `DEBT.md` con contexto, impacto y solución propuesta.

No se pudo ejecutar `pnpm typecheck`/`lint`/`test`/`build` desde el
Reviewer (sin shell disponible en este contexto); revisión estática
exhaustiva del código no encontró inconsistencias con el resultado 4/4 en
verde reportado por el Implementador.

---

Este archivo es la pizarra compartida entre todos los agentes del pipeline: los
subagentes corren aislados y no ven la conversación, así que lo único que
comparten es lo que está escrito aquí. Lo gobierna el Orquestador, que lo crea al
empezar cada tarea con la plantilla del framework y lo archiva al cerrarla.
