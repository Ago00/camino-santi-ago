# Tarea en curso

## Fix: la extensión sur del corredor (DT-005) usa el tramo alternativo `t03v` en vez de `t03`, verificado contra GPX real

**Origen:** Decisión ya definida en el encargo (no pasa por Arquitecto — fix de
geometría con un único camino de solución, verificado con datos reales antes
de implementar).

### Problema

`scripts/simplificar-traza.ts` genera la extensión sur del corredor (DT-005)
combinando dos bloques del KML oficial de la Xunta (`docs/traza-source/doc.kml`).
Hoy usa exclusivamente el tramo `CPO-e01t03-TUI-O_PORRIÑO(PolígonoIndustrial-OPorriño)`
(bloque índice 2, `KML_BLOQUE2_IDX`), pero se verificó con un track GPS real
(GPX de un peregrino en Wikiloc, `C:\Users\santi\Downloads\camino-de-santiago-portugues-1a-etapa-tui-porrino-2018.gpx`,
3.308 puntos) que ese tramo se desvía hasta ~838 m del camino que la gente
anda de verdad en esa zona (medido: `t03[126]` dista 838,1 m del punto más
cercano del track real).

El mismo KML oficial contiene una variante alternativa,
`CPO-e01t03v-TUI-O_PORRIÑO(TramoAlternativo-AsGándaras-Porriño)` (bloque
índice 3, 863 puntos), que sí coincide con el track real en esa misma zona.

**Confirmado geométricamente (distancia exacta 0,00 m):** el extremo norte de
`t03v` (su índice 0, lon -8.62272810062411, lat 42.1459690971047) coincide
exactamente con el índice 94 de `t03`. Es decir, `t03v` es una bifurcación
literal de `t03` en ese punto.

### Fix aprobado

1. **En la composición de la extensión sur** (`scripts/simplificar-traza.ts`,
   lógica alrededor de `KML_BLOQUE2_IDX`/`KML_BLOQUE2_FIN_IDX`): en vez de
   usar `t03` (bloque índice 2) desde su índice 0 hasta 126, usar:
   - `t03` (bloque índice 2) desde su índice **0 hasta 94** (centro de
     O Porriño → punto de bifurcación).
   - A partir de ahí, `t03v` (bloque índice 3) desde su índice **0 hacia el
     sur**, tantos índices como la fiabilidad frente al track real lo
     sostenga.
2. **Criterio de corte del extremo sur de `t03v`:** parsear el GPX real y
   comparar distancia (haversine) de cada punto de `t03v` contra el punto más
   cercano del track real. Extender `t03v` hacia el sur mientras esa distancia
   se mantenga en el mismo orden de magnitud que los umbrales ya validados en
   el proyecto para "esto cuenta como en ruta" (`EN_RUTA_MAX_M = 50` y
   `DESVIO_MENOR_MAX_M = 250`, en `lib/traza/umbrales.ts` — solo como
   referencia de fiabilidad, sin editarlos, no son umbrales de rechazo en
   runtime).
   - **Medido:** el bloque `t03v` completo (863 puntos) se mantiene siempre
     por debajo de 128 m del track real, con máximo puntual de 127,8 m solo en
     el índice 0 (la propia bifurcación) y el resto del bloque casi siempre
     por debajo de 20 m (solo un segundo pico de hasta 93 m en los índices
     ~430-448). Nunca se acerca a `DESVIO_MENOR_MAX_M` (250 m). Conclusión:
     **se usa el bloque `t03v` completo**, índices 0 a 862 (862 = último
     índice, 863 puntos).
3. **Guardarraíl obligatorio:** el corredor resultante no puede quedar más
   corto (hacia el sur, en km desde el centro de O Porriño) que el corredor
   actual (corte viejo a ~3.046 m del centro, `t03` índice 126).
   - **Verificado antes de implementar:** el corte viejo (`t03[0..126]`) mide
     3,0456 km desde el centro de O Porriño. El corte nuevo (`t03[0..94]` +
     `t03v[0..862]`) mide 8,5082 km. **Es más largo, no más corto** — sin
     bloqueo.
4. **Fuera de alcance, no perseguir:** el empalme entre el extremo sur de
   `t03v` y `t02` (queda sin conexión documentada en el KML, no se persigue
   hasta el final). Tampoco la calibración de mojón físico "100 km" — el
   anclaje del progreso al primer punto GPS real del intento
   (`calcularProgreso`, DT-005, existente, **NO TOCAR** `lib/traza/proyeccion.ts`)
   ya resuelve la precisión fina el día del reto.
