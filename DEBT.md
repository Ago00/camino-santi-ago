# Deuda técnica

---

## Desfase entre la pantalla y las piedras: calibración aplazada a F3

**Fecha:** 2026-07-30
**Contexto:** Generado en F1.1 al adoptar el diseño de "corredor" (DT-005). La traza mide de más respecto a las distancias grabadas en los mojones físicos del Camino, con un desfase creciente hacia el sur (medido: +1,61 km en Padrón, +2,11 km en Caldas, +2,29 km en Pontevedra, +2,49 km en Redondela, +3,72 km en O Porriño). No es un error de la traza — es la diferencia entre un track GPS detallado y las distancias de etapa redondeadas de las guías.
**Problema:** El día del reto, cuando Santi pase junto a un mojón que pone "98" (por ejemplo), la web mostrará un número diferente. El desfase esperado es ~1,5-3,7 km según la zona. Esto puede ser confuso para los espectadores que conozcan los mojones físicos.
**Impacto:** Cosmético durante el reto: la barra y el odómetro son coherentes entre sí, pero no coinciden con la escala grabada en piedra. Santi ya está informado y lo acepta. El mayor riesgo es que un espectador malinterprete el número como un error técnico.
**Solución propuesta:** En F3, añadir al panel de admin la posibilidad de registrar mojones reales (número grabado + timestamp de paso) durante el reto. Con 2-3 mojones anotados se puede calibrar una función de corrección lineal que alinee la pantalla con las piedras para el resto del recorrido.
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

**Fecha:** 2026-07-30 · **Ampliada:** 2026-07-31, tarea F3
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
**Prioridad:** Media — no bloquea F2-F4, sí bloquea el despliegue real.

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
