# Tarea en curso

**Título:** Mapa público en modo NO libre pinta solo la traza real; panel admin ve ambas trazas + referencia
**Tipo:** Feature
**Estado:** Implementación
**Iniciada:** 2026-08-11

## Prompt clarificado

**Modo NO libre (guiado), mapa PÚBLICO** (`components/mapa/Mapa.tsx`, variante `"ruta"`):
- Deja de pintarse la traza oficial completa (`trazaCoords`). En su lugar se pinta la polilínea del recorrido GPS **real** del usuario (histórico completo de posiciones, mismo criterio de privacidad que ya usa modo libre: solo lat/lon, nunca batería/precisión/id de intento).
- Esto requiere que la web pública en modo guiado empiece a recibir el histórico de posiciones (hoy `ModoDurante.tsx` solo recibe `posicionActual`, la última). Se replica el patrón ya usado en modo libre (`puntosGps`).
- El marcador de **fin de ruta** (Santiago) se mantiene, con símbolo ⛪ (catedral) en vez de la ★ actual.
- El **cálculo** de distancia restante, ETA, mojón, etc. no cambia en absoluto: sigue usando la traza oficial completa server-side (`lib/traza/proyeccion.ts`), solo cambia lo que se **pinta**.

**Panel ADMIN** — nueva pestaña "Mapa":
- Muestra el mapa con **ambas** trazas simultáneamente: la oficial (un color) y la real del usuario (otro color, distinto — naranja `#D9773B` ya asociado a "andado" si tiene sentido).
- Línea discontinua conectando la posición real actual con el **punto real de la traza oficial usado por el cálculo** de distancia restante (el punto proyectado por `proyeccion.ts`, no una aproximación). Implica exponer explícitamente ese punto proyectado (lat/lon) desde el cálculo de progreso hacia el admin — hoy solo se calcula internamente y no sale del servidor.

## Alcance
- **Incluye:** cambio de pintado en `Mapa.tsx` variante "ruta" (público), exposición de histórico GPS al público en modo guiado, exposición del punto proyectado de referencia (para admin), nueva pestaña "Mapa" en el panel admin, cambio de símbolo de destino ★ → ⛪.
- **Excluye:** cualquier cambio a la lógica de cálculo de progreso/distancia/ETA (se mantiene intacta). Modo libre no se toca (ya se comporta así).

## Comportamiento en casos límite
- Sin histórico todavía (recién iniciado el reto, 0-1 puntos GPS): la polilínea real no se pinta o se pinta vacía (mismo comportamiento que ya tiene hoy modo libre en ese caso).
- Volumen de histórico grande (final del reto, ~100 km): se reutiliza la misma infraestructura de paginación/caché ya existente para modo libre (tope de 50.000 filas, caché TTL 20s) — sin diseño nuevo de escalabilidad.

## Supuestos asumidos
- La nueva pestaña "Mapa" del admin no requiere autenticación adicional a la ya existente del panel (`proxy.ts` + verificación de sesión).

## Diseño
Mockup: N/A — no aplica fase de diseño (extiende un componente existente reutilizando su propio lenguaje visual)

## Decisión técnica / Diagnóstico

Ver DT-021 en `docs/tecnico/decisiones-tecnicas.md`. Resumen para el Implementador:

