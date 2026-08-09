# Decisiones técnicas

Log permanente de decisiones de arquitectura. Cada entrada: qué se decidió, qué
alternativas se valoraron, por qué se eligió, fecha.

---

## DT-001 — Dos representaciones de la traza: cálculo y pintado

**Fecha:** 2026-07-30 · **Tarea:** F1 — Base

**Decisión.** La traza vive en dos ficheros con responsabilidades distintas:

| | Cálculo | Pintado |
|---|---|---|
| Fichero | `lib/traza/traza.geojson` | `lib/traza/traza-mapa.geojson` |
| Puntos | 7.121 (sin simplificar, traza extendida DT-005) | ~2.011 (Douglas-Peucker, 3 m) |
| Peso | ~147 KB | ~42 KB (~16 KB gzip) |
| Dónde se usa | Solo servidor (`proyeccion.ts`) | Se envía al navegador (mapa, F3) |
| Exactitud | Longitud real, intocable | ±3 m, estética |

> Nota (DT-015, 2026-08-07): la fila "Puntos" de esta tabla es la cifra en la
> fecha de esta decisión. DT-015 corrige la extensión sur del corredor y las
> cifras vigentes pasan a 7.951 puntos / 110,43 km (cálculo). El reparto en
> dos ficheros con estas responsabilidades no cambia — solo el punto de
> corte al sur.

**Por qué.** Douglas-Peucker corta esquinas y por tanto **siempre acorta la
línea**. Medido sobre nuestra traza real **antes de la extensión sur de F1.1**
(6.911 puntos, 100 km) — el análisis sigue siendo válido, las cifras son históricas:

| Tolerancia | Puntos | Longitud | Pérdida |
|---|---|---|---|
| — | 6.911 | 100,0008 km | — |
| 1 m | 3.198 | 99,934 km | −67 m |
| 3 m | 1.724 | 99,662 km | −339 m |
| 5 m | 1.302 | 99,419 km | −582 m |
| 10 m | 829 | 98,769 km | −1.232 m |

Una tolerancia de 5 m es visualmente invisible en el mapa y aun así evapora
**582 metros**. Si el cálculo usara la traza simplificada, Santi llegaría al
Obradoiro y la web le diría que le faltan 600 m — el fallo más caro posible,
justo en el momento que justifica todo el proyecto.

**Consecuencia de diseño:** `proyeccion.ts` se ejecuta **en servidor**. Al
cliente solo viajan los números del `Progreso`, no la traza de cálculo.

**Alternativas valoradas.** Una sola traza simplificada (descartada: rompe la
distancia). Una sola traza completa enviada al cliente (descartada: 147 KB sobre
la cobertura móvil de la ruta, y el cálculo en cliente sería manipulable).

**Tolerancia elegida para el pintado: 3 m.** 5 m ahorra 9 KB y no compensa
arriesgar fidelidad visual en el elemento central del producto.

---

## DT-002 — La meta es la Praza do Obradoiro; la traza mide 100,21 km

> ⚠️ **DEROGADA parcialmente por DT-005** (2026-07-30). La meta en el Obradoiro
> y el tramo final manual siguen vigentes. Lo que decae es el punto de inicio y
> el objetivo de longitud: la traza ya no persigue una cifra, es un corredor.

**Fecha:** 2026-07-30 · **Tarea:** F1 — Base · **Decisión de producto de Santi**

**Contexto.** La traza oficial de la Xunta termina en **Praza da Quintana**,
detrás de la catedral, a 93 m en línea recta del Obradoiro (andando son ~210 m:
no se atraviesa la catedral, hay que rodearla). Tres objetivos que hasta ahora
eran compatibles dejaron de serlo:

```
(a) arrancar en el mojón físico del km 100
(b) terminar en la Praza do Obradoiro
(c) que el total sean 100,000 km exactos
```

**Decisión.** Se extiende la traza hasta el Obradoiro (+209,5 m) y **el inicio no
se mueve**. La traza pasa a medir **100,210 km**. Se renuncia a (c).

**Por qué.** 210 m sobre 100 km es un 0,2%. Mantener el inicio conserva el punto
ya calculado y validado contra el mojón, evita rehacer el recorte desde el KML
original, y deja un pelín de margen: se anda algo más de lo que se promete, nunca
menos. La cifra "100 km" es el nombre del reto, no una medición de precisión.

**Alternativas valoradas.**
- *Extender y recortar 210 m por el inicio* para mantener 100,000 km exactos.
  Descartada por Santi: mueve un punto de inicio ya bueno para ganar precisión
  simbólica.
- *Dejar la traza en Quintana* y pintar el Obradoiro como icono. Descartada: la
  barra marcaría 100% dos minutos antes de pisar la plaza.

**Deuda que genera.** Los ~210 m finales son geometría **dibujada a mano** (5
waypoints rodeando la catedral por Praza da Inmaculada), no dato oficial. Van
marcados con `tramo_final_manual: true` en las propiedades del GeoJSON y
registrados en `DEBT.md` para validar sobre el terreno.

**Waypoints del tramo manual** (lon, lat):

| # | Coordenada | Lugar | Tramo |
|---|---|---|---|
| 1 | -8.543659, 42.880599 | Fin de la traza oficial (Quintana) | — |
| 2 | -8.543850, 42.880950 | Quintana, extremo norte | 42,0 m |
| 3 | -8.544300, 42.881350 | Praza da Inmaculada (Azabachería) | 57,6 m |
| 4 | -8.544900, 42.881050 | Arco do Pazo de Xelmírez | 59,2 m |
| 5 | -8.544800, 42.880600 | **Praza do Obradoiro** | 50,7 m |

---

## DT-003 — `proyeccion.ts` es dominio puro con la traza inyectada

**Fecha:** 2026-07-30 · **Tarea:** F1 — Base

**Decisión.** API en dos piezas:

```ts
prepararTraza(geojson): TrazaPreparada      // km acumulados por vértice, una vez
calcularProgreso(historico, traza): Progreso
```

Sin I/O, sin lectura de ficheros, sin `Date.now()` implícito. La traza entra como
parámetro.

**Por qué.** Los tests se escriben con trazas sintéticas de 3 puntos en vez de
depender del GeoJSON real de 7.951 vértices (estado actual tras DT-015; eran
7.121 tras DT-005, 6.911 antes de la extensión sur de F1.1): fixtures legibles
y fallos que señalan la línea exacta del bug. `prepararTraza` separada evita
recalcular las distancias acumuladas en cada petición (el día del reto habrá
~3.600 posiciones).

---

## DT-004 — Umbrales del dominio en un único módulo

**Fecha:** 2026-07-30 · **Tarea:** F1 — Base

| Constante | Valor | Razón |
|---|---|---|
| `EN_RUTA_MAX_M` | 50 m | El error típico de GPS urbano es de 10-30 m |
| `DESVIO_MENOR_MAX_M` | 250 m | Por encima ya no es ruido: se ha ido por otra calle |
| `VELOCIDAD_MAX_KMH` | 15 km/h | Andando + margen. Por encima es salto de GPS |
| `PRECISION_MAX_M` | 150 m | Puntos más imprecisos no suman al odómetro |

**Por qué en un módulo propio.** El día del reto puede hacer falta ajustar un
umbral en caliente. Buscarlos esparcidos por el código, con el reloj corriendo y
Santi andando, es exactamente lo que no queremos.

---

## DT-005 — La traza es un corredor, no un recorrido: se extiende al sur y el progreso se ancla al inicio real

**Fecha:** 2026-07-30 · **Tarea:** F1.1 — Ajuste de traza y anclaje
**Deroga:** el punto de inicio y el objetivo de longitud de DT-002

**Decisión de producto de Santi.** El reto debe **arrancar en un mojón físico
cuya cifra grabada sea ≥ 100 km**. Y, textualmente: *"la ruta empieza donde yo le
dé a iniciar"* y *"debe mostrar que llevo lo que lleve y que me queda lo
calculado; debemos hacerlo de manera que empiece antes de los 100 km
calculados"*.

### El problema

El inicio actual de la traza está 1,7 km al **norte** de O Porriño siguiendo la
ruta. En la escala de los mojones eso es ≈98,7 km: **incumple el criterio**.

Y no se puede corregir con precisión, por dos motivos independientes:

1. **Las coordenadas de los mojones no existen en ningún dataset público.** El
   dataset de la Xunta solo publica los trazados de etapa; OpenStreetMap en esa
   zona solo tiene mojones de carretera (AP-9V, AG-46). Único ancla documentada
   encontrada: el mojón **99,408**, donde el Camino abandona la N-550 para
   entrar en O Porriño por la rúa Manuel Rodríguez.
2. **Nuestra medición y la grabada en las piedras no coinciden.** Contrastando
   hitos contra las distancias oficiales de etapa, nuestra traza mide de más de
   forma creciente hacia el sur:

   | Hito | Restante s/ traza | Guías | Desvío |
   |---|---|---|---|
   | Padrón | 25,310 km | 23,7 | +1,61 |
   | Caldas de Reis | 44,411 km | 42,3 | +2,11 |
   | Pontevedra | 65,690 km | 63,4 | +2,29 |
   | Redondela | 85,495 km | 83,0 | +2,49 |
   | O Porriño | 101,92 km | 98,2 | +3,72 |

   **No es un fallo de la traza**: se verificó que no se solapa consigo misma en
   ningún punto (0 zonas de repaso), así que no hay tramos duplicados del KML.
   Es la diferencia normal entre un track GPS detallado y las distancias de
   etapa redondeadas de las guías.

### La decisión

**1. La traza se extiende ~4,7 km hacia el sur**, atravesando O Porriño en
dirección Tui, hasta ~3 km al sur del centro. Total ≈ **105 km**.

En vez de acertar el mojón exacto —imposible con los datos disponibles— se
ensancha la red: con 105 km, el punto donde una piedra pone `100` queda dentro de
la traza incluso en el escenario de desfase más pesimista (+3,7 km).

**2. El progreso se ancla al primer punto del intento, no al origen de la traza.**
El porcentaje se mide desde donde Santi pulsa Iniciar hasta el Obradoiro. Sin
esto, con la traza empezando 4,7 km antes, la barra marcaría ~4,5% antes de dar
un paso. Odómetro y km restantes no cambian de semántica.

**3. Se abandona el objetivo de longitud exacta.** El compromiso pasa de "100,000
km exactos" a **"nunca menos de 100"**. Se anda algo más de lo que dice el
titular, nunca menos.

### Por qué esto es robusto

La traza deja de ser *el recorrido* y pasa a ser *el corredor previsto*. Eso la
hace inmune a las dos incógnitas que no podemos cerrar desde aquí (dónde está el
mojón y cuál es el desfase real de la escala grabada): el recorrido de verdad lo
define Santi al pulsar Iniciar.

### Alternativas valoradas

- *Localizar el mojón por investigación* (Wikiloc, fotos geolocalizadas, Street
  View). Descartada por Santi a favor de estimar: más lento y aun así incierto.
