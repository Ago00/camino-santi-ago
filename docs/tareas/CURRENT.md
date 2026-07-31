# Tarea en curso

## [Fix] Mapa base de MapTiler no pinta: Turbopack resuelve mal la URL del worker de MapLibre GL

**Origen:** Debugger (fix simple, sin análisis de arquitectura)

**Causa raíz:**
`maplibre-gl@6` calcula internamente la URL de su Web Worker (el script que
parsea las teselas vectoriales `.pbf`) a partir de `import.meta.url` del
propio módulo, con este patrón (código fuente real en
`node_modules/maplibre-gl/dist/maplibre-gl.mjs`):

```js
function fi(){
  let e = import.meta.url;
  if(!/^https?:/.test(e)) return "";
  let t = e.endsWith("-dev.mjs") ? "maplibre-gl-worker-dev.mjs" : "maplibre-gl-worker.mjs";
  return new URL(`./${t}`, e).href
}
```

Es un `new URL(target-dinámico-condicional, import.meta.url)`: el nombre del
fichero destino se decide en tiempo de ejecución entre dos posibles (`-dev` o
no). Los bundlers que soportan `new URL(..., import.meta.url)` (Webpack, Vite)
necesitan poder analizarlo estáticamente para saber qué asset emitir y
reescribir la referencia; Turbopack no resuelve bien este caso de doble target
condicional.

Verificado en el bundle real generado por `next dev` (Turbopack) — se
inspeccionó `.next/static/chunks/*.js`:

- El manifest de assets (`.next/static/chunks/1zcwv9r52rljo.js`) registra
  correctamente los ficheros: id `23325` → `maplibre-gl-dev.<hash>.mjs`
  (el bundle principal), id `21323` → `maplibre-gl-worker-dev.<hash>.mjs`
  (el worker real).
- La función equivalente a `fi()` en el chunk transformado por Turbopack
  (`.next/static/chunks/05sjgh8swjkrp.js`) queda así tras la transformación:

  ```js
  async function c7(){
    let i, r = tB.WORKER_URL || (
      i = cP.url,
      /^https?:/.test(i)
        ? (i.endsWith("-dev.mjs"), new t.U(t.r(23325)).href)
        : ""
    ), ...
  ```

  Turbopack colapsó la referencia dinámica siempre al id **23325**
  (`maplibre-gl-dev.mjs`, el bundle principal) en vez de resolver
  condicionalmente al **21323** (`maplibre-gl-worker-dev.mjs`, el worker real).
  El resultado de `.endsWith("-dev.mjs")` queda como expresión huérfana,
  descartada por el operador coma — nunca se usa para elegir el asset.

Consecuencia en runtime: MapLibre crea el Worker apuntando al **bundle
principal** de la librería en vez de al script del worker. Ese fichero es un
módulo ESM válido (`type: module`, por eso no hay error de red ni excepción
visible en consola) que se ejecuta sin problema, pero nunca instala el
`onmessage`/actor que el hilo principal espera para pedir el parseo de
teselas vectoriales. El ciclo de vida de la petición de tile nunca completa
esa fase — coincide exactamente con lo observado: `style.json` y `tiles.json`
sí se piden (no dependen del worker), pero jamás se llega a pedir ningún
`.pbf`, y no hay ningún error en consola porque desde el punto de vista del
navegador el worker se crea y ejecuta con normalidad.

Esto también explica el timeout de `preview_screenshot` solo cuando el mapa
está en viewport: es plausible que algún camino de espera en MapLibre
(loading/idle del source, a la espera de una respuesta del actor del worker
que nunca llega) bloquee el compositor durante el intento de captura. No se
verificó como causa aislada, pero es coherente con el mecanismo descrito y no
requiere investigación adicional para el fix.

**Archivos implicados:**
- `components/mapa/Mapa.tsx:137` — `await import("maplibre-gl")`, punto donde
  se inicializa el módulo antes de crear la instancia de `Map`.
