# Tarea en curso

**Título:** Foto en "Quién camina" + estadísticas y perfil de elevación
**Tipo:** Feature
**Estado:** Implementación
**Iniciada:** 2026-07-31

## Prompt clarificado

**1. Foto en "Quién camina"**: hueco de foto circular/tarjeta en esa sección
de `ModoAntes.tsx`. Sigue el mismo patrón ya usado para el peregrino
(`FOTO_SANTI: string | undefined`, hoy `undefined`) — con placeholder por
defecto (diseño propio, no imagen de stock) y sustitución trivial cuando
Santi tenga la foto real.

**2. Estadísticas + perfil de elevación**, hito "El recorrido" (Antes),
debajo del mapa:
- Distancia total, desnivel acumulado (ascenso/descenso)
- Perfil de elevación como SVG propio (área/curva), sin librería de gráficos
- Datos de Open-Elevation, muestreados cada ~500m-1km de la traza real,
  calculados una vez en un script (patrón `simplificar-traza`) y guardados
  en fichero derivado
- Solo en modo "Antes"

## Alcance
- Incluye: lo listado arriba.
- Excluye: cambios en "Durante"/"Llegada" (el perfil no depende del intento
  activo, es la ruta fija, pero el usuario pidió explícitamente que solo
  aparezca en "Antes").

## Supuestos asumidos
- La distancia mostrada es la real del corredor (~105 km, misma fuente que
  `proyeccion.ts`), no el "~100 km" de marketing del hero.
- El perfil se calcula una vez en tiempo de build/mantenimiento (no depende
  de datos en vivo).

## Diseño
**Aprobado.** Mockup: `design-sandbox/app/camino-perfil/page.tsx`.

Decisiones tomadas:
- Foto: tarjeta 4:3, degradado + textura granito + nombre superpuesto
  (recupera el tratamiento del mockup original de F3, perdido al
  implementar); placeholder de silueta genérica sin foto real.
- Stats: 3 casillas (distancia/ascenso/descenso), mismo patrón visual que
  `Stats.tsx` en "Durante".
- Perfil: SVG propio (área + curva), con hover que muestra la cota en cada
  punto.

## Decisión técnica / Diseño

**Aprobada por Santi (2026-07-31).** Registrada como DT-009 en
`docs/tecnico/decisiones-tecnicas.md`. Resumen:

1. `scripts/generar-perfil-elevacion.ts` (ejecución manual, NO en
   `predev`/`prebuild`): remuestrea `traza-mapa.geojson` cada ~1 km,
   consulta Open-Elevation (API pública, sin clave, un solo POST de lote),
   escribe `lib/traza/perfil-elevacion.json`. Falla explícitamente si algún
   punto no devuelve dato — nunca escribe un perfil incompleto en silencio.
2. El JSON generado **se commitea** (patrón `traza-mapa.geojson`) — la web
   pública nunca llama a Open-Elevation, cero dependencia externa en
   producción.
3. `lib/traza/perfil-elevacion.ts` (nuevo, puro): importa el JSON, expone
   `calcularDesnivel(perfil)` → `{ascensoM, descensoM}`, testeable con
   fixtures sintéticas.
4. `components/publico/PerfilElevacion.tsx` (nuevo, cliente): stats +
   SVG de área/curva, sigue el mockup aprobado
   (`design-sandbox/app/camino-perfil/page.tsx`).
5. `components/publico/ModoAntes.tsx`: tarjeta de foto inline en "Quién
   camina" (`FOTO_SANTI: string | undefined`, hoy `undefined` →
   placeholder de silueta, mismo patrón que `FOTO_PEREGRINO`), y
   `<PerfilElevacion />` bajo el mapa en "El recorrido".

## Archivos modificados

**Nuevos:**
- `scripts/generar-perfil-elevacion.ts` — script manual (patrón
  `simplificar-traza.ts`): remuestrea `traza-mapa.geojson` cada ~1 km,
  consulta Open-Elevation en un único POST de lote, escribe
  `lib/traza/perfil-elevacion.json`. Falla explícito si algún punto no trae
  elevación.
- `lib/traza/perfil-elevacion.json` — dato generado y commiteado (DT-009).
  Ejecutado contra la API real de Open-Elevation: 106 puntos, 0–104,678 km,
  elevación 3–263 m.
