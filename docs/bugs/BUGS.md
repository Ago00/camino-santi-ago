# Knowledge base de bugs

Cada entrada incluye: síntomas, causa raíz, solución y tags para facilitar
la búsqueda cuando aparezca un bug similar.

---

<!-- Formato de entrada:
## [Título descriptivo]
**Fecha:** YYYY-MM-DD
**Tags:** tag1, tag2
**Síntomas:** Qué se observaba.
**Causa raíz:** Por qué ocurría.
**Solución:** Qué se cambió.
-->

## `/api/track` daba 500 con Supabase real: variable de entorno inexistente

**Fecha:** 2026-07-30
**Tags:** supabase, env-vars, testing-con-mocks, integracion

**Síntomas:** Con `.env.local` configurado según el plan y un intento activo
real en la BD, una petición válida a `/api/track` (token correcto, payload
válido, punto dentro de la traza) devolvía `500` en vez de guardar la posición.
Los 32 tests de `route.test.ts` pasaban en verde sin ningún problema.

**Causa raíz:** `lib/supabase/admin.ts` leía `process.env.SUPABASE_URL`, una
variable que **nunca existió** en el proyecto — el plan
(`docs/tecnico/plan-ejecucion-v1.md`) solo define `NEXT_PUBLIC_SUPABASE_URL`.
`lib/supabase/public.ts` sí usaba el nombre correcto. Los tests con el cliente
Supabase mockado nunca ejercitan la lectura real de `process.env`, así que el
nombre de la variable no se puso a prueba hasta la primera verificación de
integración manual contra un proyecto Supabase real.

**Solución:** `admin.ts` pasa a leer `NEXT_PUBLIC_SUPABASE_URL` (la URL de un
proyecto Supabase no es secreta — por eso ya llevaba ese prefijo en el cliente
público; no hace falta una variable de servidor separada solo para la URL).
Se añadió `lib/supabase/admin.test.ts` con `vi.stubEnv()` para que este tipo de
error de nombre de variable quede cubierto por un test unitario que sí
instancia el cliente real (sin conectar), en vez de depender solo de mocks.

**Lección:** cuando un módulo lee `process.env` directamente, un test que
mockea el cliente entero no prueba nada sobre los nombres de las variables que
usa. Hace falta al menos un test que construya el objeto real con
`vi.stubEnv()`. Ver también `docs/LESSONS.md`.

---

## El mapa base de MapTiler no pintaba: worker de MapLibre GL roto en silencio por Turbopack

**Fecha:** 2026-07-31
**Tags:** maplibre-gl, turbopack, web-worker, bundling, esbuild, next.js

**Síntomas:** En `components/mapa/Mapa.tsx`, el overlay SVG (traza naranja,
marcadores) se pintaba correctamente, pero el mapa base de MapTiler (calles,
agua, relieve) quedaba completamente en blanco. Cero errores en consola, cero
peticiones `.pbf` (teselas vectoriales) en la pestaña Network, `style.json` y
`tiles.json` sí se cargaban con normalidad. `gl.readPixels()` sobre el canvas
WebGL devolvía `[0,0,0,0]` en el centro del mapa.

**Causa raíz (confirmada tras 3 rondas de diagnóstico, ver
`docs/tareas/historico/` y DT-008 en `docs/tecnico/decisiones-tecnicas.md`):**

1. `maplibre-gl@6` calcula la URL de su Web Worker con
   `new URL(target-condicional-en-runtime, import.meta.url)`. Turbopack no
   resuelve bien ese patrón de doble target condicional: colapsa siempre la
   referencia al bundle principal en vez del worker real, sin ningún error.
   Fijar `config.WORKER_URL` a mano evita este primer problema — pero no basta.
2. Turbopack solo bundlea (resuelve y hashea) un Web Worker cuando el propio
   código de la app contiene **literalmente** `new Worker(new URL(...))` como
   expresión estática analizable. Como `maplibre-gl` construye el `Worker`
   con una URL que le llega en tiempo de ejecución vía `config.WORKER_URL`,
   Turbopack nunca puede aplicar ese análisis — sin importar si la URL
   apunta a un fichero de `node_modules` o a un fichero propio de la app
   creado expresamente para ello. En ambos casos, Turbopack trata el
   fichero como **asset estático copiado en crudo**, sin bundlear sus
   imports internos.