- `node_modules/maplibre-gl/dist/maplibre-gl.mjs` (no se toca — librería de
  terceros) — contiene la función `fi()`/`gi()` con el patrón de
  `import.meta.url` que Turbopack no resuelve bien.

**Solución a implementar:**
`maplibre-gl` expone una API pública pensada exactamente para saltarse este
cálculo automático: `config.WORKER_URL` (tipado en
`maplibre-gl.d.ts:127`, documentado junto a `setWorkerUrl()`/`setWorkerCount()`
en `maplibre-gl.d.ts:16193`). Hay que fijar esa URL explícitamente **antes**
de crear cualquier instancia de `Map`, apuntando al fichero de worker servido
por Next/Turbopack.

En `components/mapa/Mapa.tsx`, dentro del bloque `async` donde ya se hace
`await import("maplibre-gl")` (línea 137):

```ts
const maplibregl = await import("maplibre-gl");
const { Map: MapLibreMap, AttributionControl, config } = maplibregl;
if (!config.WORKER_URL) {
  config.WORKER_URL = new URL(
    "maplibre-gl/dist/maplibre-gl-worker.mjs",
    import.meta.url
  ).href;
}
```

Nota importante para el Implementador: comprobar primero si con Turbopack el
`new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url)` en
`Mapa.tsx` (un fichero de la app, no de node_modules) se resuelve bien como
asset estático — este caso es un target único y literal (no condicional), que
es justo el patrón que Turbopack sí soporta según su propia documentación de
manejo de `new URL(literal, import.meta.url)`. Si Turbopack no resuelve el
paquete `maplibre-gl` por nombre en ese contexto, la alternativa (usada en
ejemplos oficiales de MapLibre con bundlers Rollup/Vite) es importar el
worker como asset con query `?url`:

```ts
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
```

y usar `config.WORKER_URL = maplibreWorkerUrl` — pero probar primero la
opción con `import.meta.url` porque no requiere depender de que Turbopack
soporte el sufijo `?url` (patrón de Vite, no necesariamente igual en
Turbopack). Cualquiera de las dos vías es un fix acotado a
`components/mapa/Mapa.tsx`; no toca ninguna otra capa.

**Clasificación:** Fix simple
**Siguiente paso:** Implementador directo

---

## Registro del Implementador

**Solución aplicada:** la opción A (primera opción propuesta por el
Debugger) funcionó sin necesidad de plan B. En
`components/mapa/Mapa.tsx`, dentro del bloque `async` donde ya se hacía
`await import("maplibre-gl")`, se desestructura también `config` del
módulo y, antes de crear la instancia de `Map`, se fija
`config.WORKER_URL` con:

```ts
const { Map: MapLibreMap, AttributionControl, config } = await import("maplibre-gl");
...
if (!config.WORKER_URL) {
  config.WORKER_URL = new URL(
    "maplibre-gl/dist/maplibre-gl-worker.mjs",
    import.meta.url
  ).href;
}
```

No hizo falta el plan B (`?url`) — Turbopack sí resuelve correctamente
`new URL(literal, import.meta.url)` cuando el target es un string literal
único (sin la doble condición `-dev`/no-`-dev` que tiene el código interno
de la librería).

**Quality gates — las 4 en verde:**
1. `pnpm typecheck` — 0 errores.
2. `pnpm lint` — 0 errores.
3. `pnpm test` — 78/78 tests en verde (9 ficheros), sin tests nuevos
   necesarios: el fix es de configuración de infraestructura de bundling
   (no lógica de dominio), no introduce comportamiento nuevo verificable
   con tests unitarios/integración — la verificación real es a nivel de
   bundle y red, documentada abajo.
4. `pnpm build` — build de producción completado sin errores.

**Verificación funcional (sin acceso a `preview_start`/`preview_network`/
`preview_screenshot` desde este subagente — esas herramientas viven en el
hilo principal del Orquestador):**

Se levantó `pnpm dev --port 3002` y se inspeccionó directamente el bundle
generado por Turbopack, replicando el método que usó el Debugger para el
diagnóstico original:

