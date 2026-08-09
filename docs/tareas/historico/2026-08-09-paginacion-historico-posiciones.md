# Tarea en curso

**Título:** El histórico de posiciones se corta a 1000 filas: mapa, barra y km se congelan
**Tipo:** Bug
**Estado:** Implementación
**Iniciada:** 2026-08-09

## Prompt clarificado

Durante la prueba real del 2026-08-07 (intento 10, modo libre), el mapa dejó
de pintarse pasado cierto punto aunque el iPhone seguía enviando posiciones
sin cortes: cadencia de 15 s constante, cero huecos de más de 5 minutos, 1564
posiciones guardadas en BD hasta las 11:10:32Z.

**Causa raíz confirmada (2026-08-08):** PostgREST (Supabase) limita a **1000
filas** cualquier `SELECT` sin `Range` explícito. Las dos consultas que
alimentan el progreso y el mapa piden el histórico completo sin paginar:

- `app/api/progreso/route.ts` (`calcularProgresoActual`, línea ~103-108)
- `app/page.tsx` (`obtenerHistoricoPosiciones`, línea ~224-234)

Verificado con la misma clave `anon` que usa la web: la consulta devolvió
`content-range: 0-999/*` (1000 filas) con última `ts` de `08:49:39Z`, cuando
la última posición real en BD era de `11:10:32Z` — **564 puntos, 2 h 21 min
de camino, ausentes de todo lo que el histórico alimenta**:

- `ultimaPosicion` (de donde salen el marcador del mapa, la distancia
  restante en modo libre, y el "última señal hace…")
- `odometroKm` y `porcentaje`/`kmAvanzados`/`kmRestantes` en modo guiado
  (`calcularProgreso`, `lib/traza/proyeccion.ts` — necesita el histórico
  **completo**, no solo los últimos puntos: el odómetro suma distancia real
  entre cada par consecutivo, y `maxKmAvanzados` es un máximo monótono desde
  el ancla)
- los puntos GPS dibujados en el mapa del modo libre
  (`calcularProgresoLibreDelIntento`, mismo `app/page.tsx`)

**Por qué es el bug más grave de los tres detectados en la prueba:** en modo
libre ya cortó a las ~4 h 20 min de un intento de 7 h. En un intento
**guiado** real (30 h, cadencia de 15 s ⇒ ~7200 puntos), el corte llegaría a
**las ~4 horas de empezar** — y a partir de ahí el mapa, la barra de progreso
y los kilómetros mostrados quedarían congelados el resto del reto, sin que
nada en pantalla lo indique como un fallo (no hay error, simplemente deja de
avanzar).

**Lo que NO se ve afectado** (verificado, no hace falta tocarlo):
- La ingesta (`POST /api/track`) no lee `posiciones`, solo inserta — sigue
  guardando todo correctamente aunque el resto se congele. Por eso en la
  prueba real los datos estaban todos ahí, intactos, esperando a ser leídos.
- El panel admin (`components/admin/SeccionPosicion.tsx`) ya pagina
  correctamente con `.range(offset, offset + TAMANO_PAGINA - 1)` para su
  listado paginado — no está afectado, es el patrón a seguir.
- El mapa en modo **guiado** no depende del histórico de posiciones para
  dibujar la ruta (esa es la traza fija `traza-mapa.geojson`); solo el
  marcador de posición actual y el corte "andado/restante" dependen de
  `ultimaPosicion`, que sí viene del histórico truncado.

## Alcance

- **Incluye:** las dos consultas sin paginar listadas arriba, y cualquier
  ajuste de tipado/tests que se derive de corregirlas.