1. **Público, modo guiado (`ModoDurante.tsx` + `app/page.tsx`):** cargar histórico completo server-side (mismo `obtenerHistoricoPosiciones` que ya usa modo libre) y acumularlo en cada poll de 30 s — copiar literalmente el patrón de `ModoDuranteLibre.tsx` líneas 41-76 (prop `puntosGpsIniciales`, estado `puntosGps`, `ultimoTs`, append en poll). Pasar `puntosGps` a `Mapa`.
2. **`components/mapa/Mapa.tsx`, variante `"ruta"`:** en `recalcularOverlay`, cuando `varianteRef.current === "ruta"`, pintar `puntosGpsRef.current` (como ya hace `"libre"`) en vez de recortar `trazaCoordsRef.current`. Símbolo de fin de ruta: ⛪ en vez de ★ (mismo color dorado `#C9A24B`). El inicio (círculo gris) ya no aplica en "ruta" tampoco (no hay traza oficial pintada que tenga inicio visible) — igual que "libre".
3. **`lib/traza/proyeccion.ts` / `lib/types.ts`:** añadir `puntoProyectado: {lat, lon} | null` a `Progreso` y a `ResultadoProyeccion` — usar `snap.geometry.coordinates` de Turf (ya calculado, hoy descartado) en los 3 `return` de `proyectarPunto`. Propagarlo en `calcularProgreso` (desde `ultimaPosicionValida`/última proyección) y en `progresoEnCero` (`null`). **No** añadir a `ProgresoPublicoGuiado` (`lib/traza/progreso-publico.ts`) — el público no debe recibir este campo.
4. **Nuevo módulo server-side para el admin** (p. ej. `lib/traza/datos-mapa-admin.ts`): intento activo + `obtenerHistoricoCompleto` + `cargarTrazaDeCalculo` + `cargarTrazaDeMapa` + `calcularProgreso` (crudo, sin pasar por `aProgresoPublico`). Devuelve algo como `{ modo: "guiado", trazaOficial: [number,number][], trazaReal: {lat,lon}[], posicionActual: {lat,lon}|null, puntoReferencia: {lat,lon}|null } | { modo: "libre", trazaReal: {lat,lon}[], posicionActual: {lat,lon}|null }`.
5. **`components/mapa/Mapa.tsx`, props nuevas (solo para admin):** `trazaOficialComparacion?: [number, number][]` (pinta la traza oficial completa, color propio — p. ej. azul/gris, distinto del naranja `#D9773B` ya asociado a la traza real) y `puntoReferencia?: {lat, lon} | null` (marcador propio en ese punto + línea discontinua entre `posicionActual` y `puntoReferencia`). Estas props son un no-op si no se pasan — el público nunca las usa.
6. **`lib/admin/navegacion.ts`:** añadir `{ valor: "mapa", etiqueta: "Mapa" }` a `TABS_ADMIN`.
7. **`components/admin/SeccionMapa.tsx` (nuevo):** Server Component, mismo patrón que `SeccionPosicion.tsx` (sin polling, `getSupabaseAdmin()`), usa el módulo del punto 4 + `Mapa` con las props del punto 5. Si `modo === "libre"`, aviso "Este intento es modo libre, sin traza oficial" + solo `puntosGps`.
8. **`app/admin/page.tsx`:** renderizar `{tab === "mapa" && <SeccionMapa />}`.

**Fuera de alcance (explícito):** cualquier cambio a `lib/traza/proyeccion.ts` más allá de exponer `puntoProyectado` (la fórmula de cálculo no cambia). Modo libre público no se toca.

## Archivos modificados

**Nuevos:**
- `lib/traza/datos-mapa-admin.ts` — módulo server-side del punto 4 (unión discriminada `DatosMapaAdmin`, `obtenerDatosMapaAdmin()`).
- `lib/traza/datos-mapa-admin.test.ts` — tests unitarios del módulo anterior (Supabase mockado).
- `components/admin/SeccionMapa.tsx` — pestaña "Mapa" del panel admin (punto 7).
- `lib/historico-cache.ts` — fix del bloqueante de Seguridad, Ronda 1: caché en memoria del histórico completo de posiciones (mismo patrón y mismo `CACHE_TTL_MS` de 20 s que `lib/progreso-cache.ts`).
- `lib/historico-cache.test.ts` — tests unitarios del módulo anterior.

