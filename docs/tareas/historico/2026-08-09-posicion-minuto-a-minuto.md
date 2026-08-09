# Tarea en curso

**Título:** Las entradas del minuto a minuto se guardan sin posición (lat/lon a null)
**Tipo:** Bug
**Estado:** Implementación
**Iniciada:** 2026-08-09

## Prompt clarificado

Las **16 entradas** publicadas en el "minuto a minuto" durante la prueba real
del 2026-08-07 tienen `lat`/`lon` a `null` — el **100 %**, no un caso raro.
Efecto visible: al pinchar cualquier entrada del feed para ver dónde estaba
Santi en ese momento, no aparece ningún marcador en el mapa.

**Causa raíz (ya diagnosticada y documentada, DT-014 + `DEBT.md`).**
`crearMinutoAMinuto` (`app/admin/actions.ts:422`) lee la posición de una
caché en memoria de proceso (`lib/progreso-cache.ts`, compartida con
`GET /api/progreso`, DT-007/DT-014) en vez de consultar `posiciones`
directamente — decisión deliberada de DT-014 para que la coordenada
guardada coincida exactamente con lo que el mapa público está mostrando en
ese instante, sin adelantarse. El problema: esa caché vive en memoria de
**una instancia serverless concreta** y no se comparte con otras — si
`crearMinutoAMinuto` se ejecuta en una instancia que no ha atendido
recientemente ningún `GET /api/progreso`, la caché está vacía y la entrada
se guarda sin posición. Sin fallback a una lectura fresca a propósito (ver
DT-014: revertir ese fallback "deshace el fix" que solucionaba una
inconsistencia distinta — la entrada podía quedar coordenada "por delante"
de lo que el mapa público estaba pintando).