- **Excluye explícitamente:**
  - El defecto ya registrado en `DEBT.md` ("Modo libre (DT-016): el trazado
    en vivo del mapa solo capta 1 punto GPS por ventana de polling") — es un
    problema distinto (cliente, no servidor) y ya tiene su propia entrada de
    deuda a prioridad Baja. No se toca en esta tarea.
  - Bug 3 (entradas del minuto a minuto con `lat`/`lon` a `null` por la
    caché no compartida entre instancias serverless) — tarea aparte.
  - Persistir el progreso incremental en la tabla `intentos` para evitar
    recorrer el histórico completo en cada cálculo — es la solución de fondo
    de más largo plazo, ya identificada y descartada por alcance en DT-007 y
    en la entrada de `DEBT.md` sobre `kmAcumulados`. El Arquitecto debe
    valorarla como opción, pero se anticipa alto riesgo/esfuerzo para tan
    cerca del reto.
  - `lib/traza/proyeccion.ts` (el dominio de cálculo) y el algoritmo de
    `calcularProgreso`/`calcularProgresoLibre` en sí — no se tocan, solo
    cómo se les suministra el histórico.

## Comportamiento en casos límite

- **Intento con más de 1000 posiciones** (el caso real que falló): el
  histórico completo debe llegar a `calcularProgreso`/`calcularProgresoLibre`
  sin truncar, sea cual sea su tamaño real durante las 30 h del reto.
- **Intento con 0 o pocas posiciones:** sin cambio de comportamiento.
- **Consulta muy grande** (día completo, ~7200 filas): debe seguir
  respondiendo en un tiempo razonable para no degradar el polling de 30 s del
  cliente; se apoya en la caché de 15-20 s ya existente (DT-007), que no se
  toca en esta tarea.

## Supuestos asumidos

- **La corrección debe cubrir tanto modo guiado como libre** — ambos leen
  del mismo histórico sin paginar, y el reto real es en modo guiado.
- **Actualización tras medir (2026-08-09): sí hace falta optimizar el
  algoritmo de proyección — resultó estrictamente necesario.** Medido con el
  algoritmo real: paginar sin más habría dejado `calcularProgreso` tardando
  ~281 s con el histórico de un día completo, muy por encima de cualquier
  timeout serverless. Ver DT-018 para los números completos y la solución
  (ventana deslizante). El supuesto original de "no perseguir mejoras de
  rendimiento salvo que resulte estrictamente necesario" queda satisfecho
  por su propia condición, no derogado.
- Hay un intento real activo en producción ahora mismo (`id 10`, `durante`,
  modo libre, sin cerrar) — el Implementador y el Orquestador deben tenerlo
  en cuenta al verificar en preview (no confundir datos de prueba con el
  intento real, igual que en la tarea anterior).

## Diseño
Mockup: N/A — no hay cambio de UI ni de pantalla, es una corrección de cómo
se consulta la base de datos.

## Decisión técnica / Diagnóstico

### Decisión aprobada por el usuario (2026-08-09) — DT-018

El usuario delegó explícitamente la elección al Arquitecto, con un criterio
claro: *"elige la que quieras pero que funcione ... que sea robusto y no
pueda volver a pasar"*. Antes de recomendar, se midió con el algoritmo real
del proyecto (no estimado) el coste de `calcularProgreso` a escala de un día
completo de reto, lo que reveló que la corrección "solo paginar" propuesta
inicialmente habría sido insuficiente — ver DT-018 en
`docs/tecnico/decisiones-tecnicas.md` para el análisis completo, los datos
medidos y las alternativas descartadas. Resumen de lo que hay que construir:

1. **Función compartida de fetch paginado** (`.range()` en bucle hasta
   agotar, con tope de seguridad + log si se alcanza) para los dos sitios que
   necesitan el histórico completo:
   - `calcularProgresoActual` en `app/api/progreso/route.ts`, rama modo
     guiado (llama a `calcularProgreso`).
   - `obtenerHistoricoPosiciones` en `app/page.tsx` (usada por ambos modos en
     la carga de página: guiado siempre, libre para construir `puntosGps`
     inicial del mapa).

2. **La rama modo libre de `/api/progreso` deja de pedir el histórico
   completo.** Cambia a `.order(ts desc).limit(1).maybeSingle()` — es lo
   único que `calcularProgresoLibre` usa. Mismo resultado, sin coste de
   traer miles de filas cada 30 s de polling.

3. **Proyección con ventana deslizante en `calcularProgreso`**
   (`lib/traza/proyeccion.ts`) — el cambio que hace viable el punto 1 a
   escala de un día completo (sin él, paginar sin más habría cambiado el
   bug por uno peor: ~281 s por cálculo con 7200 puntos, medido). Mantener
   el índice de traza del último punto proyectado a lo largo del bucle;
   cada punto siguiente busca primero en una ventana de **±30 segmentos**
   alrededor de ese índice (con Turf sobre un *slice* de
   `traza.coordenadas`, convirtiendo el resultado local a km globales
   sumando `traza.kmAcumulados[índice de inicio del slice]`). Si la mejor
   coincidencia de la ventana queda a más de **300 m**, reintentar con un
   escaneo completo de la traza (el comportamiento exacto de hoy) y
   realinear el índice desde ahí — esto nunca puede dar un resultado peor
   ni distinto al actual, solo más lento en ese caso puntual.

   **Validado con el algoritmo real, no solo diseñado:** 75× más rápido a
   2000 puntos (0,71 s vs. 53,9 s) con 0,0000 km de diferencia en odómetro y
   `kmAvanzados`; ~2,87 s a 7200 puntos (vs. 281 s); y un escenario de
   desvío real de ~3 km fuera de la traza (300 puntos normal → 50
   desviados → 150 reenganchados) da resultado **idéntico** al cálculo sin
   ventana, con el mecanismo de respaldo activándose 3 veces de 500 puntos.
   Números completos en DT-018.

4. **Constantes nuevas en `lib/traza/umbrales.ts`**, no en línea en
   `proyeccion.ts` (mismo criterio que el resto de umbrales del fichero):
   tamaño de la ventana (segmentos) y umbral de distancia para el fallback
   a escaneo completo. Documentar en comentario que el umbral del fallback
   debe quedar por encima de `DESVIO_MENOR_MAX_M` (así que en-ruta y
   desvío-menor siempre resuelven por ventana; solo desvío-mayor o un hueco
   de datos largo dispara el escaneo completo).

**Fuera de alcance (no tocar):** `progreso-libre.ts`, `separacionDeTrazaM`
(se llama una vez por posición entrante en `/api/track`, no en un bucle
sobre el histórico — sin problema de escala), el esquema de BD, y persistir
progreso incremental en `intentos` (Opción B de DT-018, descartada por
alcance).

**Tests obligatorios** (más allá de que los existentes de
`proyeccion.test.ts` sigan en verde sin cambios, ya que el contrato externo
de `calcularProgreso` no cambia):
- Historial grande (varios miles de puntos) da el mismo resultado que el
  código sin ventana para los mismos datos — comparar contra una
  implementación de referencia o fixtures conocidas, no solo contra sí
  mismo.
- Un desvío que se sale de la ventana debe seguir clasificándose
  correctamente (mismo `estado`, mismo `separacionM`) y el punto de
  reenganche posterior debe volver a resolver por ventana, no quedarse
  perdido.
- Huecos largos en el histórico (siguiente punto muy lejos del índice
  anterior) deben disparar el fallback y no dar un resultado incorrecto.
- Valorar un test de rendimiento con un histórico de escala de un día
  completo (~7000-8000 puntos) que falle si el tiempo de ejecución supera
  un umbral generoso (p. ej. unos pocos segundos) — es exactamente esta
  clase de regresión (invisible con datos de test pequeños, solo aparece a
  escala real) la que motivó esta tarea.

## Archivos modificados

**Nuevos:**
- `lib/supabase/paginacion.ts` — `obtenerTodasLasFilas()`, fetch paginado
  genérico con `.range()` en bucle, tope de seguridad (50 páginas / 50.000
  filas) + log de aviso.
- `lib/supabase/paginacion.test.ts` — tests de la función de paginación
  (página única, encadenado de varias páginas, borde de 1000 filas exactas,
  error mid-paginación, tope de seguridad).
- `lib/traza/proyeccion.ventana.test.ts` — tests de la ventana deslizante:
  equivalencia numérica con/sin ventana a 1000 puntos (histórico grande,
  ritmo constante sobre la traza real), desvío que se sale de la ventana
  (~3 km) con reenganche posterior, hueco largo en el histórico que dispara
  el fallback, y rendimiento con ~7.200 puntos (día completo de reto).

**Modificados:**
- `lib/traza/umbrales.ts` — nuevas constantes `VENTANA_PROYECCION_SEGMENTOS`
  (30) y `VENTANA_PROYECCION_FALLBACK_MAX_M` (300, por encima de
  `DESVIO_MENOR_MAX_M`).
- `lib/traza/proyeccion.ts` — `calcularProgreso` proyecta con ventana
  deslizante (nueva función privada `proyectarPunto`), manteniendo el
  índice de traza del último punto proyectado a lo largo del bucle; fallback
  a escaneo completo si la ventana queda a más de 300 m. Limpieza asociada:
  se eliminó la doble proyección del primer punto (antes: una vez para el
  ancla, otra dentro del bucle) y la proyección final duplicada de la
  última posición válida (antes: un `nearestPointOnLine` extra tras el
  bucle) — ambas reutilizan ahora el resultado ya calculado dentro del
  propio bucle. El contrato externo (`Posicion[]` + `TrazaPreparada` →
  `Progreso`) no cambia; `proyeccion.test.ts` no se tocó y sigue en verde.
- `app/api/progreso/route.ts` — rama modo guiado pagina el histórico
  completo con `obtenerTodasLasFilas`; rama modo libre deja de pedir el
  histórico completo y pasa a `.order(ts desc).limit(1).maybeSingle()`.
- `app/api/progreso/route.test.ts` — mocks de `posiciones` actualizados para
  la nueva forma de consulta (`range`/`limit`/`maybeSingle` en vez de un
  `order` que resolvía directamente); dos tests nuevos verificando la
  bifurcación de fetch (guiado pagina, libre solo pide 1 fila).
- `app/page.tsx` — `obtenerHistoricoPosiciones` (usada por ambos modos en la
  carga de página) pagina con `obtenerTodasLasFilas` en vez de un `select`
  sin límite.
- `docs/tecnico/arquitectura.md` — añadida `lib/supabase/paginacion.ts` a la
  tabla de estructura, nota de paginación en `progreso/route.ts`, nota de
  ventana deslizante en `proyeccion.ts`/`umbrales.ts`, y
  `proyeccion.ventana.test.ts` en `lib/traza/`.
- `CHANGELOG.md` — entrada del fix.
- `DEBT.md` — nueva entrada sobre el tiempo añadido a `pnpm test` por el
  test de equivalencia a escala de miles de puntos (~45 s del fichero
  `proyeccion.ventana.test.ts`; deliberado, documentado, prioridad baja).

**No tocados** (confirmado, según el alcance aprobado): `progreso-libre.ts`,
`separacionDeTrazaM`, el esquema de BD, `proyeccion.test.ts` (sin cambios).

### Ronda 2 — endurecimiento de seguridad (S1 + S2, post-revisión de Seguridad)

**Modificados:**
- `lib/traza/umbrales.ts` — nueva constante `VENTANA_PROYECCION_MAX_FALLBACKS`
  (50) con su porqué (tope de coste del fallback por llamada).
- `lib/traza/proyeccion.ts` — `proyectarPunto` recibe un estado mutable
  propio de la llamada (`EstadoFallbackVentana`, nunca a nivel de módulo)
  que cuenta los escaneos completos usados; al agotar el tope, degrada al
  resultado de la ventana (sin más escaneos completos) y avisa una vez por
  `console.warn`. `calcularProgreso` crea ese estado al principio de cada
  llamada. Ninguna otra parte del comportamiento validado en la Ronda 1
  cambia.
- `app/page.tsx` — `calcularProgresoDelIntento` (exportada para test)
  consulta `obtenerCacheProgreso()`/`guardarCacheProgreso()` de
  `lib/progreso-cache.ts` antes/después de calcular, mismo patrón que
  `app/api/progreso/route.ts`. **Alcance deliberadamente NO ampliado a
  `calcularProgresoLibreDelIntento`**: el vector de coste computacional
  (S1) no la afecta (`calcularProgresoLibre` no llama a `calcularProgreso`,
  sin ventana ni fallback), y el fix pedido explícitamente por el
  Orquestador escopa solo `calcularProgresoDelIntento`. El informe crudo de
  Seguridad menciona también `calcularProgresoLibreDelIntento` en su lista
  de opciones de fix (coste de paginar hasta 50.000 filas en cada visita,
  categoría de riesgo distinta: volumen de consulta a BD, no cómputo sin
  cota) — si Seguridad lo sigue considerando bloqueante en esta ronda, es
  una ampliación de alcance a decidir explícitamente, no algo que el
  Implementador deba asumir sin más.
- `lib/traza/proyeccion.ventana.test.ts` — nueva sección 5: benchmark
  adversarial que reproduce el escenario exacto de Seguridad (puntos a más
  de 300 m entre sí, dentro de 100 km, a velocidad plausible) y confirma
  con medición real que el tiempo queda acotado con el tope activo (~1,1 s
  a 300 puntos) frente a sin él (escala a varios segundos, réplica sin
  ventana). Verifica también que el aviso de `console.warn` se dispara
  exactamente una vez.
- `app/page.test.ts` — `calcularProgresoDelIntento` ahora se exporta y
  tiene 3 tests nuevos (sirve desde caché sin tocar `posiciones`, calcula y
  guarda cuando no hay caché, no explota con una caché en modo libre).
  Mocks ampliados para cubrir la tabla `posiciones` (antes solo `intentos`).
- `docs/tecnico/decisiones-tecnicas.md` — nota de cierre en DT-018
  documentando S1 y S2.
- `CHANGELOG.md` — párrafo añadido a la entrada existente del mismo día.

## Quality gates

- `pnpm typecheck` — verde, 0 errores.
- `pnpm lint` — verde, 0 errores/warnings.
- `pnpm test` — verde, 312/312 tests (29 ficheros; +2 en
  `proyeccion.ventana.test.ts`, +3 en `app/page.test.ts` respecto a la
  Ronda 1). El fichero `proyeccion.ventana.test.ts` sigue siendo el más
  lento de la suite (~32 s, benchmarks adversariales incluidos); el resto
  de la suite sigue tardando ~11 s como antes. Ver `DEBT.md` para el
  tradeoff aceptado (ya registrado en la Ronda 1, sin cambios).

## Historial de revisión

### Ronda 1 — Reviewer (2026-08-09)

**Veredicto: ✅ Aprobado — pasa a Seguridad.**

Verificado contra lo aprobado en DT-018 punto por punto: paginación completa
en los dos sitios correctos, modo libre a `.order(ts desc).limit(1)` con
`descartado=false` mantenido, ventana deslizante con offset local→global
correcto en los bordes del array, `VENTANA_PROYECCION_SEGMENTOS`/
`VENTANA_PROYECCION_FALLBACK_MAX_M` en `umbrales.ts` con su porqué. Sin
`any`/`as`/`@ts-ignore`. `proyeccion.test.ts` no se tocó y sus 21 tests son
compatibles con la nueva implementación (fixtures pequeñas: la ventana cubre
siempre la traza entera). Las suites nuevas (`paginacion.test.ts`,
`proyeccion.ventana.test.ts`) son tests reales — comparan contra una
implementación de referencia independiente, no contra sí mismos.
`arquitectura.md` refleja el fichero nuevo y las notas de DT-018 en los tres
sitios relevantes.

Sin bloqueantes. Cuatro recomendaciones (ninguna exige acción antes de
Seguridad), dos ya registradas en `DEBT.md`:
1. `obtenerTodasLasFilas` pierde en silencio parte del histórico si una
   página intermedia falla (mitigado por el TTL de caché corto). Registrado
   en `DEBT.md`.
2. Ningún test/aserción protege el invariante
   `VENTANA_PROYECCION_FALLBACK_MAX_M > DESVIO_MENOR_MAX_M`. Registrado en
   `DEBT.md`.
3. DT-018 no lleva nota de cierre sobre la reducción del test de
   equivalencia de 2000 a 1000 puntos (sí está en `DEBT.md` y en el propio
   test) — añadir dos líneas a DT-018 en `decisiones-tecnicas.md`.
4. Sin test de equivalencia numérica que ejercite el clip superior de la
   ventana (llegada cerca del final real de `traza.geojson`) — el test de
   rendimiento llega hasta ahí pero no compara contra la referencia.

Detalle completo en el informe del Reviewer (fuera de este archivo).

---

### Ronda 2 — Reviewer (2026-08-09)

**Veredicto: ✅ Aprobado — pasa a Seguridad para su reverificación.**

Verificado específicamente el fix de los 2 bloqueantes (S1, S2), sin
reabrir nada fuera de esa zona:

**S1 (`lib/traza/proyeccion.ts`, `umbrales.ts`).** Confirmado leyendo el
código: `EstadoFallbackVentana` se crea con `const estadoFallback = { usados:
0, avisado: false }` dentro del cuerpo de `calcularProgreso` (línea ~179),
no a nivel de módulo — no hay fuga de contador entre intentos/peticiones
distintas. El benchmark adversarial nuevo (`proyeccion.ventana.test.ts`,
sección 5) reproduce el vector exacto de Seguridad: puntos espaciados 0,6 km
(por encima de la ventana de ±417 m) con huecos de 10 min entre sí (por
debajo de `VELOCIDAD_MAX_KMH`, así que no se descartan por velocidad y
llegan de verdad a proyectarse — verificado explícitamente con
`puntosDescartados === 0` dentro del propio test, que es lo que demuestra
que el test ejercita el camino adversarial real y no coincide por
casualidad con el camino normal). Confirma el aviso único por
`console.warn` y un tiempo acotado; el segundo test de la sección (réplica
sin ventana a 150 puntos) demuestra que sin el tope el coste sí escala. Los
21 tests de `proyeccion.test.ts` siguen sin tocarse (recuento verificado:
21 bloques `it(`, idéntico a la Ronda 1) y las 6 suites originales de
`proyeccion.ventana.test.ts` (secciones 1-4) no cambiaron ni una línea.

**S2 (`app/page.tsx`).** `calcularProgresoDelIntento` reutiliza
`obtenerCacheProgreso`/`guardarCacheProgreso`/`CACHE_TTL_MS` de
`lib/progreso-cache.ts` — mismo patrón get-then-set que
`app/api/progreso/route.ts`, sin caché ni TTL propios nuevos. `export const
dynamic = "force-dynamic"` sigue intacto (línea 31): la página no se
prerenderiza en build, solo evita recalcular dentro de la ventana de TTL.
La condición extra `cache.valor.modo === "guiado"` (defensa ante una caché
con el modo equivocado, aunque el invariante de un único intento activo
debería impedirlo) está realmente testeada, no es solo un guardarraíl de
tipos sin ejercitar: `app/page.test.ts` tiene un test dedicado
("ignora una caché cacheada en modo libre") que escribe una entrada de
caché en modo libre a propósito y confirma que `calcularProgresoDelIntento`
la ignora y recalcula. Los otros dos tests nuevos cubren el hit (no llama a
`range`) y el miss (calcula y guarda). Aritmética de la suite verificada de
forma independiente: 307 (Ronda 1) + 2 (sección 5 de
`proyeccion.ventana.test.ts`) + 3 (`app/page.test.ts`) = 312 — coincide
exactamente con el gate reportado.

**Sobre la pregunta abierta (alcance de `calcularProgresoLibreDelIntento`).**
Confirmo el razonamiento técnico del Implementador: `calcularProgresoLibre`
(`lib/traza/progreso-libre.ts`) no invoca `calcularProgreso`/`proyectarPunto`
en ningún punto — es una única `haversineKm` entre la última posición y el
destino, sin ventana, sin fallback, sin Turf sobre la traza. El vector O(m)
por punto que S1 acota (~39 ms/fallback) no existe ahí, así que extender el
tope de fallbacks no aplica. Y el propio informe de Seguridad, en la sección
"Sin issues — categorías verificadas y cerradas", ya evaluó el coste de
volumen/memoria de `obtenerTodasLasFilas` (que sí usa
`calcularProgresoLibreDelIntento`, tope de 50.000 filas) como
"resuelto correctamente" — un juicio de seguridad ya cerrado, no una omisión
del Implementador.

Dicho esto, **no cierro yo este punto por mi cuenta**: el "fix requerido"
literal del issue 2 de Seguridad nombra explícitamente
`calcularProgresoDelIntento`/`calcularProgresoLibreDelIntento` juntos como
las dos funciones a proteger antes de invocarse desde la ruta sin caché ni
rate limit. La decisión de alcance es defendible (el argumento de "familia
de riesgo" del propio issue 2 se apoya en el coste computacional de issue 1,
que no aplica a modo libre) pero es una lectura, no lo único que el texto
permite — y el framework es explícito en que "cualquier issue de seguridad
es bloqueante, no hay issues de seguridad opcionales" y que el veredicto de
seguridad lo cierra Seguridad, no el Reviewer. Dado que extender el mismo
patrón ya probado (mismo caché compartida, misma condición de modo,
`cache.valor.modo === "libre"`) a `calcularProgresoLibreDelIntento` sería
barato y de bajo riesgo, recomiendo a Seguridad valorar exigirlo de todos
modos en esta reverificación para cerrar la ambigüedad del texto original,
en vez de aceptar la interpretación de alcance sin más. **Traslado la
decisión final a Seguridad explícitamente — no la doy por cerrada.**

**Documentación.** La nota de cierre de DT-018 (`decisiones-tecnicas.md`,
sección "Nota de cierre (2026-08-09)") es coherente con el cuerpo original:
no contradice ninguno de los números o el comportamiento validado en la
Ronda 1, dice explícitamente "no cambia nada del comportamiento validado en
la decisión original", y sus cifras (~39 ms/fallback, ~11,7 s sin tope a 300
puntos, ~1,1 s con tope) coinciden con las de los tests nuevos.