**Modificados:**
- `lib/types.ts` — `Progreso` gana `puntoProyectado: {lat, lon} | null`.
- `lib/traza/proyeccion.ts` — `ResultadoProyeccion` gana `puntoProyectado`; los 3 `return` de `proyectarPunto` lo propagan (`snap.geometry.coordinates`); `calcularProgreso` y `progresoEnCero` lo devuelven. Ninguna fórmula existente cambia.
- `lib/traza/proyeccion.test.ts` — tests nuevos de `puntoProyectado` (null en cero, propagación, punto sobre la traza no sobre el GPS bruto en un desvío).
- `lib/traza/proyeccion.ventana.test.ts` — ajuste mecánico (`puntoProyectado: null`) en la réplica de referencia para que siga tipando tras el cambio de `Progreso`.
- `lib/traza/progreso-publico.test.ts` — fixture y test nuevo: `puntoProyectado` nunca sale en `ProgresoPublicoGuiado`.
- `lib/traza/progreso-actual.ts` — `obtenerHistoricoCompleto` pasa a exportarse (reutilizada por `datos-mapa-admin.ts`).
- `components/mapa/Mapa.tsx` — variante `"ruta"` pinta `puntosGps` en `modo === "directo"` (antes recortaba `trazaCoords`); marcador de fin ★→⛪; `modo === "resumen"` (pantalla "antes") sigue pintando `trazaCoords` sin cambios (ver nota más abajo); dos props nuevas no-op para el admin (`trazaOficialComparacion`, `puntoReferencia` + línea discontinua); eliminado `indiceMasCercano` (ya no se usa).
- `components/publico/ModoDurante.tsx` — carga/acumula `puntosGps` (mismo patrón que `ModoDuranteLibre.tsx`) y los pasa a `<Mapa variante="ruta">`.
- `app/page.tsx` — `ModoDuranteConectado` carga el histórico completo (`obtenerHistoricoPosiciones`, ya existente) y lo pasa como `puntosGpsIniciales`.
- `lib/admin/navegacion.ts` — `TABS_ADMIN` gana `{ valor: "mapa", etiqueta: "Mapa" }`.
- `app/admin/page.tsx` — importa y renderiza `<SeccionMapa />` en `tab === "mapa"`.
- `components/publico/ModoLlegada.tsx` — ampliación de alcance (ver más abajo): nueva prop `puntosGps`, reenviada a `<Mapa variante="ruta">`.
- `app/page.tsx` — `ModoLlegadaConectado` carga también `obtenerHistoricoPosiciones` (en paralelo con lo que ya cargaba) y lo pasa como `puntosGps`; fix del bloqueante de Seguridad Ronda 1: `ModoDuranteConectado`/`ModoLlegadaConectado`/`calcularProgresoDelIntento`/`calcularProgresoLibreDelIntento` pasan a usar `obtenerHistoricoPosicionesCacheado` (nueva función exportada, usa `lib/historico-cache.ts`) en vez de `obtenerHistoricoPosiciones` directo.
- `app/page.test.ts` — `beforeEach` limpia también `lib/historico-cache.ts`; tests nuevos para `obtenerHistoricoPosicionesCacheado` (sirve desde caché, guarda en caché, compartida entre `calcularProgresoDelIntento` y una llamada directa posterior).
- `CHANGELOG.md`, `DEBT.md`, `docs/tecnico/decisiones-tecnicas.md` (nota de cierre de DT-021) — cierre de tarea.

## Quality gates

- **Typecheck** (`pnpm typecheck`): verde, 0 errores.
- **Lint** (`pnpm lint`): verde, 0 errores/warnings.
- **Tests** (`pnpm test`): verde — 348/348 (32 ficheros), reejecutado tras el fix del bloqueante de Seguridad (Ronda 1). El fallo de timeout intermitente en `app/admin/page.test.ts` visto en una pasada anterior es el flaky ya documentado en `DEBT.md` ("`app/admin/page.test.ts` agota el timeout de 5 s en la primera ejecución de la suite completa") — reproducido y confirmado no relacionado con este cambio (verde aislado y en pasadas completas posteriores).
- **Verificación visual**: sin acceso a herramienta de navegador/computer-use en este contexto delegado. Se hizo un smoke test con `pnpm dev` + `curl` (home `/` → 200, `/admin` → 307 a login, `/admin/login` → 200, sin errores en el log del servidor). **No** se ha podido verificar visualmente el pintado del mapa (símbolo ⛪, color de la traza de comparación, línea discontinua) ni la pestaña "Mapa" del admin (requiere `ADMIN_PASSWORD`, no presente en `.env.local` de este entorno) — recomendado antes de mergear, según el criterio de `docs/LESSONS.md` ("ninguna quality gate detecta problemas puramente visuales").

