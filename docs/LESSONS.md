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

## Comentarios de cabecera que documentan un estado transitorio ("bloqueado por F0", "no probado aún") sobreviven fases enteras sin actualizarse

**Registrada:** 2026-08-01 (F5 — Cierre, auditoría completa)
**Por quién:** Reviewer

En la auditoría completa de F5 (todo el código acumulado desde F1) aparecieron
tres ficheros de producción (`app/api/track/route.ts`, `lib/supabase/admin.ts`,
`lib/supabase/public.ts`) con comentarios de cabecera escritos en F2 que
afirman literalmente "NO SE HA PROBADO CONTRA UNA BASE DE DATOS REAL" y
"bloqueado por F0" — falsos desde hace tres fases: el proyecto está en
producción real con Supabase desde F2. Es el mismo patrón que ya había
generado una entrada de deuda en F4 (`EnlacePaginacion.tsx`, comentario que
describe un `<Link>` que ya no existe), pero esta vez en tres ficheros a la
vez y sobre una afirmación más engañosa (sugiere que código crítico de
ingesta/BD nunca se validó contra datos reales, cuando sí se validó e incluso
generó una entrada en `docs/bugs/BUGS.md`).

**Causa raíz del patrón:** un comentario que documenta el *estado del
proyecto en el momento de escribirlo* (en vez de una decisión o invariante
atemporal) caduca en cuanto ese estado cambia, y nada en el pipeline fuerza su
revisión — no rompe ningún test, no falla ningún build, y el Implementador de
la fase siguiente rara vez vuelve a abrir un fichero que ya "funciona" y no
está tocando.

**Regla a partir de ahora:** los comentarios sobre "no probado todavía" /
"bloqueado por [fase futura]" / cualquier afirmación atada a un estado
temporal del proyecto deben tratarse como TODO con caducidad explícita, no
como documentación permanente. Dos alternativas mejores: (a) si la
información es relevante a largo plazo, moverla a `docs/bugs/BUGS.md` o
`decisiones-tecnicas.md` en pasado ("se verificó en la fase X, ver..."), donde
sí hay revisión activa; (b) si es puramente transitoria, no dejarla como
comentario de cabecera sino como entrada de `DEBT.md` con la fase en la que
caduca, para que algún checklist la recoja. El Reviewer, al auditar cualquier
fase de cierre, debe además buscar explícitamente referencias a fases
anteriores o "pendiente de F#" en comentarios de código (no solo en `DEBT.md`)
— es una categoría de desactualización que no se detecta leyendo solo la
documentación viva.

**Aplica a:** cualquier proyecto con pipeline multi-fase donde el código de
una fase temprana se comenta describiendo limitaciones que fases posteriores
resuelven — buscar y purgar estos comentarios debe ser parte explícita del
checklist de cualquier tarea de tipo "cierre" o "auditoría completa".

## Features cerradas por el pipeline técnico dejan `docs/producto/` desactualizado si nadie invoca al Agente de Producto al cierre

**Registrada:** 2026-08-07 (revisión de DT-016 — modo de intento guiado/libre)
**Por quién:** Reviewer

Segunda vez que ocurre el mismo patrón (la primera fue "Minuto a minuto",
DEBT.md 2026-08-02): una feature de cara al usuario se implementa
completamente, con `CHANGELOG.md` y documentación técnica
(`arquitectura.md`, `decisiones-tecnicas.md`, `modelo-datos.md`) al día,
pero `docs/producto/funcionalidades.md`, `decisiones-producto.md` y
`roadmap.md` no se tocan — porque el pipeline estándar (Clarificador →
Arquitecto → Implementador → Reviewer → Seguridad) nunca invoca al Agente de
Producto salvo que el usuario lo pida explícitamente en conversación
directa. El Implementador actualiza `CHANGELOG.md`/`DEBT.md` (su
responsabilidad según el framework, sección 8) pero no `docs/producto/`,
que es responsabilidad exclusiva del Agente de Producto.