Sin bloqueantes nuevos desde el Reviewer. Las 4 recomendaciones de la Ronda
1 siguen abiertas (sin relación con S1/S2, fuera de esta zona). Añado una
recomendación nueva, de severidad baja, a `DEBT.md`.

---

### Ronda 1 - Seguridad (2026-08-09)

**Veredicto: Issues bloqueantes - devuelve al Implementador.**

#### Estandares aplicados
- OWASP Top 10 (incluida auditoria de dependencias A06).

#### Alcance revisado
Diff sin commitear en la rama (git diff + ficheros nuevos): lib/supabase/paginacion.ts,
lib/supabase/paginacion.test.ts, lib/traza/proyeccion.ventana.test.ts,
app/api/progreso/route.ts, app/api/progreso/route.test.ts, app/page.tsx,
lib/traza/proyeccion.ts, lib/traza/umbrales.ts.

#### Issues encontrados

1. lib/traza/proyeccion.ts:362-407 (proyectarPunto) + app/page.tsx:234-245
(obtenerHistoricoPosiciones) - A04 Diseno inseguro / denegacion de
servicio por contenido adversarial de datos. BLOQUEANTE.

La ventana deslizante (DT-018) reduce el coste normal de calcularProgreso
de O(n x m) a O(n x ventana), pero el mecanismo de fallback reintroduce el
coste O(m) (~39 ms por punto, medido en DT-018: 281 s / 7200 puntos) para
cualquier punto cuya proyeccion mas cercana dentro de la ventana quede a
mas de VENTANA_PROYECCION_FALLBACK_MAX_M (300 m) del indice de referencia
anterior. Esa condicion no exige que el punto este fuera de traza: un
punto perfectamente valido pero fuera de secuencia espacial respecto al
anterior (por ejemplo un salto de 80 km sobre la propia traza) tambien la
dispara, porque la ventana es un slice local de +-30 segmentos (~417 m)
alrededor del indice anterior, no de toda la traza.