3. El propio worker de MapLibre (`maplibre-gl-worker.mjs`) importa
   internamente `./maplibre-gl-shared.mjs` (ruta sin hash de contenido).
   Esa ruta sin hash **nunca existe** en el output de Turbopack (solo la
   versión con hash), así que el import falla con **404 dentro del
   contexto del propio Worker** — confirmado con una captura real de la
   pestaña Network de una preview de Vercel desplegada.
4. Este fallo es invisible desde el hilo principal: `maplibre-gl` nunca
   engancha `worker.onerror` al `Worker` nativo, así que ni
   `window.onerror`, ni `map.on('error')`, ni la consola de la página
   principal muestran nada. Solo se detecta inspeccionando directamente la
   pestaña Network o leyendo el código fuente de la librería.

**Solución:** pre-empaquetar el worker de MapLibre GL (y su dependencia
`maplibre-gl-shared.mjs`) en un único fichero autocontenido con `esbuild`,
sin ningún import externo restante (`scripts/bundle-maplibre-worker.ts`,
ejecutado en `predev`/`prebuild`), y servirlo como asset estático desde
`public/maplibre-gl-worker.bundled.js` — fuera por completo del pipeline de
bundling de Turbopack. `config.WORKER_URL` apunta a esa ruta pública fija,
sin `new URL(..., import.meta.url)` de por medio. Ver DT-008.

**Lección:** cuando una librería de terceros crea un Web Worker con una URL
resuelta en tiempo de ejecución (no un literal estático en el código de la
app), Turbopack no puede bundlearlo por mucho que se cambie desde dónde se
referencia el fichero. La única solución robusta es eliminar la necesidad
de bundling en tiempo real: pre-empaquetar el worker de antemano y servirlo
como estático. Ver también `docs/LESSONS.md`.

---

## El panel admin no dejaba arrancar el reto la primera vez: nada creaba el primer `intento`

**Fecha:** 2026-08-01
**Tags:** server-action, supabase, bootstrap, panel-admin, testing-con-mocks

**Síntomas:** Con F4 ya desplegado en producción y la tabla `intentos`
todavía vacía (proyecto Supabase real, sin datos de prueba previos en esa
tabla), la sección Actividad del panel admin mostraba "No hay ningún intento
activo en la base de datos" y no ofrecía ningún botón — ni siquiera
"Iniciar". Detectado por el usuario al probar el panel recién fusionado.

**Causa raíz:** Las 4 Server Actions de Actividad en `app/admin/actions.ts`
(`iniciarReto`, `finalizarReto`, `retomarReto`, `reiniciarReto`) parten todas
de la premisa de que ya existe una fila con `cerrado = false` sobre la que
actuar — incluida `reiniciarReto`, cuyo `insert` de la fila nueva solo es
alcanzable después de cerrar una fila ya existente. Ninguna acción, ni
`/api/track`, siembra la primera fila desde cero. Durante la verificación de
F2 contra Supabase real, esa primera fila de prueba se insertó a mano por SQL
directamente en el editor de Supabase — nunca se probó el panel de punta a
punta arrancando desde una base de datos completamente vacía a través de la
propia app, que es el escenario real de un proyecto nuevo.

**Solución:** Nueva Server Action `crearPrimerIntento()` (misma verificación
de sesión que el resto, comprueba explícitamente que no exista ya una fila
`cerrado=false` antes de insertar, con el índice único parcial
`intentos_activo_unico` como backstop ante condiciones de carrera) + botón
en `SeccionActividad.tsx` (reutilizando `BotonConfirmable`) que aparece
únicamente cuando no hay ningún intento activo.

**Lección:** cuando una entidad tiene un ciclo de vida de estados (aquí:
antes → durante → llegada, con cierre/reapertura), es fácil construir todas
las transiciones *entre* estados y olvidar la transición *de la nada al
primer estado*. Un entorno de pruebas que siempre arranca con datos
sembrados a mano (SQL directo, fixtures, seeds) puede ocultar este hueco
indefinidamente porque nunca ejercita el camino de "base de datos
recién creada". Ver también `docs/LESSONS.md`.