## Fix del bloqueante de Seguridad, Ronda 1 (2026-08-12)

Seguridad encontró un issue A04/A05 (coste/DoS): `ModoDuranteConectado`/`ModoLlegadaConectado` llamaban a `obtenerHistoricoPosiciones` sin caché en cada visita a `/` en modo guiado, reabriendo el vector de coste que S2 (DT-018) ya había cerrado (`/` no tiene rate limiting propio, DT-011 solo cubre `/api/progreso`). **Fix:** `lib/historico-cache.ts`, mismo patrón/TTL (20 s) que `lib/progreso-cache.ts`, reutilizado por `calcularProgresoDelIntento`, `ModoDuranteConectado`, `ModoLlegadaConectado` y (opcional, aplicado) `calcularProgresoLibreDelIntento` — cierra también la entrada de deuda ya registrada para modo libre en `DEBT.md`, que se ha marcado como resuelta (no retirada, para conservar el historial). Detalle completo en la nota de cierre de DT-021, `docs/tecnico/decisiones-tecnicas.md`. Quality gates reverificadas en verde (348/348).

## Bloqueo mayor encontrado y resuelto durante la implementación

**`ModoLlegada.tsx` (pantalla "llegada", modo guiado) no estaba en los 8 puntos aprobados de DT-021 y se quedaba con el mapa sin recorrido (regresión).** `ModoLlegada.tsx` usa la misma combinación `variante="ruta"` + `modo="directo"` que `ModoDurante.tsx`, pero el Arquitecto no la incluyó en el alcance original. El Implementador lo señaló como bloqueo mayor (framework, sección 10: "impacto en más componentes de los previstos") en vez de decidirlo en solitario. El Orquestador escaló al usuario, que decidió ampliar el alcance de DT-021 en esta misma tarea. **Resuelto**: `app/page.tsx` (`ModoLlegadaConectado`) carga el histórico completo y `ModoLlegada.tsx` lo pinta como `puntosGps`, mismo patrón ya validado en producción por `ModoLlegadaLibre.tsx`. Ver la nota de cierre de DT-021 en `docs/tecnico/decisiones-tecnicas.md` para el detalle completo. La entrada correspondiente de `DEBT.md` se ha retirado (ya no aplica).

## Historial de revisión

### Ronda 1 — Reviewer (2026-08-12)

**Veredicto: ✅ Aprobado — pasa a Seguridad.**

Revisión completa contra DT-021 (incluida su nota de cierre sobre la
ampliación de alcance a `ModoLlegada.tsx`) y el prompt clarificado de
`CURRENT.md`. Sin bloqueantes.