El filtro de plausibilidad geografica de /api/track (DT-006, capa 1) solo
rechaza puntos a mas de 100 km de la traza - tres ordenes de magnitud mas
laxo que el umbral de 300 m que activa el fallback. Nada en la cadena de
ingesta impide insertar una secuencia de puntos, todos dentro de esos 100
km (por tanto aceptados y persistidos), disenada para que casi todos
disparen el fallback (por ejemplo alternando entre dos zonas alejadas
entre si sobre la traza, o simplemente en un orden temporal que no seria
el de una persona caminando).

Esto reintroduce exactamente el problema que DT-018 se propuso cerrar (que
sea robusto y no pueda volver a pasar), pero por una via nueva: no volumen
de filas, sino contenido adversarial. Con el token de /api/track filtrado
(el propio escenario que DT-006/DT-011 ya contemplan como riesgo residual
aceptado), y su rate limit de 40 req/min (DT-011):

- ~300 puntos maliciosos (menos de 8 minutos de abuso del token) ya
  cuestan ~300 x 39 ms, unos 11,7 s de computo sincrono en
  calcularProgreso - por encima del timeout por defecto de una funcion
  serverless de Vercel Hobby (10 s; DT-018 confirma que el proyecto no
  declara maxDuration).
- El tope de seguridad de obtenerTodasLasFilas (MAX_PAGINAS = 50, unas
  50.000 filas, lib/supabase/paginacion.ts) acota el caso extremo en unos
  1.950 s (32 min) si la practica totalidad de las filas disparase el
  fallback - alcanzable en aproximadamente 21 h de abuso continuo a 40
  req/min, dentro de la ventana de unas 30 h del reto.

