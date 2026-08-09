# Tarea en curso

**Título:** Modo libre: añadir tiempo en marcha, ritmo medio y km caminados
**Tipo:** Feature
**Estado:** Implementación
**Iniciada:** 2026-08-09

## Prompt clarificado

El modo libre (DT-016) hoy solo muestra la distancia restante en línea recta
al destino. Al construirlo se excluyeron de golpe cuatro cosas bajo la
misma etiqueta ("sin estadísticas, fuera de alcance"): ETA, ritmo, % de
progreso y odómetro. Pero esas cuatro no son equivalentes:

- **ETA y % de progreso** dependen de una ruta fija sobre la que medir
  cuánto queda del recorrido total — no tienen sentido en modo libre (no hay
  ruta) y siguen fuera, sin cambios.
- **Tiempo en marcha y ritmo medio** no dependen de ninguna ruta — son
  aritmética sobre cuánto tiempo ha pasado y cuánto se ha caminado. El
  usuario confirma que sí los quiere.

Debe añadirse al modo libre, tanto en "durante" como en "llegada":
1. **Tiempo en marcha** — horas y minutos desde que se pulsó Iniciar
   (o desde Iniciar hasta Finalizar, en "llegada").
2. **Ritmo medio** — km/h, calculado como km caminados entre horas
   transcurridas.