Verificaciones específicas pedidas por el Orquestador:
1. `puntoProyectado` nunca se filtra al público: confirmado en
   `lib/traza/progreso-publico.ts` (`aProgresoPublico` no lo copia) y en su
   test (`progreso-publico.test.ts`, caso explícito "no expone... ni
   puntoProyectado").
2. Usos de `<Mapa` revisados en todo el árbol (`Glob`/`Grep`, no solo los 3
   conocidos): 6 en total — `ModoDurante.tsx`, `ModoLlegada.tsx`,
   `ModoAntes.tsx` (modo "resumen", sin cambios), `ModoDuranteLibre.tsx` y
   `ModoLlegadaLibre.tsx` (variante "libre", sin cambios de comportamiento) y
   `SeccionMapa.tsx` (nuevo, admin). Ninguno de los callers públicos pasa
   `trazaOficialComparacion` ni `puntoReferencia`.
3. Quality gates: no se han podido re-ejecutar `pnpm typecheck`/`lint`/`test`
   en este entorno de revisión (sin herramienta de shell disponible) — se
   confía en el reporte del Implementador (340/340, verde) respaldado por una
   revisión estática exhaustiva de todos los ficheros nuevos/modificados
   (tipos, imports, firmas de función, discriminación de uniones) sin
   inconsistencias encontradas. **Recomendación al Orquestador:** confirmar
   `pnpm typecheck && pnpm lint && pnpm test` antes de mergear si no se ha
   hecho ya fuera de este hilo.
4. Documentación: `CHANGELOG.md` y `DEBT.md` coherentes; la entrada de
   `DEBT.md` sobre el bloqueo de `ModoLlegada.tsx` está correctamente
   retirada (verificado, no queda rastro). `docs/producto/funcionalidades.md`
   quedó desactualizado (describe el pintado antiguo de la traza oficial) —
   registrado como recomendación en `DEBT.md`, no bloqueante (mismo criterio
   que `docs/LESSONS.md`).
5. `lib/traza/datos-mapa-admin.ts`: reutiliza correctamente
   `obtenerHistoricoCompleto`, `cargarTrazaDeCalculo`, `cargarTrazaDeMapa`,
   `calcularProgreso`/`calcularProgresoLibre` sin duplicar lógica. Unión
   discriminada `DatosMapaAdmin` bien tipada (`modo: "guiado"|"libre"|
   "sin-intento"`), sin `any`. Tests (`datos-mapa-admin.test.ts`) cubren los
   tres modos, histórico vacío y el fallback de compatibilidad de la
   migración 0003.
6. Props nuevas de `Mapa.tsx` (`trazaOficialComparacion`, `puntoReferencia`):
   con valores por defecto `[]`/`null`, genuinamente no-op cuando están
   ausentes (`recalcularOverlay` solo pinta si `length > 1`/no-null). Ningún
   caller público las pasa (verificado en el punto 2).

**Recomendaciones (no bloqueantes, registradas en `DEBT.md`):**
- `docs/producto/funcionalidades.md` desactualizado respecto al pintado real
  del mapa en modo guiado, y sin sección de panel admin (hueco preexistente,
  ampliado por esta tarea).

**Lo que está bien:** la desviación de alcance (`ModoLlegada.tsx`) quedó
correctamente cerrada tanto en `docs/tareas/CURRENT.md` como en la nota de
cierre de DT-021 en `decisiones-tecnicas.md` — exactamente el patrón que pide
la lección de `docs/LESSONS.md` ("la desviación va al documento de
decisiones, no solo a CURRENT.md"). El test de `progreso-publico.test.ts` que
verifica explícitamente la no-filtración de `puntoProyectado` es el tipo de
guardarraíl correcto para un requisito de privacidad/scope.

**Siguiente paso:** pasa al Agente de Seguridad.

### Ronda 1 — Seguridad (2026-08-12)

**Veredicto: ❌ Issues bloqueantes — devuelve al Implementador.**

Revisión OWASP Top 10 sobre el scope de DT-021 (archivos nuevos y
modificados listados arriba). `pnpm audit --audit-level=high`: sin
vulnerabilidades (A06 limpio).

**Verificaciones sin hallazgos (documentado explícitamente, no es solo
silencio):**
1. **Exposición de datos GPS al público (A01/A05):** `app/page.tsx`
   (`ModoDuranteConectado`, `ModoLlegadaConectado`) y `datos-mapa-admin.ts`
   mapean explícitamente `historico`/`data` a `{ lat, lon }` en cada punto de
   salida hacia el cliente — nunca `batt`, `acc`, `intento_id`, `fuente` ni
   `descartado`. Mismo criterio que ya usa modo libre en producción.
2. **`puntoProyectado` (A01, mínimo privilegio):** confirmado que
   `lib/traza/progreso-publico.ts` (`aProgresoPublico`) no lo copia a
   `ProgresoPublicoGuiado`, y que `app/api/progreso/route.ts` solo devuelve
   el resultado de `calcularProgresoActual()` (que pasa por
   `aProgresoPublico`). El campo nunca sale de `datos-mapa-admin.ts` /
   `SeccionMapa.tsx` (admin).
3. **Sesión en la nueva pestaña "Mapa" del admin (A01/A07):**
   `app/admin/page.tsx` verifica `verificarSesion(cookieSesion)` y hace
   `redirect("/admin/login")` **antes** de evaluar `tab` y renderizar
   cualquier sección — cubre `SeccionMapa` sin necesitar código adicional,
   igual que el resto de pestañas.
4. **`lib/traza/datos-mapa-admin.ts` (A03):** sin input de usuario directo
   (no toma parámetros), usa `getSupabaseAdmin()` server-side con el mismo
   patrón que `progreso-actual.ts`/`SeccionPosicion.tsx`, sin concatenación
   de strings en queries (`.eq()`/`.select()` parametrizados vía
   supabase-js), sin `eval`/`Function` dinámica.

**Issue bloqueante encontrado (A04/A05 — control de recursos / DoS de coste):**

- `app/page.tsx:99-102` (`ModoDuranteConectado`) y `app/page.tsx:127-131`
  (`ModoLlegadaConectado`): la carga de `puntosGpsIniciales`/`puntosGps` para
  el modo guiado añade una llamada **directa y sin caché** a
  `obtenerHistoricoPosiciones(intentoId)` (paginada, hasta 50 páginas × 1000
  filas = 50.000 filas, `lib/supabase/paginacion.ts`) en **cada visita** a
  `/` durante las fases "durante"/"llegada" — independientemente de si la
  caché de `calcularProgresoDelIntento` (`lib/progreso-cache.ts`, TTL 20 s,
  DT-007/DT-014) está caliente o no. Confirmado con `git diff HEAD --
  app/page.tsx`: antes de esta tarea, el modo guiado en `ModoDuranteConectado`
  solo llamaba a `calcularProgresoDelIntento` (cacheado); con caché caliente,
  una visita a `/` no generaba ninguna consulta a Supabase. Con este cambio,
  **toda** visita a `/` en modo guiado dispara como mínimo una consulta
  paginada completa a `posiciones`, exista o no caché válida.
  La ruta "/" (Server Component, `export const dynamic = "force-dynamic"`)
  no tiene ningún rate limiting — el único rate limiting del proyecto
  (DT-011, `lib/rate-limit.ts`, 60 req/min por IP) protege únicamente
  `GET /api/progreso`, no el render de la página. Esto reabre exactamente el
  vector de coste que S2 (nota de cierre de DT-018,
  `docs/tecnico/decisiones-tecnicas.md`) mitigó compartiendo la caché entre
  `/api/progreso` y la carga de página: esa mitigación cubre `progreso`, pero
  no cubre esta nueva consulta de histórico añadida por DT-021 para
  `puntosGpsIniciales`/`puntosGps`. Un cliente que refresque `/` repetidamente
  durante el reto (sin límite alguno) fuerza, en cada petición, hasta 50
  consultas secuenciales paginadas a Supabase sin protección de frecuencia ni
  de caché — amplificación de coste/carga que el propio proyecto ya trató
  como riesgo de seguridad en S1/S2 para un caso equivalente.
  **Nota:** el mismo patrón (fetch de histórico sin caché en cada visita) ya
  existía en modo libre (`calcularProgresoLibreDelIntento`) antes de esta
  tarea — no es una regresión ahí. Lo bloqueante es que DT-021 **extiende**
  ese patrón sin protección al modo guiado, que hasta ahora sí estaba
  protegido por la caché compartida, reduciendo la cobertura de una
  mitigación de seguridad ya existente sin compensarla.

  **Fix requerido (a elección del Implementador, cualquiera de las dos
  cierra el issue):**
  a) Cachear el histórico de posiciones a nivel de página con el mismo TTL
     que `lib/progreso-cache.ts` (20 s) — p. ej. una entrada de caché
     análoga para `puntosGps`/`historico`, reutilizable entre
     `ModoDuranteConectado`/`ModoLlegadaConectado` y `calcularProgresoDelIntento`
     para no duplicar la consulta ni perder la protección de coste; o
  b) Añadir rate limiting (mismo `lib/rate-limit.ts`, por IP) a la carga de
     `/` en fases "durante"/"llegada", igual que ya protege `/api/progreso`.

