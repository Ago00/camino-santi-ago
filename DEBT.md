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
**Prioridad:** Media (no bloquea F2-F4; debe evaluarse antes de F5 cuando se pruebe con historial real)

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

**Fecha:** 2026-07-30
**Contexto:** Detectado por el Agente de Seguridad en la revisión de F1. El tipo
`Progreso` incluye `ultimaPosicion: Posicion | null`, que es el tipo completo de
base de datos.
**Problema:** El tipo `Posicion` arrastra campos internos: `batt`, `acc`,
`intento_id`, `fuente` y `descartado`. Cuando F3 serialice `Progreso` hacia el
navegador, todos esos campos internos viajarán al cliente salvo que se filtren
de forma explícita. El proyecto publica la posición en tiempo real de una persona
real durante 30 horas, así que cada campo de más es superficie de exposición
innecesaria.
**Impacto:** No explota en F1 (no hay serialización hacia cliente aún), pero si
F3 serializa `Progreso` tal cual, el cliente recibirá metadatos internos del
tracker GPS (nivel de batería, precisión GPS, fuente del dato, flag de descarte).
En el peor caso, revela información sobre el hardware del dispositivo de rastreo
y el estado interno del sistema.
**Solución propuesta:** Definir en F3 un tipo `ProgresoPublico` que proyecte solo
lo que la web pública necesita (`lat`, `lon`, `ts`) antes de enviarlo al cliente.
La proyección debe hacerse explícitamente en la capa de servidor (Server Component
o route handler), nunca en el cliente.
**Prioridad:** Media — no explota en F1, pero debe resolverse antes de que la web
pública salga a producción.

---

## Envenenamiento del ancla de progreso desde el endpoint de ingesta (F2)

**Fecha:** 2026-07-30 · **Corregida (parcialmente):** 2026-07-30, tarea F2
**Contexto:** Detectado por el Agente de Seguridad en la revisión de F1.1. El ancla del porcentaje se fija con el primer punto no descartado del histórico y determina el denominador de todo el cálculo del intento. En F2 el histórico se alimenta desde `/api/track`, un endpoint accesible desde internet. Ver **DT-006** en `docs/tecnico/decisiones-tecnicas.md` para el análisis completo y la decisión de defensa en dos capas.
**Problema (corrección de la premisa original):** Esta entrada decía "irreversible sin tocar la BD directamente". Es incorrecto: `calcularProgreso` recalcula el ancla en cada llamada como `validas[0]` (primer punto con `descartado: false`), así que marcar el punto envenenado como `descartado` desde el panel de admin lo repara sin tocar la BD a mano — **es reversible vía admin**. El problema real y más matizado: la especificación v1 solo prevé un botón de "descartar último punto", que no llega a un punto envenenado si queda enterrado bajo datos posteriores.
**Impacto:** Si un tercero consigue insertar un primer punto muy adelantado en la traza (p. ej. km 104 con Santi en el km 0), la barra queda fijada cerca del 100% hasta que se descarte ese punto desde el panel. Con el filtro geográfico de F2 (ver más abajo) el vector de "punto absurdamente lejano" queda cerrado; sigue abierto el caso límite de un punto dentro de rango pero adelantado, insertado por alguien con el token, si se descubre tarde y el botón de F4 solo alcanza al último punto.
**Solución — estado tras F2:**
- **Capa 1 (F2, implementada):** filtro de plausibilidad geográfica en `/api/track` — se rechaza (sin guardar, sin dar pistas) cualquier punto a más de 100 km de la traza de cálculo. Ver `app/api/track/route.ts`, `lib/traza/umbrales.ts` (`SEPARACION_TRAZA_MAX_KM`) y sus tests en `app/api/track/route.test.ts`.
- **Capa 2 (F4, pendiente):** el botón de descartar debe ampliarse de "último punto" a "cualquier punto del histórico", para poder llegar a un punto envenenado aunque quede enterrado bajo horas de datos posteriores. Registrado en `docs/producto/roadmap.md`, sección F4.
**Prioridad:** Alta — se mantiene hasta que la capa 2 (F4) esté implementada. La capa 1 ya reduce drásticamente la superficie de ataque, pero el caso límite descrito arriba sigue sin cerrarse del todo.

---

## `/api/track` no valida el rango físico de `lat`/`lon`/`tst` en el schema Zod

**Fecha:** 2026-07-30 · **Resuelta:** 2026-07-30, ronda final de limpieza F2
**Contexto:** Detectado por el Reviewer en la revisión de F2. El schema `payloadOwnTracks` en `app/api/track/route.ts` validaba `lat`/`lon`/`tst` solo como `z.number()`, sin rango físico.
**Resolución:** `payloadOwnTracks` ahora exige `lat: z.number().min(-90).max(90)`, `lon: z.number().min(-180).max(180)` y `tst: z.number().positive()` (sin cota superior, para no mantener una fecha mágica). Sigue siendo el filtro geográfico de 100 km (DT-006) la defensa real contra el envenenamiento del ancla — esto es defensa adicional explícita por contrato, no un sustituto.
**Prioridad:** Cerrada.

---

## Sin rate limiting en `/api/track`

**Fecha:** 2026-07-30
**Contexto:** Detectado por el Agente de Seguridad en la revisión de F2 (auditoría OWASP Top 10, A04).
**Problema:** El endpoint de ingesta no tiene ningún límite de peticiones. No es bloqueante mientras el proyecto no esté desplegado (F0/Vercel pendiente), pero es condición explícita antes de exponer el endpoint a internet: un token filtrado sin límite permite spam de inserciones en `posiciones`, degradando el rendimiento y ensuciando el histórico (con impacto directo en el cálculo de progreso).
**Impacto:** No compromete la integridad del ancla (eso ya lo cubre DT-006), pero permite agotar cuota de BD y ensuciar el histórico visible en el panel de admin si el token se filtra (captura de la config de OwnTracks en el móvil, logs de Vercel, etc.).
**Solución propuesta:** Rate limiting a nivel de IP o de token en el propio route handler (o mediante la capa de Vercel/Edge si se dispone de ella), antes de F5 (cierre y deploy a producción).
**Prioridad:** Media — no bloquea F2, sí bloquea el despliegue real.

---
