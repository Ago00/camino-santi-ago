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

<!-- Formato de nueva entrada:
## [Título]
**Registrada:** YYYY-MM-DD
**Por quién:** [Rol]
[Descripción del patrón que no funciona y la alternativa correcta]
-->
