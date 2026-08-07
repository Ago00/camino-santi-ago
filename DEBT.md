# Deuda técnica

---

## Recordatorio: aplicar `supabase/migrations/0003_modo_intento.sql` contra producción

**Fecha:** 2026-08-07
**Contexto:** Detectado por el Orquestador verificando en vivo esta rama
(`feature/modo-libre-guiado`) contra el Supabase real de producción, no por
un agente del pipeline. La migración `0003_modo_intento.sql` (columnas
`modo`/`destino_lat`/`destino_lon` de `intentos`, DT-016) todavía no está
aplicada en producción — se aplicará más adelante, por separado. Mientras
tanto, con el código de esta rama desplegado, las consultas que seleccionan
esas columnas fallan contra la BD real con `column intentos.modo does not
exist (code 42703)`.
**Problema:** Sin salvaguarda, ese error de columna se interpretaba (en
`app/page.tsx`, `app/api/progreso/route.ts`) como "sin intento activo",
ocultando la fase real (`durante`/`llegada`) de un intento realmente en
marcha tras la pantalla "antes del reto" — una regresión visible para
cualquier visitante. En `app/api/track/route.ts` el mismo error hacía que se
descartara en silencio cada punto GPS recibido, sin insertarlo — corte real
de la ingesta, no solo cosmético.
**Impacto (mientras la migración no esté aplicada):** Aplicado el fix de
compatibilidad de esta tarea (fallback al select mínimo, tratando el intento
como modo guiado en los tres puntos de lectura, y omitiendo `modo` del
`UPDATE` de `iniciarReto` en modo guiado), el comportamiento público vuelve a
ser idéntico al de antes de introducir el modo de intento — sin pérdida de
datos ni de seguimiento en directo. La única limitación que queda: el modo
**libre** no se puede iniciar desde el panel admin hasta que la migración
esté aplicada (falla con el mensaje de error ya existente "No se pudo
iniciar el reto."), aceptado explícitamente porque solo afecta al admin, no
al público.
**Solución propuesta:** Aplicar `supabase/migrations/0003_modo_intento.sql`
contra el proyecto Supabase de producción. Una vez aplicada y verificada
(columnas `modo`/`destino_lat`/`destino_lon` presentes en `intentos`), el
código de fallback de esta tarea queda inactivo por sí solo (las consultas
completas ya no fallan) — no hace falta revertir nada, pero conviene
revisar si merece la pena simplificar/eliminar el fallback una vez pase
tiempo suficiente sin que nadie dependa de él.
**Prioridad:** Alta — hasta que se aplique, el modo libre no está disponible
en producción y el sistema depende de este fallback para no romper la web
pública ni la ingesta de posiciones.

---

## El fallback de compatibilidad (migración 0003 sin aplicar) no distingue el error "columna inexistente" de otros errores genuinos de Supabase

**Fecha:** 2026-08-07
**Contexto:** Detectado por el Reviewer en la Ronda 2 de revisión del fix de
compatibilidad (ver entrada anterior de este archivo y `docs/tareas/CURRENT.md`,
"Fix de compatibilidad post-revisión"). Los tres puntos de fallback
(`app/page.tsx` `obtenerIntentoActivo`, `app/api/track/route.ts`, `app/api/progreso/route.ts`
`calcularProgresoActual`/`obtenerIntentoActivoModoGuiado`) activan el reintento
con el select mínimo ante **cualquier** `error` que devuelva la consulta con
`modo`/`destino_lat`/`destino_lon` — nunca comprueban `error.code === "42703"`
(el código Postgres específico de "columna no existe") ni registran nada en
logs cuando el error es de otra naturaleza (red, RLS mal configurado, timeout).
**Problema:** Un fallo genuino y no relacionado con la migración pendiente
queda indistinguible del caso esperado "columna todavía no existe" — ambos
disparan el mismo camino de reintento silencioso, sin ningún rastro en logs
que permita diferenciar "esto es esperado, falta aplicar la migración" de
"esto es un problema real que investigar".
**Impacto:** Verificado que no hay regresión funcional: en el peor caso (el
select de fallback también falla), el resultado es exactamente el mismo
comportamiento que tenía el sistema antes de DT-016 (se trata como "sin
intento activo" / se descarta el punto GPS) — coherente con el patrón de
degradación silenciosa ya establecido en todo el proyecto (`respuestaVacia()`
en `/api/track` nunca da pistas sobre el motivo de un descarte). El único
coste real es de observabilidad: mientras la migración 0003 siga sin
aplicarse, no hay forma de detectar desde logs si el fallback se está
disparando por el motivo esperado o por otra causa.
**Solución propuesta:** Comprobar explícitamente `error.code === "42703"`
antes de decidir el reintento; si el código es distinto, registrar con
`console.error` (incluyendo el código/mensaje real de Supabase, sin datos de
usuario) para poder diferenciar ambos casos en los logs de Vercel. Aplica a
los tres puntos de fallback listados arriba.
**Prioridad:** Baja — no bloquea el cierre de la tarea (sin regresión de
comportamiento), pero conviene resolverlo junto con la limpieza del fallback
una vez la migración esté aplicada y confirmada.

---

## Patrón de fallback de compatibilidad (migración 0003) triplicado sin extraer a un helper compartido

**Fecha:** 2026-08-07
**Contexto:** Detectado por el Reviewer en la Ronda 2 de revisión del fix de
compatibilidad. El mismo patrón (intentar select completo → si falla,
reintentar con select mínimo → tratar como modo guiado) aparece implementado
de forma independiente en `app/page.tsx`, `app/api/track/route.ts` y
`app/api/progreso/route.ts`, con ligeras variaciones (columnas seleccionadas,
cliente Supabase admin vs. público, forma del valor de retorno).
**Problema:** Triplicación de lógica equivalente en tres ficheros. No se
extrajo a un helper común.
**Impacto:** Bajo — evaluado y aceptado en la revisión: es código
explícitamente temporal (destinado a quedar inactivo y candidato a
eliminarse una vez la migración esté aplicada, ver entrada de deuda
anterior), y los tres call sites difieren lo suficiente (columnas distintas,
dos clientes Supabase distintos, formas de retorno distintas) como para que
una abstracción compartida forzada añadiera complejidad sin beneficio real
para código de vida corta — coherente con el criterio del framework contra
abstracciones especulativas.
**Solución propuesta:** No actuar mientras el fallback siga siendo temporal.
Si en una revisión futura se confirma que la migración sigue sin aplicarse
mucho tiempo después (y por tanto este código deja de ser "temporal" en la
práctica), reconsiderar extraer un helper común en ese momento, no antes.
**Prioridad:** Baja.

---

## Desfase entre la pantalla y las piedras: calibración aplazada a F3

**Fecha:** 2026-07-30
**Contexto:** Generado en F1.1 al adoptar el diseño de "corredor" (DT-005). La traza mide de más respecto a las distancias grabadas en los mojones físicos del Camino, con un desfase creciente hacia el sur (medido: +1,61 km en Padrón, +2,11 km en Caldas, +2,29 km en Pontevedra, +2,49 km en Redondela, +3,72 km en O Porriño). No es un error de la traza — es la diferencia entre un track GPS detallado y las distancias de etapa redondeadas de las guías.
**Problema:** El día del reto, cuando Santi pase junto a un mojón que pone "98" (por ejemplo), la web mostrará un número diferente. El desfase esperado es ~1,5-3,7 km según la zona. Esto puede ser confuso para los espectadores que conozcan los mojones físicos.
**Impacto:** Cosmético durante el reto: la barra y el odómetro son coherentes entre sí, pero no coinciden con la escala grabada en piedra. Santi ya está informado y lo acepta. El mayor riesgo es que un espectador malinterprete el número como un error técnico.
**Solución propuesta:** En F3, añadir al panel de admin la posibilidad de registrar mojones reales (número grabado + timestamp de paso) durante el reto. Con 2-3 mojones anotados se puede calibrar una función de corrección lineal que alinee la pantalla con las piedras para el resto del recorrido.
**Actualización (2026-08-07, DT-015):** durante el fix de la extensión sur del corredor se investigaron dos mojones reales georreferenciados en OpenStreetMap (lat 42,1696 "97,602" y lat 42,1934 "94,512", ambos al norte de O Porriño). No fue posible calibrar de forma concluyente con solo dos puntos, y no formaba parte del alcance de esa tarea — queda como contexto útil para retomar cuando se aborde esta deuda, no como intento fallido a descartar.
**Prioridad:** Media — no bloquea F2-F4; debe valorarse antes del día del reto.

---

## Tramo final de la traza pendiente de validar sobre el terreno

**Fecha:** 2026-07-30
**Contexto:** Generado en F1 al extender la traza oficial hasta la Praza do
Obradoiro. La traza de la Xunta termina en Praza da Quintana, 93 m en línea
recta del Obradoiro (andando ~210 m, rodeando la catedral).
**Problema:** Los últimos ~210 m de la traza (`lib/traza/traza.geojson`) son
geometría dibujada a mano con 4 waypoints intermedios (Quintana norte →
Praza da Inmaculada → Arco do Pazo de Xelmírez → Obradoiro). No proceden de
datos GPS reales ni de cartografía oficial. La ruta asume que se pasa por
Praza da Inmaculada (Azabachería) — puede que el camino peregrina oficial o
el que use Santi difiera ligeramente.
**Impacto:** La barra de progreso puede mostrar un avance incorrecto en los
últimos ~200 m del reto, que es el tramo más visible del día. Error estimado:
≤ 50 m si la ruta real se desvía de lo dibujado.
**Solución propuesta:** El día del reto, Santi valida la ruta real a pie
(o con fotos de Google Street View) y se ajustan los waypoints. El script
`pnpm simplificar-traza` regenera ambos GeoJSON automáticamente. La propiedad
`tramo_final_manual: true` en el GeoJSON y el test de integridad en
`proyeccion.test.ts` actúan como guardarraíl: si se regenera la traza
incorrectamente, el test falla.
**Prioridad:** Media (no bloquea el desarrollo; debe resolverse antes del día del reto)

---

## `kmAcumulados` se calcula en `prepararTraza` pero no se usa en `calcularProgreso`

**Fecha:** 2026-07-30
**Contexto:** Detectado por el Reviewer en la revisión de F1. El campo `kmAcumulados` de `TrazaPreparada` se precalcula en `prepararTraza` (array de distancias acumuladas por vértice) con la intención de que `calcularProgreso` lo use para proyectar posiciones eficientemente. La implementación actual delega la proyección completamente a `@turf/nearest-point-on-line`, que recalcula internamente todos los segmentos de la LineString en cada llamada, sin aprovechar el precálculo.
**Problema:** El array `kmAcumulados` de 6.915 doubles (~55 KB en memoria) se genera y se almacena en `TrazaPreparada` pero no se usa. El rendimiento real de `calcularProgreso` con el histórico completo del día del reto (~3.600 posiciones) depende de cuántas veces Turf itera los 6.914 segmentos de la traza: en el peor caso, ~24,9 millones de operaciones de distancia por petición. La documentación del tipo y del módulo implica que el precálculo evita este trabajo, pero no es cierto en la implementación actual.
**Impacto:** Potencial lentitud en el endpoint de datos en F2 si se llama con el histórico completo sin paginar. Si `calcularProgreso` se ejecuta en cada petición con 3.600 posiciones, podría superar 100 ms en servidor. No hay impacto en correctitud — solo en rendimiento.
**Solución propuesta:** Dos opciones: (a) implementar la proyección usando `kmAcumulados` (búsqueda binaria + interpolación lineal) para O(log n) por punto en vez de O(n); o (b) eliminar `kmAcumulados` de `TrazaPreparada` y documentar que el rendimiento depende de Turf. La opción (a) es la que se anticipaba en el diseño. Evaluar en F2 cuando se defina cómo se llama `calcularProgreso`.
**Actualización (F3, 2026-07-31):** `calcularProgreso` se invoca ahora desde `GET /api/progreso` con polling del cliente cada 30 s. Ver DT-007: se mitiga con una caché en memoria de proceso (TTL 15-20 s) en el propio route handler, sin tocar `proyeccion.ts` ni el esquema. Si en producción (día del reto) la caché TTL no basta — por ejemplo con muchos más seguidores concurrentes de los previstos — el arreglo de fondo sigue siendo la opción (a) de arriba, o persistir el progreso incremental en `intentos` (Opción C descartada en DT-007 por alcance).
**Prioridad:** Media (mitigada en F3; el arreglo de fondo queda pendiente solo si el TTL resulta insuficiente en producción)

---

## `traza-mapa.geojson` es 4 KB más grande que el objetivo de DT-001

**Fecha:** 2026-07-30
**Contexto:** DT-001 estimó ~37 KB para la traza de pintado. El fichero
generado mide 41,9 KB (compact JSON). La diferencia se debe a que la traza
extendida tiene 4 puntos más y a ligeras variaciones en el algoritmo.
**Problema:** El fichero enviado al navegador en F3 pesa ~5 KB más de lo previsto.
Con gzip, la diferencia real será de ~1-2 KB.
**Impacto:** Despreciable en la práctica. En cobertura móvil rural (el escenario
del reto), la diferencia es imperceptible.
**Solución propuesta:** Revisar en F3 cuando se integre MapLibre. Si el peso
total de la página es un problema, se puede reducir la precisión de coordenadas
a 5 decimales (actualmente 6) o subir la tolerancia DP a 4-5 m.
**Prioridad:** Baja

---

## Ancla del porcentaje se recalcula si el admin descarta la primera posición

**Fecha:** 2026-07-30
**Contexto:** Detectado por el Reviewer en la revisión de F1.1. En `proyeccion.ts`, el ancla del porcentaje (DT-005) se calcula desde `validas[0]` — el primer punto sin `descartado=true` — en cada llamada a `calcularProgreso`. Si el admin descarta la primera posición del histórico (operación que existirá en el panel de F4), la siguiente llamada ancla en la segunda posición, que puede estar en un km distinto de la traza.
**Problema:** En el escenario donde la posición 0 estaba proyectada a km 4 de la traza, Santi avanzó hasta km 50 (porcentaje ≈ 45,5%), y el admin descarta la posición 0, la nueva ancla pasa a la posición 1 (km 5). El nuevo porcentaje es (50-5)/(105-5) × 100 = 45%. La barra baja visiblemente, aunque el comportamiento resultante es más correcto (el ancla refleja el inicio real del intento). El riesgo principal es que ocurra en directo con espectadores mirando.
**Impacto:** Leve en casi todos los casos reales (las primeras dos posiciones registradas suelen estar muy próximas). Potencialmente visible si el primer GPS registró una posición muy desviada al sur antes de corregir.
**Solución propuesta:** En F4, al implementar la acción de descartar posición, añadir una advertencia al admin si la posición a descartar es la que actualmente ancla el porcentaje. Alternativamente, persistir `kmAncla` en la tabla `intentos` de BD la primera vez que se calcula, para que no dependa del primer punto del histórico en cada petición.
**Prioridad:** Baja — el escenario es operacionalmente improbable; solo importa si se descarta el primer punto mientras el reto está en curso.

---

## `Progreso` expone campos internos de `Posicion` al serializar hacia el cliente en F3

**Fecha:** 2026-07-30 · **Resuelta:** 2026-07-31, tarea F3
**Contexto:** Detectado por el Agente de Seguridad en la revisión de F1. El tipo
`Progreso` incluye `ultimaPosicion: Posicion | null`, que es el tipo completo de
base de datos.
**Resolución:** F3 introduce `ProgresoPublico` (`lib/types.ts`) y la función pura
`aProgresoPublico()` (`lib/traza/progreso-publico.ts`), que proyecta `Progreso` a
solo `porcentaje`, `kmAvanzados`, `kmRestantes`, `odometroKm`, `estado`, y de
`ultimaPosicion` solo `lat`/`lon`/`ts` — nunca `batt`, `acc`, `intento_id`,
`fuente` ni `descartado`. La proyección se ejecuta siempre en servidor:
`GET /api/progreso/route.ts` y `app/page.tsx` (Server Component) son los únicos
puntos que llaman a `calcularProgreso()`, y ambos serializan a través de
`aProgresoPublico()` antes de que nada llegue al cliente. Cubierto con tests
(`lib/traza/progreso-publico.test.ts`) que verifican explícitamente que ninguno
de los campos internos aparece en el objeto resultante.
**Prioridad:** Cerrada.

---

## Envenenamiento del ancla de progreso desde el endpoint de ingesta (F2)

**Fecha:** 2026-07-30 · **Corregida (parcialmente):** 2026-07-30, tarea F2 · **Cerrada:** 2026-08-01, tarea F4
**Contexto:** Detectado por el Agente de Seguridad en la revisión de F1.1. El ancla del porcentaje se fija con el primer punto no descartado del histórico y determina el denominador de todo el cálculo del intento. En F2 el histórico se alimenta desde `/api/track`, un endpoint accesible desde internet. Ver **DT-006** en `docs/tecnico/decisiones-tecnicas.md` para el análisis completo y la decisión de defensa en dos capas.
**Problema (corrección de la premisa original):** Esta entrada decía "irreversible sin tocar la BD directamente". Es incorrecto: `calcularProgreso` recalcula el ancla en cada llamada como `validas[0]` (primer punto con `descartado: false`), así que marcar el punto envenenado como `descartado` desde el panel de admin lo repara sin tocar la BD a mano — **es reversible vía admin**. El problema real y más matizado: la especificación v1 solo preveía un botón de "descartar último punto", que no llegaba a un punto envenenado si quedaba enterrado bajo datos posteriores.
**Solución — estado final:**
- **Capa 1 (F2, implementada):** filtro de plausibilidad geográfica en `/api/track` — se rechaza (sin guardar, sin dar pistas) cualquier punto a más de 100 km de la traza de cálculo. Ver `app/api/track/route.ts`, `lib/traza/umbrales.ts` (`SEPARACION_TRAZA_MAX_KM`) y sus tests en `app/api/track/route.test.ts`.
- **Capa 2 (F4, implementada):** la Server Action `descartarPosicion(id)` (`app/admin/actions.ts`) y la sección Posición del panel (`components/admin/SeccionPosicion.tsx`) permiten descartar cualquier punto del histórico paginado, no solo el último — cierra el caso límite de un punto envenenado enterrado bajo datos posteriores.
**Prioridad:** Cerrada — ambas capas de defensa están implementadas.

---

## `/api/track` no valida el rango físico de `lat`/`lon`/`tst` en el schema Zod

**Fecha:** 2026-07-30 · **Resuelta:** 2026-07-30, ronda final de limpieza F2
**Contexto:** Detectado por el Reviewer en la revisión de F2. El schema `payloadOwnTracks` en `app/api/track/route.ts` validaba `lat`/`lon`/`tst` solo como `z.number()`, sin rango físico.
**Resolución:** `payloadOwnTracks` ahora exige `lat: z.number().min(-90).max(90)`, `lon: z.number().min(-180).max(180)` y `tst: z.number().positive()` (sin cota superior, para no mantener una fecha mágica). Sigue siendo el filtro geográfico de 100 km (DT-006) la defensa real contra el envenenamiento del ancla — esto es defensa adicional explícita por contrato, no un sustituto.
**Prioridad:** Cerrada.

---

## Sin rate limiting en `/api/track`

**Fecha:** 2026-07-30 · **Ampliada:** 2026-07-31, tarea F3 · **Cerrada:** 2026-08-01, tarea F5
**Contexto:** Detectado por el Agente de Seguridad en la revisión de F2 (auditoría OWASP Top 10, A04).
**Problema:** El endpoint de ingesta no tiene ningún límite de peticiones. No es bloqueante mientras el proyecto no esté desplegado (F0/Vercel pendiente), pero es condición explícita antes de exponer el endpoint a internet: un token filtrado sin límite permite spam de inserciones en `posiciones`, degradando el rendimiento y ensuciando el histórico (con impacto directo en el cálculo de progreso).
**Impacto:** No compromete la integridad del ancla (eso ya lo cubre DT-006), pero permite agotar cuota de BD y ensuciar el histórico visible en el panel de admin si el token se filtra (captura de la config de OwnTracks en el móvil, logs de Vercel, etc.).
**Solución propuesta:** Rate limiting a nivel de IP o de token en el propio route handler (o mediante la capa de Vercel/Edge si se dispone de ella), antes de F5 (cierre y deploy a producción).
**Ampliación (F3):** los tres endpoints nuevos de la web pública (`POST /api/comentarios`, `POST /api/intenciones`, `GET /api/progreso`/`GET /api/comentarios`) están en el mismo caso — explícitamente fuera de alcance de F3 según `docs/tareas/CURRENT.md`, la solución de fondo es la misma y debe cubrir los cuatro endpoints (`/api/track` incluido) antes de F5.
**Ampliación (F4):** `POST /api/admin/login` se añade a la misma lista — sin
rate limiting, un atacante puede probar contraseñas sin límite (fuerza
bruta). La comparación en tiempo constante (`timingSafeEqual`) evita fugar
información por timing, pero no sustituye a un límite de intentos. Explícitamente
fuera de alcance de F4 según `docs/tareas/CURRENT.md`, agrupado con los demás
endpoints pendientes de F5.
**Resolución (F5):** implementado rate limiting en memoria de proceso (DT-011,
`docs/tecnico/decisiones-tecnicas.md`) en los 6 endpoints listados: módulo
compartido `lib/rate-limit.ts` (función `consumir(clave, limite, ventanaMs)`
sobre un `Map` en scope de módulo, mismo patrón que la caché TTL de DT-007).
`POST /api/track` limita por token (40 req/min); `POST /api/comentarios`,
`POST /api/intenciones`, `GET /api/progreso`, `GET /api/comentarios` y
`POST /api/admin/login` limitan por IP (`x-forwarded-for`) con sus propios
límites (ver tabla en DT-011). Al exceder el límite se responde `429` sin
cuerpo, mismo criterio de rechazo silencioso que el resto del proyecto.
Cubierto con tests unitarios de `lib/rate-limit.ts` (ventana que expira,
contador que resetea, claves independientes, borde exacto del límite) y
tests de integración por ruta que verifican el `429` al superar el cupo.
**Limitación conocida, aceptada en DT-011:** el contador es por instancia de
función serverless — no se comparte entre regiones ni sobrevive a un cold
start. Suficiente para el tráfico esperado (evento de un día, audiencia
familiar/amigos); si no bastara, la solución de fondo es un contador
compartido (Upstash u otro).
**Prioridad:** Cerrada.

---

## Overlay del mapa (F3): el corte "andado / restante" usa distancia euclídea en grados, no la proyección real de Turf

**Fecha:** 2026-07-31 · **Contexto:** Generado en F3 al implementar `components/mapa/Mapa.tsx`.
**Problema:** Para pintar el tramo andado en naranja y el restante en discontinuo, el overlay SVG busca el vértice de `traza-mapa.geojson` más cercano a la posición actual con distancia euclídea simple en grados lon/lat (función `indiceMasCercano`), en vez de reutilizar `nearestPointOnLine` de Turf (la misma proyección que ya usa `calcularProgreso` en `proyeccion.ts`). Es una aproximación deliberada para no acoplar un componente puramente visual al dominio de cálculo de progreso (que trabaja sobre `traza.geojson`, no `traza-mapa.geojson`).
**Impacto:** Puramente cosmético — el `%`/km mostrados en el Mojón siempre vienen de `calcularProgreso` (correcto). El único efecto de esta aproximación es que, en tramos donde la traza serpentea mucho (curvas cerradas), el punto de corte entre el color naranja y el discontinuo puede desviarse visualmente unos pocos vértices del punto exacto. No afecta a ningún número mostrado al usuario.
**Solución propuesta:** Si en producción se nota un desajuste visible, sustituir `indiceMasCercano` por una proyección con Turf sobre `traza-mapa.geojson` (import de `@turf/nearest-point-on-line`, ya es dependencia del proyecto).
**Prioridad:** Baja — cosmético, sin impacto en los datos mostrados.

---

## `scripts/bundle-maplibre-worker.ts` no valida la existencia del fichero de entrada antes de invocar esbuild

**Fecha:** 2026-07-31
**Contexto:** Detectado por el Reviewer en la revisión de los fixes post-preview de F3 (DT-008, worker de MapLibre pre-empaquetado).
**Problema:** El script asume que `node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs` existe con ese nombre exacto y no comprueba su existencia con `existsSync` antes de llamar a `esbuild.build()`. Si una futura actualización de `maplibre-gl` renombra o reestructura los artefactos de `dist/`, el fallo se manifiesta como el error nativo de esbuild ("Could not resolve...") — ruidoso y capturado por el `.catch()` de `main()` (no rompe en silencio), pero el mensaje no menciona DT-008 ni orienta hacia la causa real.
**Impacto:** Bajo. El fallo es visible y detiene el hook `predev`/`prebuild` (no hay build fantasma con worker desactualizado), pero diagnosticar la causa exige que quien lo vea conozca DT-008 de antemano.
**Solución propuesta:** Añadir una comprobación `existsSync(ENTRADA)` al inicio de `main()` que lance un error propio, explícito, con referencia a DT-008 y `docs/LESSONS.md`, antes de invocar esbuild.
**Prioridad:** Baja.

---

## DT-008 no refleja la decisión final sobre si el artefacto del worker se commitea o se regenera

**Fecha:** 2026-07-31
**Contexto:** Detectado por el Reviewer en la revisión de los fixes post-preview de F3.
**Problema:** `docs/tecnico/decisiones-tecnicas.md` (DT-008) deja explícitamente "a criterio del Implementador" si `public/maplibre-gl-worker.bundled.js` se commitea o se regenera en cada build, remitiendo a `README.md`/`AGENTS.md` para el detalle. La implementación final decidió no commitearlo (está en `.gitignore`, se regenera siempre vía `predev`/`prebuild`) y lo documentó bien en `AGENTS.md`, pero el propio DT-008 nunca se actualizó para cerrar esa decisión abierta — un lector de `decisiones-tecnicas.md` no sabe, sin ir a `AGENTS.md`, cuál de las dos opciones se tomó.
**Impacto:** Puramente documental. No afecta al comportamiento del sistema.
**Solución propuesta:** Añadir una línea a DT-008 confirmando la decisión final ("no se commitea; se regenera siempre desde `node_modules` vía predev/prebuild") para que el documento de decisiones quede autocontenido.
**Prioridad:** Baja.

---

## `docs/tecnico/arquitectura.md` no refleja los ficheros nuevos del perfil de elevación

**Fecha:** 2026-07-31
**Contexto:** Detectado por el Reviewer en la revisión de la tarea "Foto en Quién camina + estadísticas y perfil de elevación". La tabla de estructura de carpetas de `arquitectura.md` (sección `lib/traza/` y `components/publico/`) no incluye `lib/traza/perfil-elevacion.ts`, `lib/traza/perfil-elevacion.json`, `components/publico/PerfilElevacion.tsx` ni `scripts/generar-perfil-elevacion.ts`, pese a que esa tabla es la fuente de verdad documentada de dónde vive cada tipo de código.
**Problema:** Un agente o desarrollador que consulte `arquitectura.md` para orientarse no verá estos cuatro ficheros nuevos, aunque sí están documentados en detalle en DT-009 (`decisiones-tecnicas.md`).
**Impacto:** Puramente documental. No afecta al comportamiento del sistema, pero reduce la fiabilidad de `arquitectura.md` como mapa completo del proyecto.
**Solución propuesta:** Añadir las 4 filas nuevas a la tabla de estructura de `arquitectura.md`, siguiendo el mismo formato que las entradas marcadas `# F3: ...`.
**Prioridad:** Baja.

---

## Comentario desactualizado en `EnlacePaginacion.tsx`: dice "Link", implementa `<button>` + `router.push`

**Fecha:** 2026-08-01
**Contexto:** Detectado por el Reviewer en la revisión de F4 — Panel admin. El comentario de cabecera de `components/admin/EnlacePaginacion.tsx` dice "en vez de fetch de cliente, es un Link que actualiza un parámetro de offset propio en la URL", pero el componente no usa `next/link`: renderiza un `<button onClick={...}>` que llama a `router.push()`.
**Problema:** El comentario no describe la implementación real. No es incorrecto en el efecto (navega actualizando la query string) pero induce a pensar que hay un `<Link>` de Next debajo, lo que puede confundir a quien lo lea para depurar o extender el patrón de paginación en otra sección.
**Impacto:** Puramente documental — cero efecto en comportamiento.
**Solución propuesta:** Ajustar el comentario para reflejar que es un botón con `router.push()`, no un `<Link>`.
**Prioridad:** Baja.

---

## Comentarios de cabecera obsoletos: "no probado contra Supabase real" / "bloqueado por F0" en 3 ficheros de producción

**Fecha:** 2026-08-01
**Contexto:** Detectado por el Reviewer en la auditoría completa de F5 (F1-F5). `app/api/track/route.ts`, `lib/supabase/admin.ts` y `lib/supabase/public.ts` conservan comentarios de cabecera escritos en F2, cuando el proyecto Supabase todavía no existía (bloqueado por F0): afirman literalmente "NO SE HA PROBADO CONTRA UNA BASE DE DATOS REAL", "no existe proyecto Supabase todavía" y "bloqueado por F0". El proyecto lleva desplegado en producción con Supabase real desde F2 y ha pasado por F3 y F4 sin que nadie actualizara estos tres comentarios.
**Problema:** Documentación embebida en el código que contradice el estado real del sistema. Un agente o desarrollador que lea estos ficheros por primera vez (por ejemplo para depurar un incidente en producción) puede concluir erróneamente que el cliente Supabase nunca se ha verificado contra una BD real, cuando de hecho lleva en producción real varias fases.
**Impacto:** Puramente documental — cero efecto en comportamiento. Pero es el mismo patrón que ya causó una entrada de deuda en F4 (`EnlacePaginacion.tsx`) y ahora aparece de forma recurrente en 3 ficheros más — ver nueva entrada en `docs/LESSONS.md`.
**Solución propuesta:** Actualizar los tres comentarios de cabecera para reflejar el estado real (Supabase en producción, verificado en integración desde F2 según `docs/bugs/BUGS.md`), eliminando cualquier referencia a "bloqueado por F0" o "no probado".
**Prioridad:** Baja — documental, pero recurrente; conviene resolver en la próxima tarea que toque cualquiera de estos tres ficheros.

---

## Nombre de test en `proyeccion.test.ts` puede quedar incompleto tras añadir assertion de `kmRestantes`

**Fecha:** 2026-08-02 · **Cerrada:** 2026-08-02, fix de Ronda 1 de la misma tarea
**Contexto:** Detectado por el Reviewer en la revisión de "Km restantes: solo plan restante desde el punto más cercano (sin sumar la vuelta)". El bloqueante de esa revisión pide añadir una assertion de `kmRestantes` al test de "desvío grande (~2 km)" (`lib/traza/proyeccion.test.ts`, línea ~304-319, `it("clasifica como desvio-mayor cuando la separación es ~2 km"...)`).
**Problema:** Si el Implementador amplía las assertions de ese test sin renombrarlo, el nombre deja de describir con precisión todo lo que el test verifica (framework, sección Tests: "los nombres de los tests describen el comportamiento que verifican").
**Resolución:** Al aplicar el fix del bloqueante de Ronda 1, el test se renombró a "clasifica como desvio-mayor y kmRestantes no suma la separación cuando la separación es ~2 km", reflejando ambas assertions.
**Prioridad:** Cerrada.

---

## `docs/producto/roadmap.md` y `funcionalidades.md` no reflejan "Minuto a minuto" como implementado

**Fecha:** 2026-08-02
**Contexto:** Detectado por el Reviewer en la revisión de la tarea "Minuto a minuto (feed en directo con fotos)". La feature está completamente implementada (DT-013), documentada en `CHANGELOG.md` y en la documentación técnica (`arquitectura.md`, `modelo-datos.md`), pero `docs/producto/roadmap.md` sigue listando "Minuto a minuto (feed de mensajes en directo, editable desde admin)" bajo la sección "Ideas v2 (fuera de alcance v1)" sin marcarlo como hecho, y `docs/producto/funcionalidades.md` no describe la nueva sección desde el punto de vista del usuario (a diferencia del resto de funcionalidades del documento).
**Problema:** Documentación de producto desactualizada respecto al estado real del sistema. Un lector de `roadmap.md`/`funcionalidades.md` (incluido el Agente de Producto en una tarea futura) puede concluir que la feature sigue sin construir.
**Impacto:** Puramente documental — cero efecto en comportamiento. Reduce la fiabilidad de la documentación de producto como fuente de verdad de qué existe ya en el producto.
**Solución propuesta:** El Agente de Producto debe mover el ítem de `roadmap.md` de "Ideas v2" a la sección de hechos (o marcarlo `[x]` con contexto de qué fase/tarea lo implementó, igual que el resto de ítems ya cerrados), y añadir una entrada en `funcionalidades.md` describiendo el feed "minuto a minuto" desde la perspectiva del usuario (qué ve, cuándo, cómo interactúa con el mapa).
**Prioridad:** Baja.

---

## `MinutoAMinuto.tsx` asume sin documentarlo que `entradas[0]` es siempre la entrada más reciente para el poll incremental

**Fecha:** 2026-08-02
**Contexto:** Detectado por el Reviewer en la revisión de "Minuto a minuto (feed en directo con fotos)". `components/publico/MinutoAMinuto.tsx` usa `entradas[0].id` como `despuesDeId` para el poll incremental (`masRecienteIdRef`), lo que asume que la primera entrada del array (ordenado por `created_at desc`) tiene también el `id` más alto — cierto hoy porque `id` es autoincremental y `created_at` se genera en el mismo insert, pero es una invariante implícita, no verificada por ningún test ni documentada en el propio componente.
**Problema:** Si en el futuro se permitiera editar `created_at`, hacer backfill de entradas antiguas, o cualquier operación que desacople el orden de `id` del orden de `created_at`, el poll incremental podría dejar de detectar entradas nuevas (o repetirlas) sin que ningún test lo capture.
**Impacto:** Bajo en el estado actual del sistema — no hay ninguna vía para insertar `minuto_a_minuto` con `created_at` fuera de orden respecto a `id` (todas las inserciones son vía `crearMinutoAMinuto`, que no permite fijar `created_at`). Solo se manifestaría si una tarea futura cambia esa garantía.
**Solución propuesta:** Añadir un comentario junto a `masRecienteIdRef` documentando explícitamente la invariante ("`id` creciente y `created_at desc` están siempre correlacionados porque ambos se generan en el mismo insert, sin vía de edición de `created_at`"), y opcionalmente un test que verifique el comportamiento del poll con una respuesta de varias entradas nuevas a la vez.
**Prioridad:** Baja.

---

## `calcularRitmoMedioIntento` (y sus equivalentes) no se defienden contra fechas inválidas

**Fecha:** 2026-08-01
**Contexto:** Detectado por el Reviewer en la revisión de "Estadísticas (tiempo, distancia, ritmo) en la pantalla de llegada". `lib/ritmo.ts` (`calcularRitmoMedioIntento`) recibe `iniciadoEn`/`finalizadoEn` como `string | null` (o `Date | string | null` en el caso del final) directamente desde columnas de Supabase (`started_at`/`ended_at`), sin validación de formato. Si el valor almacenado no fuera un ISO 8601 parseable, `new Date(valor)` produce `Invalid Date` (`getTime()` → `NaN`), y la resta `(final - inicio) / 3_600_000` da `NaN`, que pasa la comprobación `horasTranscurridas <= 0` como `false` (toda comparación con `NaN` es `false`) y termina formateándose como `"NaN,N"` en vez de caer al fallback `"—"`.
**Problema:** No es una regresión de esta tarea — el mismo patrón sin blindar ya existe en `calcularRitmoMedio` de `components/publico/ModoDurante.tsx` y en `formatearTiempoTotal` de `app/page.tsx`, ninguno con test para este caso. Pero al centralizar la fórmula de ritmo en `lib/ritmo.ts` con tests, es el punto natural para cerrarlo de una vez para los tres sitios.
**Impacto:** Bajo en la práctica — `started_at`/`ended_at` los escribe el propio backend (Server Actions del panel admin), nunca un formulario de usuario externo; la superficie de que lleguen corruptos es pequeña. Si ocurriera, el efecto visible sería mostrar `"NaN,N"` en vez de `"—"` en la pantalla pública, un fallo cosmético pero visible a espectadores.
**Solución propuesta:** Añadir una comprobación `Number.isNaN(inicio) || Number.isNaN(final)` (o validar con `Number.isFinite`) antes de calcular `horasTranscurridas` en `lib/ritmo.ts`, con su test de regresión; valorar si merece la pena replicar el mismo guard en `ModoDurante.tsx`/`page.tsx` o extraerlos también a `lib/ritmo.ts` en una tarea futura de consolidación.
**Prioridad:** Baja.

---

## `docs/tecnico/arquitectura.md` no incluye `lib/rate-limit.ts` en la tabla de estructura

**Fecha:** 2026-08-01 · **Cerrada:** 2026-08-01, tarea "Auto-refresco de fase en la web pública"
**Contexto:** Detectado por el Reviewer en la auditoría completa de F5. La tabla de estructura de carpetas de `arquitectura.md` no lista `lib/rate-limit.ts`, pese a ser un módulo de infraestructura compartida (DT-011) usado activamente por las 6 rutas públicas del proyecto.
**Problema:** Mismo patrón ya registrado para el perfil de elevación (ver entrada anterior en este archivo): la tabla de estructura no es fuente de verdad completa de dónde vive cada tipo de código.
**Impacto:** Puramente documental. La decisión sí está bien documentada en DT-011 (`decisiones-tecnicas.md`), solo falta el reflejo en la tabla de `arquitectura.md`.
**Resolución:** Añadida la fila `lib/rate-limit.ts` a la tabla de estructura de `arquitectura.md` al añadir también `app/api/fase/route.ts` y `components/publico/RefrescoAlCambiarFase.tsx` (DT-012).
**Prioridad:** Cerrada.

---

## `crearMinutoAMinuto` puede guardar `lat`/`lon` a `null` si la caché compartida de progreso está vacía en esa instancia serverless

**Fecha:** 2026-08-02
**Contexto:** Generado al implementar DT-014 (`docs/tecnico/decisiones-tecnicas.md`) — fix para que el snapshot de posición de "Minuto a minuto" coincida con lo que el mapa público está mostrando, leyendo de la caché compartida `lib/progreso-cache.ts` en vez de una lectura fresca de `posiciones`.
**Problema:** La caché vive en memoria de proceso, igual que DT-007/DT-011 — no se comparte entre instancias serverless de Vercel ni sobrevive a un cold start. Si `crearMinutoAMinuto` se ejecuta en una instancia que todavía no ha atendido ninguna petición `GET /api/progreso` (arranque en frío, poco tráfico reciente), la caché está vacía y la entrada se guarda con `lat: null, lon: null` aunque existan posiciones reales en BD — deliberado (sin fallback a `posiciones`, ver DT-014), pero significa que alguna entrada del feed puede quedar sin posición asociada aunque Santi sí tuviera GPS reciente.
**Impacto:** Cosmético — la entrada simplemente no tiene marcador en el mapa al pincharla (mismo comportamiento ya existente hoy para "aún no hay ninguna posición registrada"). No afecta a ningún otro dato del intento ni al cálculo de progreso. La frecuencia esperada es baja: `/api/progreso` recibe polling cada 30 s desde cualquier visitante de la web pública en "durante", así que la caché rara vez estará realmente vacía salvo en los primeros segundos tras un cold start o justo tras "Iniciar" antes de la primera visita.
**Solución propuesta:** Si en producción (día del reto) se observa que ocurre con demasiada frecuencia, escalar a la Opción B descartada en DT-014: persistir el último snapshot de posición en la tabla `intentos`, actualizado por `/api/progreso` en cada recálculo, con su propia migración.
**Prioridad:** Baja — riesgo cosmético, mismo patrón ya aceptado en DT-007/DT-011 para este proyecto.

---

## `docs/producto/decisiones-producto.md` no refleja las cifras nuevas de la traza tras DT-015

**Fecha:** 2026-08-07
**Contexto:** Detectado por el Reviewer en la revisión de DT-015 (extensión sur del corredor corregida con `t03v`). La entrada "La traza es un corredor: el recorrido real empieza donde Santi pulse Iniciar" (2026-07-30) sigue diciendo, en su "Consecuencia técnica", que "la traza pasa de 100,21 km a ~105 km (7.121 puntos)". Esa cifra es la de DT-005, ya no la vigente (110,43 km / 7.951 puntos tras DT-015). `docs/tecnico/decisiones-tecnicas.md` sí resolvió el mismo problema para DT-001 añadiendo una nota explícita que remite a DT-015; `decisiones-producto.md` no recibió el mismo tratamiento porque no estaba en el alcance de ficheros a tocar de esta tarea.
**Problema:** Documentación de producto con una cifra desactualizada en un log histórico de decisiones. `docs/producto/contexto.md` (el documento de "estado actual") sí está correcto con 110,43 km — el desfase es solo en el log de decisiones.
**Impacto:** Puramente documental. Quien lea `decisiones-producto.md` de forma aislada (sin cruzar con `decisiones-tecnicas.md` o `contexto.md`) puede quedarse con la cifra de ~105 km como vigente.
**Solución propuesta:** Añadir una nota breve a esa entrada, mismo patrón que la nota de DT-015 en `decisiones-tecnicas.md` (DT-001): "la cifra de esta decisión es la vigente en su fecha; DT-015 (2026-08-07) la corrige a 110,43 km / 7.951 puntos".
**Prioridad:** Baja.

---

## `nota_extension_sur` en `traza.geojson` mezcla dos medidas distintas bajo una misma cifra ("~10,2 km al sur de O Porriño")

**Fecha:** 2026-08-07
**Contexto:** Detectado por el Reviewer en la revisión de DT-015. La propiedad `nota_extension_sur` de `scripts/simplificar-traza.ts` (y por tanto de `traza.geojson`) dice "Los primeros ~10,2 km (al sur de O Porriño) proceden del KML original...". Los 10,2175 km son la distancia desde el inicio original de la traza (pre-DT-005, ~1,7 km al norte del centro de O Porriño) hasta el nuevo extremo sur — no son 10,2 km medidos desde O Porriño hacia el sur (esa cifra real es 8.508,2 m, ver DT-015).
**Problema:** La cifra en sí es correcta (coincide con "Extensión sur... 4,7549 km → 10,2175 km" documentado en el histórico de la tarea), pero el paréntesis "(al sur de O Porriño)" puede leerse como si los 10,2 km fueran íntegramente al sur del centro de O Porriño, cuando en realidad incluyen también el tramo ya existente entre el inicio original (al norte del centro) y el centro mismo.
**Impacto:** Puramente documental/cosmético — no afecta a ningún cálculo, solo a la claridad de un comentario de propiedades del GeoJSON que no llega al cliente (no es `traza-mapa.geojson`).
**Solución propuesta:** Reformular a algo como "Los primeros ~10,2 km del corredor (desde el inicio original de la traza, incluyendo el tramo que atraviesa O Porriño) proceden del KML..." para no sugerir que toda la cifra es sur del centro.
**Prioridad:** Baja.

---

## Modo libre (DT-016): el trazado en vivo del mapa solo capta 1 punto GPS por ventana de polling (30 s)

**Fecha:** 2026-08-07
**Contexto:** Generado al implementar el modo de intento "libre" (DT-016, `docs/tecnico/decisiones-tecnicas.md`). El contrato `ProgresoPublico` (rama libre) solo expone `ultimaPosicion` (la posición más reciente), no un histórico — decisión explícita de DT-016 para no ampliar el contrato público. Para pintar en el mapa "el trazado de puntos GPS recibidos, conectados según van llegando" en modo "durante" sin añadir un endpoint público nuevo ni exponer el histórico completo en `ProgresoPublico`, la solución adoptada carga el histórico completo una vez server-side (carga inicial de página) y luego, en cada poll de 30 s a `GET /api/progreso` (ya existente, DT-007), añade al trazado la `ultimaPosicion` si su `ts` cambió respecto al último punto conocido.
**Problema:** Si el tracker GPS envía más de un punto dentro de la misma ventana de 30 s entre dos polls, el cliente solo llega a ver y añadir al trazado visual el último de esos puntos — los intermedios quedan guardados en BD (no se pierde ningún dato real) pero no aparecen en la polilínea que ve el espectador hasta que la página se recargue (momento en el que la carga inicial sí trae el histórico completo).
**Impacto:** Cosmético — el trazado en vivo puede verse ligeramente menos denso/suave de lo que realmente caminó/condujo la persona en modo libre, solo durante el tramo entre la última recarga de página y el momento actual. No afecta a `distanciaRestanteKm` (siempre se calcula sobre la posición real más reciente en BD, no sobre el trazado del mapa) ni a ningún dato mostrado a terceros.
**Solución propuesta:** Si en uso real se nota el trazado demasiado disperso, añadir un endpoint público ligero (`GET /api/puntos-gps` o similar, con el mismo criterio de RLS/rate limiting que el resto de endpoints públicos) que devuelva los puntos nuevos desde un cursor (mismo patrón que `despuesDeId` de `GET /api/minuto-a-minuto`, DT-013), y que `ModoDuranteLibre.tsx` haga polling a ese endpoint en vez de derivar el trazado únicamente de `ultimaPosicion`.
**Prioridad:** Baja — cosmético, modo libre es una feature nueva sin uso real todavía que lo confirme como problema.

---

## `docs/producto/funcionalidades.md`, `roadmap.md` y `decisiones-producto.md` no reflejan el modo de intento configurable (guiado/libre)

**Fecha:** 2026-08-07
**Contexto:** Detectado por el Reviewer en la revisión de "Modo de intento configurable (guiado / libre con destino en línea recta)" (DT-016). La feature está completamente implementada y bien documentada en `CHANGELOG.md`, `docs/tecnico/arquitectura.md` y `docs/tecnico/modelo-datos.md`, pero `docs/producto/funcionalidades.md` sigue describiendo la web pública solo en términos del modo guiado (barra de progreso, km andados/restantes, sin ninguna mención al modo libre ni a la distancia restante en línea recta) y `docs/producto/decisiones-producto.md` no tiene ninguna entrada sobre la decisión de producto de ofrecer un modo de intento configurable. `roadmap.md` tampoco menciona la idea en ningún punto, ni antes ni después de implementarla.
**Problema:** Documentación de producto desactualizada respecto al estado real del sistema — mismo patrón ya registrado antes en este archivo para "Minuto a minuto" (ver entrada de 2026-08-02, ya cerrada por el Agente de Producto). Un lector de `funcionalidades.md` (incluido el propio Agente de Producto en una tarea futura) no sabría, sin cruzar con `docs/tecnico/`, que el modo libre existe.
**Impacto:** Puramente documental — cero efecto en comportamiento. Reduce la fiabilidad de la documentación de producto como fuente de verdad de qué existe ya en el producto. Es la segunda vez que este patrón ocurre (ver `docs/LESSONS.md`, entrada sobre documentación de producto no actualizada tras features cerradas sin pasar por el Agente de Producto).
**Solución propuesta:** El Agente de Producto debe añadir una sección a `funcionalidades.md` describiendo el modo libre desde la perspectiva del usuario (qué ve, en qué se diferencia de "durante"/"llegada" guiado), y una entrada en `decisiones-producto.md` con la decisión de ofrecer un modo configurable al iniciar.
**Prioridad:** Baja.

---
