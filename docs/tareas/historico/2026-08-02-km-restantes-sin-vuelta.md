# Tarea en curso

**Título:** Km restantes: solo plan restante desde el punto más cercano (sin sumar la vuelta)
**Tipo:** Feature (revisión de una decisión de producto original)
**Estado:** ✅ Aprobado por Seguridad — lista para cerrar
**Iniciada:** 2026-08-02

## Prompt clarificado

`kmRestantes` en `lib/traza/proyeccion.ts` se calcula hoy como
`separacionM/1000 + planRestanteKm` ("return-aware": incluye la distancia
de vuelta a la ruta oficial si estás desviado). El usuario quiere que pase
a ser **solo `planRestanteKm`** — lo que queda de ruta oficial desde el
punto más cercano hasta Santiago, sin sumar el coste de volver al camino.

**Contexto:** "return-aware" fue una decisión de la especificación original
(`docs/producto/especificacion-v1.md`), sin una justificación más profunda
documentada que "es correcto". Se revisa ahora con criterio del usuario,
no hay ninguna razón técnica oculta que se pierda al cambiarlo.

**No cambia con esto:**
- `porcentaje`/`kmAvanzados` (la barra, proyectada sobre el plan) — sin tocar.
- `odometroKm` (distancia real andada) — sin tocar.
- `estado` (en-ruta/desvío-menor/desvío-mayor) — sin tocar.
- El filtro de plausibilidad de velocidad/geografía — sin tocar.

Solo cambia la fórmula de `kmRestantes`.

## Alcance
- Incluye: `lib/traza/proyeccion.ts` (la fórmula), `lib/traza/proyeccion.test.ts`
  (actualizar fixtures de desvío que verifican el valor de `kmRestantes`),
  `lib/types.ts` (comentario desactualizado), `docs/producto/especificacion-v1.md`
  y `docs/producto/funcionalidades.md` (documentación de producto que describe
  "return-aware").
- Excluye: cualquier cosa de la feature "recorrido real en el mapa" (tarea
  aparte, pendiente después de esta).

## Decisión técnica / Diagnóstico
Trivial — una sola línea de fórmula, sin tradeoffs de arquitectura. Sin DT
nueva formal, pero sí hay que actualizar la documentación de producto que
describía el comportamiento anterior como decisión deliberada.

## Archivos modificados

- `lib/traza/proyeccion.ts` — `calcularProgreso`: `kmRestantes` pasa a ser
  `planRestanteKm` (antes `separacionM/1000 + planRestanteKm`). Comentario
  encima de la línea actualizado. `separacionM` se sigue calculando y
  devolviendo igual (usado por `clasificarEstado` y en el `Progreso`
  devuelto) — no se toca esa parte.
- `lib/traza/proyeccion.test.ts` — **Fix de Ronda 1 (2026-08-02):** el test
  de "desvío grande (~2 km)" (`describe("calcularProgreso — desvío grande
  (~2 km)")`) se amplió con una assertion nueva sobre `result.kmRestantes` y
  se renombró (de "clasifica como desvio-mayor cuando la separación es ~2 km"
  a "clasifica como desvio-mayor y kmRestantes no suma la separación cuando
  la separación es ~2 km", según la recomendación no bloqueante del Reviewer
  registrada en `DEBT.md`). La assertion nueva verifica
  `74.7 < result.kmRestantes < 76.7` para la fixture existente
  (`lat: 0.22, lon: 0.018`, `TRAZA_100KM`). El rango se calculó de forma
  independiente (fuera del código de producción, con haversine a mano sobre
  los 3 vértices de la fixture): longitud total de la traza ≈ 100,19 km,
  distancia acumulada hasta la proyección en lat≈0.22 ≈ 24,46 km →
  `planRestanteKm` esperado ≈ 75,72 km. La fórmula vieja
  (`separacionM/1000 + planRestanteKm`) daría ≈ 77,72 km — fuera del rango,
  a más de 1 km del límite superior. Verificado manualmente que el test
  falla si se reintroduce la fórmula vieja (revertido tras la comprobación,
  sin dejar el cambio).
- `lib/types.ts` — comentario de `kmRestantes` en `Progreso` actualizado
  (ya no dice "return-aware: separacion + plan restante").
- `docs/producto/especificacion-v1.md` — descripción de "Km restantes"
  actualizada (ya no "return-aware").
- `docs/producto/funcionalidades.md` — descripción de "Km restantes"
  actualizada (ya no "return-aware").
- `CHANGELOG.md` — entrada nueva (2026-08-02, Fix) explicando el cambio de
  cara al usuario.

