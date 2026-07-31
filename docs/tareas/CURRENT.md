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

---

## Registro del Implementador (3ª pasada — causa raíz confirmada por el Orquestador, fix indicado NO funciona según evidencia de build)

**Contexto recibido:** el Orquestador confirmó la causa raíz 100% (404 real
y verificado en Network de Vercel: `.../maplibre-gl-shared.mjs` sin hash no
existe porque Turbopack copia `maplibre-gl-worker.mjs` como asset estático
crudo sin bundlear su `import ... from "./maplibre-gl-shared.mjs"` interno).
El fix indicado: crear `lib/maplibre-worker-entry.ts` con
`import "maplibre-gl/dist/maplibre-gl-worker.mjs";` y apuntar
`config.WORKER_URL` a ese fichero de la app en vez de al de `node_modules`,
bajo la premisa de que Turbopack trataría esa referencia como "entrada de
bundling real" y sí resolvería/hashearía el grafo de imports del worker.

**Cambios aplicados (código, tal como se indicó):**
1. Creado `lib/maplibre-worker-entry.ts` exactamente como se especificó.
2. En `components/mapa/Mapa.tsx`, `config.WORKER_URL` ahora apunta a
   `new URL("../../lib/maplibre-worker-entry.ts", import.meta.url).href`
   (ruta relativa verificada: `Mapa.tsx` está en `components/mapa/`, `../../`
   sube a la raíz del proyecto, correcto).
3. Comentario de `WORKER_URL` reescrito con la causa raíz completa (URL sin
   hash + Turbopack copia asset crudo + MapLibre no engancha `worker.onerror`).
4. Retirada toda la instrumentación `// DEBUG TEMPORAL`: los listeners de
   `window.addEventListener("error"/"unhandledrejection", ...)` y los
   `instancia.on("styledata"/"sourcedata"/"dataloading"/"idle", ...)`.
   Se conserva (como código de producción limpio, sin prefijo de debug) un
   único listener permanente `instancia.on("error", (e) =>
   console.error("Error de MapLibre GL:", e.error))` — decisión de bloqueo
   menor: es razonable dejarlo dado que ya sabemos que MapLibre puede fallar
   sin propagar el error por ningún otro canal.

**Quality gates de código — las 3 primeras en verde:**
1. `pnpm typecheck` — 0 errores.
2. `pnpm lint` — 0 errores.
3. `pnpm test` — 78/78 tests en verde (9 ficheros), sin cambios de dominio.
4. `pnpm build` — completa sin errores... **pero la inspección del output
   real revela que el fix NO logra el efecto esperado.**

**BLOQUEO MAYOR — el fix indicado no resuelve la causa raíz según evidencia del build de producción:**

Inspeccioné `.next/static/media/` y los chunks generados tras `pnpm build`:

- Turbopack SÍ genera un asset con hash para el nuevo fichero:
  `.next/static/media/maplibre-worker-entry.0mpwi316efso-.ts` — pero **es una
  copia literal y cruda del `.ts` fuente sin transpilar**, tal cual (con el
  comentario incluido), no un bundle. Turbopack lo trató como "asset
  estático referenciado por `new URL(..., import.meta.url)`" — exactamente
  el mismo tratamiento que ya se aplicaba al fichero de `node_modules` —, no
  como "entrada de bundling".
- En el chunk cliente (`.next/static/chunks/2qdz7o0b9yaf7.js`) la asignación
  de `WORKER_URL` queda como
  `o.WORKER_URL=new t.U(t.r(56342)).href`, y el módulo `56342` mapea (visto
  en `.next/static/chunks/3jh6ntzr9it4k.js`, la función de manifest) a
  `/_next/static/media/maplibre-worker-entry.0mpwi316efso-.ts` — el propio
  `.ts` copiado tal cual, con el `import "maplibre-gl/dist/maplibre-gl-worker.mjs"`
  sin resolver.
- El fichero real del worker sigue siendo el de siempre,
  `.next/static/media/maplibre-gl-worker.2er27gb6mgsf8.mjs`, y su primera
  línea de import sigue exactamente igual que antes del fix:
  `from"./maplibre-gl-shared.mjs"` — **la ruta sin hash, que sigue sin
  existir en el output** (`.next/static/media/maplibre-gl-shared.2zqce7ukeetkz.mjs`
  es la única versión de ese fichero, con hash). El worker que
  efectivamente se sirve al navegador seguiría dando el mismo 404 interno
  que motivó esta tarea.