**Por qué esto ya no es solo una posibilidad teórica.** DT-014 preveía esto
como algo infrecuente ("`/api/progreso` recibe polling cada 30 s desde
cualquier visitante... la caché rara vez estará vacía") y proponía escalar a
una solución de fondo *"si en producción se observa con demasiada
frecuencia"*. Con datos reales de producción, la frecuencia observada es
100 %, no "demasiada" — es total. La explicación más probable: durante la
prueba del 7 de agosto, la web pública tuvo poco o ningún tráfico real
(nadie mirando en directo salvo pruebas puntuales), así que casi nunca había
una petición `GET /api/progreso` reciente que hubiera calentado la caché de
la instancia que atendió cada publicación del feed.

**Lo que NO se sabe todavía y condiciona la solución:** si el día del reto
real, con familia y amigos mirando de verdad (tráfico continuo de polling
cada 30 s), la frecuencia de caché vacía bajará por sí sola sin tocar nada,
o si Vercel puede seguir enrutando la Server Action de publicar y las
peticiones `GET /api/progreso` a instancias distintas incluso con tráfico
sano (razón estructural, no solo de volumen). No hay forma de confirmarlo
sin datos reales del día — el Arquitecto debe proponer una solución que no
dependa de que esa duda se resuelva a favor.

## Alcance

- **Incluye:** cómo `crearMinutoAMinuto` obtiene la posición a guardar con
  cada entrada nueva.
- **Excluye explícitamente:**
  - Bugs 1 y 2 (ya cerrados y fusionados en `main`).
  - El propio mecanismo de caché de `/api/progreso` (`lib/progreso-cache.ts`,
    DT-007) — su TTL y comportamiento para servir la web pública no cambian.
  - Editar la posición de una entrada ya publicada (DT-013 lo descartó a
    propósito: la solución es borrar y republicar).

## Comportamiento en casos límite

- **Intento sin ninguna posición registrada todavía** (justo tras "Iniciar",
  antes del primer GPS): la entrada se sigue guardando con `lat`/`lon` a
  `null` — no hay ninguna posición real que mostrar, este caso no es el bug,
  es correcto.
- **Publicar con la caché vacía pero con posiciones reales ya en BD** (el
  caso real que falló): la entrada debe quedar con una posición real
  asociada.

## Supuestos asumidos

- El **impacto sigue siendo cosmético** (sin marcador al pinchar la entrada,
  nada más) — no afecta al cálculo de progreso ni a ningún otro dato del
  intento. Esto no cambia con esta tarea.
- Dado que se desconoce si el problema se autocorregirá parcialmente con
  tráfico real el día del reto, **la solución debe eliminar el caso `null`
  por completo, no solo reducir su frecuencia** — es una entrada del feed
  familiar, no un dato técnico; que falte el marcador en varias entradas
  seguidas sería visible y notado.

## Diseño
Mockup: N/A — no hay cambio de UI; a lo sumo cambia de dónde sale un dato que
ya se guarda igual.

## Decisión técnica / Diagnóstico

### Decisión aprobada por el usuario (2026-08-09) — DT-019

El usuario preguntó explícitamente por una opción mejor que la primera
propuesta (lectura en bruto de `posiciones` como respaldo) — pidió que se
consultara "la última ubicación enviada **y pintada**". Eso llevó a refinar
la Opción A original a la versión aprobada. Ver DT-019 en
`docs/tecnico/decisiones-tecnicas.md` para el análisis completo. Resumen de
lo que hay que construir:

1. **Extraer `calcularProgresoActual`** de `app/api/progreso/route.ts` (hoy
   función privada) a un módulo compartido, para que `route.ts` y
   `app/admin/actions.ts` la usen sin duplicar lógica. Sin cambios de
   comportamiento en `route.ts` — sigue haciendo exactamente lo mismo,
   importado desde el sitio nuevo.
2. **En `crearMinutoAMinuto`** (`app/admin/actions.ts:422`): si
   `obtenerCacheProgreso()` no tiene valor, en vez de dar `lat`/`lon` a
   `null` directamente, llamar a `calcularProgresoActual()` para obtener el
   progreso fresco (funciona igual en modo guiado y libre, ya lo resuelve la
   función existente), extraer `ultimaPosicion` de ahí, y **guardar el
   resultado en la caché** (`guardarCacheProgreso`) igual que ya hace
   `route.ts` — mismo patrón, disparado desde un sitio más.
3. Si `calcularProgresoActual()` también da `ultimaPosicion: null` (de
   verdad no hay ninguna posición registrada todavía para el intento), la
   entrada se guarda con `lat`/`lon` a `null` — comportamiento correcto, no
   es el bug (ver "Comportamiento en casos límite" arriba).

**Fuera de alcance (no tocar):** el esquema de BD, el TTL/comportamiento de
`lib/progreso-cache.ts` en el camino normal (caché caliente) — sigue
idéntico a DT-014, la Opción B de `DEBT.md` (persistir en `intentos`).

**Tests obligatorios:**
- `crearMinutoAMinuto` con caché vacía y posiciones reales en BD debe guardar
  `lat`/`lon` no nulos, coincidentes con lo que `calcularProgresoActual`
  calcularía en ese momento (modo guiado y modo libre).
- `crearMinutoAMinuto` con caché vacía y sin ninguna posición real en BD
  debe seguir guardando `lat`/`lon` a `null` (caso límite legítimo).
- `crearMinutoAMinuto` con caché caliente debe seguir usando el valor de la
  caché sin recalcular (comportamiento de DT-014 intacto — test de
  regresión, no solo de la funcionalidad nueva).
- Test de la función extraída (`calcularProgresoActual` o como se llame en
  su nueva ubicación) si no lo tenía ya cobertura directa.

## Archivos modificados

**Nuevos:**
- `lib/traza/progreso-actual.ts` — `calcularProgresoActual()` extraída de
  `app/api/progreso/route.ts` (DT-019): consulta el intento activo (con
  compatibilidad temporal migración 0003), el histórico correspondiente
  según el modo, y delega en `calcularProgreso`/`calcularProgresoLibre`. Sin
  caché propia.
- `lib/traza/progreso-actual.test.ts` — cobertura directa de la función
  extraída (antes solo indirecta vía `route.test.ts`): sin intento activo,
  modo guiado con histórico paginado, modo libre con solo la última
  posición, y el fallback de compatibilidad de la migración 0003.

**Modificados:**
- `app/api/progreso/route.ts` — ya no define `calcularProgresoActual`
  localmente; la importa del módulo nuevo. Sin cambio de comportamiento
  externo (mismo TTL, mismo rate limiting, misma respuesta HTTP). Cabecera
  reescrita para reflejar dónde vive ahora cada responsabilidad.
- `app/admin/actions.ts` (`crearMinutoAMinuto`) — cuando
  `obtenerCacheProgreso()` no tiene ninguna entrada (caché realmente vacía,
  no solo `ultimaPosicion: null` dentro de una entrada ya resuelta), llama a
  `calcularProgresoActual()`, usa su `ultimaPosicion` y deja el resultado en
  la caché compartida con `guardarCacheProgreso`. Si el recálculo también da
  `ultimaPosicion: null`, la entrada se guarda sin posición — caso límite
  legítimo, no el bug.
- `app/admin/actions.test.ts` — mock de `@/lib/traza/progreso-actual`;
  actualizados los tests de "caché vacía" (ya no esperan `null` sin más:
  ahora verifican que se recalcula, en modo guiado y libre, que el resultado
  se guarda en caché, y el caso límite de recálculo también nulo). Añadidas
  aserciones `expect(calcularProgresoActualMock).not.toHaveBeenCalled()` en
  los tests de caché caliente (regresión de DT-014).
- `docs/tecnico/arquitectura.md` — añadida la fila de
  `lib/traza/progreso-actual.ts`, actualizadas las de `api/progreso/route.ts`,
  `lib/progreso-cache.ts` y la fila de Server Actions.

**No tocados a propósito:** `lib/traza/proyeccion.ts`, `lib/progreso-cache.ts`
(el módulo en sí, solo se le añade un llamador más), esquema de BD,
`app/api/progreso/route.test.ts` (sigue en verde sin cambios: los mocks de
`@/lib/supabase/public` y `@/lib/traza/cargar-traza` siguen interceptando el
módulo real independientemente de quién lo importe).

## Quality gates

- `pnpm typecheck` — verde, cero errores.
- `pnpm lint` — verde, cero errores/warnings.
- `pnpm test` — verde, 30 ficheros / 318 tests (incluye los 4 nuevos de
  `progreso-actual.test.ts` y los 3 nuevos/reescritos de
  `actions.test.ts` sobre el camino de recálculo).

## Historial de revisión

### Ronda 1 — Reviewer (2026-08-09)

**Veredicto: ✅ Aprobado — pasa a Seguridad.**

Verificado contra DT-019, DT-014 y el prompt clarificado punto por punto:

- La extracción de `calcularProgresoActual` a `lib/traza/progreso-actual.ts`
  es mecánica: `route.ts` solo importa la función, misma caché/TTL/rate
  limiting, `route.test.ts` no se tocó y sigue verde con los mismos mocks de
  `@/lib/supabase/public` y `@/lib/traza/cargar-traza` (siguen interceptando
  el módulo real independientemente de quién lo importe). Se reexporta
  `limpiarCacheProgreso` igual que antes.
- El fallback de compatibilidad con la migración 0003 sin aplicar
  (`obtenerIntentoActivoModoGuiado`) se preservó tal cual estaba: mismo
  criterio (cualquier `error`, sin comprobar `error.code === "42703"`),
  consistente con la deuda ya aceptada en `DEBT.md` — no es una regresión,
  es el mismo comportamiento trasladado de sitio.
- `crearMinutoAMinuto` reutiliza `calcularProgresoActual()` (no una lectura
  en bruto de `posiciones`) — respeta explícitamente la razón de diseño de
  DT-019 sobre el descarte de puntos por velocidad implícita imposible en
  modo guiado.
- El camino de caché caliente no recalcula nunca:
  `app/admin/actions.test.ts` tiene aserciones explícitas
  `expect(calcularProgresoActualMock).not.toHaveBeenCalled()` en los tests
  de caché caliente (incluida la regresión de DT-014 sobre no comprobar
  TTL), no solo verificación del resultado final.
- El caso límite "caché vacía y sin ninguna posición real" sigue devolviendo
  `lat`/`lon` a `null`, cubierto con un test explícito que además distingue
  esta situación del bug.
- Los tests nuevos (`lib/traza/progreso-actual.test.ts` y los de
  `actions.test.ts` sobre el camino de recálculo) usan valores concretos
  verificables (coordenadas exactas esperadas), no solo "no es null".
- Documentación: `arquitectura.md` refleja el módulo nuevo y actualiza las
  filas de `api/progreso/route.ts`, `lib/progreso-cache.ts` y Server
  Actions. `CHANGELOG.md` tiene la entrada de esta tarea. `DEBT.md` tiene la
  entrada original (2026-08-02) marcada `Cerrada` con referencia a DT-019.

Sin bloqueantes ni recomendaciones nuevas de esta ronda — la tarea sigue
exactamente el diseño aprobado en DT-019 sin desviaciones. Pasa a Seguridad.

### Ronda 1 — Seguridad (2026-08-09)

**Estándares aplicados:** OWASP Top 10 (incluida auditoría de dependencias
A06), sobre el diff sin commitear de esta rama
(`app/admin/actions.ts`, `app/api/progreso/route.ts`,
`lib/traza/progreso-actual.ts` nuevo) y su verificación cruzada con DT-019,
DT-014, DT-010 y DT-011.

**Verificación punto por punto de los focos indicados:**

- **A01 — Control de acceso.** `crearMinutoAMinuto` sigue llamando a
  `await requerirSesion()` como primera instrucción del `try`, antes de leer
  `formData`, antes de tocar Storage y antes de la nueva llamada a
  `calcularProgresoActual()`. No hay ningún camino en el nuevo código
  (`app/admin/actions.ts:433-443`) que se ejecute antes de esa verificación
  ni que la sortee. `calcularProgresoActual()` en sí no comprueba sesión —
  correcto, porque no le corresponde: sigue siendo una función de dominio
  puro de lectura, invocada únicamente desde llamadores que ya verifican
  sesión (`route.ts`, que es público por diseño) o que la verifican antes de
  invocarla (`crearMinutoAMinuto`). El test
  `"crearMinutoAMinuto devuelve el motivo sin insertar si no hay cookie de
  sesión"` (`app/admin/actions.test.ts:521`) sigue en verde y no fue
  modificado por esta tarea.
- **Rate limiting (DT-011) — independencia confirmada.** `consumir(...)` (el
  contador de 60 req/min) vive únicamente dentro del `GET` handler de
  `app/api/progreso/route.ts`, antes de tocar caché o recalcular.
  `calcularProgresoActual()` no lo invoca ni lo referencia — es una función
  de dominio llamada directamente (import + `await`), no una petición HTTP a
  `/api/progreso`. La llamada desde `crearMinutoAMinuto` no consume ni
  interfiere con el cupo de la ruta pública: son caminos de ejecución
  totalmente independientes, ambos correctos según su naturaleza (uno es una
  Server Action ya protegida por sesión de admin, DT-010; el otro es un
  endpoint público que sí necesita su propio rate limit).
- **A02/A05 — Cliente Supabase usado en `calcularProgresoActual()`.** El
  módulo extraído sigue usando `getSupabasePublic()` (`anon`, sujeto a RLS —
  `supabase/migrations/0001_esquema_inicial.sql`: `intentos_select_activo`,
  `posiciones_select_activo_no_descartado`), sin cambiar al cliente
  `service role` aunque ahora también lo invoque una Server Action que usa
  `getSupabaseAdmin()` para el resto de sus operaciones. Evaluado como
  **asimetría inofensiva, no un problema de seguridad real**: usar el
  cliente de *menor* privilegio en un contexto de *mayor* privilegio no abre
  ninguna vía de escalada — en el peor caso el admin queda limitado por las
  mismas políticas RLS que ya limitan al público (fail-closed, no
  fail-open), lo que como mucho reintroduce parcialmente el síntoma
  funcional original (menos casos cubiertos de lo que el admin podría ver
  con `service role`), nunca una exposición de datos. No es una vulnerabilidad,
  es una decisión de diseño ya justificada por DT-019 (reutilizar la función
  compartida en vez de reimplementar con otro cliente para dos consumidores
  con contratos distintos).
- **Escritura en `lib/progreso-cache.ts` desde una Server Action.**
  `guardarCacheProgreso()` ahora puede ser invocada desde
  `crearMinutoAMinuto`, pero el valor que guarda siempre proviene de
  `calcularProgresoActual()` calculado con el mismo cliente `anon`/RLS que
  usa `route.ts` — nunca con `service role`. Por tanto no existe ninguna vía
  por la que el dato calculado en el contexto de escritura del admin
  contamine la caché pública con información calculada con privilegios que
  no pasarían el filtro RLS de `anon`: ambos caminos calculan exactamente lo
  mismo, con el mismo cliente, sobre las mismas políticas. Sin issue.
- **A08 — Integridad de datos.** `calcularProgresoActual()` sigue siendo
  puramente de lectura: no hace ningún `insert`/`update`/`delete`, confirmado
  leyendo el módulo completo. La única escritura del flujo nuevo es la
  caché en memoria (no persistente, no es "dato" en el sentido de integridad
  de BD). El texto del formulario sigue validado server-side (longitud,
  trim) igual que antes, sin cambios de este diff.
- **A09 — Logging/errores.** Sin `console.log`/`console.error` de datos
  sensibles en el módulo nuevo. Si `calcularProgresoActual()` lanzara una
  excepción no controlada dentro de `crearMinutoAMinuto` (p. ej. fallo de
  red hacia Supabase), no hay `try/catch` propio alrededor de esa llamada,
  pero esto no es una fuga de información: Next.js redacta en producción
  cualquier error lanzado desde una Server Action (mismo mecanismo ya
  documentado en el comentario de DT-017 sobre esta misma función), el
  digest genérico no expone stack traces ni nombres de tabla. Es una
  cuestión de robustez/UX (¿debería devolver `{ok:false}` en vez de
  propagar?), no de seguridad — se deja fuera por no ser bloqueante en este
  criterio.
- **A03 — Inyección.** Todas las queries de `progreso-actual.ts` usan el
  query builder de Supabase (`.eq`, `.order`, `.range`, `.limit`) con
  parámetros tipados, sin concatenación de strings ni SQL crudo. Sin
  `eval`/`new Function`. Sin cambios respecto al código ya auditado que se
  movió de sitio.
- **A04/A07 — Diseño y autenticación.** Sin cambios en el mecanismo de
  sesión (`lib/auth/admin-session.ts` no se toca en este diff). El flujo de
  publicación sigue sin poder saltarse manipulando el cliente: la
  validación de texto y la comprobación de intento activo ocurren
  server-side, igual que antes.
- **A06 — Dependencias.** `pnpm audit` → **"No known vulnerabilities
  found"**. `git diff -- package.json pnpm-lock.yaml` está vacío: no se ha
  añadido, actualizado ni eliminado ninguna dependencia en esta tarea. Las
  CVEs de los bugs 1 y 2 (ya cerradas en `main`) no han reaparecido.
- **A10 — SSRF.** No aplica: no se construye ninguna URL a partir de input
  de usuario en el código tocado.

## Sin issues

No se ha encontrado ningún issue de seguridad en el diff de esta tarea
(`app/admin/actions.ts`, `app/api/progreso/route.ts`,
`lib/traza/progreso-actual.ts`, y sus tests). La verificación de sesión de
DT-010 permanece intacta y es la primera instrucción de
`crearMinutoAMinuto`; el rate limiting de DT-011 es estructuralmente
independiente de la nueva llamada porque `calcularProgresoActual()` nunca
pasa por el route handler; el cliente Supabase usado (`anon`/RLS) es
consistente en ambos llamadores y no introduce ninguna vía de escalada de
privilegios ni de contaminación de la caché pública; `pnpm audit` está
limpio y no hay dependencias nuevas.

## Veredicto

✅ **Sin vulnerabilidades — tarea lista para cerrar.**

---


Este archivo es la pizarra compartida entre todos los agentes del pipeline: los
subagentes corren aislados y no ven la conversación, así que lo único que
comparten es lo que está escrito aquí. Lo gobierna el Orquestador, que lo crea al
empezar cada tarea con la plantilla del framework y lo archiva al cerrarla.