5. Verificación de continuidad/empalme para el nuevo punto `t03[94]`→`t03v[0]`
   con el mismo patrón `console.warn` que ya usa el script (<1 m de salto
   esperado; medido 0,00 m).
6. Ejecutar `pnpm simplificar-traza` para regenerar `lib/traza/traza.geojson`
   y `lib/traza/traza-mapa.geojson`. Reportar la nueva longitud total
   resultante (hoy ~104,97 km) y cuánto se extiende el corredor sur en km.

### Cambios de documentación/texto adicionales

- Renombrar el `Point` interno con
  `name: "Inicio del corredor (~3 km al sur de O Porriño)"` en
  `scripts/simplificar-traza.ts` para que no describa un "punto de inicio
  oficial" — algo como "Límite sur del corredor (no es el punto de inicio
  oficial — el intento se ancla donde se pulse Iniciar)". No llega al
  cliente (`traza-mapa.geojson` no incluye `Point`s, solo el `LineString`).
- Reescribir el comentario de cabecera del script ("GEOMETRÍA DE LA EXTENSIÓN
  SUR (DT-005)") para reflejar el uso de `t03`+`t03v` en vez de solo
  `t03`+bloque4.
- Mantener y reforzar `nota_extension_sur` con que la longitud del corredor
  es deliberadamente generosa y no persigue un mojón físico exacto.

### Documentación técnica — DT-015 (única, dos apartados)

1. El fix de geometría: desviación de `t03` (hasta 838 m, verificado contra
   GPX real), empalme exacto `t03[94]`≡`t03v[0]` (0,00 m), criterio de corte
   sur (fiabilidad GPX, reutilizando el orden de magnitud de
   `EN_RUTA_MAX_M`/`DESVIO_MENOR_MAX_M`), y que no se persigue el empalme con
   `t02` (fuera de alcance, motivo documentado).
2. Aclaración/extensión de DT-005: el corredor no necesita precisión de
   mojón porque el anclaje en vivo ya resuelve la precisión fina; el
   corredor solo necesita margen suficiente para que `clasificarEstado` no
   muestre `desvio-mayor` al primer punto real del intento. Contexto no
   bloqueante: investigación de dos mojones reales georreferenciados en
   OpenStreetMap (lat 42.1696 "97,602" y lat 42.1934 "94,512", ambos al
   norte de O Porriño, fuera de la zona corregida) cuya calibración no fue
   concluyente y no bloqueó esta decisión.

Actualizar también `CHANGELOG.md` y `docs/tecnico/arquitectura.md`/
`docs/tecnico/modelo-datos.md` si describen la composición de la traza.

### Alcance — qué NO tocar

- `lib/traza/proyeccion.ts` (dominio puro, cerrado).
- `lib/traza/umbrales.ts` (solo referencia de fiabilidad, no se edita).
- `components/mapa/Mapa.tsx`, `/api/progreso`, pipeline de "minuto a minuto"
  (DT-014, ya cerrada).
- El empalme con `t02` ni la calibración de mojón (fuera de alcance
  explícitamente).
- Nada retroactivo relacionado con `minuto_a_minuto`.

### Quality gates obligatorios

`pnpm typecheck`, `pnpm lint`, `pnpm test` (toda la suite), y `pnpm build` —
los cuatro en verde. Si algún test de integridad de la traza (longitud
total, número de puntos) queda como "magic number" desactualizado, corregirlo
para reflejar la nueva geometría real, no ignorarlo.

---

## Archivos modificados/creados

- `scripts/simplificar-traza.ts` — extensión sur recompuesta: `t03[0..94]` +
  `t03v[0..862]` (bloque completo) en vez de `t03[0..126]`; nuevas
  constantes `KML_BLOQUE2_BIFURCACION_IDX`/`KML_BLOQUE3_IDX`/
  `KML_BLOQUE3_FIN_IDX`; verificación de empalme `t03[94]`→`t03v[0]`;
  cabecera y `nota_extension_sur` reescritas; `Point` "Inicio del corredor"
  renombrado a "Límite sur del corredor (no es el punto de inicio
  oficial...)".
- `lib/traza/traza.geojson` — regenerado (`pnpm simplificar-traza`): 7.951
  puntos, 110,4310 km.