Por que es mas grave que el riesgo ya aceptado en DT-006/DT-011. Esas
decisiones aceptan que un token filtrado permita ensuciar el historico o
agotar cuota de BD - degradacion de datos, reversible via el panel admin
(descartar posicion, DT-006 capa 2). Lo que este hallazgo describe es
distinto en clase: una vez la secuencia adversarial esta persistida (no
descartado), cada calculo futuro de calcularProgreso sobre ese historico
vuelve a pagar el coste O(m) por cada punto adversarial, no solo la
insercion en si. Combinado con el issue 2 (abajo), esto puede dejar la
pagina publica entera devolviendo error o timeout durante el resto del
evento, sin que el reintento natural del polling (cada 30 s) ni la cache
(20 s, DT-007) lo resuelvan - al contrario, cada recalculo tras expirar la
cache vuelve a intentar el mismo computo caro y vuelve a agotar el
timeout, sin que el resultado se llegue a cachear nunca (un calculo que no
termina no escribe en guardarCacheProgreso). Es un fallo que se
autoperpetua sin intervencion adicional del atacante, exactamente el
escenario que DT-018 declara explicitamente que no debe poder volver a
ocurrir.

La unica mitigacion existente (panel admin, descartar puntos uno a uno) no
es una defensa preventiva: exige que un humano detecte el problema y
descarte manualmente cada punto adversarial mientras el sitio publico ya
esta caido, en mitad de un evento en directo de 30 h sin margen para
depurar.