- El worker se emite ahora como asset estático real:
  `.next/static/media/maplibre-gl-worker.2er27gb6mgsf8.mjs` (y su variante
  `-dev`), servido con `200 OK` y contenido real de MapLibre GL (verificado
  con `curl`).
- El chunk transformado de `Mapa.tsx` ahora contiene:
  `o.WORKER_URL||(o.WORKER_URL=new t.U(t.r(10827)).href)` — una referencia
  estática única, no condicional. Se confirmó en el manifest de módulos que
  el id **10827** mapea exactamente a
  `/_next/static/media/maplibre-gl-worker.2er27gb6mgsf8.mjs` (el worker
  real), no al bundle principal como ocurría antes del fix (que colapsaba
  siempre al id `23325`, `maplibre-gl-dev.mjs`).
- Esto confirma a nivel de bundle que MapLibre ya apunta al worker
  correcto; el efecto esperado en runtime es que el worker instale su
  `onmessage`/actor y las peticiones a
  `https://api.maptiler.com/tiles/v3/{z}/{x}/{y}.pbf` empiecen a
  completarse.

**Pendiente de verificación por el Orquestador (con sus herramientas de
preview):** confirmar en el navegador real, con `preview_network`, que
aparecen peticiones `.pbf` a MapTiler, y con `preview_screenshot`, que el
mapa base (calles, agua, relieve) se pinta visualmente — no solo el overlay
SVG de la traza. También comprobar si el timeout de `preview_screenshot`
en viewport con el mapa (apuntado por el Debugger como posiblemente
relacionado con este mismo bug) desaparece tras el fix, o si persiste como
problema aparte del entorno de pruebas. Este subagente no tiene acceso a
esas herramientas para completarlo directamente.

**Alcance:** cambio acotado exclusivamente a
`components/mapa/Mapa.tsx`. No se ha tocado ninguna otra capa. No se ha
generado deuda técnica nueva relacionada; no se ha encontrado deuda no
relacionada en el camino que mereciera registro adicional.

---

## Registro del Debugger (2ª pasada — el canvas sigue vacío tras el fix de WORKER_URL)

**Contexto:** el Orquestador verificó que, tras el fix de `config.WORKER_URL`,
el worker se emite y se sirve (`200`, contenido válido), el timeout de
`preview_screenshot` desapareció, pero el canvas WebGL sigue completamente
vacío (`readPixels` → `[0,0,0,0]` en el centro) y **ninguna** petición `.pbf`
aparece en `preview_network`, ni un solo error en consola.

**Investigación de código realizada** (sin poder ejecutar el navegador desde
este subagente — solo lectura de `node_modules/maplibre-gl` y de los
artefactos ya generados en `.next/`):

1. Comparé byte a byte los cuatro ficheros de worker de `maplibre-gl`
   (`maplibre-gl-worker.mjs`: 19.108 B vs `maplibre-gl-worker-dev.mjs`:
   38.733 B, y sus copias emitidas en `.next/static/media/`, mismos tamaños
   exactos). El fichero que el Orquestador inspeccionó (200 OK, 19 KB,
   termina en `z(self)&&(self.worker=new $(self));export{$ as default}`) es
   exactamente el bundle **no-dev** (`maplibre-gl-worker.mjs`), no el
   `-dev`. Esto es coherente con el fix aplicado: `config.WORKER_URL` en
   `Mapa.tsx` construye la URL con un **literal fijo**
   `"maplibre-gl/dist/maplibre-gl-worker.mjs"` (sin la lógica condicional
   `-dev`/no-`-dev` que sí tiene el cálculo interno `defaultWorkerUrl()` de
   la propia librería, que decide el sufijo mirando si el propio
   `import.meta.url` de `maplibre-gl.mjs` termina en `-dev.mjs`).
   Consecuencia: **en `pnpm dev` el hilo principal carga
   `maplibre-gl-dev.mjs` pero el worker que se instancia es siempre el
   bundle de producción** (`maplibre-gl-worker.mjs`), nunca el `-dev`.
   Confirmé leyendo el contenido de ambos ficheros que **son funcionalmente
   equivalentes** (mismo `Actor`, mismos `registerMessageHandler` para
   `LT`/`LD`/`GG`/`GI`/etc., mismo `self.worker = new $(self)`) — el worker
   no-dev no le falta ninguna capacidad, solo carece de dev-warnings.
   Descarto esto como causa raíz del canvas vacío, pero **es una
   inconsistencia real que conviene corregir** (ver propuesta más abajo).