- `lib/traza/traza-mapa.geojson` — regenerado: 2.101 puntos, 110,1328 km.
- `lib/traza/proyeccion.test.ts` — guardarraíl de longitud actualizado
  (104,92-105,02 km → 110,38-110,48 km); comentario de cabecera (7.121 →
  7.951 vértices).
- `app/api/progreso/route.test.ts` — comentario actualizado (7.121 → 7.951).
- `lib/traza/cargar-traza.ts` — comentario actualizado (~7.121 → ~7.951).
- `docs/tecnico/decisiones-tecnicas.md` — nueva DT-015 (dos apartados: fix
  de geometría + aclaración de DT-005); nota añadida a la tabla de DT-001;
  cifras "estado actual" corregidas en DT-003 y DT-007.
- `docs/tecnico/arquitectura.md` — tabla de las dos trazas y comentario de
  estructura actualizados a las cifras nuevas.
- `AGENTS.md` — cifra de longitud del corredor actualizada.
- `docs/producto/contexto.md` — longitud y punto sur del corredor
  actualizados, referencia a DT-015 añadida.
- `DEBT.md` — entrada "Desfase entre la pantalla y las piedras" ampliada con
  el contexto no bloqueante de los dos mojones de OSM investigados (sin
  cambio de prioridad, sin deuda nueva).
- `CHANGELOG.md` — nueva entrada 2026-08-07.
- `docs/tareas/CURRENT.md` — este fichero, reseteado para la tarea y
  completado al cierre.
- `pnpm-lock.yaml` — fix bloqueante de Seguridad (Ronda 1): `pnpm update
  brace-expansion js-yaml` bumpea las resoluciones transitivas a
  `brace-expansion@5.0.9` (bajo `minimatch@10.2.6`, sin cambio de versión de
  `minimatch`) y `js-yaml@4.3.1` (bajo `@eslint/eslintrc@3.3.6`, sin cambio de
  versión de `eslint`). Ambos saltos caían ya dentro de los rangos semver
  declarados por sus padres (`^5.0.8` y `^4.3.0` respectivamente) — el
  lockfile solo tenía fijada una resolución más vieja de lo necesario. **Sin
  cambios en `package.json`**: no hizo falta actualizar `eslint`/
  `@vitest/coverage-v8` a una versión mayor ni añadir `pnpm.overrides`.

## Resultado de la verificación geométrica (antes de implementar)

- `t03[126]` (corte antiguo) dista **838,1 m** del track GPS real (Wikiloc,
  3.308 puntos) — confirma la desviación descrita en el encargo.
- `t03[94]` ≡ `t03v[0]`: distancia **0,00 m** — bifurcación literal del KML.
- `t03v` completo (863 puntos): separación máxima **127,8 m** (en el propio
  índice 0), resto casi siempre < 20 m, nunca cerca de `DESVIO_MENOR_MAX_M`
  (250 m) → se usa el bloque completo.
- Guardarraíl de longitud: corte nuevo = 8.508,2 m desde el centro de
  O Porriño vs. corte viejo = 3.045,6 m → **más largo, no más corto**. Sin
  bloqueo.
- Empalme con `t02` (fuera de alcance): hueco de **1.358,9 m** sin conexión
  documentada en el KML, coincide exactamente con la cifra dada en el
  encargo.

## Resultado tras regenerar la traza

- Longitud total: **104,9684 km → 110,4310 km** (+5.462,6 m).
- Extensión sur (desde el inicio actual de la traza hasta el nuevo extremo
  sur): 4,7549 km → 10,2175 km (+5.462,6 m) — todo el incremento de longitud
  total procede de esta extensión, el resto de la traza no cambia.
- Puntos de `traza.geojson`: 7.121 → 7.951.
- `traza-mapa.geojson` (pintado): 2.101 puntos, 110,1328 km.

## Estado de quality gates

- `pnpm typecheck` — verde, cero errores.
- `pnpm lint` — verde, cero errores/warnings.
- `pnpm test` — verde, 208/208 tests (21 ficheros).
- `pnpm build` — verde, compila y genera todas las rutas correctamente
  (incluye `bundle-maplibre-worker` en `prebuild`).

Lista para Reviewer.

---

## Historial de revisión

### Ronda 1 — Reviewer (2026-08-07)

**Veredicto: ✅ Aprobado — pasa a Seguridad.**