**Siguiente paso:** vuelve al Implementador para aplicar el fix. Tras el fix,
repetir la Ronda 2 de Seguridad antes de cerrar la tarea.

### Fix aplicado por el Implementador (2026-08-12)

Aplicada la opción (a) sugerida por Seguridad: `lib/historico-cache.ts`
(nuevo), mismo patrón exacto que `lib/progreso-cache.ts` (`{timestamp,
valor}` en memoria de proceso, `CACHE_TTL_MS` de 20 s reexportado desde
`lib/progreso-cache.ts` para no duplicar la constante). Nueva función
`obtenerHistoricoPosicionesCacheado` (exportada desde `app/page.tsx`,
`lib/historico-cache.ts`), usada por `calcularProgresoDelIntento`,
`ModoDuranteConectado`, `ModoLlegadaConectado` y, aprovechando el mismo
fix, también `calcularProgresoLibreDelIntento` (modo libre) — cierra de
paso la entrada de deuda ya registrada para libre en `DEBT.md` (S1/S2 de
DT-018), marcada ahora como resuelta en vez de retirada, para conservar el
historial. Tests nuevos: `lib/historico-cache.test.ts` (contrato de la
caché) y tres tests nuevos en `app/page.test.ts` sobre
`obtenerHistoricoPosicionesCacheado` (sirve desde caché sin volver a
consultar Supabase, guarda en caché tras un miss, y comparte la caché entre
`calcularProgresoDelIntento` y una llamada directa posterior — verificado
con `rangeMock` sin segunda invocación). `beforeEach` de `app/page.test.ts`
limpia también la nueva caché para no contaminar tests entre sí.

