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
depender del GeoJSON real de 7.121 vértices (estado actual; eran 6.911 antes de
la extensión sur de F1.1): fixtures legibles y fallos que señalan la línea exacta
del bug. `prepararTraza` separada evita recalcular las
distancias acumuladas en cada petición (el día del reto habrá ~3.600 posiciones).

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
una sobre los ~7.121 segmentos de la traza — con ~3.600 posiciones al final
del reto, hasta ~25M operaciones de distancia por llamada. Con varios
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