Verificación manual realizada (sin acceso a shell en esta sesión, así que no se
re-ejecutaron `pnpm typecheck`/`lint`/`test`/`build`; se confirma su
plausibilidad por revisión exhaustiva de código y datos, no por re-ejecución):

- **Geometría verificada por aritmética independiente, no solo por las cifras
  del resumen del Implementador.** `t03[0..94]` = 95 puntos (`slice(0, 95)`),
  `t03v[1..862]` = 862 puntos (`slice(1, 863)`, sin duplicar la bifurcación) →
  957 puntos nuevos, frente a los 127 puntos del `t03[0..126]` viejo → delta
  de **+830 puntos**, que coincide exactamente con 7.951 − 7.121 = 830.
  Delta de longitud del guardarraíl (8.508,2 − 3.045,6 = 5.462,6 m) coincide
  exactamente con el delta de longitud total reportado (110,4310 − 104,9684 =
  5.462,6 km→m). Ambas cifras cuadran de forma independiente — no hay
  redondeo sospechoso ni discrepancia.
- **Sin punto duplicado en el empalme:** `ext3NorteSur` se toma con
  `slice(1, ...)`, evitando duplicar `t03v[0]` (≡ `t03[94]`, 0,00 m).
- **Orientación norte→sur / sur→norte correcta** en los tres bloques
  compuestos y sus inversiones — verificado leyendo la lógica completa, no
  solo los comentarios.
- **`console.warn`/`console.log` de continuidad presentes** para el nuevo
  empalme `t03[94]`→`t03v[0]` (líneas ~205-220 de
  `scripts/simplificar-traza.ts`), además del guard general de salto máximo
  (300 m) ya existente.
- **`t03v` completo, no un subconjunto** — confirmado en código
  (`KML_BLOQUE3_FIN_IDX = 862`, el último índice real del bloque).
- **Guardarraíl de longitud con la misma referencia** (centro de O Porriño)
  en ambos términos de la comparación — correcto.
- **DT-015 completa y honesta**: explica la desviación de 838,1 m con datos
  concretos, el empalme exacto, el criterio de corte (y por qué no hizo
  falta cortar `t03v`), el hueco de 1.358,9 m con `t02` como fuera de
  alcance documentado, y la aclaración de DT-005.
- **`proyeccion.test.ts`**: el rango 110,38–110,48 km es coherente con el
  valor real (110,4310 km, dentro del rango con margen). Búsqueda de "magic
  numbers" desactualizados (104,9x / 7.121 / 100,2103) en el resto del
  código no encontró ninguno en ficheros de producción o tests — solo en
  logs históricos (`docs/tareas/historico/`, entradas de decisiones ya
  fechadas), que no requieren actualización.
- **`lib/traza/proyeccion.ts` y `lib/traza/umbrales.ts` sin tocar** —
  confirmado leyendo ambos ficheros íntegros.
- **`AGENTS.md`, `docs/producto/contexto.md`, `docs/tecnico/arquitectura.md`,
  `CHANGELOG.md`** coherentes con las cifras nuevas (110,43 km / 7.951
  puntos). Sin cifras viejas sueltas en ningún documento de "estado actual".

**Recomendaciones (no bloqueantes, registradas en `DEBT.md`):**
- `docs/producto/decisiones-producto.md` conserva la cifra vieja (~105 km /
  7.121 puntos) en el log histórico de la decisión de DT-005, sin la nota
  de actualización que sí recibió DT-001 en `decisiones-tecnicas.md`.
- `nota_extension_sur` en `traza.geojson` dice "~10,2 km (al sur de
  O Porriño)", cifra correcta pero de lectura ambigua (incluye el tramo
  entre el inicio original —al norte del centro— y el centro mismo, no solo
  el tramo sur).

**Sin bloqueantes.** El Agente de Seguridad debe revisar a continuación.

---

### Ronda 1 — Agente de Seguridad (2026-08-07)

**Veredicto: ❌ Bloqueantes encontrados — devuelve al Implementador.**

Auditoría OWASP Top 10 completa sobre los 13 ficheros tocados en esta tarea
(diff real verificado con `git diff`, no solo el resumen del Implementador).

**A01 — Control de acceso roto:** no aplica. Ningún endpoint, server action ni
middleware tocado. `scripts/simplificar-traza.ts` es un script de build local
(`pnpm simplificar-traza`), no se ejecuta en runtime ni en `predev`/`prebuild`
(confirmado: solo `bundle-maplibre-worker` corre en esos hooks, según
`AGENTS.md`). Sin superficie de autenticación/autorización en el diff.