- `lib/traza/perfil-elevacion.ts` — dominio puro: `calcularDesnivel(perfil)`.
- `lib/traza/perfil-elevacion.test.ts` — 5 tests con fixtures sintéticas
  (monótono ascendente, monótono descendente, con altibajos, un único punto,
  perfil vacío).
- `components/publico/PerfilElevacion.tsx` — client component: 3 casillas de
  stats + SVG de perfil (área/curva con hover), sigue el mockup aprobado.

**Modificados:**
- `components/publico/ModoAntes.tsx` — añadida `FotoQuienCamina` inline (con
  constante `FOTO_SANTI: string | undefined`, patrón `FOTO_PEREGRINO`) en el
  hito "Quién camina"; añadido `<PerfilElevacion />` bajo el mapa en el hito
  "El recorrido".
- `package.json` — nuevo script `generar-perfil-elevacion` (NO enganchado a
  `predev`/`prebuild`, ejecución manual, según DT-009).
- `CHANGELOG.md` — entrada de la tarea.

## Quality gates

Las 4 en verde:
- `pnpm typecheck` — OK, cero errores.
- `pnpm lint` — OK, cero errores.
- `pnpm test` — OK, 83 tests pasan (10 ficheros), incluye los 5 nuevos de
  `calcularDesnivel`.
- `pnpm build` — OK, build de producción completo sin errores.

**Verificación visual:** servidor dev levantado en local, capturas de
pantalla de `/` (Edge headless) confirmando que la tarjeta de foto
(placeholder de silueta, degradado, nombre "Santi"/"Peregrino de una noche"
superpuesto) y el bloque de estadísticas + perfil de elevación (105 km /
1200 m ascenso / 963 m descenso + SVG de área ámbar) se ven según el mockup
aprobado. Ficheros de captura temporales eliminados tras la verificación.

## Historial de revisión

**Reviewer (2026-07-31) — ✅ Aprobado, pasa a Seguridad.**

Verificado explícitamente:
- Regla de las dos trazas: `scripts/generar-perfil-elevacion.ts` lee
  `traza-mapa.geojson` (pintado), nunca `traza.geojson`. Correcto.
- DT-009 sin dependencia en producción: `generar-perfil-elevacion` no está
  enganchado a `predev`/`prebuild` en `package.json`; `PerfilElevacion.tsx`/
  `ModoAntes.tsx` no hacen ninguna llamada de red en runtime.
- `lib/traza/perfil-elevacion.json`: dato real, 106 puntos, 0–104,678 km,
  elevación 3–263 m, estructura `{km, m}[]` coherente con el consumo.
- `calcularDesnivel()`: lógica correcta (deltas positivos → ascenso, valor
  absoluto de negativos → descenso, plano no cuenta); 5 tests cubren
  monótono ascendente/descendente, altibajos (con tramo plano explícito),
  un único punto y perfil vacío — no solo happy path.
- `FOTO_SANTI: string | undefined = undefined` sigue exactamente el patrón
  ya validado de `FOTO_PEREGRINO` en `PeregrinoLibre.tsx`.
- Fidelidad al mockup `design-sandbox/app/camino-perfil/page.tsx`: colores,
  3 casillas de stats y SVG de perfil coinciden; único cambio es sustituir
  el array hardcodeado por los datos reales del dominio, como se esperaba.
- Tipado estricto: sin `any`, sin `as unknown as X`, sin `@ts-ignore` en
  ninguno de los archivos nuevos/modificados.
- Alcance respetado: `ModoDurante.tsx` y `ModoLlegada.tsx` no referencian
  `PerfilElevacion` ni `FOTO_SANTI` (verificado por grep).

Sin bloqueantes. Dos recomendaciones registradas en `DEBT.md`:
1. `docs/tecnico/arquitectura.md` no se actualizó con los 4 ficheros nuevos
   (`perfil-elevacion.ts`, `perfil-elevacion.json`, `PerfilElevacion.tsx`,
   `scripts/generar-perfil-elevacion.ts`) en la tabla de estructura de
   carpetas.
2. El Reviewer no pudo ejecutar `pnpm typecheck/lint/test/build` de forma
   independiente en esta sesión (sin herramienta de shell disponible); se
   confía en el reporte en verde ya documentado arriba por el Implementador,
   sin verificación externa adicional.

Siguiente paso: Agente de Seguridad.