3. **Km caminados (odómetro)** — distancia real recorrida sumando cada
   tramo del GPS. **No existe hoy para modo libre**: `calcularProgresoLibre`
   nunca lo calculó (el módulo lo declara explícitamente: "sin corredor, sin
   rechazo de velocidad implícita ni de precisión GPS").

## Alcance

- **Incluye:** `lib/traza/progreso-libre.ts` (nuevo cálculo de odómetro),
  `lib/types.ts` (`ProgresoPublicoLibre` gana `odometroKm`),
  `ModoDuranteLibre.tsx` y `ModoLlegadaLibre.tsx` (mostrar las 3 stats
  nuevas), y lo que haga falta en `app/page.tsx` para pasarles `started_at`/
  `ended_at` (hoy no se les pasa — solo lo recibe el modo guiado).
- **Excluye explícitamente:**
  - ETA, % de progreso, "km restantes de ruta" — siguen sin sentido en modo
    libre, no se tocan. La distancia restante en línea recta
    (`DistanciaRestante.tsx`) sigue exactamente igual.
  - El rechazo de velocidad implícita / precisión GPS que sí tiene el modo
    guiado (`VELOCIDAD_MAX_KMH`, `PRECISION_MAX_M` en `calcularProgreso`) —
    el odómetro de modo libre suma todos los tramos sin filtrar, coherente
    con la filosofía ya existente del módulo ("los puntos se aceptan y se
    dibujan sin validar"). No se abre ahora el debate de si modo libre
    debería tener esa validación — eso sería una tarea aparte.
  - `formatearTiempoTotal` de `app/page.tsx` (usada por `ModoLlegada.tsx`
    guiado) — ya usa dos timestamps reales, sin `ahora` de por medio, no
    tiene el bug de DT-020. Queda como candidato de limpieza futura, no
    como deuda nueva.

- **Ampliado tras clarificación (2026-08-09) — ver DT-020:** el usuario
  detectó que `ModoDurante.tsx` (modo guiado, ya en producción) calcula
  tiempo en marcha y ritmo medio con la hora actual del navegador de quien
  mira (`ahora`), no con el último dato GPS real — mismo problema que se
  iba a evitar en el código nuevo de modo libre. Decisión explícita:
  **corregir los dos modos en esta misma tarea**, no solo el libre. Ver
  DT-020 para el análisis completo.

## Comportamiento en casos límite

- **Intento sin ninguna posición todavía:** tiempo en marcha se puede
  calcular igualmente (depende de `started_at`, no de posiciones); ritmo
  medio y km caminados dan 0 o "—" según corresponda (mismo criterio que ya
  usa `lib/ritmo.ts` para `horasTranscurridas <= 0` o sin `iniciadoEn`).
- **Un único punto GPS:** km caminados = 0 (no hay ningún tramo que sumar
  todavía) — comportamiento correcto, no es un caso de error.
- **"Llegada":** tiempo en marcha y ritmo medio se congelan en el momento de
  Finalizar (mismo patrón que ya usa `ModoLlegada.tsx` con
  `calcularRitmoMedioIntento(..., endedAt)`), no siguen las 30h del reto de
  vuelta a la web pública.

## Supuestos asumidos

- Reutilizar el componente `Stats.tsx` ya existente tal cual, sin
  modificarlo — es genérico (recibe 3 strings ya formateados), no tiene
  nada específico del modo guiado.
- Reutilizar `lib/ritmo.ts` (`calcularRitmoMedioIntento`) para el ritmo, no
  duplicar una tercera copia de esa fórmula.

## Diseño
Mockup: N/A — reutiliza el componente `Stats.tsx` ya existente y validado en
modo guiado, sin ningún elemento visual nuevo que diseñar.

## Decisión técnica / Diagnóstico

### Decisión aprobada por el usuario (2026-08-09) — DT-020 + solución única de la sección anterior

Ver DT-020 en `docs/tecnico/decisiones-tecnicas.md` para el análisis
completo del hallazgo (tiempo en marcha/ritmo anclados a "ahora" en vez de
al último punto GPS real) y la decisión de corregirlo en ambos modos.
Resumen de lo que hay que construir, en orden:

1. **`lib/traza/progreso-libre.ts`** — `calcularProgresoLibre` suma el
   odómetro: recorre `historico` en el orden recibido (precondición ya
   documentada: ascendente por `ts`, mismo criterio que el modo guiado) y
   suma `haversineKm` entre cada par consecutivo de posiciones no
   descartadas. Sin ningún filtro de velocidad ni precisión — coherente con
   la filosofía ya existente del módulo.

2. **`lib/types.ts`** — `ProgresoPublicoLibre` gana `odometroKm: number`.
   Actualizar su docstring (ya no es cierto que "no tiene odómetro"; sigue
   siendo cierto que no tiene ETA ni % de progreso).

3. **`lib/ritmo.ts`** — añadir una función hermana de
   `calcularRitmoMedioIntento` para formatear tiempo transcurrido ("H:MM"),
   con la misma forma de parámetros (`iniciadoEn`, `finalizadoEn`). Mismo
   criterio de test que ya tiene el fichero (casos límite: sin `iniciadoEn`,
   sin `finalizadoEn`, `finalizadoEn` anterior a `iniciadoEn`).

4. **`ModoDurante.tsx`** (modo guiado, "durante") — elimina sus funciones
   privadas de tiempo/ritmo; usa las de `lib/ritmo.ts` pasando
   `progreso.ultimaPosicion?.ts ?? null` como referencia final, no `ahora`.
   El estado `ahora` se conserva (sigue haciendo falta para
   `ultimaSenalTexto` y la banda horaria del mapa), simplemente deja de
   alimentar estas dos estadísticas.

5. **`app/page.tsx`** — `ModoDuranteLibreConectado` y
   `ModoLlegadaLibreConectado` pasan `started_at`/`ended_at` a sus
   componentes (hoy no se les pasa nada de esto), igual que ya hacen sus
   equivalentes guiados.

6. **`ModoDuranteLibre.tsx`** — nueva prop `startedAt`; calcula tiempo en
   marcha y ritmo medio igual que el punto 4 (con `progreso.ultimaPosicion?.ts`,
   nunca con la hora del cliente); renderiza `<Stats />` con las 3
   estadísticas. `DistanciaRestante` no cambia.

7. **`ModoLlegadaLibre.tsx`** — nuevas props `startedAt`/`endedAt`; tiempo en
   marcha y ritmo medio con `endedAt` como referencia final (mismo patrón
   que ya usa `ModoLlegada.tsx` guiado); renderiza `<Stats />`.

**Fuera de alcance:** esquema de BD, `formatearTiempoTotal` de `page.tsx`
(no tiene el bug de DT-020, no hace falta migrarla), la validación de
velocidad/precisión del modo guiado aplicada al odómetro de modo libre.

**Tests obligatorios:**
- `calcularProgresoLibre`: el odómetro suma correctamente varios tramos,
  da 0 con un único punto, no aplica ningún filtro de velocidad (a
  diferencia del modo guiado — test que lo distinga explícitamente).
- La función nueva de `lib/ritmo.ts` (tiempo transcurrido): casos límite
  igual que ya cubre `calcularRitmoMedioIntento`.
- Que `ModoDurante.tsx`/`ModoDuranteLibre.tsx` usan `ultimaPosicion?.ts`
  como referencia, no `ahora` — si hay forma razonable de testear esto a
  nivel de componente, hacerlo; si no, que quede claro en el propio código
  que `ahora` no participa en el cálculo de estas dos cifras (para que un
  futuro cambio no reintroduzca el bug sin darse cuenta).

## Archivos modificados

**Dominio:**
- `lib/traza/progreso-libre.ts` — `calcularOdometroLibre` nueva + campo
  `odometroKm` en el resultado (punto 1).
- `lib/traza/progreso-libre.test.ts` — tests del odómetro (suma de tramos,
  un único punto, sin filtro de velocidad) + `odometroKm: 0` en el test de
  igualdad exacta que ya existía.
- `lib/types.ts` — `ProgresoPublicoLibre` gana `odometroKm: number`, docstring
  actualizado (punto 2).
- `lib/ritmo.ts` — nueva función `calcularTiempoEnMarchaIntento`, hermana de
  `calcularRitmoMedioIntento`; ambas refactorizadas sobre un helper interno
  común `msTranscurridosEntre` (opera en milisegundos, no en horas, para
  evitar redondeos de punto flotante al derivar minutos) (punto 3).
- `lib/ritmo.test.ts` — tests de `calcularTiempoEnMarchaIntento` (mismos
  casos límite que ya cubre `calcularRitmoMedioIntento`).

**Modo guiado (fix DT-020):**
- `components/publico/ModoDurante.tsx` — elimina `formatearTiempoEnMarcha` y
  `calcularRitmoMedio` privadas; usa `lib/ritmo.ts` con
  `progreso.ultimaPosicion?.ts ?? null` como referencia final. `ahora` se
  conserva solo para `ultimaSenalTexto`/banda horaria (punto 4).

**Conectores y modo libre:**
- `app/page.tsx` — `ModoDuranteLibreConectado` gana `startedAt`;
  `ModoLlegadaLibreConectado` gana `startedAt`/`endedAt`; ambos los pasan a
  sus componentes (punto 5).
- `components/publico/ModoDuranteLibre.tsx` — nueva prop `startedAt`;
  calcula tiempo en marcha/ritmo medio con `ultimaPosicion?.ts`; renderiza
  `<Stats />` (punto 6).
- `components/publico/ModoLlegadaLibre.tsx` — nuevas props
  `startedAt`/`endedAt`; calcula tiempo en marcha/ritmo medio con `endedAt`;
  renderiza `<Stats />` (punto 7).

**Fixes de tipado en tests existentes** (por el nuevo campo obligatorio
`odometroKm` en `ProgresoPublicoLibre`, sin relación con el comportamiento
que prueban):
- `lib/progreso-cache.test.ts` — helper `progresoPublicoLibre` gana
  `odometroKm: 0`.
- `app/page.test.ts` — literal de `guardarCacheProgreso` gana `odometroKm: 0`.
- `app/admin/actions.test.ts` — literal de `calcularProgresoActualMock.mockResolvedValue`
  gana `odometroKm: 0`.
- `app/api/progreso/route.test.ts` — el test "devuelve la rama 'libre'..."
  actualiza su título/aserción a `odometroKm` presente (ahora forma parte del
  contrato); el test del describe "histórico sin cortar a 1000 filas
  (DT-018)" se reescribe para verificar el comportamiento revertido (ver
  "Bloqueo mayor — resuelto" más abajo).

**Bloqueo mayor — resuelto tras la decisión del Orquestador:**
- `lib/traza/progreso-actual.ts` — la rama de modo libre deja de pedir solo
  la última posición (`.limit(1)`) y vuelve a paginar el histórico completo
  con `obtenerTodasLasFilas`, igual que modo guiado; extraído a un helper
  compartido `obtenerHistoricoCompleto`. Docstring actualizado.
- `lib/traza/progreso-actual.test.ts` — el test de modo libre se reescribe
  para verificar paginación completa (`rangeMock` con `.range(0, 999)`,
  `limitMock` sin llamar) y `odometroKm > 0` con dos posiciones (regresión
  directa del bug).
- `app/api/progreso/route.test.ts` — mismo ajuste en el describe "histórico
  de posiciones sin cortar a 1000 filas (DT-018)": el test "modo libre pide
  solo la última posición" se sustituye por "modo libre pagina el histórico
  completo con `.range()`...", con guardarraíles explícitos
  (`expect(limitMock).not.toHaveBeenCalled()`) para detectar una regresión
  futura a ese atajo.

**Documentación:**
- `docs/tecnico/arquitectura.md` — `lib/ritmo.ts` añadido al árbol;
  `progreso-libre.ts`, `ProgresoPublicoLibre`, `ModoDuranteLibre.tsx` y
  `ModoLlegadaLibre.tsx` actualizados.
- `docs/tecnico/decisiones-tecnicas.md` — nota de cierre en DT-020 (ambigüedad
  resuelta + bloqueo mayor encontrado) y nota de cierre en DT-018 (reversión
  del atajo `.limit(1)` de modo libre, con el análisis de por qué no reabre
  el hallazgo de Seguridad S1/S2 de ese mismo DT).
- `DEBT.md` — entrada del bloqueo mayor añadida y cerrada en la misma tarea
  (ver "Resuelta").
- `CHANGELOG.md` — entrada de la feature.

## Quality gates

Todas en verde sobre el estado final de esta tarea (tras resolver el
bloqueo mayor):

- `pnpm typecheck` — 0 errores.
- `pnpm lint` — 0 errores.
- `pnpm test` — 330/330 tests en verde (30 ficheros).

## Bloqueo mayor encontrado durante la implementación — resuelto

Al implementar el punto 1 (odómetro de modo libre), se detectó que
`calcularProgresoActual` (`lib/traza/progreso-actual.ts`) — la función que
alimenta tanto `GET /api/progreso` (polling de 30 s desde
`ModoDuranteLibre.tsx`) como el camino de respaldo de `crearMinutoAMinuto` —
pedía para modo libre **solo la última posición** (`.limit(1)`, optimización
deliberada de DT-018, correcta en su momento porque entonces
`calcularProgresoLibre` solo necesitaba el último punto para
`distanciaRestanteKm`). Con `odometroKm` sumando tramos sobre el `historico`
recibido, pasarle un array de un solo elemento hacía que el odómetro
devuelto por el polling fuera siempre 0 — la cifra "Caminados" (y el ritmo
medio, que depende de ella) era correcta en la carga inicial de página (usa
el histórico completo) pero caía a 0 en el primer poll (~30 s después) y se
quedaba ahí el resto de la fase "durante" en modo libre.

El Implementador paró y avisó en vez de decidir en solitario, por tocar un
fichero fuera del "Incluye" aprobado y revertir parcialmente una decisión de
arquitectura ya tomada (DT-018) con un test que la verificaba
explícitamente. **El Orquestador resolvió el bloqueo** (mensaje de
coordinación, 2026-08-09): confirmó contra `docs/tecnico/decisiones-tecnicas.md`
que el hallazgo de Seguridad S1/S2 de DT-018 es específico del mecanismo de
ventana deslizante de `calcularProgreso()` (modo guiado) y no aplica a
`calcularProgresoLibre` (suma `O(n)` trivial, sin proyección sobre traza), y
ordenó revertir el atajo `.limit(1)` de modo libre a fetch paginado completo
(mismo patrón que modo guiado, mismo helper `obtenerTodasLasFilas`).

**Aplicado:** `lib/traza/progreso-actual.ts` vuelve a pedir el histórico
completo en modo libre (helper compartido `obtenerHistoricoCompleto`);
docstring del fichero actualizado; nota de cierre añadida a DT-018 en
`docs/tecnico/decisiones-tecnicas.md`; tests de
`lib/traza/progreso-actual.test.ts` y `app/api/progreso/route.test.ts`
actualizados para verificar el comportamiento nuevo (con guardarraíles
explícitos contra una regresión futura al atajo); entrada de `DEBT.md`
marcada como resuelta. Las 3 quality gates vuelven a estar en verde tras el
cambio (330/330 tests).

## Decisión de implementación documentada (bloqueo menor resuelto)

`ModoDurante.tsx`/`ModoDuranteLibre.tsx` (fase "durante"): sin ninguna
posición GPS todavía, tiempo en marcha y ritmo medio dan "—" (no "0:00"/hora
que avanza con `ahora`), porque sin `ultimaPosicion` no hay ninguna
referencia final real que pasarle a `lib/ritmo.ts` — la única alternativa
habría sido volver a usar `ahora` justo en el caso que DT-020 identifica como
más sensible. El "Comportamiento en casos límite" original de este documento
(escrito antes del hallazgo de DT-020) describía el comportamiento previo a
esta decisión; ver la nota de cierre de DT-020 en
`docs/tecnico/decisiones-tecnicas.md` para el razonamiento completo.

## Historial de revisión

**Implementador (2026-08-09):** implementados los 7 puntos de la decisión
técnica. Durante la implementación del punto 1 se encontró un bloqueo mayor
(ver arriba) y se paró para avisar en vez de decidir en solitario, tal como
exige el framework ante un cambio de alcance con implicaciones de
arquitectura/coste. El Orquestador resolvió el bloqueo con la decisión
documentada arriba; el Implementador la aplicó completa (código, tests,
documentación permanente en DT-018) y reconfirmó las 3 quality gates en
verde. Tarea lista para el Reviewer.

**Reviewer (2026-08-09):** ✅ Aprobado, sin bloqueantes ni recomendaciones
nuevas. Verificado línea por línea: `ModoDurante.tsx` solo cambió la
referencia temporal de `ahora` a `progreso.ultimaPosicion?.ts` para tiempo en
marcha/ritmo medio (nada más del render, `ultimaSenalTexto` y la banda
horaria siguen usando `ahora`); `lib/traza/progreso-actual.ts` revierte
correctamente el atajo `.limit(1)` de DT-018 para modo libre con
`obtenerHistoricoCompleto` compartido, y el razonamiento de por qué esto no
reabre S1/S2 (específicos del fallback de ventana deslizante de
`calcularProgreso`, modo guiado; `calcularProgresoLibre` es O(n) trivial sin
Turf ni traza) es correcto y está documentado en la nota de cierre de DT-018;
los tests de `progreso-actual.test.ts` y `route.test.ts` verifican
paginación completa con guardarraíles explícitos (`limitMock`/`maybeSingleMock`
`.not.toHaveBeenCalled()`), no solo que el atajo desapareció. El odómetro de
modo libre tiene test explícito de que NO aplica filtro de velocidad,
distinguiéndolo del modo guiado. `lib/ritmo.ts` refactorizado sobre
`msTranscurridosEntre` sin duplicar lógica, mismos casos límite en ambas
funciones. La resolución de "sin ninguna posición GPS → '—'" es coherente en
código y tests, y queda documentada en el propio código para que un cambio
futuro no reintroduzca `ahora`. `Stats.tsx` y `DistanciaRestante.tsx` sin
tocar. `app/page.tsx` pasa `startedAt`/`endedAt` a los conectores libres sin
afectar al flujo guiado. Documentación (`arquitectura.md`,
`decisiones-tecnicas.md` con notas de cierre en DT-018/DT-020, `DEBT.md` con
la entrada del bloqueo marcada "Resuelta", `CHANGELOG.md`) al día. Sin `any`,
sin `as`, sin `@ts-ignore` en ningún fichero tocado. Pasa a Seguridad.

**Seguridad (2026-08-09):** ✅ Aprobado, sin issues. Estándares aplicados:
OWASP Top 10 (incluida auditoría de dependencias, A06). Alcance revisado:
los 20 ficheros del `git diff` de esta rama (sin ficheros nuevos), con
atención especial a los tres puntos señalados por el Orquestador.

1. **Histórico completo de modo libre en el polling (reversión parcial de
   DT-018) — no reabre S1/S2.** Verificado directamente en
   `lib/traza/progreso-libre.ts`: `calcularOdometroLibre` es una suma `O(n)`
   de `haversineKm` entre pares consecutivos del `historico` recibido, sin
   ninguna llamada a Turf ni a `lib/traza/proyeccion.ts`, sin ventana
   deslizante ni fallback de escaneo completo — no existe en este módulo
   ningún camino cuyo coste dependa del *contenido*/separación de los
   puntos (que es justo el vector que explotaban S1/S2 contra
   `calcularProgreso()` en modo guiado), solo de su *cantidad*. El
   razonamiento de la nota de cierre de DT-018 y de `CURRENT.md` es
   correcto. El coste que sí reaparece — leer el histórico completo en cada
   poll de 30 s en modo libre — sigue acotado por dos capas ya existentes y
   sin tocar en este diff: (a) el tope duro de `obtenerTodasLasFilas` (50
   páginas / 50.000 filas, `lib/supabase/paginacion.ts`, sin cambios); (b)
   la caché compartida `lib/progreso-cache.ts` (TTL 20 s) y el rate limit de
   `GET /api/progreso` (60 req/min por IP, DT-011) — confirmado que
   `app/api/progreso/route.ts` no tiene diff en esta tarea, así que ambas
   defensas siguen intactas y se aplican también a modo libre. Como solo
   puede haber un intento activo a la vez (invariante de
   `docs/tecnico/arquitectura.md`), el peor caso para "muchos visitantes
   concurrentes haciendo polling" sigue siendo, como mucho, un recálculo
   `O(n)` por ventana de 20 s por proceso — mismo orden de magnitud que ya
   paga modo guiado desde DT-007/DT-018, no un vector nuevo. Es, tal como
   plantea el Orquestador, volver al comportamiento pre-DT-018 (ya evaluado
   y aceptado entonces), ahora con las mismas defensas de caché/rate-limit
   que protegían a modo guiado cubriendo también a modo libre. No
   bloqueante.

2. **Odómetro de modo libre sin filtro de velocidad/precisión — integridad
   de datos, no vulnerabilidad.** Confirmado que `app/api/track/route.ts` no
   tiene diff en esta tarea: token comparado en tiempo constante
   (`timingSafeEqual` sobre SHA-256, DT-006), rate limit de 40 req/min por
   token (DT-011), y el filtro de plausibilidad geográfica de 100 km ya
   estaba desactivado para modo libre desde DT-016 — decisión de producto
   explícita y ya revisada, no una consecuencia de esta tarea. Inyectar
   puntos falsos para inflar el odómetro/ritmo exige ya poseer el
   `TRACK_TOKEN`: mismo prerrequisito y mismo riesgo residual que ya asumen
   DT-006/DT-011 para cualquier otro dato del intento (posición mostrada,
   entradas de minuto a minuto con posición asociada, etc.), no una
   superficie nueva que abra esta tarea. El impacto de que ocurriera es
   exclusivamente un número incorrecto mostrado en una web pública de
   seguimiento familiar/amigos — sin acceso a datos de otros usuarios, sin
   escalado de privilegio, sin persistencia de daño más allá de ese dato en
   sí (se resetea con "Reiniciar", mismo patrón que el resto del intento).
   No alcanza el umbral de vulnerabilidad de OWASP Top 10; es un riesgo de
   producto ya evaluado y aceptado explícitamente en DT-016 ("no se abre
   ahora el debate de si modo libre debería tener esa validación"). No
   bloqueante.

3. **DT-020 en `ModoDurante.tsx` — confirmado sin superficie nueva.** El
   diff de este fichero (`git diff -- components/publico/ModoDurante.tsx`)
   es exclusivamente un cambio de referencia temporal dentro de un Client
   Component: sustituye el estado local `ahora` por
   `progreso.ultimaPosicion?.ts`, un dato que ya llegaba en las props del
   propio componente (`ProgresoPublicoGuiado`, ya público). Sin llamada de
   red nueva, sin mutación, sin acceso a ningún dato adicional. Trivialmente
   sin superficie nueva, confirmado.

4. **Auditoría de dependencias (A06).** `package.json` y `pnpm-lock.yaml`
   sin diff en esta rama — no se ha añadido ninguna dependencia.
   `pnpm audit` → "No known vulnerabilities found".

**Repaso OWASP Top 10 sobre el resto del diff** (`lib/ritmo.ts`,
`lib/types.ts`, `ModoDuranteLibre.tsx`, `ModoLlegadaLibre.tsx`,
`app/page.tsx`, tests):
- A01: sin endpoints ni server actions nuevos, sin cambios de autorización;
  `app/page.tsx` sigue exponiendo solo datos ya públicos del intento activo
  (`startedAt`/`endedAt` ya se muestran en los modos guiados equivalentes).
- A02: sin secretos, tokens ni datos sensibles nuevos en código, props ni
  logs.
- A03: sin SQL concatenado, sin `eval`/`new Function`, sin interpolación de
  input de usuario en comandos — `calcularOdometroLibre` y
  `lib/ritmo.ts` (`msTranscurridosEntre`, `calcularTiempoEnMarchaIntento`)
  son aritmética pura sobre fechas/números.
- A04: sin cambios en flujos críticos; el modo del intento sigue
  fijándose server-side en `iniciarReto()`, no manipulable desde el
  cliente.
- A05: sin credenciales ni variables de entorno nuevas.
- A06: ver punto 4.
- A07: sesión de admin (`lib/auth/admin-session.ts`, `proxy.ts`) sin tocar
  en este diff.
- A08: los datos que llegan a los componentes cliente (`historico`,
  `ultimaPosicion`, `odometroKm`) proceden siempre de datos ya validados
  server-side (Zod en `/api/track`, tipos de `lib/types.ts`); sin `as` ni
  `@ts-ignore` nuevos en ningún fichero del diff (confirmado con grep,
  coherente con lo ya verificado por el Reviewer).
- A09: sin logging de datos sensibles nuevo; los `console.warn` existentes
  de `lib/supabase/paginacion.ts` no se han tocado y no exponen datos de
  usuario.
- A10: sin URLs construidas a partir de input de usuario en ninguno de los
  ficheros tocados.

## Sin issues
No se ha encontrado ningún issue de seguridad en esta tarea. El silencio no
es la aprobación — se deja constancia explícita.

## Veredicto
✅ Sin vulnerabilidades — tarea lista para cerrar (abrir PR).

---

Este archivo es la pizarra compartida entre todos los agentes del pipeline: los
subagentes corren aislados y no ven la conversación, así que lo único que
comparten es lo que está escrito aquí. Lo gobierna el Orquestador, que lo crea al
empezar cada tarea con la plantilla del framework y lo archiva al cerrarla.
