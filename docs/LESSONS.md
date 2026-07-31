# Lecciones aprendidas

Decisiones de arquitectura que salieron mal, patrones que se marcan como
error y no deben repetirse. La leen el Arquitecto y el Implementador antes
de cada tarea. No es deuda ni bugs — es lo que cambia cómo se decide.

---

## MapLibre: las capas GL `line`/`circle` no pintan de forma fiable

**Registrada:** 2026-07-30 (de la POC)
**Por quién:** Arquitecto (de la lección de la POC)

En la POC con MapLibre GL, las capas de tipo `line` y `circle` no pintaban
de forma fiable — la traza y los puntos aparecían y desaparecían según el
estado del mapa.

**Solución validada:** overlay SVG recalculado en el evento `move` del mapa.
Este patrón funcionó en la POC y es el que se usa en F3.

**Cuidado adicional:** race condition entre el evento `load` del mapa y las
props de React. Solución: usar una ref con el valor más reciente de las props
para que el handler de `move` no capture una versión stale.

---

## @supabase/supabase-js: los `Row` del tipo `Database` deben ser mapped types, no interfaces directas

**Registrada:** 2026-07-30 (F2 — Datos e ingesta)
**Por quién:** Implementador

Al tipar `BaseDeDatos` (el genérico `Database` de `createClient<Database>()`)
usando directamente los `interface` de `lib/types.ts` como `Row` de cada
tabla (`Row: Posicion`, `Row: Intento`...), `.from(tabla).insert(...)` y
`.update(...)` resuelven silenciosamente a `never` — sin ningún error hasta
que se llama con datos reales, y de forma inconsistente entre `tsc
--noEmit` (a veces no lo detecta, especialmente con caché incremental) y
`next build` (sí lo detecta siempre). Nada avisa de que el `Database extends
GenericSchema` interno de la librería falló.

**Causa raíz:** `@supabase/postgrest-js` exige que `Row` sea estructuralmente
asignable a `Record<string, unknown>` (necesita index signature). Un
`interface` de TypeScript no tiene index signature implícito, así que no es
asignable a `Record<string, unknown>` aunque tenga exactamente los mismos
campos. La condición `Schema extends GenericSchema ? Schema : never` de la
librería falla en silencio y cae al `never` por defecto.

**Solución validada:** envolver cada `Row` en `Pick<T, keyof T>` (o
equivalente: cualquier mapped type que reconstruya el interface). Eso sí
tiene index signature estructural y preserva los mismos campos.
`Insert`/`Update` no tienen este problema porque ya suelen construirse con
`Omit`/`Partial` (mapped types por definición).

**Aplica a:** cualquier tabla nueva que se añada al tipo `BaseDeDatos` de
`lib/supabase/admin.ts` en F3/F4 (comentarios, intenciones si se tipan
inserts, etc.) — seguir el mismo patrón `Row: Pick<T, keyof T>`.

---

## Los tests con mocks del cliente Supabase no verifican los nombres reales de env vars

**Registrada:** 2026-07-30
**Por quién:** Implementador (a partir de una verificación de integración manual)

`app/api/track/route.test.ts` mockea `lib/supabase/admin` entero (sustituye
`getSupabaseAdmin()` por un builder falso), así que nunca ejecuta el código
real que lee `process.env`. Esto dejó pasar un bug real: `getSupabaseAdmin()`
leía `process.env.SUPABASE_URL` — variable que nunca existió en el proyecto,
el plan solo define `NEXT_PUBLIC_SUPABASE_URL` — sin que ningún test lo
detectara. Con `.env.local` configurado correctamente según el plan, el
cliente admin lanzaba en el primer uso real y `/api/track` devolvía 500.

Lo encontró una verificación de integración manual contra Supabase real
(fuera del pipeline automático de tests), precisamente el tipo de prueba que
F2 tenía pendiente antes de darse por cerrada del todo (ver
`docs/tareas/historico/`).

**Solución validada:** además de los tests con mocks (necesarios para probar
la lógica de negocio del endpoint sin BD), añadir al menos un test que
instancie el cliente real — sin conectar, solo construirlo — para verificar
los nombres exactos de env vars que lee. Ver `lib/supabase/admin.test.ts`:
usa `vi.stubEnv()` para comprobar que con las variables correctas puestas no
lanza, que lanza si falta alguna, y (regresión directa de este bug) que no
se confunde si existe una variable con nombre parecido pero incorrecto.

**Aplica a:** cualquier módulo que lea `process.env` directamente y esté
cubierto solo por tests que lo mockean — el nombre de la variable en sí
nunca queda bajo test a menos que se instancie el código real al menos una
vez.

---

## No commitear en una rama cuyo PR ya se ha fusionado