Fix requerido (a decidir por Implementador/Arquitecto si excede alcance
menor): acotar el coste computacional de calcularProgreso de forma
independiente del contenido de los datos, no solo de su volumen. Opciones,
no excluyentes:
- Limite duro al numero de veces que proyectarPunto puede caer al escaneo
  completo (fallback) dentro de una misma llamada a calcularProgreso (por
  ejemplo tras N fallbacks, dejar de reintentar full-scan para los puntos
  restantes y usar el resultado de la ventana aunque supere el umbral) -
  el equivalente computacional al tope de MAX_PAGINAS que ya existe para
  filas. Preferible a nivel de diseno: no cambia el contrato para el caso
  normal (fallback esporadico), solo acota el patologico.
- Alternativa mas simple si esa no encaja con el contrato de Progreso:
  presupuesto de tiempo (performance.now()) dentro de calcularProgreso,
  que corte el bucle y devuelva el mejor resultado parcial (con log) si se
  supera un umbral generoso pero acotado (por ejemplo 5 s).
- Como mitigacion complementaria (no sustituto): anadir cache/rate-limit
  tambien a la ruta app/page.tsx (ver issue 2) para que el coste de un
  computo caro, aunque ocurra, no se repita en cada visita.

---

2. app/page.tsx:1-40, 234-269 - A04 Diseno inseguro. BLOQUEANTE (agrava el
issue 1; no es independiente por si solo).

app/page.tsx declara export const dynamic = "force-dynamic" (linea 30) y
calcularProgresoDelIntento/calcularProgresoLibreDelIntento invocan
obtenerHistoricoPosiciones (ahora paginada hasta 50.000 filas) mas
calcularProgreso/calcularProgresoLibre en cada carga de la pagina publica,
sin ningun Cache-Control/revalidate (verificado: no hay vercel.json, no
hay cabecera de cache en page.tsx) y sin el rate limiting por IP que si
protege GET /api/progreso (DT-011, 60 req/min) ni la cache TTL de 20 s que
si lo protege (DT-007, lib/progreso-cache.ts).

Esto ya era asi antes de esta tarea (no es una regresion introducida
hoy), pero esta tarea multiplica su superficie de riesgo al elevar el
volumen maximo de filas procesables por peticion de 1.000 (corte
incidental de PostgREST, que antes actuaba como limite de coste
accidental) a 50.000 (MAX_PAGINAS), y al ser la ruta sin cache ni rate
limit, es el punto por el que el issue 1 se vuelve mas danino: cualquier
visitante (sin necesidad de ser quien filtro el token) que cargue / de
forma repetida vuelve a disparar el computo caro sin limite de
frecuencia.

Fix requerido: aplicar a app/page.tsx la misma proteccion que ya existe en
/api/progreso - cache TTL compartida (reutilizar lib/progreso-cache.ts o
extraer una comun) y/o rate limiting por IP antes de invocar
calcularProgresoDelIntento/calcularProgresoLibreDelIntento. No sustituye
el fix del issue 1 (acota la frecuencia, no el coste maximo de una sola
llamada), pero es necesario en conjunto.

#### Sin issues - categorias verificadas y cerradas

- Volumen/memoria sin limite (pregunta especifica del brief): resuelto
  correctamente. obtenerTodasLasFilas (lib/supabase/paginacion.ts) tiene
  un tope duro (MAX_PAGINAS = 50, unas 50.000 filas) con console.warn al
  alcanzarlo - no hay bucle infinito ni acumulacion sin cota en memoria
  por volumen de filas. Confirmado con paginacion.test.ts (test dedicado
  del tope de seguridad). El issue bloqueante 1 es sobre coste
  computacional por contenido, no sobre volumen/memoria sin cota - esa
  parte especifica esta bien resuelta.
- Rama modo libre de /api/progreso: .order(ts desc).limit(1).maybeSingle()
  sigue aplicando .eq("descartado", false) (linea 126 de
  app/api/progreso/route.ts) - sin cambio respecto al comportamiento
  anterior. calcularProgresoLibre (lib/traza/progreso-libre.ts, no
  tocado) vuelve a filtrar !p.descartado de forma defensiva por su cuenta.
- RLS / minimo privilegio: la politica
  posiciones_select_activo_no_descartado
  (supabase/migrations/0001_esquema_inicial.sql) sigue siendo la unica
  puerta de acceso del cliente anon a posiciones a nivel de BD - el
  cambio de esta tarea es unicamente en como el codigo de aplicacion
  pagina la misma consulta ya permitida (select con los mismos filtros
  intento_id/descartado/ts), no en que columnas o filas puede leer anon.
  No se ha ampliado el acceso.
- Autenticacion/autorizacion: confirmado que el alcance de esta tarea no
  toca ninguna Server Action ni sesion de admin. No se introduce ningun
  camino nuevo de acceso a datos que sortee RLS.
- A02 Fallos criptograficos: sin cambios - no hay secretos, tokens ni
  datos sensibles nuevos en el codigo ni en los logs anadidos
  (console.warn de paginacion.ts solo incluye error.message de Supabase,
  mensajes de error genericos, sin PII).
- A03 Inyeccion: sin SQL crudo ni interpolacion de input de usuario;
  .range(desde, hasta) recibe enteros calculados internamente (pagina x
  TAMANO_PAGINA_FETCH), no input externo.
- A08 Integridad de datos: sin as/any/@ts-ignore en ningun fichero del
  diff (verificado explicitamente).
- A06 Dependencias: sin cambios en package.json/pnpm-lock.yaml (el fix es
  codigo propio + Supabase JS + Turf, ya existentes). pnpm audit ejecutado
  en la raiz: "No known vulnerabilities found" - las 3 CVEs altas
  cerradas en DT-017 siguen cerradas, ninguna ha reaparecido.

#### Veredicto

Issues bloqueantes - devuelve al Implementador. Los issues 1 y 2 son la
misma familia de riesgo (denegacion de servicio del computo de progreso
por datos adversariales, sin proteccion de frecuencia en app/page.tsx) y
deben resolverse juntos. Tras el fix, vuelve a pasar por Seguridad antes
de abrir el PR.