Quality gates reejecutadas: `pnpm typecheck` (verde), `pnpm lint` (verde),
`pnpm test` (348/348, 32 ficheros). Listo para Ronda 2 de Seguridad.

### Ronda 2 — Seguridad (2026-08-12)

**Veredicto: ✅ Aprobado — sin issues bloqueantes pendientes. Tarea lista para cerrar.**

Revisado el fix del bloqueante A04/A05 de la Ronda 1 (`lib/historico-cache.ts`
+ `obtenerHistoricoPosicionesCacheado` en `app/page.tsx`).

**El fix cierra realmente el vector de coste.** Confirmado con
`git diff HEAD -- app/page.tsx`: `calcularProgresoDelIntento`,
`ModoDuranteConectado`, `ModoLlegadaConectado` y
`calcularProgresoLibreDelIntento` pasan ahora por
`obtenerHistoricoPosicionesCacheado`, que solo llama a
`obtenerHistoricoPosiciones` (fetch paginado) si no hay entrada en caché o ha
expirado el TTL (`CACHE_TTL_MS = 20_000`, reexportado literalmente desde
`lib/progreso-cache.ts` — un único origen de verdad para el TTL, no un valor
duplicado que pueda divergir). Verificado con test explícito
(`app/page.test.ts`, "se comparte entre calcularProgresoDelIntento y una
llamada directa posterior") que una visita real a `/` en modo guiado —
`calcularProgresoDelIntento` + `obtenerHistoricoPosicionesCacheado` en el
mismo `Promise.all` de `ModoDuranteConectado`/`ModoLlegadaConectado` — hace
como máximo una consulta paginada a `posiciones` por ventana de 20 s,
compartida entre ambas llamadas, igual que ya garantizaba `progreso-cache.ts`
para el cálculo de progreso. Cierra el hallazgo de la Ronda 1 sin
reintroducir el problema de otra forma (no hay ninguna otra ruta de código
nueva que llame a `obtenerHistoricoPosiciones` sin pasar por la versión
cacheada).

**Revisión específica del riesgo señalado por el Orquestador — fuga de datos
entre intentos distintos por invalidación de caché al cambiar de intento
activo.** `obtenerHistoricoPosicionesCacheado` no valida `intentoId` contra
el valor cacheado — un cambio de intento activo (intento A se cierra,
intento B arranca) dentro de la misma ventana de 20 s podría, en teoría,
servir el histórico de A bajo una petición hecha para B. Verificado que:
- Es **exactamente el mismo patrón** que ya usa `lib/progreso-cache.ts` desde
  DT-007/DT-014/S2 (`calcularProgresoDelIntento` tampoco compara `intentoId`
  contra la caché) — no es un riesgo nuevo ni un patrón introducido por este
  fix, es la réplica deliberada de un mecanismo ya en producción.
- El propio código (comentario de cabecera de `lib/historico-cache.ts` y del
  nuevo bloque en `app/page.tsx`) documenta explícitamente por qué se acepta:
  el invariante de `docs/tecnico/arquitectura.md` ("solo un `Intento` con
  `cerrado = false` a la vez") es la base con la que S2 justificó compartir
  `progreso-cache.ts` sin clave por intento, y el mismo razonamiento aplica
  aquí sin ninguna diferencia de superficie de riesgo (ambas cachés
  almacenan datos de posición del mismo nivel de sensibilidad).
- La ventana de exposición está acotada al mismo TTL ya aceptado (20 s) y al
  mismo evento infrecuente ya aceptado (cierre de un intento + apertura de
  otro por el admin, una acción manual y poco frecuente, no algo que un
  atacante externo pueda disparar a voluntad).
- No encontrado ningún camino nuevo por el que este fix amplíe esa ventana o
  la haga explotable de una forma que `progreso-cache.ts` no lo fuera ya
  (mismo TTL, mismo invariante, mismo tipo de dato).

Conclusión: no es un issue nuevo introducido por el fix — es la extensión
consistente de un riesgo ya evaluado y aceptado explícitamente en el propio
histórico de decisiones del proyecto (S2, DT-007/DT-014/DT-018). No se marca
como bloqueante en esta ronda. Si en el futuro se quiere cerrar también ese
riesgo residual (para ambas cachés a la vez, no solo la nueva), corresponde
registrarlo como entrada de `DEBT.md` a discreción del Implementador/Arquitecto
— no es un hallazgo de esta revisión de Seguridad porque no cambia el perfil
de riesgo ya aceptado del proyecto.

**Verificaciones adicionales:**
- `pnpm typecheck`: 0 errores. `pnpm lint`: sin avisos. `pnpm test`: 348/348
  verde (reejecutado en este entorno, incluye `lib/historico-cache.test.ts` y
  los 3 tests nuevos de `app/page.test.ts`).
- `pnpm audit --audit-level=high`: sin vulnerabilidades (A06, reverificado).
- `DEBT.md`: la entrada de modo libre ("`calcularProgresoLibreDelIntento`...
  sigue sin caché...") queda correctamente marcada como resuelta (con fecha y
  referencia a esta tarea), conservando el historial en vez de borrarse — buen
  criterio de trazabilidad.
- `docs/tecnico/decisiones-tecnicas.md`: nota de cierre de DT-021 documenta el
  bloqueante de Seguridad y el fix con el detalle suficiente para que un
  agente futuro no necesite reconstruirlo desde el código.

**Siguiente paso:** tarea lista para cerrar (Reviewer y Seguridad en verde).