- *Estimar desde el mojón 99,408 y contar 500 m hacia atrás.* Encadena dos
  estimaciones (dónde está ese cruce y que el espaciado sea regular) para ganar
  una precisión que el diseño de corredor hace innecesaria.

### Deuda que genera

El día del reto, **la pantalla y las piedras no dirán el mismo número** (~1,5-3,7
km de diferencia). Se aparca deliberadamente hasta F3: cuando Santi ande la ruta
se podrán anotar mojones reales y calibrar con datos en vez de con estimaciones.
Registrado en `DEBT.md`.

---

## DT-006 — Defensa en dos capas contra el envenenamiento del ancla de progreso

**Fecha:** 2026-07-30 · **Tarea:** F2 — Datos e ingesta · **Decisión de producto de Santi**

**Contexto.** El Agente de Seguridad detectó en la revisión de F1.1 que el ancla
del porcentaje (el primer punto no descartado del histórico) determina el
denominador de todo el cálculo del intento. Si `/api/track` acepta un primer
punto falso muy adelantado en la traza, la barra queda fijada cerca del 100%
desde el arranque. Registrado inicialmente en `DEBT.md` como **irreversible sin
tocar la BD directamente**.

**Corrección de esa premisa.** `calcularProgreso` recalcula el ancla en cada
llamada como `validas[0]` — el primer punto con `descartado: false`. Si ese
punto se marca como descartado, el ancla salta automáticamente al siguiente
punto válido. **Es reversible desde el panel de admin, sin tocar la BD a mano.**

**El matiz real.** La especificación v1 solo prevé "descartar **último**
punto" (el más reciente), pensado para el caso típico de un salto de GPS que se
nota al momento. Si el punto envenenado queda enterrado bajo horas de datos
reales posteriores, ese botón no llega hasta él — aunque el modelo de datos sí
lo permite (`descartado` es un booleano por fila, sin restricción de cuál).

**Decisión.** Defensa en dos capas, cada una barata por separado:

1. **F2 — filtro de plausibilidad geográfica en `/api/track`.** Se rechaza
   (sin guardar, sin dar pistas al remitente) cualquier punto a más de **100 km**
   de la traza de cálculo. Es un margen deliberadamente generoso: cubre
   cualquier situación real (incluida la de un coche de apoyo puntual), y solo
   corta puntos verdaderamente absurdos o maliciosos. No debe interferir nunca
   con un desvío real de Santi.
2. **F4 — el botón de descartar pasa de "último punto" a "cualquier punto del
   histórico".** Mejora que además es útil por sí misma (Santi puede querer
   limpiar un punto raro de hace una hora, no solo el de ahora). Cierra el hueco
   que deja la capa 1 si algo la esquivara.

**Por qué las dos y no solo una.** Sin la capa 1, el endpoint queda
desprotegido durante toda la ventana entre que F2 se despliega y F4 existe. Sin
la capa 2, un punto envenenado que sí burlara el filtro geográfico (por ejemplo,
alguien con acceso al token insertando un punto dentro de esos 100 km pero muy
adelantado) seguiría sin tener arreglo si se descubre tarde.

**Alternativas valoradas.**
- *Umbral de 10 km* (propuesta inicial). Descartado por Santi a favor de más
  margen: prioriza no rechazar nunca un punto real por encima de un filtro más
  ajustado.
- *Solo capa 2, sin filtro en F2.* Descartada: deja el endpoint sin protección
  hasta que F4 esté construido y desplegado.
- *Solo capa 1, sin ampliar F4.* Descartada: no cierra el caso límite de un
  punto envenenado que se descubre después de haberse enterrado en el
  histórico.

**Actualiza `DEBT.md`**: la entrada de envenenamiento del ancla pasa de
"irreversible" a "reversible vía admin, con la ampliación de alcance de F4
descrita aquí"; prioridad se mantiene Alta hasta que ambas capas estén
implementadas.

---

## DT-007 — Web pública: polling + caché TTL en memoria en vez de Realtime o progreso incremental en BD

**Fecha:** 2026-07-31 · **Tarea:** F3 — Web pública · **Decisión de arquitectura**

**Contexto.** F3 necesita que "durante" refleje la posición y el progreso de
Santi con datos vivos, y que el muro de comentarios se actualice. Dos
decisiones relacionadas:

**1. Cómo llega el dato vivo al cliente.**

**Decisión:** *polling* del cliente a `GET /api/progreso` y `GET
/api/comentarios` cada 30 s, en vez de Supabase Realtime.

**Por qué.** `calcularProgreso` necesita `traza.geojson` (solo servidor, DT-001)
— un evento de Realtime en el cliente igualmente tendría que disparar una
llamada al servidor para recalcular, así que Realtime solo ahorraría el
intervalo fijo, no el coste real de cómputo. Con audiencia familiar/amigos,
30 s de retardo es imperceptible. Realtime añadiría gestión de conexión
(reconexión, cleanup) sin resolver el problema real.

**2. Coste de `calcularProgreso` en cada petición.**

`calcularProgreso` recorre todo el histórico de posiciones y proyecta cada
una sobre los ~7.951 segmentos de la traza (cifra tras DT-015; ~7.121 en la
fecha de esta decisión) — con ~3.600 posiciones al final del reto, hasta
~28M operaciones de distancia por llamada. Con varios
seguidores haciendo polling cada 30 s durante 24-30 h, esto se ejecutaría sin
caché justo cuando la web más tráfico tiene.

**Decisión:** caché en memoria de proceso con TTL corto (15-20 s) dentro de
`app/api/progreso/route.ts`. **No** se persiste progreso incremental en BD.

**Por qué.** La alternativa correcta "de verdad" (guardar el estado
acumulado — máximo histórico, odómetro, ancla — en `intentos` y actualizarlo
incrementalmente desde `/api/track`) cambiaría la firma de `calcularProgreso`
(dominio ya cerrado y testeado en F1, DT-003), la migración de F2 ya
verificada contra Supabase real, y el propio `/api/track`. Eso excede el
alcance aprobado para F3. La caché TTL en memoria resuelve el riesgo real
(recomputación repetida en ráfagas de polling) sin tocar nada fuera de F3.

**Alternativas valoradas.**
- *Supabase Realtime.* Descartada — no evita la recomputación, solo el
  intervalo; añade complejidad de conexión no justificada para este evento.
- *Progreso incremental persistido en BD (Opción C).* Descartada para F3 por
  alcance; ver `DEBT.md` — queda como el arreglo de fondo si la caché TTL
  resulta insuficiente el día del evento.

**Actualiza `DEBT.md`**: la entrada sobre el coste de `calcularProgreso` /
`kmAcumulados` sin usar pasa de "evaluar en F2" a "mitigado en F3 con caché
TTL en memoria; el arreglo de fondo (progreso incremental en BD) queda
pendiente si el TTL no basta en producción".

---

## DT-008 — Worker de MapLibre GL pre-empaquetado con esbuild, servido desde `public/`