**Registrada:** 2026-07-31
**Por quién:** Orquestador

Durante la verificación de F2 contra Supabase real se encontró y corrigió un
bug (variable de entorno mal nombrada en `admin.ts`). El fix se commiteó y
subió a `feature/f2-datos-ingesta` — la misma rama del PR de F2 — sin
comprobar que ese PR **ya estaba fusionado**. GitHub no vuelve a fusionar
automáticamente los pushes nuevos en una rama con el PR cerrado: el commit
quedó huérfano, nunca llegó a `main`, y el bug siguió en producción pese a
"estar arreglado" — costó dos rondas de deploy fallido en Vercel y una
sesión completa de depuración hasta encontrar la causa real.

**Regla:** antes de commitear sobre cualquier rama de feature, comprobar con
`gh pr view <rama>` (o el estado de la rama en GitHub) si su PR sigue abierto.
Si ya se fusionó, crear una rama nueva desde `main` actualizado — nunca
reutilizar una rama con el PR cerrado, por poco que quede por añadir.

**Aplica a:** cualquier fix o ajuste que surja después de que una tarea ya se
haya dado por cerrada y fusionada — especialmente en sesiones donde el
usuario fusiona PRs sin avisar explícitamente en la conversación.

---

## Ninguna quality gate detecta que Tailwind no esté generando CSS real

**Registrada:** 2026-07-31
**Por quién:** Orquestador (detectado por el usuario al abrir la preview)

F3 se cerró con las 4 quality gates en verde (`typecheck`, `lint`, `test`,
`build`) y pasó Reviewer y Seguridad, pero faltaba `postcss.config.mjs` —
sin él, `@import "tailwindcss"` en `globals.css` nunca se expande y **ninguna
clase de Tailwind se aplicaba**, en todo el proyecto, desde F1. Ni
`next build` ni `tsc` ni los tests fallan por esto: Tailwind sin PostCSS
conectado no es un error de compilación, es CSS que simplemente no se
genera. El HTML sale con las clases escritas en el `className` (sintácticamente
correctas) pero sin ninguna regla CSS real detrás. El bug pasó tres
revisiones (Implementador, Reviewer, Seguridad, todas basadas en código/tests)
sin que nadie lo viera, porque nadie abrió un navegador — hasta que el
usuario abrió la preview de Vercel y "se veía lamentable".

**Causa raíz:** el scaffolding inicial de F1 nunca generó `postcss.config.mjs`
pese a tener `@tailwindcss/postcss` en `package.json`. No había ninguna
pantalla real en F1/F2 para notarlo (F1 era un placeholder, F2 no tenía UI).

**Regla:** para cualquier tarea que toque UI, el pipeline no puede darse por
cerrado solo con quality gates de código (`typecheck`/`lint`/`test`/`build`)
y revisión de código. Hace falta al menos una comprobación visual real —
levantar el dev server (o revisar la preview desplegada) y mirar el
resultado renderizado — antes de reportar la tarea como lista. Un build que
compila y tests que pasan no garantizan que el CSS se esté generando.

**Aplica a:** toda tarea con componentes visuales nuevos, en este proyecto o
en cualquier otro con Tailwind v4 + Next.js — verificar que existe
`postcss.config.mjs` (o equivalente) es parte del checklist de arranque de
cualquier fase con UI, y el Orquestador debe insertar un paso de
verificación visual (preview local o desplegada) antes de reportar el
cierre de cualquier tarea con UI, no solo cuando el usuario lo pide.

## Turbopack no resuelve `new URL(target-condicional, import.meta.url)`: colapsa siempre al bundle principal, sin error visible

**Registrada:** 2026-07-31 (F3 — bug del mapa base de MapTiler sin pintar)
**Por quién:** Debugger (diagnóstico) / Implementador (fix aplicado)

`maplibre-gl@6` calcula la URL de su Web Worker con
`new URL(condición ? "a.mjs" : "b.mjs", import.meta.url)` — el nombre del
fichero destino depende de una condición evaluada en tiempo de ejecución
(dos targets posibles). Webpack y Vite sí soportan `new URL(...,
import.meta.url)` cuando pueden analizarlo estáticamente, pero Turbopack no
resuelve bien el caso de **doble target condicional**: colapsa la
referencia siempre al primer/bundle principal, descarta la rama condicional
como expresión huérfana, y no lanza ningún error — el resultado es un
módulo ESM válido que se ejecuta sin excepción pero no es el fichero
esperado (en este caso, un Worker que arranca pero nunca instala el
`onmessage`/actor real).