**Conclusión:** el patrón "referenciar el worker desde un fichero de la
propia app en vez de `node_modules`" **no cambia el tratamiento de Turbopack**
para `new URL(literal, import.meta.url)` — en ambos casos Turbopack lo trata
como un asset estático copiado en crudo, nunca como punto de entrada de
bundling. La premisa del fix (documentada también así en el prompt recibido
y pensada para actualizar `docs/LESSONS.md`) no se sostiene con la evidencia
real del build. Esto es un cambio respecto al plan aprobado — no una
ambigüedad de implementación menor — así que paro aquí en vez de improvisar
una solución alternativa de arquitectura (p. ej. `?url`, `import()` dinámico
sin `new URL`, mover el worker a `public/`, o configurar Turbopack para que
trate `.ts`/`.mjs` bajo esa ruta como módulo en vez de asset).

**Estado del código en este momento:** el fix de `WORKER_URL` y la limpieza
de instrumentación de debug están aplicados en el working tree tal como se
pidió (útiles como base, el comentario del listener de error permanente es
válido en cualquier escenario), pero **el bug del mapa base sin pintar sigue
sin resolverse** — no se ha podido verificar visualmente (paso 2-3 de la
verificación exigida) porque el fix de fondo no llega a servir el worker
correcto.

**No se ha hecho:** verificación con `curl`/preview del navegador, porque el
build ya revela por inspección estática que el resultado sería el mismo 404
que antes del fix — no tiene sentido gastar ese paso hasta que haya una
solución de fondo distinta.

**Siguiente paso:** Orquestador/Arquitecto deciden la vía alternativa real
para bundlear el grafo de imports del worker de MapLibre bajo Turbopack.
Alternativas no probadas que podrían investigarse: (a) importar el worker
con sufijo `?url` (patrón de Vite,
`import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url"`,
ya descartado preventivamente por el Debugger en la 1ª pasada por no ser
necesariamente soportado por Turbopack, pero no se ha probado empíricamente
todavía); (b) copiar el worker y su dependencia compartida a `public/` en
tiempo de build (script propio, similar a `simplificar-traza.ts`) y apuntar
`WORKER_URL` a esa ruta estática servida sin pasar por el pipeline de
bundling de Turbopack en absoluto; (c) investigar si Turbopack tiene alguna
directiva/config (`turbopack.rules` en `next.config`) para forzar que un
`.mjs` bajo cierta ruta se trate como módulo transformable en vez de asset.

---

## Decisión de Arquitectura (Orquestador, tras 3 rondas de diagnóstico) — DT-008

**Aprobada por Santi (2026-07-31).** Registrada en `docs/tecnico/decisiones-tecnicas.md` como DT-008.

El Implementador (3ª pasada) confirmó con evidencia real de build que referenciar
el worker desde un fichero de la app (en vez de `node_modules`) NO resuelve el
problema: Turbopack solo bundlea correctamente un Worker cuando el propio código
de la app contiene literalmente `new Worker(new URL(...))` — como `maplibre-gl`
construye el Worker con una URL en tiempo de ejecución, Turbopack nunca puede
aplicar ese análisis, venga de donde venga el fichero referenciado.

**Solución aprobada:** pre-empaquetar el worker de MapLibre (+ su dependencia
`maplibre-gl-shared.mjs`) con `esbuild` en un fichero único sin imports
externos, servido desde `public/` (fuera del pipeline de bundling de Turbopack
por completo). Ver DT-008 para el detalle completo y las alternativas descartadas.

**Siguiente paso:** Implementador (4ª pasada) — instrucciones exactas en el
mensaje del Orquestador al invocarlo.

---

## Registro del Implementador (4ª pasada — DT-008 implementado)

**Cambios aplicados:**

1. **`esbuild` añadido como devDependency** (`^0.28.1`).
2. **`scripts/bundle-maplibre-worker.ts`** creado, patrón análogo a
   `scripts/simplificar-traza.ts`. Usa la API de Node de esbuild
   (`esbuild.build({...})`) con `entryPoints:
   ["node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs"]`, `bundle: true`,
   `format: "esm"`, `outfile: "public/maplibre-gl-worker.bundled.js"`.
   Verifica al final con una regexp que el fichero de salida no contenga
   ningún `import ... from "./"` sin resolver, y lanza si lo encontrara.
   **Decisión de bloqueo menor:** un único bundle sirve para dev y
   producción (no se genera variante `-dev`) — el Debugger ya había
   confirmado en la 2ª ronda que `maplibre-gl-worker.mjs` y
   `maplibre-gl-worker-dev.mjs` son funcionalmente equivalentes (mismo
   `Actor`, mismos message handlers; el `-dev` solo añade warnings). No
   vale la pena mantener dos artefactos para esa diferencia cosmética.