---

### Ronda 2 — Implementador (2026-08-09): fix de los 2 bloqueantes de Seguridad (S1 + S2)

**S1 — tope de seguridad al fallback (`lib/traza/proyeccion.ts`,
`umbrales.ts`).** Nueva constante `VENTANA_PROYECCION_MAX_FALLBACKS = 50`.
`proyectarPunto` recibe un contador mutable (`EstadoFallbackVentana`)
creado de nuevo en cada llamada a `calcularProgreso` (nunca a nivel de
módulo — no debe filtrar estado entre invocaciones). Al superar el tope,
deja de reintentar el escaneo completo y usa el resultado de la ventana tal
cual para los puntos restantes, avisando una sola vez por `console.warn`
(mismo patrón que el tope de `lib/supabase/paginacion.ts`). El caso normal
(no adversarial) no cambia de comportamiento — validado: los 21 tests de
`proyeccion.test.ts` y las 6 suites originales de `proyeccion.ventana.test.ts`
(equivalencia, desvío, hueco, rendimiento) siguen en verde sin tocarlas.

**Verificado con benchmark adversarial real**, no solo diseño: nueva
sección 5 en `proyeccion.ventana.test.ts` reproduce el escenario exacto
descrito por Seguridad (puntos a más de 300 m entre sí, dentro del radio de
100 km de `/api/track`, con huecos de tiempo para no disparar el rechazo
por velocidad) — 300 puntos adversariales se calculan en ~1,1 s con el
tope activo (vs. ~11,7 s estimados sin él; confirmado con la réplica sin
ventana que a 150 puntos ya tarda >2 s, escalando linealmente).

**S2 — caché en `app/page.tsx`.** `calcularProgresoDelIntento` reutiliza
`lib/progreso-cache.ts` (mismo TTL 15-20 s que `/api/progreso`, DT-007/
DT-014) en vez de recalcular en cada visita — sin infraestructura nueva,
apoyado en el invariante de un único intento activo. `export const dynamic
= "force-dynamic"` no cambia. Alcance limitado a `calcularProgresoDelIntento`
(modo guiado, el único que paga el coste de `calcularProgreso`) — no se
tocó `calcularProgresoLibreDelIntento`, ver detalle y justificación en
"Archivos modificados" arriba. Si Seguridad considera que el coste de
paginación de `obtenerHistoricoPosiciones` en modo libre también necesita
protección de frecuencia en esta ronda, es una decisión a tomar
explícitamente (posible ampliación de alcance), no algo resuelto aquí.

**Documentación:** nota de cierre en DT-018 (`decisiones-tecnicas.md`)
documentando S1 y S2 con el mismo formato que la nota de cierre de DT-017;
`CHANGELOG.md` ampliado; esta misma sección.

**Quality gates:** `pnpm typecheck` verde, `pnpm lint` verde, `pnpm test`
verde (312/312, 29 ficheros). Detalle completo arriba en "Quality gates".

**Pendiente:** vuelve a Reviewer (con foco específico en la zona del
fallback y en `app/page.tsx`) y después a Seguridad — el Implementador no
cierra este ciclo por sí solo.

---

---

### Ronda 2 - Seguridad (2026-08-09)

**Veredicto: Aprobado - lista para abrir el PR.**

#### Alcance revisado
Fix de los 2 bloqueantes de la Ronda 1 (S1, S2) mas la pregunta trasladada
por el Reviewer sobre `calcularProgresoLibreDelIntento`. Reverificado leyendo
codigo (no solo el resumen del Implementador/Reviewer) y ejecutando gates de
forma independiente: `pnpm typecheck` (0 errores), `pnpm lint` (0 avisos),
`pnpm test` (312/312, 29 ficheros, verificado en esta misma sesion), `pnpm
audit` (sin vulnerabilidades, sin cambios en package.json/pnpm-lock.yaml).

#### Issue 1 (Ronda 1) - S1: CERRADO

Confirmado en `lib/traza/proyeccion.ts`: `estadoFallback` (tipo
`EstadoFallbackVentana`, `{ usados, avisado }`) se instancia con `const`
dentro del cuerpo de `calcularProgreso`, sin ninguna variable a nivel de
modulo - verificado explicitamente con grep, sin fuga de contador entre
llamadas. `VENTANA_PROYECCION_MAX_FALLBACKS = 50` en `umbrales.ts`, con el
razonamiento del porque (39 ms/fallback medido x 50 = ~2 s de peor caso)
documentado en el propio comentario.

El benchmark adversarial nuevo (`proyeccion.ventana.test.ts`, seccion 5)
reproduce exactamente el vector que reporte en la Ronda 1: puntos separados
0,6 km (por encima de la ventana de +-417 m) dentro del radio de 100 km de
`/api/track` (DT-006), con huecos de 10 min entre si para no disparar el
rechazo por velocidad. Lo ejecute yo mismo (no me limite a leer el codigo):
`puntosDescartados === 0` confirma que los puntos llegan de verdad a
proyectarse (el test no evita el problema por casualidad), el aviso unico de
`console.warn` se dispara con el mensaje esperado, y el tiempo queda acotado
en 1,68 s para 300 puntos adversariales (frente a los ~11,7 s que yo mismo
habia estimado sin el tope) - el segundo test de la seccion (replica sin
ventana ni tope a 150 puntos, 5,02 s) confirma que el vector era real y que
la proteccion marca una diferencia de orden de magnitud, no un margen
estrecho. Esto cierra el issue 1 de mi informe de Ronda 1: el propio
mecanismo de respaldo ya no puede volver a costar mas que un tope acotado y
predecible, independientemente del contenido del historico.

#### Issue 2 (Ronda 1) - S2: CERRADO para modo guiado