Esto es especialmente peligroso porque **no hay ningún error de compilación
ni de runtime**: `tsc`, `next build`, los tests y la consola del navegador
quedan todos en silencio. El único síntoma es un comportamiento incompleto
en runtime (en este caso, ninguna tesela `.pbf` se llega a pedir nunca,
aunque `style.json`/`tiles.json` sí cargan bien).

**Solución validada:** cuando una librería de terceros calcula
internamente la URL de un Web Worker con este patrón condicional, no
confiar en el cálculo automático. Usar la API pública que casi todas estas
librerías exponen para fijar la URL a mano (en MapLibre,
`config.WORKER_URL`) **antes** de cualquier uso, con un
`new URL(literal-único, import.meta.url)` propio en el código de la app
(no en `node_modules`) — ese caso sí es un patrón que Turbopack resuelve
correctamente porque el target es un string literal único, sin condición.
Verificado con éxito en `components/mapa/Mapa.tsx`.

**Aplica a:** cualquier librería con Web Workers bajo Next.js/Turbopack que
use `import.meta.url` con un target condicional o dinámico (no solo
maplibre-gl — el mismo patrón puede repetirse en otras libs con workers:
comprobar primero si exponen una forma de fijar la URL del worker a mano
antes de asumir que "simplemente funciona" con Turbopack). Señal de alarma:
un Worker se crea sin error pero el comportamiento que depende de él nunca
se completa — sin ningún error en consola ni en red.

**Actualización (2026-07-31, cierre definitivo tras dos "fixes" fallidos):**
fijar `config.WORKER_URL` a mano **no fue suficiente**. El motivo real, más
profundo que el descrito arriba: Turbopack solo aplica su tratamiento
especial de bundling de Web Workers (resolver y hashear el grafo de imports
del script) cuando el propio código de la app contiene **literalmente** la
expresión `new Worker(new URL(...))` como análisis estático. Como
`maplibre-gl` construye el `Worker` internamente con una URL que le llega
en tiempo de ejecución vía `config.WORKER_URL`, Turbopack **nunca** puede
aplicar ese análisis — no importa si la URL apunta a un fichero de
`node_modules` o a un fichero propio de la app: en ambos casos lo trata
como **asset estático copiado en crudo**, sin bundlear sus imports internos.
Se probó explícitamente crear un fichero de la app que solo hacía
`import "maplibre-gl/dist/maplibre-gl-worker.mjs"` (con la premisa de que
Turbopack lo trataría como "entrada de bundling real"): el build de
producción confirmó que Turbopack copió ese `.ts` tal cual, sin transpilar,
con el import interno sin resolver — mismo resultado que apuntar
directamente a `node_modules`. El propio worker de MapLibre importa
`./maplibre-gl-shared.mjs` (ruta sin hash de contenido); esa ruta nunca
existe en el output real de Turbopack (solo la versión con hash), así que
el import falla con **404 dentro del contexto del propio worker** —
invisible desde el hilo principal porque MapLibre nunca engancha
`worker.onerror` al `Worker` nativo. Confirmado con una captura real de la
pestaña Network de una preview de Vercel desplegada (no solo en local).

**Patrón correcto (DT-008):** cuando una librería de terceros construye un
Worker con una URL resuelta en tiempo de ejecución (no un literal estático
en el código de la app), no intentar que Turbopack lo bundlee de ninguna
forma — es una limitación de fondo documentada en la propia guía de
Turbopack sobre Web Workers, no un detalle de configuración corregible.
**Pre-empaquetar el worker con `esbuild` en un script de build**
(`scripts/bundle-maplibre-worker.ts`), inlineando todas sus dependencias
internas en un único fichero sin imports externos, y **servirlo como
asset estático desde `public/`** — fuera por completo del pipeline de
bundling de Turbopack. `config.WORKER_URL` apunta entonces a una ruta
pública fija (`/maplibre-gl-worker.bundled.js`), sin ningún
`new URL(..., import.meta.url)` de por medio.

**Aplica a (ampliado):** cualquier caso donde el fix de "fijar la URL a
mano" no sea suficiente porque el fichero de destino en sí tiene imports
internos que Turbopack debería resolver pero no puede (por ser referenciado
como asset, no como entrada de bundling). Señal de alarma para distinguir
este caso del anterior: el `Content-Type`/`200 OK` de la petición al script
del worker es correcto, pero sigue sin haber ninguna petición de datos
(`.pbf`, tiles, etc.) — hay que mirar directamente el contenido del fichero
servido en busca de imports internos sin resolver, no solo si la petición
en sí tuvo éxito.

<!-- Formato de nueva entrada:
## [Título]
**Registrada:** YYYY-MM-DD
**Por quién:** [Rol]
[Descripción del patrón que no funciona y la alternativa correcta]
-->