3. **`package.json`:** nuevo script `"bundle-maplibre-worker": "tsx
   scripts/bundle-maplibre-worker.ts"`, enganchado en `predev` y `prebuild`
   (`simplificar-traza` es manual, sin hook — pero aquí se justifica un hook
   automático porque el artefacto depende de la versión de `maplibre-gl` en
   `node_modules`, que puede cambiar sin que nadie recuerde regenerar el
   worker a mano).
4. **Artefacto generado** en `public/maplibre-gl-worker.bundled.js`
   (634 KB) y **añadido a `.gitignore`** — se regenera siempre en
   `predev`/`prebuild`, nunca se commitea (consistente con cómo el proyecto
   trata otros artefactos derivados como `.next/`).
5. **`components/mapa/Mapa.tsx`:**
   - Eliminado `lib/maplibre-worker-entry.ts` (enfoque descartado, ya no se
     referencia desde ningún sitio).
   - `config.WORKER_URL = "/maplibre-gl-worker.bundled.js"` — ruta pública
     fija, sin `new URL(..., import.meta.url)`.
   - Comentario reescrito con la causa raíz completa (DT-008) y la solución
     final.
   - Se mantiene el listener `instancia.on("error", ...)` permanente (ya
     decidido en la 3ª pasada).
6. **`eslint.config.mjs`:** añadido `public/maplibre-gl-worker.bundled.js`
   a `globalIgnores` — es un artefacto generado por esbuild (código de
   terceros minificado/bundleado), no código fuente del proyecto; sin esto
   ESLint lo lintea y genera cientos de warnings irrelevantes.

**Quality gates — las 4 en verde:**
1. `pnpm typecheck` — 0 errores.
2. `pnpm lint` — 0 errores (tras excluir el artefacto generado).
3. `pnpm test` — 78/78 tests en verde (9 ficheros), sin tests nuevos: el
   cambio es de infraestructura de build (script de empaquetado + ruta de
   worker), no lógica de dominio. El propio script de bundling actúa como
   su propia guardia de calidad (falla si detecta un import sin resolver
   en su salida) — verificado que efectivamente pasa esa guardia con el
   contenido real generado.
4. `pnpm build` — completa sin errores. El hook `prebuild` regeneró
   correctamente `public/maplibre-gl-worker.bundled.js` antes de que Next
   compilara (verificado borrando el artefacto antes del build y
   confirmando que reaparece).

**Verificación exigida — resultado y método exacto de cada punto:**

1. **`public/maplibre-gl-worker.bundled.js` existe y no está vacío tras el
   build:** confirmado (649.631 bytes tras `pnpm build`, regenerado por el
   hook `prebuild`).
2. **`curl` directo al fichero servido + grep de imports sin resolver:**
   levantado `pnpm build && pnpm start` (puerto 3000, producción real, no
   dev server). `curl -sD - http://localhost:3000/maplibre-gl-worker.bundled.js`
   devuelve `HTTP/1.1 200 OK`, `Content-Type: application/javascript;
   charset=UTF-8` (MIME type válido para un módulo ES en un Worker — esto
   era precisamente la hipótesis principal de la 2ª ronda de diagnóstico
   cuando el fichero se servía desde `_next/static/media/`; servido desde
   `public/` el problema desaparece). El contenido descargado por `curl` es
   **byte a byte idéntico** al fichero generado localmente (`diff` sin
   diferencias) y **no contiene ningún `import ... from "./"` ni `import`
   de nivel superior sin resolver** (verificado con grep con varios
   patrones: ninguna coincidencia).
3. **Navegación real + `preview_network` sin 404 de MapLibre:** **NO
   ejecutado por este subagente.** Las herramientas `preview_start` /
   `preview_network` / `preview_screenshot` / `preview_eval` no están
   disponibles en el entorno de este subagente Implementador — viven
   exclusivamente en el hilo principal del Orquestador (mismo límite ya
   documentado en la 1ª pasada de esta tarea).
4. **Confirmación visual del mapa base pintado (screenshot o
   `gl.readPixels()`):** **NO ejecutado**, mismo motivo que el punto 3.