**A02 — Fallos criptográficos:** no aplica. Sin datos sensibles, tokens ni
claves en ningún fichero tocado. Verificado con grep de
`key|secret|token|password|api[_-]?key|credential` sobre los diffs de
`docs/tecnico/decisiones-tecnicas.md`, `docs/tecnico/arquitectura.md`,
`AGENTS.md`, `docs/producto/contexto.md`, `DEBT.md` y `CHANGELOG.md` — cero
coincidencias.

**A03 — Inyección:** sin SQL, sin `eval`/`new Function`, sin comandos de
sistema. `parsearBloquesKML` usa una regex fija
(una expresion regular fija que captura todo el contenido entre las etiquetas <coordinates> y </coordinates>, sin flags dinamicos) sobre un fichero KML local y de
confianza (`docs/traza-source/doc.kml`, ya versionado en el repo), no sobre
input externo ni de usuario. Sin riesgo de ReDoS relevante (patrón simple,
entrada de tamaño acotado y controlado).

**A04 — Diseño inseguro:** no aplica. Sin flujos de negocio críticos
(autenticación, pagos, operaciones irreversibles) en el diff. La generación
de la traza es un proceso offline de desarrollo, no una operación runtime
manipulable por el cliente.

**A05 — Configuración de seguridad incorrecta:** sin credenciales ni secretos
hardcoded en el diff. Sin variables de entorno tocadas. Se verificó además
que la ruta local absoluta mencionada en el encargo
(en la carpeta Downloads del equipo local, ruta: C:/Users/santi/Downloads/camino-de-santiago-portugues-1a-etapa-tui-porrino-2018.gpx,
el GPX de Wikiloc usado solo para la verificación manual previa) no quedó
hardcoded en `scripts/simplificar-traza.ts` ni en ningún fichero committeado —
el script solo lee `doc.kml` y el GeoJSON fuente, con rutas relativas al
proyecto (`join(ROOT, ...)`). Tampoco quedo ninguna ruta local tipo `C:/Users/...`
filtrada en los GeoJSON generados (`lib/traza/traza.geojson`,
`lib/traza/traza-mapa.geojson`) ni en la documentación committeada —
verificado con grep, cero coincidencias.

**A06 — Componentes vulnerables:** ❌ **BLOQUEANTE.** `pnpm audit` en la raíz
del proyecto reporta **2 vulnerabilidades de severidad alta**:
- `brace-expansion` (>=4.0.0 <5.0.9) — DoS por arrays intermedios sin acotar,
  bypass de la mitigación de CVE-2026-14257 (GHSA-rgw5-rvv9-x895). Cadena:
  `eslint > @eslint/config-array > minimatch > brace-expansion` y
  `@vitest/coverage-v8 > test-exclude > (glob>)minimatch > brace-expansion`
  (95 rutas en total, `pnpm why brace-expansion`).