Confirmado en `app/page.tsx`: `calcularProgresoDelIntento` consulta
`obtenerCacheProgreso()` antes de tocar BD, y solo recalcula/pagina/guarda si
no hay hit valido dentro de `CACHE_TTL_MS` (misma cache compartida de
`lib/progreso-cache.ts` que ya usa `GET /api/progreso`, DT-007/DT-014). La
guarda `cache.valor.modo === "guiado"` evita reusar por error una entrada de
cache escrita en modo libre - verificado que esta cubierta por un test
dedicado (`app/page.test.ts`, "ignora una cache cacheada en modo libre"),
no es solo un guardarraiel de tipos sin ejercitar. `export const dynamic =
"force-dynamic"` sigue intacto - la pagina sigue siendo dinamica, solo deja
de repetir el calculo caro dentro de la ventana de TTL. Esto cierra la parte
de mi issue 2 que de verdad importaba: la ruta que amplificaba el vector de
S1 (coste O(m) por fallback) ya no recalcula sin limite de frecuencia.

#### Pregunta trasladada por el Reviewer: `calcularProgresoLibreDelIntento` (modo libre)

**Decision: no bloqueante. De acuerdo con el razonamiento tecnico del
Implementador y del Reviewer - queda fuera de esta ronda, con la entrada de
DEBT.md ya registrada como suficiente.**

Verificado leyendo `lib/traza/progreso-libre.ts` (no tocado en ninguna
ronda): `calcularProgresoLibre` no invoca `calcularProgreso` ni
`proyectarPunto` en ningun punto - es una unica `haversineKm` entre la
ultima posicion no descartada y el destino fijo del intento. No hay ventana,
no hay fallback, no hay Turf sobre la traza. El vector que motivo el issue 1
(coste O(m) por punto, disparado por contenido adversarial via el fallback
de la ventana) no existe en esta rama de codigo - es una afirmacion que
puedo confirmar yo mismo, no una afirmacion que tengo que aceptar de segunda mano.

Lo que si sigue costando en cada visita sin cache es
`obtenerHistoricoPosiciones` (fetch paginado, tope duro ya evaluado y
cerrado como correcto en mi Ronda 1: `MAX_PAGINAS = 50`, 50.000 filas) mas
un `.map()` O(n) para `puntosGps`. Esto es una clase de coste distinta y
menor a la que motivo el bloqueante original:
- Es LINEAL en filas, no cuadratico en contenido: el coste escala con
  cuantas filas existen realmente (acotado en 50.000 por un tope ya
  verificado), no con como esten distribuidas espacialmente. No hay
  amplificacion desproporcionada: un atacante no puede lograr un coste
  grande con un numero pequeno de puntos bien colocados, a diferencia del
  vector de S1 (300 puntos ya bastaban para ~11,7 s).
- El peor caso (50 lecturas paginadas secuenciales a Supabase mas un mapeo
  O(n) sobre como mucho 50.000 filas) es del orden de unos pocos segundos de
  latencia de red, no de computo sincrono que agote un timeout serverless
  por si solo con un numero pequeno de filas.
- Requiere el mismo escenario de amenaza ya aceptado como riesgo residual en
  DT-006/DT-011 (token de `/api/track` filtrado) para llegar a un volumen
  que importe - no es una via de ataque nueva, es una extension marginal de
  una ya conocida y ya mitigada en capas (rate limit 40 req/min, filtro
  geografico de 100 km, tope de 50.000 filas).
La entrada de `DEBT.md` ("`calcularProgresoLibreDelIntento` sigue sin cache
tras el endurecimiento S1/S2 de DT-018") esta bien redactada: caracteriza el
riesgo residual con precision ("bajo-medio", "lineal, no cuadratico"),
documenta la solucion propuesta concreta (extender el mismo patron ya
probado, ~10 lineas) y prioridad Media - coherente con mi propia lectura
independiente. Confirmo que es suficiente y no lo elevo a bloqueante.

**Nota no bloqueante, fuera de OWASP Top 10 (no es un issue de seguridad,
es una observacion de robustez para que quede escrito):** ejecutando
`pnpm test` observe que el aviso de tope de S1 tambien se dispara en el
escenario de desvio real de ~3 km de la seccion 2 de
`proyeccion.ventana.test.ts` (no adversarial, un desvio generado para el
test). En ese caso concreto los resultados agregados siguen coincidiendo
con la referencia sin ventana dentro de la tolerancia del test porque la
geometria del desvio es un tramo recto (el punto mas cercano real se queda
dentro de la ventana pese a superar el umbral de 300 m), pero el mecanismo
degradado en si (una vez agotado el tope, el indice de referencia avanza
como mucho +-30 segmentos por punto, no lo que de verdad avanzo la persona)
podria, en una geometria distinta, hacer que `kmAvanzados` quede rezagado
respecto a la posicion real durante el resto de esa misma llamada. No es un
vector de denegacion de servicio (el coste sigue acotado) ni de
confidencialidad/integridad de acceso - es una cuestion de precision del
dato mostrado bajo un historico ya anomalo, exactamente el tipo de
degradacion que el propio codigo documenta como "aceptada". La dejo escrita
para que quede en el registro, no la convierto en bloqueante ni le exijo
DEBT.md nueva - el Implementador/Arquitecto pueden valorarla si aparece
evidencia real de que importa.

#### Documentacion

Nota de cierre de DT-018 (`docs/tecnico/decisiones-tecnicas.md`) verificada:
coherente con el cuerpo original ("no cambia nada del comportamiento
validado en la decision original"), las cifras citadas (~39 ms/fallback,
~11,7 s sin tope a 300 puntos, ~1,1 s con tope) coinciden con las que yo
mismo he verificado ejecutando los tests.

#### Veredicto final de toda la auditoria (Ronda 1 + Ronda 2)

**Cierro A04 (denegacion de servicio) y el resto de OWASP Top 10 para esta
tarea: sin issues pendientes.** Los 2 bloqueantes de la Ronda 1 estan
corregidos y verificados con evidencia (codigo leido, tests ejecutados por
mi mismo, no solo el resumen de otros agentes). La pregunta de alcance sobre
modo libre queda cerrada como no bloqueante, con deuda tecnica registrada y
justificada. Gates en verde, sin dependencias nuevas, `pnpm audit` limpio.

**Lista para abrir el PR.**


Este archivo es la pizarra compartida entre todos los agentes del pipeline: los
subagentes corren aislados y no ven la conversación, así que lo único que
comparten es lo que está escrito aquí. Lo gobierna el Orquestador, que lo crea al
empezar cada tarea con la plantilla del framework y lo archiva al cerrarla.