**Fecha:** 2026-07-31 · **Tarea:** F3 — Web pública (bug post-cierre, PR #6) · **Decisión de arquitectura**

**Contexto.** El mapa base de MapTiler (calles/agua) no se pintaba en `Mapa.tsx`.
Investigación extensa (Debugger + Orquestador, con verificación directa en
consola/red del navegador real del usuario) encontró la causa raíz completa:

1. `maplibre-gl@6` calcula la URL de su Web Worker con un patrón
   `new URL(target-condicional, import.meta.url)` que Turbopack no resuelve
   bien (colapsa siempre al bundle principal). Fijar `config.WORKER_URL` a
   mano evita esto.
2. Pero apuntar `WORKER_URL` a cualquier fichero — de `node_modules` o de la
   propia app — referenciado como `new URL(literal, import.meta.url)` hace
   que Turbopack lo trate como **asset estático copiado en crudo**, sin
   bundlear sus imports internos. El propio worker de MapLibre importa
   `./maplibre-gl-shared.mjs` (sin hash de contenido); esa ruta nunca existe
   en el output (solo la versión con hash), así que el import falla con
   **404 dentro del contexto del worker** — confirmado con una captura real
   de la pestaña Network del usuario en la preview de Vercel desplegada.
3. Este fallo es **invisible desde el hilo principal**: `maplibre-gl` nunca
   engancha `worker.onerror` al `Worker` nativo, así que ni `window.onerror`,
   ni `map.on('error')`, ni la consola muestran nada. Solo se ve mirando
   directamente la pestaña Network.
4. Causa raíz de fondo, documentada en `node_modules/next/dist/docs/01-app/03-api-reference/08-turbopack.md`:
   Turbopack solo aplica su tratamiento especial de bundling de Web Workers
   cuando el propio código de la app contiene literalmente la expresión
   `new Worker(new URL(...))`. Como `maplibre-gl` construye el `Worker`
   internamente con una URL que le llega en tiempo de ejecución (vía
   `config.WORKER_URL`), Turbopack nunca puede aplicar ese análisis estático,
   sin importar desde qué fichero se referencie la URL.

**Decisión.** Pre-empaquetar el worker de MapLibre GL (y su dependencia
`maplibre-gl-shared.mjs`) en un único fichero autocontenido, sin ningún
import externo, usando `esbuild` en un script de build
(`scripts/bundle-maplibre-worker.ts`, patrón análogo a
`scripts/simplificar-traza.ts`). El resultado se sirve desde `public/`
(fichero estático servido tal cual por Next, sin pasar por el pipeline de
bundling de Turbopack) y `config.WORKER_URL` apunta a esa ruta pública fija
(`/maplibre-gl-worker.bundled.js`), sin `new URL(..., import.meta.url)` de
por medio.

**Por qué.** Al no tener ningún import interno que resolver, el fichero
pre-empaquetado es inmune a las dos limitaciones de Turbopack descritas
arriba. Servirlo desde `public/` evita por completo el pipeline de asset
bundling de Turbopack (que es precisamente la pieza que falla), en vez de
seguir intentando trabajar en contra de él.

**Alternativas valoradas.**
- *Bajar la versión de `maplibre-gl`.* Descartada: sin garantía de que una
  versión anterior no tenga el mismo problema con Turbopack (la causa raíz
  es de Turbopack + patrón de Worker en tiempo de ejecución, no específica
  de la v6), y obligaría a revalidar todo el mapa de nuevo.
- *Parchear el import a mano con un Blob en tiempo de ejecución* (fetch del
  código fuente del worker + reescritura de string del import + Blob URL).
  Descartada: frágil, dependiente de la estructura interna exacta del
  paquete (rompe con cualquier actualización de `maplibre-gl`), y es
  exactamente el tipo de "parche stringly-typed sobre código de terceros"
  que el framework desaconseja.

**Nueva dependencia:** `esbuild` (devDependency) + script de build que se
ejecuta antes de `dev`/`build` (`predev`/`prebuild` en `package.json`) o de
forma manual, según decida el Implementador — el artefacto generado
(`public/maplibre-gl-worker.bundled.js`) puede regenerarse o commitearse,
a criterio del Implementador, documentado en `README.md`/`AGENTS.md`.

---

## DT-009 — Perfil de elevación: dato estático generado una vez con Open-Elevation, commiteado

**Fecha:** 2026-07-31 · **Tarea:** Foto + perfil de elevación · **Decisión de arquitectura**

**Contexto.** Se pide mostrar distancia, desnivel (ascenso/descenso) y un
perfil de elevación de la ruta en el modo "Antes". La traza real no tiene
datos de altitud: el KML fuente de la Xunta trae elevación `0` en todos los
puntos (confirmado por inspección directa), así que hace falta una fuente
externa.

**Decisión.**
1. Nuevo script `scripts/generar-perfil-elevacion.ts`, ejecución **manual**
   (no enganchado a `predev`/`prebuild`). Remuestrea `traza-mapa.geojson`
   (traza de PINTADO, nunca la de cálculo — es contenido de visualización)
   a intervalos de ~1 km, consulta **Open-Elevation** (API pública, gratis,
   sin clave, endpoint de lote) en una sola petición, y escribe
   `lib/traza/perfil-elevacion.json`.
2. El artefacto generado **se commitea al repositorio**, igual que
   `traza-mapa.geojson` — no se regenera en cada build. La ruta es fija; no
   tiene sentido que cada deploy de Vercel dependa de la disponibilidad de
   una API externa de terceros para un dato que no cambia.
3. La web pública **nunca llama a Open-Elevation** — cero dependencia
   externa en producción, cero riesgo de indisponibilidad en el reto.

**Por qué Open-Elevation y no la API de MapTiler.** Ya hay cuenta/clave de
MapTiler, pero al ejecutarse una sola vez y nunca en producción, no compensa
generar dependencia de su cuota por un dato que se pide una vez y se
commitea. Open-Elevation no requiere clave ni gestión de cuenta.

**Alternativas valoradas.**
- *Regenerar el perfil en cada build (`predev`/`prebuild`, patrón DT-008).*
  Descartada: DT-008 lo hacía porque el artefacto depende de la versión
  instalada de una librería (`maplibre-gl`) que puede cambiar; aquí el dato
  depende de la geografía real de la ruta, que es fija. Regenerarlo siempre
  añadiría una dependencia de red externa a cada build sin ningún beneficio.
- *API de elevación de MapTiler.* Descartada por la razón de cuota/clave
  explicada arriba.

---

## DT-010 — Sesión de admin: cookie HMAC casera con `node:crypto`; corrección `middleware.ts` → `proxy.ts`

**Fecha:** 2026-07-31 · **Tarea:** F4 — Panel admin · **Decisión de arquitectura**

**Contexto.** F4 necesita proteger `/admin/*` con una sesión de admin único
(contraseña en `ADMIN_PASSWORD`). `docs/tecnico/arquitectura.md` documentaba
`middleware.ts` como el fichero que protegería esas rutas.

**Hallazgo previo a la decisión.** `middleware.ts` está deprecado desde
Next.js **16.0.0** y renombrado a `proxy.ts` (función exportada `proxy()`,
no `middleware()`) — confirmado en
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`,
no en la documentación de entrenamiento del modelo (aviso de `AGENTS.md`
sobre Next 16). `arquitectura.md` quedaba desactualizado en este punto desde
que se escribió en F1. Además, Proxy en Next 16 usa **runtime Node.js por
defecto** (antes Edge) — sin restricción para usar `node:crypto`. La propia
documentación de Next advierte: las Server Actions se sirven como POST a la
misma ruta donde se usan, así que un cambio de matcher en `proxy.ts` puede
dejarlas sin cobertura sin que se note — **cada Server Action debe verificar
la sesión por sí misma**, nunca asumir que `proxy.ts` ya lo hizo.

**Decisión — sesión.** `lib/auth/admin-session.ts`: cookie `HttpOnly` con
payload mínimo `{ exp: timestamp }` en base64url, firmado HMAC-SHA256
(`ADMIN_SESSION_SECRET`), verificado con `timingSafeEqual` — mismo patrón que
ya usa `/api/track` para `TRACK_TOKEN`. TTL 7 días, renovada en cada petición
válida a `/admin/*` desde `proxy.ts`. Cada función de
`app/admin/actions.ts` verifica la sesión ella misma antes de mutar nada.

**Decisión — fichero.** `proxy.ts` (no `middleware.ts`) protege `/admin/*`
excepto `/admin/login`.

**Por qué HMAC casero y no `jose`/JWT.** Un solo admin, sin roles ni claims
adicionales — un JWT completo resuelve un problema (multi-claim,
interoperabilidad) que este proyecto no tiene. El HMAC casero es igual de
seguro (mismo algoritmo por debajo) con cero dependencias nuevas y reutiliza
un patrón ya presente y revisado en el proyecto.

**Alternativas valoradas.**
- *JWT con `jose`.* Descartada: dependencia nueva sin beneficio real para un
  admin único.
- *TTL corto (horas) sin renovación.* Descartada: obligaría a Santi a volver
  a loguearse en pleno reto (24-30 h), justo el peor momento.
- *TTL muy largo (meses) o sin expiración.* Descartada: amplía innecesariamente
  la ventana de exposición si el móvil se pierde; las intenciones que protege
  la sesión son datos privados de terceros.

**Actualiza `arquitectura.md`**: `proxy.ts` sustituye a `middleware.ts` en la
tabla de estructura; se añaden `lib/auth/admin-session.ts` y
`components/admin/`.

---

## DT-011 — Rate limiting en memoria de proceso, sin infraestructura nueva

**Fecha:** 2026-08-01 · **Tarea:** F5 — Cierre · **Decisión de arquitectura**

**Contexto.** `DEBT.md` marca explícitamente "sin rate limiting" como bloqueante
antes de desplegar a producción real, en 6 endpoints: `POST /api/track`,
`POST /api/comentarios`, `GET /api/comentarios`, `POST /api/intenciones`,
`GET /api/progreso` y `POST /api/admin/login`.

**Opciones valoradas:**
- **Redis gestionado (Upstash vía `@upstash/ratelimit`).** Contador realmente
  compartido entre instancias/regiones. Descartada: exige dar de alta una
  cuenta/integración externa nueva y env vars adicionales, sobredimensionado
  para un proyecto Hobby con audiencia familiar/amigos de un solo día.
- **Reglas de rate limiting del Firewall de Vercel.** Sin tocar código.
  Descartada sin explorar más: las reglas personalizadas de rate limiting del
  Firewall son función de plan Pro; el proyecto es explícitamente Hobby.

**Decisión:** rate limiter en memoria de proceso, módulo compartido
`lib/rate-limit.ts` con una función genérica `consumir(clave, limite,
ventanaMs): boolean` sobre un `Map<string, {count, resetAt}>` en scope de
módulo. Cada ruta la llama con su propia clave (IP vía `x-forwarded-for` para
las públicas, token para `/api/track`) y su propio límite:

| Endpoint | Clave | Límite |
|---|---|---|
| `POST /api/track` | token | 40 req/min |
| `POST /api/comentarios` | IP | 10 req/min |
| `POST /api/intenciones` | IP | 10 req/min |
| `GET /api/progreso` | IP | 60 req/min |
| `GET /api/comentarios` | IP | 60 req/min |
| `POST /api/admin/login` | IP | 10 intentos/15 min |

**Por qué.** Mismo patrón ya validado en **DT-007** (caché TTL en memoria de
proceso en `/api/progreso`), coherente con el resto del proyecto. Coste cero,
sin dependencias ni cuentas nuevas. El riesgo real a mitigar —token filtrado o
spam puntual desde un mismo origen— no requiere precisión distribuida: el
límite es por clave (IP o token), así que una ráfaga de visitantes distintos
nunca se bloquea entre sí, solo se frena a quien excede su propio límite.

**Limitación conocida (aceptada, igual que DT-007):** el contador vive por
instancia de función serverless — no se comparte entre regiones ni sobrevive
a un cold start. Un atacante distribuido en múltiples instancias lo esquiva
parcialmente. Aceptable para el tráfico esperado (evento de un día, audiencia
familiar/amigos); si el tráfico real lo desborda, la solución de fondo es
migrar a un contador compartido (Upstash u otro), igual que ya se anticipa
para DT-007 en `DEBT.md`.

---

## DT-012 — Auto-refresco de fase: endpoint dedicado `GET /api/fase`, sin Realtime

**Fecha:** 2026-08-01 · **Tarea:** Auto-refresco de fase en la web pública · **Decisión de arquitectura**

**Contexto.** La web pública decide en servidor (`app/page.tsx`, Server
Component) qué modo mostrar (`antes`/`durante`/`llegada`) en cada petición.
Un visitante con la página ya cargada no ve el cambio de fase hasta que
refresca a mano. Se pide que la web detecte el cambio sola y recargue.

**Opción valorada y descartada:** reutilizar `GET /api/progreso` (ya
devuelve datos del intento activo) añadiéndole el campo `fase`. Descartada:
en modo "durante" habría dos pollings independientes al mismo endpoint cada
30 s (el de `ModoDurante` para el progreso, y el nuevo para la fase), y ese
endpoint ejecuta `calcularProgreso()` — caro — solo para exponer un campo
que no lo necesita.

**Decisión:** endpoint nuevo `GET /api/fase`, de responsabilidad única:
`select fase from intentos where not cerrado`, sin cálculo de progreso, sin
caché (la consulta ya es mínima). Rate limit 60 req/min por IP, mismo
criterio que `/api/progreso`/`/api/comentarios` GET (DT-011).

Un único componente cliente, `RefrescoAlCambiarFase` (`components/publico/`),
se renderiza una vez en `app/page.tsx` junto al modo activo, recibe la fase
actual como prop desde el servidor, hace polling a `/api/fase` cada 30 s
(mismo patrón e intervalo que DT-007) y ejecuta `window.location.reload()`
si la fase del servidor ya no coincide con la mostrada. No se modifica
`ModoAntes`, `ModoDurante` ni `ModoLlegada`.

**Por qué.** Sigue el patrón ya establecido en el proyecto: un endpoint por
responsabilidad (igual que `/api/track`, `/api/comentarios`,
`/api/intenciones`, `/api/progreso`, `/api/admin/login`), consulta mínima en
vez de reutilizar un cálculo caro para un dato que no lo necesita, y sin
introducir Realtime/WebSockets (coherente con DT-007: la audiencia
familiar/amigos no necesita menos de 30 s de latencia).

---

## DT-013 — Minuto a minuto: tabla scoped por intento, Storage público, polling (no Realtime)

**Fecha:** 2026-08-01 · **Tarea:** Minuto a minuto (feed en directo con fotos) · **Decisión de arquitectura**

**Contexto.** Nueva sección "Minuto a minuto" (idea de `roadmap.md`, hasta
ahora sin definir): entradas de texto + foto opcional + posición asociada,
publicadas solo por el admin, visibles en "durante" (en directo) y "llegada"
(recopilatorio), con clic → marcador temporal en el mapa. Mockup aprobado en
`design-sandbox/app/camino/{admin,durante}-minuto-a-minuto/page.tsx`.

**Decisiones sin alternativa real:**

1. **Fotos → Supabase Storage, bucket público** (`minuto-a-minuto`). Mismo
   proyecto Supabase ya existente, sin cuenta nueva. Todas las subidas pasan
   por Server Actions con el cliente `service role`, que bypassa RLS de
   Storage igual que bypassa RLS de BD — no hace falta ninguna política de
   Storage para `insert`. Bucket público porque nada de este contenido es
   privado (mismo criterio que `posiciones`/`comentarios`, ya públicos).
   Alternativas descartadas por el mismo motivo que DT-011 descartó Upstash:
   un servicio externo (Cloudinary) añade una cuenta nueva sin necesidad
   real; base64 en la fila degradaría cualquier consulta del feed.
2. **Tabla `minuto_a_minuto` con `intento_id` FK**, mismo patrón que
   `posiciones`: RLS de `anon` solo `SELECT` de entradas cuyo intento no esté
   `cerrado`, cero políticas de escritura para `anon` (solo `service role`
   vía Server Actions). "Reiniciar" resetea el feed automáticamente, sin
   código extra — coherente con que el resto de datos del intento también
   se resetean así.
   ```sql
   create table minuto_a_minuto (
     id          bigint generated always as identity primary key,
     intento_id  bigint not null references intentos(id),
     texto       text not null check (char_length(texto) between 1 and 500),
     foto_url    text,               -- URL pública de Storage; null = sin foto
     lat         double precision,   -- snapshot de la última posición al publicar
     lon         double precision,
     created_at  timestamptz not null default now(),
     updated_at  timestamptz not null default now()
   );
   create index minuto_a_minuto_intento_idx on minuto_a_minuto (intento_id, created_at desc);
   alter table minuto_a_minuto enable row level security;
   create policy "select_intento_activo" on minuto_a_minuto for select
     using (exists (select 1 from intentos where intentos.id = minuto_a_minuto.intento_id and not intentos.cerrado));
   ```
3. **"Editar" se limita a corregir el texto, no a cambiar la foto adjunta.**
   El mockup no especificaba el detalle de edición; para no gestionar
   borrado/reemplazo de objetos huérfanos en Storage (complejidad real sin
   beneficio para un evento de un día), si la foto está mal la solución es
   borrar la entrada y publicarla de nuevo.
4. **`Mapa.tsx` gana una prop opcional `puntoResaltado`** (`{lat, lon, hora}
   | null`), pintada por el overlay SVG existente igual que el resto de
   marcadores — aditiva, valor por defecto `null`, no cambia el
   comportamiento actual cuando no se usa.

**Decisión con tradeoffs — actualización en vivo en "durante":**
**Polling** de entradas nuevas cada 30 s (extiende DT-007), no Supabase
Realtime. Descartado Realtime por ser la primera vez que el proyecto lo
introduciría, con gestión de conexión/reconexión que DT-007 ya evitó
explícitamente por no aportar nada real a esta audiencia (30 s es
imperceptible para audiencia familiar/amigos mirando el móvil de vez en
cuando). En "llegada" el feed se carga una vez, sin polling (modo ya
diseñado para quedar congelado, ver `ModoLlegada.tsx`).

---

## DT-014 — Snapshot de posición de `crearMinutoAMinuto` desde la caché compartida de `/api/progreso`, no de una lectura fresca de `posiciones`

**Fecha:** 2026-08-02 · **Tarea:** Fix — coherencia entre el snapshot de "Minuto a minuto" y el mapa público · **Decisión de arquitectura (Opción A)**

**Contexto.** `crearMinutoAMinuto` (`app/admin/actions.ts`, DT-013) guardaba
el `lat`/`lon` de cada entrada nueva leyendo en fresco y sin caché la última
fila de `posiciones` (`SELECT lat, lon ... ORDER BY ts DESC LIMIT 1`). Pero
el mapa público muestra la posición servida por `GET /api/progreso`, que
tiene caché de hasta 20 s en servidor (DT-007) más polling de 30 s en
cliente. El resultado: una entrada podía quedar con una coordenada más
"adelantada" que la que el mapa está pintando en ese instante para
cualquier espectador — inconsistencia visible entre el feed y el mapa al
pinchar la entrada (`puntoResaltado`, DT-013).

**Decisión.** Extraer el estado de caché de `app/api/progreso/route.ts` a un
módulo compartido, `lib/progreso-cache.ts` (misma forma de datos
`{timestamp, valor: ProgresoPublico}`, mismas funciones de lectura/
escritura/limpieza, mismo `CACHE_TTL_MS = 20_000`). `route.ts` pasa a usar
ese módulo — su comportamiento externo (respuesta HTTP, TTL, rate limiting)
no cambia. `crearMinutoAMinuto` deja de consultar `posiciones` y lee en su
lugar `obtenerCacheProgreso()?.valor.ultimaPosicion`:

- Si hay caché con `ultimaPosicion` no nulo → usa ese `lat`/`lon`: es
  exactamente la coordenada que el mapa público está mostrando ahora mismo.
- Si no hay caché, o `ultimaPosicion` es `null` (nadie ha llamado a
  `/api/progreso` todavía en este proceso, o el intento no tiene ninguna
  posición aún) → la entrada se guarda con `lat: null, lon: null`, igual que
  el caso ya existente hoy de "aún no hay ninguna posición registrada".
  **Sin fallback a una lectura fresca de `posiciones`** — reintroducir ese
  fallback deshace el fix.
- No se comprueba el TTL al leer: cualquier valor presente es "lo último
  calculado/pintado" y es válido usarlo tal cual, esté o no dentro de su
  ventana de 20 s. El TTL solo determina si `/api/progreso` recalcula en la
  siguiente petición GET, no invalida retroactivamente un dato ya servido.

**Por qué.** Es la solución más simple que resuelve la causa raíz real (dos
fuentes de verdad para "la posición actual de Santi": la caché de
`/api/progreso` que ve el público, y una query directa que veía el admin)
sin tocar el esquema de BD ni el contrato de `/api/progreso`.

**Riesgo aceptado — no hay garantía entre invocaciones de funciones
serverless en Vercel.** Igual que DT-007/DT-011, esta caché vive en memoria
de proceso: no se comparte entre instancias ni regiones, no sobrevive a un
cold start. Si `crearMinutoAMinuto` se ejecuta en una instancia serverless
que nunca ha atendido una petición `GET /api/progreso` (o que tuvo un cold
start reciente), la caché está vacía y la entrada se guarda con `lat`/`lon`
a `null` — aunque haya posiciones reales en BD. Este es el mismo tipo de
limitación ya aceptada en DT-007 y DT-011, no una nueva categoría de riesgo
para el proyecto.

**Alternativas valoradas.**
- **Opción B (descartada por ahora): persistir el último snapshot en BD**
  (por ejemplo una fila `ultima_posicion_publica` en `intentos`, actualizada
  por `/api/progreso` en cada recálculo). Resolvería el riesgo de caché vacía
  entre instancias con garantía real, pero exige migración de esquema y
  escritura desde un GET público — mayor alcance para un fix cuyo síntoma es
  cosmético (desalineación de unos pocos metros/segundos entre feed y mapa,
  nunca datos incorrectos ni de otro intento).
- **Fallback a `posiciones` si la caché está vacía.** Descartada
  explícitamente: es exactamente el comportamiento que causaba el problema
  original — reintroduce la posibilidad de que la entrada quede "por
  delante" del mapa.

**Si en producción se observa demasiada frecuencia de `lat`/`lon` a `null`**
(por ejemplo, cold starts frecuentes en el entorno serverless de Vercel
durante el reto) habría que escalar a la Opción B — persistencia del
snapshot en `intentos`, con su propia migración y actualización desde
`/api/progreso`.

**Actualiza `arquitectura.md`**: se añade `lib/progreso-cache.ts` a la tabla
de estructura, y se documenta que es la fuente del snapshot de posición de
`crearMinutoAMinuto`, no `posiciones` directamente.

---

## DT-015 — La extensión sur usa la variante `t03v` en vez de `t03` (verificado contra GPX real); el corredor no persigue precisión de mojón

**Fecha:** 2026-08-07 · **Tarea:** Fix — corrección de la extensión sur del corredor (`scripts/simplificar-traza.ts`) · **Decisión de geometría, sin alternativas de diseño reales**

### 1. El fix de geometría

**Contexto.** DT-005 extiende el corredor ~4,7 km al sur de O Porriño usando
el tramo `CPO-e01t03-TUI-O_PORRIÑO(PolígonoIndustrial-OPorriño)` del KML
oficial de la Xunta (`docs/traza-source/doc.kml`, bloque índice 2, "t03"),
desde su índice 0 (centro de O Porriño) hasta su índice 126 (~3.046 m al
sur).

**Hallazgo.** Contrastado contra un track GPS real de un peregrino
(Wikiloc, `camino-de-santiago-portugues-1a-etapa-tui-porrino-2018.gpx`,
3.308 puntos, etapa Tui→O Porriño), `t03` se desvía del camino que se anda
de verdad de forma creciente hacia el sur: en su índice 126 (el corte
antiguo) la separación al punto más cercano del track real es **838,1 m**.
No es un caso aislado — la desviación crece de forma sostenida desde el
índice ~90 en adelante.

El mismo KML contiene una variante alternativa,
`CPO-e01t03v-TUI-O_PORRIÑO(TramoAlternativo-AsGándaras-Porriño)` (bloque
índice 3, "t03v", 863 puntos), que sí sigue el camino real en esa zona.

**Empalme exacto verificado.** El índice 0 de `t03v`
(lon −8,62272810062411, lat 42,14596909710470) coincide con el índice 94 de
`t03` con **distancia 0,00 m** — es una bifurcación literal del KML, no una
aproximación ni una coincidencia geográfica casual.

**Criterio de corte del extremo sur de `t03v`.** Se comparó (haversine) cada
uno de los 863 puntos de `t03v` contra el punto más cercano del track GPS
real, usando como vara de medir el orden de magnitud de los umbrales ya
validados del dominio (`lib/traza/umbrales.ts`: `EN_RUTA_MAX_M = 50`,
`DESVIO_MENOR_MAX_M = 250` — solo como referencia de fiabilidad geométrica
en este análisis puntual, no se editan ni se usan en runtime). Resultado:
la separación se mantiene siempre por debajo de 128 m en todo el bloque, con
un único pico de 127,8 m justo en el índice 0 (la propia bifurcación) que
baja a menos de 20 m hacia el índice 11, un segundo pico menor de hasta
93 m entre los índices ~430-448, y el resto casi siempre por debajo de
10-20 m. Nunca se acerca a `DESVIO_MENOR_MAX_M` (250 m). **Conclusión: se
usa el bloque `t03v` completo**, sus 863 puntos (índices 0 a 862).

**Composición resultante** (`scripts/simplificar-traza.ts`): `t03` desde el
centro de O Porriño (índice 0) hasta la bifurcación (índice 94) + `t03v`
completo desde la bifurcación hacia el sur (índices 0 a 862, sin duplicar el
punto de bifurcación). El nuevo corte sur queda a **8.508,2 m** del centro
de O Porriño (antes: 3.045,6 m) — el corredor se alarga, no se acorta.
Guardarraíl cumplido explícitamente antes de implementar.

**No se persigue el empalme con `t02`.** El extremo sur de `t03v` queda a
**1.358,9 m** del inicio del bloque `t02`
(`CPO-e01t02-TUI-O_PORRIÑO(PonteDasFebres-PolígonoIndustrial)`) — un tramo
sin conexión documentada en el KML entre ambos bloques. Fuera de alcance
deliberadamente: el corredor ya gana ~5,5 km de margen sur fiable con solo
`t03v`; cerrar ese hueco de 1,4 km exigiría o bien dibujar geometría manual
(mismo tipo de deuda ya aceptada para el tramo final norte, ver DT-002) o
investigar más bloques del KML sin verificación GPS disponible en esta
tarea. No aporta nada al objetivo real del corredor (dar margen sur
suficiente), así que no se persigue.

**Resultado tras regenerar (`pnpm simplificar-traza`):** `traza.geojson`
pasa de 7.121 a **7.951 puntos**, de **104,9684 km a 110,4310 km**
(+5.462,6 m, todo en la extensión sur). `traza-mapa.geojson` (pintado) pasa
a 2.101 puntos, 110,1328 km.

### 2. Aclaración de DT-005: el corredor no persigue precisión de mojón

DT-005 ya establece que el corredor es *"el recorrido previsto"*, no *"el
recorrido real"* — la precisión fina del progreso mostrado el día del reto
la resuelve el anclaje al primer punto GPS real del intento
(`calcularProgreso`, ancla en `validas[0]`, dominio cerrado y sin tocar en
esta tarea). Esta corrección de geometría **no busca acertar el mojón físico
"100 km"** — busca únicamente que el corredor tenga margen sur suficiente
para que `clasificarEstado` (`lib/traza/proyeccion.ts`) no muestre
`desvio-mayor` al primer punto real del intento, sea cual sea el punto
exacto donde Santi pulse Iniciar dentro de la zona corregida.

**Contexto no bloqueante — investigación de mojones reales.** Durante esta
tarea se localizaron en OpenStreetMap dos mojones del Camino Portugués
Central georreferenciados al norte de O Porriño (lat 42,1696, marcado
"97,602"; lat 42,1934, marcado "94,512"), ambos fuera de la zona corregida
por este fix. Se intentó usarlos para calibrar el desfase entre la traza y
la escala grabada en piedra (mismo problema documentado en DT-005 y
`DEBT.md`), pero la calibración no fue concluyente con los dos únicos puntos
disponibles y no formaba parte del alcance aprobado de esta tarea — queda
como contexto para una futura tarea de calibración de mojones, no como
bloqueo de esta.

### Alternativas valoradas

- *Corregir solo el tramo más desviado de `t03` con geometría manual
  dibujada a mano.* Descartada: el KML oficial ya tiene un tramo real
  (`t03v`) verificado contra GPS — no hay motivo para dibujar a mano cuando
  existe dato oficial mejor.
- *Perseguir el empalme completo con `t02` para no dejar ningún hueco sin
  documentar.* Descartada por alcance: el corredor ya cumple su objetivo
  (margen sur suficiente) sin cerrar ese hueco; ver razonamiento arriba.
- *Recalibrar el mojón físico "100 km" con los dos mojones de OSM
  encontrados.* Descartada: dos puntos no bloqueantes y no concluyentes no
  justifican reabrir el diseño de "corredor con margen" que DT-005 ya
  resolvió con una solución más robusta (anclaje al primer punto real).

**Actualiza `arquitectura.md`**: tabla de las dos trazas con las cifras
nuevas (7.951 puntos, 110,43 km de cálculo / 110,13 km de pintado) y el
comentario de estructura de `traza.geojson`. **Actualiza `DEBT.md`**: sin
deuda nueva — el hueco de 1,4 km con `t02` y la calibración de mojón físico
ya estaban registrados (DEBT.md, entrada "Desfase entre la pantalla y las
piedras") y siguen igual de vigentes, sin cambio de prioridad.

---

## DT-016 — Modo de intento (guiado/libre): camino paralelo con tipos unión, sin tocar `proyeccion.ts`

**Fecha:** 2026-08-07 · **Tarea:** Feature — modo de intento configurable desde el admin · **Decisión de arquitectura (Opción B)**

**Contexto.** El usuario quiere poder elegir, al pulsar "Iniciar", entre el
modo actual ("guiado": progreso sobre la traza del Camino Portugués — %, km,
ritmo, ETA) y un modo nuevo ("libre": pensado para trazar otras rutas, en
cualquier lugar). En modo libre se fija un destino (lat/lon) al iniciar; la
web muestra solo la distancia restante en línea recta (haversine) hasta ese
destino, y el mapa dibuja únicamente el trazado de los puntos GPS recibidos,
sin ninguna línea de ruta de fondo. Dato decisivo: los puntos de modo libre
se aceptan y dibujan **sin validar si tienen sentido** (sin el rechazo por
velocidad implícita imposible que sí aplica `calcularProgreso()` en modo
guiado) — eso descarta reutilizar el dominio de progreso guiado con un flag
interno.

**Decisión.**
- Migración nueva: `intentos.modo` (`'guiado' | 'libre'`, default
  `'guiado'`) + `intentos.destino_lat`/`destino_lon` (nullable, solo se
  rellenan en modo libre). El modo se fija en `iniciarReto()` (transición
  `antes` → `durante`) y no cambia durante la vida del intento — para
  cambiarlo hace falta "Reiniciar".
- `ProgresoPublico` (`lib/types.ts`) pasa a ser una **unión discriminada** por
  `modo`: la rama `'guiado'` mantiene exactamente los campos actuales
  (`porcentaje`, `kmAvanzados`, `kmRestantes`, `odometroKm`, `estado`); la
  rama `'libre'` expone `distanciaRestanteKm: number | null`. `ultimaPosicion`
  se mantiene en ambas ramas (mismo nombre y tipo) para que
  `lib/progreso-cache.ts` y `crearMinutoAMinuto` (DT-014) sigan leyéndolo sin
  narrowing especial.
- Nueva función de dominio pura, fuera de `lib/traza/proyeccion.ts`
  (`proyeccion.ts` no se toca — dominio cerrado, DT-014/DT-015), que calcula
  `distanciaRestanteKm` con `haversineKm` entre la última posición no
  descartada y el destino. Sin corredor, sin rechazo de velocidad, sin
  anclaje de porcentaje.
- `app/page.tsx` bifurca una sola vez, arriba, según `intentoActivo.modo`,
  hacia componentes propios `ModoDuranteLibre`/`ModoLlegadaLibre` (no ramas
  condicionales dentro de `ModoDurante`/`ModoLlegada`).
- `components/mapa/Mapa.tsx` gana un prop `variante: "ruta" | "libre"` — en
  `"libre"` omite la traza de fondo y el overlay de color andado/restante, y
  solo dibuja la polilínea de los puntos recibidos. Reutiliza la
  inicialización de MapLibre/worker (la parte fràgil documentada en
  `docs/LESSONS.md`) en vez de duplicarla en un componente de mapa aparte.
- `app/api/track/route.ts`: se reordena para resolver primero
  `{id, modo}` del intento activo, y el filtro de plausibilidad geográfica de
  100 km (DT-006 capa 1) solo se aplica si `modo === 'guiado'`. En modo
  libre no hay traza contra la que comparar, así que el filtro queda
  desactivado por completo para ese intento.

**Por qué.** El requisito de "aceptar puntos sin validar" es estructuralmente
incompatible con reutilizar `calcularProgreso()` (que sí valida velocidad y
corredor). Separar el camino evita que una corrección futura del dominio
guiado afecte sin querer al modo libre (o viceversa), mantiene
`proyeccion.ts` como dominio puro cerrado, y el tipo unión hace imposible en
tiempo de compilación mezclar datos de un modo con la UI del otro — sin
opcionales sueltos ni `any`.

**Alternativas valoradas.**
- **Opción A (descartada): rama condicional dentro de los componentes
  existentes**, con `ProgresoPublico` de campos opcionales. Descartada
  porque llena los componentes de stats de `if (modo === 'libre')` y
  `?.`/`??`, y con TypeScript estricto los opcionales obligan a null-checks
  en cada consumidor aunque el modo ya se sepa en ese punto — viola el
  principio de responsabilidad única por archivo (framework, sección 7).
- **Reutilizar `calcularProgreso()` con un flag interno que desactive
  validación en modo libre.** Descartada: mezclar en una función de dominio
  cerrada dos conjuntos de invariantes incompatibles (guiado valida,
  libre no) es más frágil que mantenerlas separadas, y contradice el
  criterio ya aplicado en DT-014/DT-015 de no tocar `proyeccion.ts` sin
  necesidad real.

**Actualiza `arquitectura.md`** y **`modelo-datos.md`**: nueva migración,
campos nuevos de `intentos`, componentes nuevos de modo libre, y la nota de
que el filtro geográfico de `/api/track` es condicional al modo del intento.

---

## DT-017 — Fotos del minuto a minuto: compresión adaptativa en el navegador + reintento, sin subida directa a Storage

**Fecha:** 2026-08-09 · **Tarea:** Fix de la subida de fotos del minuto a minuto · **Decisión de arquitectura**

**Contexto.** Vercel rechaza en el edge, con `413` y
`x-vercel-error: FUNCTION_PAYLOAD_TOO_LARGE`, cualquier petición de más de
~4,5 MB, **antes de invocar la función**. Medido contra producción el
2026-08-08: body de 4,0 y 4,3 MB llegan a la función (`401`), body de 4,5 / 5
/ 6 MB devuelven `413`. Como la foto viaja dentro del `FormData` de la Server
Action `crearMinutoAMinuto` (DT-013), cualquier foto de más de ~4,4 MB nunca
llega a ejecutar código del proyecto. Durante la prueba real del 2026-08-07
esto dejó a Santi 2 h 30 min sin poder publicar fotos.

Dos creencias falsas que había codificadas en el proyecto y que esta decisión
corrige: (a) `experimental.serverActions.bodySizeLimit: "10mb"` en
`next.config.ts` no puede elevar el límite — es de aplicación, no de
plataforma; (b) `TAMANO_MAXIMO_BYTES = 8 MB` en `lib/supabase/storage.ts` era
inalcanzable, porque ninguna petición de ese tamaño llega a evaluarse.

**Decisión.** La foto se re-codifica en el navegador **antes** de enviarla,
con una escalera adaptativa que conserva el máximo de calidad que quepa en el
presupuesto, y el envío reintenta solo ante fallos de red.

1. **Escalera adaptativa, no parámetros fijos.** Se prueba primero
   **resolución nativa a calidad alta** y solo se baja un peldaño (calidad,
   luego dimensiones) si el resultado no cabe en el presupuesto. Medido sobre
   las 4 fotos reales del intento 10 (todas 4032×3024, 12,2 MP, originales de
   2,04 a 4,48 MB): a resolución completa y calidad 0,92 quedan en 1,72-3,42
   MB — es decir, **el caso normal conserva la resolución nativa intacta** y
   aun así baja del límite. Solo una foto excepcionalmente pesada llega a
   perder dimensiones, y solo lo justo.
2. **Presupuesto por debajo del corte de plataforma.** El objetivo del
   compresor y el `TAMANO_MAXIMO_BYTES` del servidor se fijan por debajo de
   los ~4,5 MB de Vercel, para que el límite que se aplique sea el nuestro,
   con nuestro mensaje, en vez del `413` mudo del edge.
3. **Degradación sin bloqueo.** Si el navegador no puede procesar la imagen,
   no se impide publicar: se intenta con el fichero original, y si ese
   tampoco cabe, el error sale en el móvil al instante, sin gastar una subida
   condenada a fallar por una conexión mala.
4. **Reintento automático con espera creciente**, y el composer nunca pierde
   el texto ni la foto al fallar. **Sin cola persistente**: iOS Safari no
   soporta Background Sync, así que ninguna web puede subir con la pantalla
   bloqueada — prometer "se envía cuando se pueda" en segundo plano sería
   falso. El reintento cubre lo que sí es posible: reanudar solo al volver a
   primer plano.

**Alternativas valoradas.**
- **Subida directa del navegador a Supabase Storage con signed upload URL
  (descartada).** Se salta el límite de Vercel y conserva el original íntegro,
  pero no resuelve el problema real: seguir mandando 4-8 MB por 4G rural
  durante 30 h es precisamente lo que falla. Además convierte un viaje de red
  en dos, añade un endpoint nuevo que proteger y limitar, deja objetos
  huérfanos en Storage si el segundo paso falla, y rompe la invariante de
  DT-013 ("todas las subidas pasan por Server Actions con `service role`")
  a pocos días del evento.
- **Compresión + subida directa como red de seguridad (descartada).** Cubre
  el caso de que la compresión no baje del límite, que con la escalera
  adaptativa no se da: todo el coste y el riesgo de la anterior para un caso
  que no ocurre.
- **Compresión fija a 1600 px (descartada tras medirlo).** Era la propuesta
  inicial. Los datos de arriba la desmontan: reduce 11x el tamaño cuando con
  1,9x ya se baja del límite, sacrificando resolución sin necesidad. La
  lección general queda en `docs/LESSONS.md`: en una foto de móvil el peso
  está sobre todo en el encoder, no en los píxeles — medir antes de elegir
  parámetros de compresión.

**No cambia** el contrato de `crearMinutoAMinuto` ni el esquema de BD ni las
políticas de Storage: la Server Action sigue recibiendo un `File` en el
`FormData` y subiendo con `service role`. Todo el cambio vive en el borde
cliente y en los umbrales.

### Nota de cierre (2026-08-09) — tres desviaciones respecto a lo aprobado arriba

Aprobadas por el Reviewer en la Ronda 1 de revisión. Se dejan escritas aquí
porque este documento es el registro permanente: el detalle completo estaba
solo en `docs/tareas/CURRENT.md`, que se archiva al cerrar la tarea.

1. **El contrato de `crearMinutoAMinuto` sí cambió: `Promise<void>` →
   `Promise<ResultadoPublicacion>`** (`{ ok: true } | { ok: false; mensaje }`,
   en `lib/types.ts`). El párrafo de arriba afirma lo contrario y se corrige
   aquí. **Por qué:** el punto 5 exige que Santi vea el motivo real del fallo,
   y con un `throw` eso es imposible en producción — Next redacta el mensaje
   de todo error lanzado en el servidor y lo sustituye por un texto genérico
   con digest, justo el "error genérico" que el prompt clarificado prohíbe. Es
   además lo que recomienda la propia guía de Next para errores esperados de
   formulario ("model expected errors as return values"). Lo que sí se
   mantiene intacto es lo que este DT declaraba fuera de alcance: sigue
   recibiendo un `File` en el `FormData`, subiendo con `service role`, sin
   tocar esquema ni políticas de Storage.

2. **El composer envía con `onSubmit` + `preventDefault`, no con
   `<form action={fn}>`.** React 19 solicita un reset del formulario *antes*
   de ejecutar una `action` de tipo función (`startHostTransition` llama a
   `requestFormReset` y después a la acción), y ese reset se aplica al
   terminar la transición, haya ido bien o mal. Con `action`, al fallar el
   envío se vaciaría el `<input type="file">` —no controlado— dejando la
   miniatura en pantalla sin fichero detrás: rompía el punto 4 ("si falla, no
   se pierde lo escrito").

3. **Los peldaños "a resolución nativa" están acotados a 4032 px de lado
   largo** (`LADO_LARGO_MAXIMO_PX`), no son ilimitados. **Por qué:** Safari en
   iOS limita el área de un `<canvas>` a 16.777.216 px y por encima de ese
   límite no lanza — `toBlob` devuelve un JPEG válido pero **en blanco**, que
   pasaría todas las validaciones de tamaño y se publicaría. Los iPhone
   recientes capturan a 24 MP (5712×4284) y pueden llegar a 48 MP. La cota se
   fija en 4032 px porque es el lado largo de las fotos de 12 MP sobre las que
   se midió la tabla de este DT: esas fotos siguen codificándose a resolución
   nativa byte por byte igual, y una foto de 24 o 48 MP acaba en 4032×3024,
   que es exactamente la resolución para la que existen las mediciones.

---

## DT-018 — Histórico de posiciones: paginación completa + proyección con ventana deslizante en `calcularProgreso`

**Fecha:** 2026-08-09 · **Tarea:** Corte a 1000 filas del histórico de posiciones · **Decisión de arquitectura**

**Contexto.** PostgREST (Supabase) limita a 1000 filas cualquier `SELECT` sin
`Range` explícito. Las dos consultas que alimentan el progreso y el mapa
(`app/api/progreso/route.ts`, `app/page.tsx`) piden el histórico completo sin
paginar. Verificado con la clave `anon` real: 564 puntos (2 h 21 min) del
intento 10 quedaron fuera de todo lo que el histórico alimenta —
`ultimaPosicion`, `odometroKm`, `porcentaje`/`kmAvanzados`/`kmRestantes`, la
polilínea del mapa en modo libre. En modo guiado real (30 h, ~7200 puntos a
15 s de cadencia), el corte llegaría a las ~4 h de empezar.

**Hallazgo que cambió el alcance de la tarea.** Medido con el algoritmo real
del proyecto (`tsx`, sin reimplementar nada) contra la traza real
(`traza.geojson`, 7951 vértices, 110,43 km) y un histórico sintético a ritmo
humano constante (4,5 km/h, cadencia 15 s — por debajo del umbral de 15 km/h
de `VELOCIDAD_MAX_KMH`, para que ningún punto se descarte y el benchmark mida
el camino real de `calcularProgreso`, no el atajo barato del rechazo por
velocidad):

| n (puntos) | `calcularProgreso` actual (full-scan por punto) |
|---|---|
| 2000 (≈ 8,3 h de reto) | 53,2-53,9 s |
| 7200 (≈ 30 h de reto, día completo) | **281,4 s (4,7 min)** |

**Arreglar solo el corte de 1000 filas habría sido peligroso, no una mejora.**
Con la paginación arreglada pero el algoritmo intacto, cada recálculo de
`/api/progreso` con el histórico de un día completo tardaría varios minutos —
muy por encima de cualquier timeout de función serverless (el proyecto no
declara `maxDuration`, así que aplica el límite por defecto de la plataforma).
La causa: `calcularProgreso` proyecta cada punto del histórico sobre **toda**
la traza con `@turf/nearest-point-on-line` (`O(n × m)`, con `m` = 7951
segmentos) — la misma complejidad ya señalada como deuda en `DEBT.md`
("`kmAcumulados` se calcula pero no se usa").

**Decisión — dos cambios, ninguno cambia el contrato externo de nada:**

1. **Paginación completa donde de verdad hace falta el histórico entero.**
   Función compartida que pagina con `.range()` en bucle hasta agotar
   (con tope de seguridad y logging si se alcanza, para no colgarse en
   silencio ante un caso patológico). Se usa en `calcularProgreso` (modo
   guiado, siempre necesita el histórico completo: el odómetro suma
   distancia real entre cada par consecutivo, y el máximo monótono se
   calcula sobre toda la secuencia) y en la construcción inicial de
   `puntosGps` del mapa en modo libre (`app/page.tsx`, solo en la carga de
   página).
2. **La ruta de polling en modo libre deja de pedir el histórico completo.**
   `calcularProgresoLibre` solo usa la posición no descartada más reciente
   — cambia a `.order(ts desc).limit(1)` en `/api/progreso`. Mismo
   resultado, sin traer miles de filas para quedarse con una.
3. **Proyección con ventana deslizante dentro de `calcularProgreso`** (el
   cambio que hace viable el punto 1 a escala de un día completo). Como el
   histórico se procesa en orden cronológico y una persona caminando no
   teletransporta, se mantiene el índice de traza del último punto
   proyectado y cada punto siguiente busca primero solo en una ventana de
   **±30 segmentos** (±≈417 m de corredor) alrededor de ese índice — con
   `@turf/nearest-point-on-line` sobre un *slice* de `traza.coordenadas`, no
   sobre la traza completa. Si la mejor coincidencia de la ventana queda a
   más de **300 m** (por encima de `DESVIO_MENOR_MAX_M`, así que cualquier
   punto en ruta o con desvío menor siempre se resuelve por ventana; solo un
   desvío mayor o un hueco de datos largo puede no encajar), se reintenta
   con un escaneo completo de la traza — igual que hace hoy el código sin
   ventana — y el índice se realinea desde ahí. La ventana y el umbral se
   suben a `lib/traza/umbrales.ts` como constantes nombradas (`VENTANA_...`,
   mismo criterio que el resto de umbrales: ajustables en caliente el día
   del reto si hiciera falta).

   **Medido con el algoritmo real, ventana ±30 / umbral 300 m:**

   | Escenario | Full-scan (actual) | Con ventana | Diferencia |
   |---|---|---|---|
   | 2000 puntos, marcha normal | 53,2-53,9 s | 0,71 s (75,2×) | odómetro 0,0000 km |
   | 7200 puntos, marcha normal (día completo) | 281,4 s | **2,87 s** | (extrapolado de lo anterior, mismo patrón) |
   | 500 puntos con desvío real de ~3 km (300 normal → 50 desviados → 150 reenganchados) | referencia | 0,0 s de diferencia perceptible, 3 escaneos completos de 500 | odómetro y `kmAvanzados` **idénticos** (0,0000 km), `separacionM` idéntico |

   El caso del desvío confirma que el mecanismo de respaldo (reintentar con
   escaneo completo) preserva la corrección exacta incluso cuando alguien se
   sale de la traza más allá de la ventana — nunca da un resultado distinto
   al del código actual, solo tarda más en ese caso puntual (raro, no es el
   estado estable de las 30 h).

**No cambia:** el contrato externo de `calcularProgreso` (mismo
`Posicion[]` + `TrazaPreparada` → mismo `Progreso`), `progreso-libre.ts`,
`separacionDeTrazaM` (llamada una vez por posición entrante en `/api/track`,
no en un bucle sobre el histórico — sin problema de escala, no se toca), ni
el esquema de BD.

**Alternativas valoradas.**
- **Paginar sin optimizar el algoritmo (descartada tras medirlo).** Era la
  propuesta inicial de esta tarea. Los datos de arriba la descartan: habría
  cambiado "el mapa se congela a las 4 h" por "el endpoint tarda minutos en
  responder ya desde la primera hora" — un fallo distinto, y peor, no una
  solución.
- **Persistir progreso incremental en `intentos`, actualizado en la
  ingesta (descartada).** Resuelve el mismo problema de raíz sin necesidad de
  recorrer el histórico en cada lectura, pero exige tocar el endpoint de
  ingesta y el esquema de BD, con migración, a días del reto — el mismo
  criterio de riesgo/alcance por el que ya se descartó en DT-007 (Opción C) y
  en la entrada de `DEBT.md` sobre `kmAcumulados`. La ventana deslizante logra
  la misma robustez (validada con los mismos datos: full-day baja de 281 s a
  2,87 s, dentro de cualquier presupuesto de timeout razonable) sin tocar
  ingesta ni esquema. Queda registrada como mejora de fondo si en producción
  real hiciera falta ir más allá.

**Actualiza `arquitectura.md`** con la función de paginación nueva, y
`umbrales.ts` con las dos constantes de la ventana.

### Nota de cierre (2026-08-09) — endurecimiento post-revisión de Seguridad (S1 + S2)

Aprobado por el Reviewer sin bloqueantes en la Ronda 1. El Agente de
Seguridad encontró 2 bloqueantes reales, ambos alrededor del propio
mecanismo de respaldo de la ventana deslizante — corregidos antes del
cierre. Se dejan escritos aquí porque este documento es el registro
permanente (mismo criterio que la nota de cierre de DT-017).

**El hallazgo.** El fallback a escaneo completo (arriba: "si la mejor
coincidencia de la ventana queda a más de 300 m, reintenta con un escaneo
completo") cuesta lo mismo por punto (~39 ms medidos) que el problema
original que esta tarea resuelve. Y ese umbral de 300 m
(`VENTANA_PROYECCION_FALLBACK_MAX_M`) es tres órdenes de magnitud más
estricto que el filtro de plausibilidad geográfica de `/api/track` (100 km,
`SEPARACION_TRAZA_MAX_KM`, DT-006). Eso deja un hueco: alguien con el token
de `/api/track` filtrado (riesgo residual ya aceptado en DT-006/DT-011, con
sus propias capas de defensa) puede mandar puntos deliberadamente a más de
300 m entre sí —pero dentro de esos 100 km, y a velocidad plausible
insertando huecos de tiempo— para forzar que cada punto dispare el escaneo
completo. Con el rate limit de 40 req/min (DT-011), ~300 puntos
(~8 min de envío) ya bastarían para que un solo recálculo de
`calcularProgreso` tardara ~11,7 s — por encima de cualquier timeout
serverless. Y como esos puntos quedan persistidos (no `descartado`), el
coste se repite en cada recálculo futuro, no solo una vez: la ventana,
pensada para resolver un problema de volumen, reabría el mismo problema por
una vía de contenido.

**S1 — tope de seguridad al número de fallbacks por llamada.** Nueva
constante `VENTANA_PROYECCION_MAX_FALLBACKS = 50` en `umbrales.ts`.
`calcularProgreso` mantiene un contador propio de la llamada (nunca a nivel
de módulo, para no filtrar estado entre invocaciones distintas); al agotar
el tope, los puntos restantes usan el resultado de la ventana tal cual
—aunque su separación supere el umbral de fiabilidad— en vez de seguir
pagando el escaneo completo, y se registra un único `console.warn` (mismo
patrón que el tope de seguridad de `lib/supabase/paginacion.ts`). Con ~39
ms/fallback, 50 fallbacks acotan el peor caso a ~2 s por invocación — muy
por encima de cuántas veces se desviaría Santi de verdad más de 300 m
durante 30 h reales (unas pocas, no cientos), y muy por debajo de cualquier
timeout serverless. Validado con benchmark adversarial real (no solo
diseño) en `lib/traza/proyeccion.ventana.test.ts`: 300 puntos con el
patrón exacto descrito arriba se calculan en ~1,1 s con el tope activo,
frente a varios segundos (réplica sin ventana ni tope, escalado
linealmente) sin él.

**S2 — la carga de página pública (`app/page.tsx`) amplificaba S1.** A
diferencia de `GET /api/progreso` (que ya usa la caché compartida
`lib/progreso-cache.ts`, TTL 15-20 s, DT-007/DT-014), `calcularProgresoDelIntento`
recalculaba desde cero en cada visita — cada visitante real durante un
ataque habría vuelto a disparar el cálculo caro. Se reutiliza la misma
caché compartida ya existente (consultar antes de calcular, guardar
después), sin infraestructura nueva: el invariante de que solo hay un
intento activo a la vez (`docs/tecnico/arquitectura.md`) hace seguro
compartir la caché entre `/api/progreso` y esta función, ya que ambas
calculan el progreso del mismo (único) intento en curso. `export const
dynamic = "force-dynamic"` no cambia — la página sigue siendo dinámica,
solo que dentro de la ventana de caché no repite el cálculo caro.

**No cambia nada del comportamiento validado en la decisión original**: la
ventana para el caso normal (no adversarial) sigue exactamente igual,
sin tocar; S1 y S2 son capas de defensa alrededor de ella, no un rediseño.
Los tests de `proyeccion.test.ts` y de la sección 1-4 de
`proyeccion.ventana.test.ts` (equivalencia numérica, desvío con reenganche,
hueco largo, rendimiento a escala de un día) siguen en verde sin cambios.

### Nota de cierre (2026-08-09) — el atajo `.limit(1)` de modo libre se revierte en la tarea de estadísticas de modo libre (CURRENT.md/DT-020)

Aprobada por el Orquestador tras el bloqueo mayor señalado por el
Implementador al ejecutar CURRENT.md (feature: tiempo en marcha, ritmo medio
y km caminados en modo libre). Se deja constancia aquí porque este documento
es el registro permanente (mismo criterio que las notas de cierre de
DT-017/DT-020).

**Lo que decía esta entrada:** en el punto 2 de la decisión original,
"la ruta de polling en modo libre deja de pedir el histórico completo" —
`calcularProgresoLibre` solo usaba la posición no descartada más reciente,
así que `calcularProgresoActual` (`lib/traza/progreso-actual.ts`) pedía
únicamente esa fila (`.order(ts desc).limit(1)`) en cada poll de 30 s, en
vez de paginar el histórico completo como sí hace modo guiado.

**Por qué se revierte:** CURRENT.md/DT-020 añade `odometroKm` a
`calcularProgresoLibre` — suma de `haversineKm` entre cada par consecutivo
de posiciones del histórico recibido. Con un histórico de una sola fila (el
atajo de este DT), ese cálculo no tiene ningún tramo que sumar y da siempre
0: la cifra "Caminados" (y el ritmo medio, que depende de ella) era correcta
en la carga inicial de página (`app/page.tsx`, que sí trae el histórico
completo) pero caía a 0 km en el primer poll y se quedaba ahí el resto de la
fase "durante" en modo libre — la premisa de esta optimización ("modo libre
solo necesita el último punto") dejó de ser cierta con la nueva feature.

**Por qué no reabre el hallazgo de Seguridad de este mismo DT (S1/S2):**
S1/S2 son específicos del mecanismo de ventana deslizante con fallback de
`calcularProgreso()` (modo **guiado**) — el vector de denegación de servicio
que motivó esos dos endurecimientos era forzar escaneos completos repetidos
de la traza (~39 ms cada uno). `calcularProgresoLibre` no proyecta nada
sobre ninguna traza: es una suma `O(n)` trivial de `haversineKm` sin Turf de
por medio, ninguna relación con ese vector. El único coste real de volver a
pedir el histórico completo en modo libre es el fetch paginado en sí, que ya
tenía su propio tope de seguridad independiente
(`MAX_PAGINAS` = 50 páginas / 50.000 filas, `lib/supabase/paginacion.ts`) y
queda además acotado por la misma caché compartida con TTL de 20 s que ya
paga modo guiado en cada recálculo (`lib/progreso-cache.ts`, DT-007) — mismo
orden de magnitud de coste que el modo guiado ya asume desde este mismo DT,
no un vector nuevo.

**Qué cambia en el código:** `lib/traza/progreso-actual.ts` — la rama de
modo libre pasa a usar el mismo `obtenerTodasLasFilas` (paginado ascendente
por `ts`) que ya usaba la rama de modo guiado, extraído a un helper interno
compartido `obtenerHistoricoCompleto`. Tests actualizados:
`lib/traza/progreso-actual.test.ts` y `app/api/progreso/route.test.ts`
verifican ahora que modo libre pagina con `.range()` (no `.limit(1)`) y que
`odometroKm` refleja el histórico completo — con guardarraíles explícitos
(`expect(limitMock).not.toHaveBeenCalled()`) para que una regresión futura a
este atajo no pase desapercibida.

---

## DT-019 — `crearMinutoAMinuto`: si la caché de progreso está vacía, recalcular en el momento (reutilizando el cálculo de `/api/progreso`), no leer `posiciones` en bruto

**Fecha:** 2026-08-09 · **Tarea:** Fix — entradas del minuto a minuto sin posición (`lat`/`lon` a `null`) · **Decisión de arquitectura**

**Contexto.** `crearMinutoAMinuto` (`app/admin/actions.ts`) lee la posición a
guardar de `lib/progreso-cache.ts` (DT-014), la misma caché en memoria de
proceso que usa `GET /api/progreso`. Esa caché no se comparte entre
instancias serverless (mismo patrón que DT-007/DT-011). En la prueba real
del 2026-08-07, las **16 de 16** entradas publicadas quedaron con
`lat`/`lon` a `null` — el 100 %, no el caso raro que preveía DT-014
("escalar si se observa con demasiada frecuencia"). Explicación más
probable: con poco tráfico público real ese día, casi nunca había una
petición `GET /api/progreso` reciente que hubiera calentado la caché de la
instancia que atendía cada publicación.

**Decisión.** Cuando la caché está vacía, `crearMinutoAMinuto` ya no se
rinde (`lat`/`lon` a `null`): **recalcula el progreso en el momento,
reutilizando la misma función que ya usa `GET /api/progreso`** para decidir
qué mostrar (`calcularProgresoActual`, hoy privada de
`app/api/progreso/route.ts`), extraída a un módulo compartido para que
ambos puntos de llamada la usen sin duplicar lógica. El resultado recalculado
también rellena la caché (`guardarCacheProgreso`), igual que hace hoy
`route.ts` — mismo comportamiento, dos disparadores posibles.

**Por qué esto y no una lectura en bruto de `posiciones` (la primera
propuesta, descartada tras la pregunta del usuario).** Una lectura directa
del último punto de `posiciones` puede diferir de lo que la web pública está
mostrando en ese instante: en modo guiado, `calcularProgreso` puede
descartar el último punto por velocidad implícita imposible (GPS erróneo) —
su `ultimaPosicion` no es siempre literalmente la última fila insertada.
Reutilizar `calcularProgresoActual` en vez de reimplementar una consulta
aparte garantiza que la entrada del feed queda **siempre** con la misma
coordenada que vería cualquier visitante recargando la web pública en ese
mismo instante — es decir, preserva exactamente el objetivo original de
DT-014 ("coincide con lo que el mapa público está mostrando"), incluso en el
camino de respaldo, no solo en el camino normal (caché caliente).

**Por qué no la Opción B de `DEBT.md` (persistir el snapshot en `intentos`
con migración).** Sigue siendo mayor alcance de lo que este bug necesita: el
100 % observado se explica enteramente por "nadie calentó la caché", y
recalcular bajo demanda lo resuelve sin tocar el esquema. Se descarta por el
mismo motivo que ya la descartó DT-014, reforzado por el precedente real de
este proyecto con una migración pendiente de aplicar a producción
(`0003_modo_intento`, ver `DEBT.md`/`BUGS.md`) — no repetir ese riesgo de
proceso a días del reto para un problema que no lo necesita.

**No cambia:** el camino normal (caché caliente) sigue siendo idéntico a
DT-014 — mismo TTL, misma fuente. El esquema de BD no se toca.

**Actualiza `arquitectura.md`** con el módulo nuevo de progreso compartido.

---

## DT-020 — Tiempo en marcha y ritmo medio: anclados al último punto GPS real, no a la hora del navegador de quien mira

**Fecha:** 2026-08-09 · **Tarea:** Añadir estadísticas al modo libre · **Decisión de arquitectura**

**Contexto.** Al diseñar las estadísticas nuevas para el modo libre, el
usuario señaló un problema que también existe hoy en el modo guiado ya en
producción: `ModoDurante.tsx` calcula "tiempo en marcha" y "ritmo medio"
usando la **hora actual del navegador de quien está mirando la web**
(`ahora`, un `Date` que se actualiza cada 60 s en el cliente), no el momento
del último dato real recibido de Santi.

**Problema concreto.** Si el móvil deja de enviar señal (batería agotada,
sin cobertura — un riesgo real en 30 h de camino rural), "tiempo en marcha"
sigue subiendo con el reloj de quien mira, y "ritmo medio" se desploma
artificialmente (se divide entre más horas de las que realmente hay datos),
aunque no haya pasado nada nuevo desde el último punto GPS real. El número
en pantalla dejaría de reflejar el reto real para reflejar cuánto rato lleva
la pestaña del navegador abierta.

**Decisión.** Tiempo en marcha y ritmo medio se calculan siempre con el
timestamp del **último punto GPS recibido** (`ultimaPosicion.ts`, ya
presente en `ProgresoPublico` en ambos modos) como referencia final, nunca
con `Date.now()`/`new Date()` del cliente. Aplica a los dos modos:

- **Modo guiado, "durante"** (`ModoDurante.tsx`): sus funciones privadas
  `formatearTiempoEnMarcha(iniciadoEn, ahora)` y
  `calcularRitmoMedio(odometroKm, iniciadoEn, ahora)` pasan a recibir
  `progreso.ultimaPosicion?.ts ?? null` como referencia final, no `ahora`.
- **Modo libre, "durante"** (`ModoDuranteLibre.tsx`, nuevo): mismo criterio
  desde el principio, sin heredar el problema.
- **Ambos, "llegada"**: sin cambios de fondo — ya usan `ended_at` (un
  timestamp real de BD, no la hora actual), así que ya cumplían este
  criterio antes de esta decisión.

**Reutilización, no triplicación.** `lib/ritmo.ts` ya tenía
`calcularRitmoMedioIntento(odometroKm, iniciadoEn, finalizadoEn)`, genérica
y ya usada por `ModoLlegada.tsx` — se reutiliza tal cual para el ritmo en
los dos "durante" nuevos/corregidos, pasando `ultimaPosicion?.ts` como
`finalizadoEn` en vez de `ended_at`. Se añade a `lib/ritmo.ts` una función
hermana para formatear el tiempo transcurrido ("H:MM") con la misma forma
de parámetros (`iniciadoEn`, `finalizadoEn`), sustituyendo a la función
privada de `ModoDurante.tsx` — cierra de paso (para los "durante") la
duplicación ya registrada en `DEBT.md` ("`calcularRitmoMedioIntento` y sus
equivalentes"), sin necesidad de abrir esa entrada como tarea aparte.

**Qué queda deliberadamente fuera:** `formatearTiempoTotal` en `app/page.tsx`
(usada por `ModoLlegada.tsx`) ya usa dos timestamps reales
(`started_at`/`ended_at`), sin `ahora` de por medio — no tiene el bug que
esta decisión corrige, así que no es obligatorio migrarla a la función
compartida nueva en esta tarea. Queda como candidato de limpieza futura, no
como deuda nueva (no hay comportamiento incorrecto que registrar).

**Por qué corregir el modo guiado en esta misma tarea (no aparte).** Es
exactamente el mismo bug de fondo en dos sitios, y el modo guiado es el que
se usará en el reto real — dejarlo para "más adelante" habría significado
llevar el problema real al día del evento a cambio de nada (el fix es
igual de barato en los dos sitios, mismo patrón, misma función compartida).

### Nota de cierre (2026-08-09) — una ambigüedad resuelta y un bloqueo mayor encontrado, no corregido en esta tarea

Aprobado por el Implementador durante la ejecución de CURRENT.md. Se dejan
escritas aquí dos cosas que no vivían en el análisis original de DT-020,
porque este documento es el registro permanente (mismo criterio que las
notas de cierre de DT-017/DT-018).

1. **Ambigüedad resuelta: tiempo en marcha sin ninguna posición GPS
   todavía.** El "Comportamiento en casos límite" original de
   `docs/tareas/CURRENT.md` (escrito antes del hallazgo de DT-020) decía que
   el tiempo en marcha "se puede calcular igualmente (depende de
   `started_at`, no de posiciones)" mientras no hubiera ninguna posición. Esa
   frase describe el comportamiento **previo** a esta decisión (cuando la
   referencia final era `ahora`, que no depende de haber recibido ningún
   punto GPS). Con la regla de este DT ("nunca `Date.now()`/`new Date()` del
   cliente, siempre la referencia final que corresponda"), sin ninguna
   posición no hay ninguna referencia final real (`ultimaPosicion` es
   `null`), así que tanto tiempo en marcha como ritmo medio dan "—" hasta que
   llega el primer punto — mismo criterio para las dos cifras, sin
   excepción. Se resuelve así por coherencia con el propio espíritu del DT
   (nunca inventar una referencia temporal que no sea un dato real) y porque
   mantener una excepción solo para "sin posición todavía" habría exigido
   volver a leer `ahora` justo en el caso que este DT identifica como el más
   sensible (arranque del intento, antes de la primera señal GPS real).

2. **Bloqueo mayor encontrado, deliberadamente no corregido en esta tarea:**
   `calcularProgresoActual` (`lib/traza/progreso-actual.ts`) — usada por
   `GET /api/progreso` (el polling de 30 s que alimenta `ModoDuranteLibre.tsx`
   en directo) — pide para modo libre solo la última posición
   (`.limit(1)`, optimización de DT-018, correcta cuando modo libre no
   necesitaba más que el último punto). Con `odometroKm` añadido por esta
   tarea, ese atajo hace que el odómetro (y por tanto el ritmo medio) vuelva
   siempre a 0 en cada poll durante la fase "durante" de modo libre — la
   premisa de DT-018 para modo libre ("solo hace falta el último punto") deja
   de ser cierta con este DT. No se corrige aquí porque el fix (pedir el
   histórico completo también en modo libre, como ya hace modo guiado)
   toca un fichero y un comportamiento explícitamente probado (DT-018) fuera
   del alcance que aprobó el Arquitecto para esta tarea concreta, y revierte
   parcialmente una decisión de arquitectura ya tomada con implicaciones de
   coste durante las 30 h del reto real — corresponde que el Arquitecto lo
   revise, no que el Implementador lo decida en solitario. Detalle completo,
   impacto y solución propuesta en `DEBT.md` ("`GET /api/progreso` no puede
   reflejar `odometroKm` real en modo libre durante el polling en directo").

### Ampliación (2026-08-09) — "llegada" tampoco cumplía el criterio

El análisis original de DT-020 daba por bueno "llegada" en los dos modos
porque usa `ended_at` (un timestamp real de BD) en vez de `ahora` — pero
`ended_at` **tampoco es un dato de posición**: es el momento en que alguien
pulsa "Finalizar" en el panel de admin, que puede ir varios minutos por
detrás del último punto GPS real (Santi guarda el móvil al llegar, el admin
tarda en pulsar el botón mientras escribe el mensaje de llegada o
celebra). Ese hueco se contaba como tiempo caminado, alargando el tiempo
total y diluyendo el ritmo medio del resumen final — la misma familia de
problema que este DT identificó para "durante", solo que la referencia no
válida era `ended_at` en vez de `ahora`.

**Decisión:** `ModoLlegada.tsx` (guiado) y `ModoLlegadaLibre.tsx` (libre)
pasan también a usar `ultimaPosicion?.ts ?? null` como referencia final
para tiempo en marcha y ritmo medio, no `ended_at`. `started_at`/`ended_at`
siguen existiendo en BD sin cambios — solo cambia qué timestamp alimenta
estas dos cifras concretas. Mismo criterio de "sin posición → '—'" ya
establecido arriba para el caso sin ningún punto GPS en todo el intento.

Con esto, la regla de DT-020 ("nunca una referencia temporal que no sea un
dato de posición real") queda aplicada de forma completa y uniforme en las
cuatro pantallas (durante/llegada × guiado/libre), no solo en dos.
