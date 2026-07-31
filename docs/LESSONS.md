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

<!-- Formato de nueva entrada:
## [Título]
**Registrada:** YYYY-MM-DD
**Por quién:** [Rol]
[Descripción del patrón que no funciona y la alternativa correcta]
-->