**Causa raíz:** el framework asigna `docs/producto/` al Agente de Producto,
pero ese agente no forma parte del pipeline de desarrollo (sección 3: "No
forma parte del pipeline de desarrollo. Se invoca en conversación directa
con el usuario"). Si una feature nace directamente como tarea técnica (sin
pasar antes por una conversación de producto que la registre en
`roadmap.md`), no hay ningún punto del pipeline que la documente desde la
perspectiva de usuario al cerrarse.

**Regla a partir de ahora:** el Reviewer, al auditar la sección de
documentación de cualquier feature con impacto visible para el usuario
final, debe comprobar explícitamente `docs/producto/funcionalidades.md` y
`decisiones-producto.md` además de `CHANGELOG.md`/`DEBT.md`/documentación
técnica — y si están desactualizados, registrarlo como recomendación en
`DEBT.md` (no bloqueante, porque escribir documentación de producto no es
responsabilidad del Implementador), para que quede trazado y alguien lo
retome explícitamente. El Orquestador debería considerar invocar al Agente
de Producto como paso de cierre para toda feature con superficie de usuario
nueva, no solo cuando el usuario lo pide.

**Aplica a:** cualquier tarea de tipo Feature (no Fix/Mejora interna) que
cambie lo que ve o puede hacer un usuario final de la web pública o del
panel admin.

## Una migración escrita y aprobada no es una migración aplicada: verificar contra el entorno real antes de dar una tarea por cerrada

**Registrada:** 2026-08-07 (Ronda 2 de revisión de DT-016 — modo de intento guiado/libre)
**Por quién:** Reviewer (a partir de un hallazgo del Orquestador)

DT-016 pasó Ronda 1 completa (Reviewer y Seguridad, sin bloqueantes) con las
4 quality gates de código en verde (`typecheck`, `lint`, `test`, `build`) y
una migración nueva (`supabase/migrations/0003_modo_intento.sql`) escrita,
revisada y correcta en su contenido SQL. Nadie en el pipeline —ni el
Implementador, ni el Reviewer, ni Seguridad— comprobó si esa migración
estaba realmente **aplicada contra el proyecto Supabase de producción**
antes de dar la tarea por lista. No lo estaba. El código desplegado asumía
columnas que no existían todavía en la BD real: la web pública mostraba la
fase "antes del reto" con un intento realmente en curso, y `/api/track`
descartaba en silencio cada punto GPS recibido. Lo encontró el Orquestador
verificando la rama en vivo contra Supabase real, no ningún agente del
pipeline estándar.

**Causa raíz:** el pipeline (Clarificador → Arquitecto → Implementador →
Reviewer → Seguridad) opera enteramente sobre código y sus quality gates
automatizadas — ninguna de ellas ejecuta ni verifica migraciones contra un
entorno real. Escribir el fichero `.sql` correcto es necesario pero no
suficiente: como con el CSS de Tailwind (ver lección "Ninguna quality gate
detecta que Tailwind no esté generando CSS real"), hay una clase entera de
fallos que solo se manifiestan verificando contra el sistema real desplegado,
nunca contra código o tests aislados.

**Regla a partir de ahora:** cuando una tarea incluye una migración de base
de datos nueva, el checklist de cierre no puede darse por completo solo con
las quality gates de código — hace falta confirmar explícitamente si la
migración se ha aplicado (o se aplicará) contra el entorno real antes de que
el código que depende de ella se considere listo para producción. Si la
migración todavía no se puede aplicar en el momento de la tarea (por
ejemplo, se coordina aparte), el código dependiente debe incluir desde el
diseño —no como parche posterior— una salvaguarda explícita ante columnas
inexistentes, en vez de asumir que el esquema de BD ya refleja la migración
recién escrita.

**Aplica a:** cualquier tarea de cualquier proyecto que añada una migración
de base de datos nueva — el Arquitecto debe considerar en su análisis si la
migración se aplicará antes o después del despliegue del código dependiente,
y el Orquestador debe verificar el estado real de la migración contra el
entorno de producción como parte del cierre, igual que ya hace con la
verificación visual de UI.

<!-- Formato de nueva entrada:
## [Título]
**Registrada:** YYYY-MM-DD
**Por quién:** [Rol]
[Descripción del patrón que no funciona y la alternativa correcta]
-->