2. Investigué el protocolo `Actor` (mecanismo de mensajes principal↔worker)
   en `node_modules/maplibre-gl/dist/maplibre-gl-shared-dev.mjs:24742`. El
   `Actor` vive en un módulo **compartido** (`maplibre-gl-shared(-dev).mjs`),
   idéntico en ambos lados del Worker boundary. La serialización
   (`web_worker_transfer.ts`, `serialize()`/`deserialize()`, línea `12844`
   en adelante) identifica las clases **por nombre de string**
   (`registry[name]`, `_classRegistryKey`), no por identidad de
   objeto/clase JS — así que aunque el hilo principal y el worker carguen
   copias de módulo físicamente distintas (como ocurre por el punto 1:
   `-dev` vs no-dev), el protocolo de mensajes en sí **no debería romperse**
   por esa causa. Descarto la hipótesis de "doble Actor incompatible" (una
   de las que planteaba el Orquestador) como causa raíz — el mecanismo está
   diseñado para tolerar exactamente esta situación (nombres de clase por
   string, no por referencia).

3. **Hallazgo más relevante:** revisé el ciclo de vida completo del `Worker`
   nativo en `maplibre-gl-dev.mjs:1670-1725` (`web_worker.ts`:
   `defaultWorkerUrl`, `createWorker`, `workerFactory`) y en el `Actor`
   (`maplibre-gl-shared-dev.mjs:24756`): el `Actor` se suscribe **solo** al
   evento `"message"` del `Worker`
   (`subscribe(this.target, "message", ...)`, función `subscribe()` en
   `maplibre-gl-shared-dev.mjs:2618`, que internamente hace
   `target.addEventListener("message", ...)`). **En ningún punto del código
   de MapLibre GL (ni en `Actor`, ni en `createWorker`, ni en `Dispatcher`,
   ni en `WorkerPool`) se añade un listener a
   `worker.addEventListener("error", ...)` ni a `worker.onerror`.** Si el
   `new Worker(url, {type:"module"})` falla al arrancar — por ejemplo
   porque el navegador rechaza el módulo por un `Content-Type`/MIME type
   incorrecto en la respuesta HTTP del `.mjs`, por un error de import
   interno del propio worker script, o por cualquier fallo de
   inicialización del Worker como módulo ES — MapLibre **no lo captura en
   absoluto**. No hay ningún camino de código que traduzca un fallo de
   arranque del Worker en un evento `error` de la instancia `Map`, ni en un
   `console.error` explícito de MapLibre. Esto es coherente al 100% con lo
   observado: cero errores en consola de la página (el error, de existir,
   ocurriría en el contexto del Worker, que solo se refleja en DevTools
   como un evento nativo del navegador — no necesariamente capturado como
   "console log" de la página principal por el tooling de
   `preview_console_logs`), cero peticiones `.pbf` (el actor nunca completa
   el handshake porque el worker nunca llegó a ejecutar su `onmessage`), y
   coincide con que `style.json`/`tiles.json`/sprites sí se cargan (no
   dependen del worker, se piden desde el hilo principal directamente).
   También confirmé que `components/mapa/Mapa.tsx` no engancha ningún
   `instancia.on("error", ...)` — sin ese listener, si MapLibre disparase
   internamente un `error` de tipo `Evented` sin nadie escuchando, por
   defecto se vuelca a `console.error`, pero eso solo cubre errores que
   MapLibre mismo detecta — no cubre el fallo del Worker en sí, que ocurre
   fuera de ese mecanismo por completo.