**Servidor de producción dejado activo para el Orquestador:** `pnpm start`
sigue corriendo en `http://localhost:3000/` (procesos `node.exe`, PIDs
16224/16932/16816 en el momento de escribir esto) con el artefacto ya
generado y verificado por red — el Orquestador puede navegar directamente
sin tener que reconstruir, solo completar los puntos 3 y 4 con sus
herramientas de preview.

**No cierro esta tarea como resuelta.** Los puntos 1 y 2 de la verificación
exigida están confirmados con evidencia real (build + red + contenido
byte a byte). Los puntos 3 y 4 — los que de verdad confirman que el bug
está resuelto en un navegador real, que es lo que ha fallado dos veces
antes — quedan pendientes de las herramientas de preview del Orquestador.
Dado el historial de esta tarea (dos "fixes" reportados sin verificación
visual real que resultaron no funcionar), no reporto éxito sin esa
confirmación final.

**Alcance:** cambios acotados a lo aprobado en DT-008: nueva dependencia
`esbuild`, nuevo script `scripts/bundle-maplibre-worker.ts`, hooks
`predev`/`prebuild` en `package.json`, eliminación de
`lib/maplibre-worker-entry.ts`, cambio de `WORKER_URL` en `Mapa.tsx`, y
exclusión del artefacto generado en `eslint.config.mjs` (ajuste menor
necesario para que `pnpm lint` no lintee código de terceros bundleado —
consistente con cómo ya se ignoran `.next/`, `out/`, `build/`). No se ha
tocado ninguna otra capa. No se ha generado deuda técnica nueva; no se ha
encontrado deuda no relacionada en el camino que mereciera registro
adicional.

**Documentación actualizada:** `CHANGELOG.md` (entrada del fix parcial
sustituida por el fix definitivo), `docs/LESSONS.md` (ampliada la lección
de Turbopack + Web Workers con el hallazgo final), `docs/bugs/BUGS.md`
(nueva entrada con causa raíz completa y solución), `AGENTS.md` (nuevo
comando `bundle-maplibre-worker` documentado).

**Siguiente paso:** Orquestador completa los puntos 3 y 4 de la
verificación exigida con sus herramientas de preview contra el servidor ya
activo en `localhost:3000`. Si confirma visualmente que el mapa base pinta
(calles/agua/relieve) y no hay 404 de MapLibre en Network, la tarea puede
darse por cerrada de verdad — Reviewer y Seguridad después. Si algo falla,
es un bloqueo mayor nuevo y hay que reabrir el diagnóstico, no volver a
reportar éxito sin esa confirmación.

---

## Confirmación final del Orquestador (2026-07-31)

**Puntos 3 y 4 completados.** Con instrumentación temporal adicional
(interceptor de `window.Worker` para capturar tráfico de mensajes, y
listeners `sourcedata`/`idle`/`render` en el Map) confirmé contra el build
de producción real (`pnpm build && pnpm start`):

- `sourcedata maptiler_planet true` — la fuente real de teselas SÍ completa
  su carga (antes se quedaba en bucle infinito en `false`).
- `idle - todo cargado` se dispara — MapLibre considera el mapa
  completamente renderizado.
- **Captura de pantalla real** contra el servidor de producción: el mapa
  pinta calles, costa y relieve (Vigo, Pontevedra, Santiago de Compostela,
  la ría) — no solo el overlay SVG de la traza sobre fondo plano.
- Sin ningún error en consola.

**Nota metodológica:** `gl.readPixels()` sobre el canvas WebGL dio
falso negativo repetidamente (siempre `[0,0,0,0]`) incluso con el mapa ya
confirmado como renderizado correctamente — el buffer de dibujo de WebGL
se limpia tras presentar cada frame salvo que el contexto pida
`preserveDrawingBuffer`, así que leerlo fuera del propio bucle de render
no es una prueba fiable. La captura de pantalla real (`preview_screenshot`)
es el método correcto para verificar visualmente un canvas WebGL.

Retiré toda la instrumentación de depuración de `Mapa.tsx` (queda solo el
listener de error permanente ya añadido). Re-confirmé las 4 quality gates
en verde tras la limpieza. **Bug cerrado de verdad.**

**Siguiente paso:** Reviewer y Seguridad sobre el diff acumulado de todo el
ciclo de este bug (fix de postcss + fix del mapa + limpieza), antes de
cerrar la tarea y fusionar el PR.