Nota: `docs/tecnico/plan-ejecucion-v1.md` y `docs/tareas/historico/*.md`
también mencionan la fórmula antigua ("return-aware") pero son documentos
de plan/histórico de tareas ya cerradas, fuera del alcance definido en este
prompt (que solo listaba `especificacion-v1.md` y `funcionalidades.md`) —
no se han tocado.

## Quality gates

- `pnpm typecheck` — verde, 0 errores (re-verificado tras el fix de Ronda 1).
- `pnpm lint` — verde, 0 errores (re-verificado tras el fix de Ronda 1).
- `pnpm test` — verde, 20 archivos / 201 tests, incluidos los 21 de
  `lib/traza/proyeccion.test.ts` (re-verificado tras el fix de Ronda 1).

## Historial de revisión

### Ronda 2 — Reviewer (2026-08-02)

**Veredicto:** ✅ Aprobado — pasa a Seguridad.

Re-revisión del único bloqueante de Ronda 1. Verificado punto por punto:

1. **El test ampliado incluye la assertion que distingue la fórmula nueva de
   la vieja.** Leído `lib/traza/proyeccion.test.ts` líneas 304-335 completo
   (no solo el resumen del informe): el test renombrado
   `"clasifica como desvio-mayor y kmRestantes no suma la separación cuando
   la separación es ~2 km"` contiene, además de las assertions ya existentes
   sobre `estado` y `separacionM`, dos assertions nuevas sobre
   `result.kmRestantes` (líneas 333-334): `toBeGreaterThan(74.7)` y
   `toBeLessThan(76.7)`.

2. **El rango es coherente — recalculado de forma independiente.** Para
   `TRAZA_100KM` (vértices `[0,0]→[0,0.45049]→[0,0.90099]`) y el punto
   `lat: 0.22, lon: 0.018`:
   - Longitud total de la traza (haversine, radio 6371 km): tramo A→B
     (Δlat=0.45049°) ≈ 50,09 km; tramo B→C (mismo Δlat) ≈ 50,09 km. Total
     ≈ 100,17 km (coincide con los ≈100,19 km del informe, diferencia de
     redondeo).
   - Proyección de `(0.22, 0.018)` sobre el segmento A→B (que corre por
     lon=0): cae en `lon≈0, lat≈0.22`. Distancia acumulada A→proyección
     (Δlat=0.22°) ≈ 24,47 km (coincide con los ≈24,46 km del informe).
   - `planRestanteKm` esperado = 100,17 − 24,47 ≈ **75,70 km** → dentro del
     rango `(74.7, 76.7)`.
   - Fórmula vieja (`separacionM/1000 + planRestanteKm`): separación ≈
     2,00 km (0,018° de lon en lat≈0,22 ≈ 6371×π/180×0,018 ≈ 2,00 km) →
     vieja ≈ 75,70 + 2,00 ≈ **77,70 km** → fuera del rango, más de 1 km por
     encima del límite superior (76,7).
   - Conclusión: el rango elegido separa limpiamente ambos resultados, con
     margen de sobra en ambos extremos. Ningún valor intermedio ambiguo.