**Hipótesis principal a verificar (la más probable tras esta
investigación):** el `Content-Type`/MIME type con el que Turbopack sirve
`.next/static/media/maplibre-gl-worker*.mjs` no es válido para que el
navegador acepte crear un `Worker` de tipo `module` a partir de él. Los
navegadores son estrictos con el MIME type para módulos ES, tanto en
`<script type="module">` como en `new Worker(url, {type:"module"})` — debe
ser `text/javascript`, `application/javascript` o similar. Es plausible que
Turbopack sirva un `.mjs` dentro de `_next/static/media/` (carpeta pensada
originalmente para imágenes/fuentes/assets binarios, no para scripts) con un
`Content-Type` genérico u octet-stream, en cuyo caso el navegador rechazaría
silenciosamente la carga del módulo del Worker.

**Instrumentación exacta a ejecutar (el Orquestador, con sus herramientas de
preview — este subagente no tiene acceso a ellas):**

1. Comprobar el header `Content-Type` real de la respuesta HTTP a
   `http://localhost:3002/_next/static/media/maplibre-gl-worker-dev.<hash>.mjs`
   (usar el fichero real que carga el navegador en `pnpm dev`, no el
   no-dev) — con `curl -sD - -o /dev/null <url>` o inspeccionando la
   pestaña Network del navegador. **Si el `Content-Type` no es
   `text/javascript` ni `application/javascript`, esa es la causa raíz
   confirmada.**
2. Si el punto 1 no revela nada anómalo, añadir temporalmente en
   `components/mapa/Mapa.tsx`, justo después de `mapRef.current = instancia;`
   (línea 172), estos listeners de diagnóstico (NO como fix final, solo
   para observar — hay que revertirlos después):
   ```ts
   instancia.on("error", (e) => console.error("MAPLIBRE ERROR", e));
   instancia.on("styledata", () => console.log("styledata"));
   instancia.on("sourcedata", (e) =>
     console.log("sourcedata", e.sourceId, e.isSourceLoaded, e.dataType)
   );
   instancia.on("dataloading", (e) => console.log("dataloading", e.sourceId));
   ```
3. Abrir DevTools → pestaña "Sources" → sección "Threads"/"Workers" para
   comprobar si aparece un hilo de Worker instanciado (confirmaría que al
   menos el `new Worker(...)` no lanzó excepción síncrona), y si ese
   contexto de worker tiene algún error marcado en su propia consola —
   revisar si `preview_console_logs` agrega solo el "execution context" de
   la página principal y por eso se está perdiendo cualquier error que
   ocurra dentro del contexto del worker.
4. Confirmar con el panel Network de DevTools (no solo CDP/`preview_network`)
   si el fichero `.mjs` del worker aparece marcado con algún icono de
   error/bloqueado pese al `200` a nivel HTTP — algunos navegadores separan
   "petición HTTP exitosa" de "recurso aceptado como módulo ES", y ese
   segundo rechazo no siempre se refleja como fallo de red en las
   herramientas basadas en CDP.

**Clasificación:** pendiente de confirmar con evidencia de runtime (paso 1
de la instrumentación es el más determinante). Si se confirma el MIME type
incorrecto → **Fix simple** (configurar Next/Turbopack para servir los
`.mjs` de `_next/static/media/` con `Content-Type: text/javascript`, o
mover/servir ese asset de otra forma que sí reciba el tipo correcto). Si no
se confirma y en el paso 2 aparece un error real y distinto dentro de
MapLibre → reevaluar la clasificación según la naturaleza de ese error.

**Siguiente paso:** Orquestador ejecuta el paso 1 (y 2-4 si hace falta) y
reporta el resultado exacto (Content-Type real de la respuesta, o logs de
los listeners de diagnóstico, o estado del hilo de Worker en DevTools) para
que el Debugger cierre el diagnóstico definitivo con evidencia de runtime,
no solo de código estático.