- `js-yaml` (>=4.0.0 <4.3.1) — consumo cuadrático de CPU en resolución de
  `!!omap`, CVE-2026-59870 sin backportear (GHSA-5p4m-2wfm-xmqj). Cadena:
  `eslint > @eslint/eslintrc > js-yaml` (26 rutas, `pnpm why js-yaml`).

  `pnpm audit --prod` da limpio (0 vulnerabilidades) — ambas son transitivas
  de `eslint`/`@vitest/coverage-v8` (devDependencies, vía
  `eslint-config-next`), no se despliegan a producción ni procesan input de
  usuario en runtime. Aun así, el framework (`FRAMEWORK.md` §11, criterio A06
  de este agente) no exime de bloqueo a las vulnerabilidades altas/críticas
  por ser de desarrollo: "cualquier vulnerabilidad de severidad alta o
  crítica es bloqueante", sin excepción declarada. Precedente directo en
  este mismo proyecto: commit `b1445bf` ("fix: vulnerabilidad alta
  (brace-expansion DoS) en dependencias de desarrollo") ya trató el mismo
  patrón como bloqueante — `brace-expansion` ha reaparecido porque la CVE
  mitigada entonces (CVE-2026-14257) tiene ahora un bypass conocido, y
  `js-yaml` es un hallazgo nuevo.
  **No relacionado con los cambios de esta tarea** (sin diff en
  `package.json` ni `pnpm-lock.yaml` — confirmado con `git status`/`git log
  -- pnpm-lock.yaml package.json`, deuda preexistente que este audit
  destapa, no introducida por DT-015), pero bloqueante igualmente por ser la
  última barrera antes de cerrar cualquier tarea.
  **Fix requerido:** actualizar a versiones parcheadas (`brace-expansion
  >=5.0.9`, `js-yaml >=4.3.1`) — vía `pnpm update` de `eslint`/
  `@vitest/coverage-v8` a versiones que arrastren las transitivas parcheadas,
  o añadiendo `pnpm.overrides` en `package.json` si el update directo no las
  arrastra. Confirmar con `pnpm audit` limpio antes de devolver a
  Seguridad.

**A07 — Fallos de identificación y autenticación:** no aplica. Sin gestión de
sesiones ni rutas protegidas en el diff.

**A08 — Fallos de integridad en software y datos:** no aplica directamente —
sin datos de cliente/formulario en el diff. La traza generada procede de una
fuente local de confianza (KML oficial de la Xunta, ya versionado), no de
input externo en runtime. Sin `as` de TypeScript usados para saltarse
validación de datos externos en los ficheros tocados.

**A09 — Fallos en logging y monitorización:** revisados los nuevos
`console.log`/`console.warn` añadidos en `scripts/simplificar-traza.ts`
(verificación de empalme `t03[94]`→`t03v[0]`) — solo exponen coordenadas
geográficas públicas y distancias en metros, nada sensible; y solo se
ejecutan en un script de desarrollo local, no en runtime de producción ni en
una respuesta al cliente.

**A10 — SSRF:** no aplica. Sin requests a URLs construidas con input de
usuario; el script solo lee ficheros locales del propio repositorio.

## Issues encontrados

- [`pnpm audit` / dependencias de desarrollo, transitivas de `eslint` y
  `@vitest/coverage-v8`] A06 — Componentes vulnerables. 2 vulnerabilidades de
  severidad alta: `brace-expansion` (CVE-2026-14257, bypass de mitigación
  previa) y `js-yaml` (CVE-2026-59870, no backporteada). No introducidas por
  esta tarea (sin diff en `package.json`/`pnpm-lock.yaml`) pero bloqueantes
  por política de A06 sin excepción para dependencias de desarrollo. Fix
  requerido: actualizar a `brace-expansion >=5.0.9` y `js-yaml >=4.3.1`
  (directamente o vía `pnpm.overrides`), verificar con `pnpm audit` limpio.

## Sin issues

Sin issues en A01, A02, A03, A04, A05, A07, A08, A09, A10 sobre los ficheros
de esta tarea — confirmado explícitamente, no por ausencia de comentarios.

## Veredicto

❌ **Issues bloqueantes — devuelve al Implementador.** Un único bloqueante,
de dependencias (A06), no relacionado con la geometría de la traza ni con la
lógica de esta tarea, que en sí misma (revisión de código y datos de DT-015)
no presenta ningún hallazgo de seguridad. El Implementador debe actualizar
las dependencias vulnerables y volver a pasar por Seguridad antes de cerrar.

---

### Fix bloqueante de Seguridad (2026-08-07)

**Acción:** `pnpm update brace-expansion js-yaml`. Ambas transitivas caían ya
dentro de los rangos semver que sus padres declaran (`minimatch@10.2.6`
acepta `brace-expansion: ^5.0.8`; `@eslint/eslintrc@3.3.6` acepta
`js-yaml: ^4.3.0`), así que un update dirigido a las propias transitivas
bastó para que pnpm resolviera las versiones parcheadas — **sin necesidad de
subir `eslint` ni `@vitest/coverage-v8` de versión mayor, y sin necesidad de
`pnpm.overrides`**.

**Versiones resultantes** (verificado con `pnpm why`):
- `brace-expansion@5.0.9` (patched >=5.0.9) — bajo `minimatch@10.2.6` (misma
  versión de `minimatch` que antes, solo cambia la resolución de su
  dependencia).
- `js-yaml@4.3.1` (patched >=4.3.1) — bajo `@eslint/eslintrc@3.3.6` (misma
  versión de `eslint`/`@eslint/eslintrc` que antes).

**`pnpm audit`:** limpio — `No known vulnerabilities found`.

**Diff:** único fichero de dependencias tocado, `pnpm-lock.yaml` (8
inserciones / 8 borrados, `git diff --stat`). `package.json` sin cambios.

**Quality gates (las cuatro, re-ejecutadas tras el fix):**
- `pnpm typecheck` — verde, cero errores.
- `pnpm lint` — verde, cero errores/warnings.
- `pnpm test` — verde, 208/208 tests (21 ficheros).
- `pnpm build` — verde, compila y genera todas las rutas correctamente
  (incluye `bundle-maplibre-worker` en `prebuild`).

**Deuda técnica generada:** ninguna — el fix fue una actualización limpia de
lockfile dentro de los rangos semver existentes, no un `override` forzado ni
un downgrade/pin que necesite seguimiento futuro.

Listo para que Seguridad vuelva a revisar (Ronda 2).

### Ronda 2 — Agente de Seguridad (2026-08-07)

**Nota de contexto:** DT-015 (geometría) ya fue mergeada a `main` directamente
por otra sesión mientras este fix de dependencias estaba en curso. Este fix
ya no pertenece a esa tarea — se commitea como fix de seguridad independiente
(solo dependencias de desarrollo). Esta ronda revisa exclusivamente el fix de
`pnpm-lock.yaml`, no vuelve a evaluar la geometría (ya aprobada en Ronda 1 de
Reviewer y no tocada en este fix).

**Verificación 1 — `pnpm audit` ejecutado directamente por este agente (no
solo el resumen del Implementador):**
```
pnpm audit        → No known vulnerabilities found
pnpm audit --prod → No known vulnerabilities found
```
Limpio, confirmado dos veces.

**Verificación 2 — resolución real de las transitivas (`pnpm why`):**
- `brace-expansion@5.0.9` (parcheada, ≥5.0.9 requerido) — **única versión**
  resuelta en todo el árbol, colgando de `minimatch@10.2.6` (sin cambio de
  versión) vía `eslint@9.39.5` y `@vitest/coverage-v8@3.2.7` (ambas
  devDependencies). Sin resoluciones duplicadas ni versiones antiguas
  coexistiendo.
- `js-yaml@4.3.1` (parcheada, ≥4.3.1 requerido) — **única versión** resuelta,
  colgando de `@eslint/eslintrc@3.3.6` (sin cambio de versión de `eslint`).

**Verificación 3 — diff mínimo (`git diff pnpm-lock.yaml` + `git status`):**
- `pnpm-lock.yaml`: 8 inserciones / 8 borrados, exactamente las 4 ubicaciones
  esperadas — 2 bloques `resolution:` (`brace-expansion@5.0.8→5.0.9`,
  `js-yaml@4.3.0→4.3.1`) y 2 referencias en `snapshots:` (bajo
  `@eslint/eslintrc` y bajo `minimatch`). Ningún otro paquete tocado, sin
  downgrades, sin cambios de versión en `eslint`, `minimatch`,
  `@eslint/eslintrc` ni `@vitest/coverage-v8`.
- `git status`: solo `docs/tareas/CURRENT.md` y `pnpm-lock.yaml` modificados.
  `package.json` sin cambios — confirmado, coincide con lo reportado por el
  Implementador.

**Repaso OWASP Top 10 sobre este fix (solo `pnpm-lock.yaml`, sin código
tocado):**
- A01, A02, A03, A04, A05, A07, A08, A09, A10 — no aplican, no hay código de
  producción ni de infraestructura en el diff, solo resolución de
  dependencias transitivas de desarrollo.
- **A06 — Componentes vulnerables: resuelto.** Las dos vulnerabilidades altas
  bloqueadas en Ronda 1 (`brace-expansion` CVE-2026-14257 bypass, `js-yaml`
  CVE-2026-59870) están parcheadas y verificadas por este agente de forma
  independiente, no solo por el resumen del Implementador.

## Issues encontrados

Ninguno.

## Sin issues

Sin issues en A01–A10 sobre el fix de dependencias verificado en esta ronda
— confirmado explícitamente, incluyendo re-ejecución propia de `pnpm audit`
y `pnpm why` (no solo revisión del resumen del Implementador).

## Veredicto

✅ **Sin vulnerabilidades — fix de seguridad listo para commitear** (como
commit independiente, no como parte de DT-015, que ya está en `main`).


---

Este archivo es la pizarra compartida entre todos los agentes del pipeline: los
subagentes corren aislados y no ven la conversación, así que lo único que
comparten es lo que está escrito aquí. Lo gobierna el Orquestador, que lo crea al
empezar cada tarea con la plantilla del framework y lo archiva al cerrarla.