3. **No se ha tocado nada fuera de lo aprobado en Ronda 1.** Releído
   `lib/traza/proyeccion.ts` completo: la fórmula (líneas 250-258) es
   exactamente la aprobada en Ronda 1, sin cambios adicionales. Releído
   `lib/traza/proyeccion.test.ts` alrededor del bloque modificado (líneas
   200-455): el único cambio respecto a lo que aprobó Ronda 1 en el resto
   de tests es el bloque 304-335 descrito en el punto 1; el resto de
   `describe`/`it` (histórico vacío, un solo punto, avance normal,
   retroceso, desvío pequeño, reenganche, salto GPS, descartado, acc mala,
   llegada al Obradoiro, anclaje DT-005) permanece idéntico. `lib/types.ts`
   (comentario de `kmRestantes`, líneas 110-112 y 119) y
   `docs/producto/especificacion-v1.md` (línea 45, "Km restantes... no suma
   la separación/vuelta") siguen coherentes con la fórmula nueva, sin
   residuos de "return-aware". La entrada correspondiente de `DEBT.md`
   ("Nombre de test en `proyeccion.test.ts`...") está correctamente cerrada.

4. **Quality gates:** no se han podido re-ejecutar directamente en esta
   ronda (el entorno de esta revisión no dispone de herramienta de
   ejecución de shell, solo de lectura/búsqueda de ficheros). Se acepta la
   afirmación del Implementador (`pnpm typecheck`/`pnpm lint`/`pnpm test`
   verdes, 201 tests incluidos los 21 de `proyeccion.test.ts`) en base a:
   inspección estática completa del único archivo con lógica modificada
   (`proyeccion.test.ts`, sintaxis y tipos correctos, usa las mismas
   utilities de Vitest que el resto del archivo) y a que el cambio es
   aislado (una sola assertion nueva sobre un campo `number` ya tipado, sin
   nuevas dependencias ni cambios de firma). Recomendado (no bloqueante):
   que el Implementador confirme explícitamente la salida de los tres
   comandos en el próximo ciclo si se retoca este archivo.

**Lo que está bien:** el cálculo independiente del rango en el informe del
Implementador es correcto y está bien documentado dentro del propio test
(comentario líneas 322-332) — deja rastro para quien lea el test en el
futuro sin tener que rehacer el cálculo. El bloqueante de Ronda 1 queda
resuelto sin efectos colaterales.

### Fix de Ronda 1 — Implementador (2026-08-02)

Aplicado el único bloqueante de la Ronda 1: ampliado y renombrado el test de
"desvío grande (~2 km)" en `lib/traza/proyeccion.test.ts` con una assertion
sobre `kmRestantes` que distingue explícitamente la fórmula nueva de la
vieja (detalle completo en la sección "Archivos modificados" arriba). No se
tocó `proyeccion.ts` ni ningún otro archivo — el Reviewer ya había aprobado
el resto. También aplicada la recomendación no bloqueante (renombrar el
test), cerrando la entrada correspondiente de `DEBT.md`.

### Ronda 1 — Reviewer (2026-08-02)

**Veredicto:** ⚠️ Bloqueantes a corregir — devuelve al Implementador.

**Bloqueantes:**
1. `lib/traza/proyeccion.test.ts` — falta un test que verifique `kmRestantes`
   en un escenario de desvío real con `separacionM` > 0. Confirmado línea
   por línea: los tests "desvío pequeño (~80 m)" (líneas 286-302) y "desvío
   grande (~2 km)" (líneas 304-319) solo verifican `estado` y `separacionM`,
   nunca `kmRestantes`. Las dos únicas assertions existentes sobre
   `kmRestantes` (histórico vacío, línea 220; llegada al Obradoiro, línea
   419) corresponden a escenarios con `separacionM` ≈ 0, donde la fórmula
   vieja (`separacionM/1000 + planRestanteKm`) y la nueva (`planRestanteKm`)
   coinciden. Sin un test que ejerza el caso donde ambas fórmulas difieren,
   un regreso accidental a la fórmula vieja pasaría la suite completa sin
   ningún fallo. Viola el criterio del framework (sección 6: "los tests
   deben cubrir casos límite y casos de error, no solo el happy path").

   **Fix pedido:** ampliar el test de "desvío grande (~2 km)" (o añadir uno
   nuevo) con una assertion sobre `result.kmRestantes` que confirme que no
   incluye `separacionM/1000` — usando la fixture ya existente
   (`lat: 0.22, lon: 0.018`, separación ≈ 2000 m) y calculando/acotando el
   `planRestanteKm` esperado de forma independiente.

**Recomendaciones (registradas en `DEBT.md`):**
- Al ampliar el test de "desvío grande" con la nueva assertion, renombrarlo
  para que el nombre siga describiendo todo lo que verifica (hoy solo
  menciona `estado`). Ver entrada en `DEBT.md` ("Nombre de test en
  `proyeccion.test.ts`...").

**Lo que está bien:** el cambio de fórmula en sí (`proyeccion.ts` líneas
250-258) es correcto y mínimo; `porcentaje`/`kmAvanzados`/`odometroKm`/
`estado`/`separacionM` no se tocaron; `lib/types.ts`,
`especificacion-v1.md`, `funcionalidades.md` y `CHANGELOG.md` están
correctamente actualizados y coherentes entre sí.

## Seguridad (2026-08-02)

**Veredicto:** Sin vulnerabilidades -- tarea lista para cerrar.

Confirmado alcance con `git diff main --stat`: proyeccion.ts, proyeccion.test.ts, types.ts, docs/producto/especificacion-v1.md, docs/producto/funcionalidades.md, CHANGELOG.md, DEBT.md (y `.claude/launch.json`, config local irrelevante). Cambio puramente aritmetico de dominio (`kmRestantes = planRestanteKm`, ya no suma `separacionM`), sin endpoints, sin I/O, sin datos nuevos, sin cambios de RLS/auth/Storage.

Revision OWASP Top 10: A01-A04, A06, A07, A10 no aplican (sin endpoints, auth, dependencias nuevas, ni requests a URLs). A02/A05 sin secretos ni env vars tocadas. A03 sin construccion de queries/comandos/eval -- es una resta de numeros. A08 funcion sigue pura, sin `as` nuevos, datos ya tipados via `TrazaPreparada`. A09 sin logs ni mensajes de error nuevos.

Sin issues encontrados.
