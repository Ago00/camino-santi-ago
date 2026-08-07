# Modelo de datos

Esquema Supabase (PostgreSQL). El SQL ejecutable vive en
`supabase/migrations/0001_esquema_inicial.sql` (F2) — copia literal del
diseño cerrado en `docs/tecnico/plan-ejecucion-v1.md`. Este documento describe
las entidades, sus relaciones y los invariantes críticos que el código debe
respetar.

> **Estado (F2, 2026-07-30):** la migración no se ha ejecutado nunca contra
> un proyecto Supabase real — no existe todavía (bloqueado por F0, ver
> `docs/producto/roadmap.md`). Es SQL revisado a mano, pero pendiente de
> verificación de integración: aplicarla contra una BD viva y confirmar que
> los índices, constraints y políticas RLS se crean tal como aquí se
> documentan.

---

## Entidades

### `intentos`

Representa un intento de completar el reto. Puede haber N intentos en la BD,
pero solo uno activo a la vez.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | bigint PK | Generado automáticamente |
| `fase` | text | `'antes' \| 'durante' \| 'llegada'` |
| `modo` | text | `'guiado' \| 'libre'` (DT-016). Default `'guiado'`. Se fija en `iniciarReto()` y es inmutable durante la vida del intento — cambiarlo exige "Reiniciar" |
| `destino_lat` | double precision | Destino del modo libre. `null` en modo guiado (siempre) y en modo libre antes de iniciar |
| `destino_lon` | double precision | Ídem |
| `cerrado` | boolean | `true` cuando se usa "Reiniciar" |
| `started_at` | timestamptz | Se fija al pasar a `durante` |
| `ended_at` | timestamptz | Se fija al pasar a `llegada` |
| `mensaje_llegada` | text | Editable desde el admin antes de finalizar |
| `created_at` | timestamptz | Automático |

**Invariante crítico:** `CREATE UNIQUE INDEX intentos_activo_unico ON intentos ((true)) WHERE NOT cerrado` — solo un intento abierto a la vez. La BD lo garantiza, no solo el código.

**Invariante de modo (DT-016):** `modo` se escribe una sola vez, en la transición `antes` → `durante` (`iniciarReto()`, `app/admin/actions.ts`). Ningún otro código de la app actualiza esta columna — no hay ninguna vía para cambiar el modo de un intento ya iniciado salvo "Reiniciar" (que cierra el intento actual y abre uno nuevo con `modo` en su default `'guiado'` hasta el siguiente Iniciar). `destino_lat`/`destino_lon` solo se escriben junto con `modo = 'libre'`; en modo guiado la actualización de `iniciarReto()` ni siquiera incluye esas dos columnas en el `UPDATE`, así que quedan en su default de BD (`null`).

### `posiciones`

Una posición GPS recibida de OwnTracks o registrada manualmente.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | bigint PK | Generado automáticamente |
| `intento_id` | bigint FK | Apunta al intento al que pertenece |
| `lat` | double precision | Latitud WGS-84 |
| `lon` | double precision | Longitud WGS-84 |
| `ts` | timestamptz | Marca temporal del dispositivo (no de inserción) |
| `batt` | int | % de batería, puede ser null |
| `acc` | real | Radio de precisión GPS en metros, puede ser null |
| `fuente` | text | `'app' \| 'manual'` |
| `descartado` | boolean | Soft-delete reversible (nunca se borra) |
| `created_at` | timestamptz | Automático |

**Invariante:** el índice `posiciones_intento_ts_idx ON posiciones (intento_id, ts ASC) WHERE NOT descartado` asegura que las consultas de puntos activos ordenadas por tiempo son eficientes.

**Invariante de dominio:** los puntos con `descartado = true` no participan en `calcularProgreso`. Los puntos con `acc > PRECISION_MAX_M` no suman al odómetro.

### `intenciones`

Intención dejada por familia o amigos.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | bigint PK | |
| `texto` | text | 1-1000 chars (check constraint) |
| `nombre` | text | null = anónima |
| `created_at` | timestamptz | |

**Invariante de privacidad:** no existe ninguna política RLS de `anon` sobre esta tabla. Solo el service role (servidor) puede leer intenciones. Las inserciones van por route handler con validación Zod, nunca por inserción directa del cliente.

### `comentarios`

Comentario público o privado de un seguidor.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | bigint PK | |
| `nombre` | text | 1-80 chars, nunca anónimo |
| `texto` | text | 1-1000 chars |
| `visibilidad` | text | `'publico' \| 'privado'` |
| `oculto` | boolean | El admin puede ocultar sin borrar |
| `created_at` | timestamptz | |

**Invariante de privacidad:** la política RLS de `anon` solo permite SELECT de `visibilidad = 'publico' AND NOT oculto`. El INSERT público no puede fijar `oculto = true`.

### `textos`

Textos editables de la web desde el panel admin.

| Campo | Tipo | Notas |
|---|---|---|
| `clave` | text PK | Clave libre (no hay enum en BD) |
| `valor` | text | El contenido del texto |
| `updated_at` | timestamptz | |

**Patrón de uso:** el código tiene un valor por defecto en `lib/textos/defaults.ts`. Si existe una fila en esta tabla con la misma clave, ese valor sobreescribe el por defecto. Nunca sale en blanco.

**Invariante:** añadir una clave nueva requiere código (decidir dónde se pinta). Editar un texto existente no requiere código — solo el panel admin.

### `minuto_a_minuto`

Entrada del feed en directo "minuto a minuto" (DT-013): texto corto + foto
opcional, publicada solo por el admin, con snapshot de posición.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | bigint PK | Generado automáticamente |
| `intento_id` | bigint FK | Apunta al intento sobre el que se publicó |
| `texto` | text | 1-500 chars (check constraint) |
| `foto_url` | text | URL pública de Supabase Storage (bucket `minuto-a-minuto`); null = sin foto |
| `lat` | double precision | Snapshot de la última posición conocida al publicar; null si aún no había ninguna |
| `lon` | double precision | Ídem |
| `created_at` | timestamptz | Automático |
| `updated_at` | timestamptz | Se actualiza al editar el texto |

**Invariante de diseño:** `lat`/`lon` son un snapshot fijado en el momento de
publicar, nunca recalculado después — no reflejan la posición actual de
Santi si se consultan más tarde, reflejan dónde estaba al publicar esa
entrada concreta.

**Invariante de edición (DT-013):** editar una entrada solo puede cambiar
`texto` (y `updated_at`). La foto no es editable — si está mal, la solución
es borrar la entrada y publicar una nueva. No hay soft-delete: eliminar es
hard delete, igual que `intenciones`. El objeto de Storage asociado a una
entrada eliminada no se borra (deuda aceptada explícitamente, ver `DEBT.md`).

**Storage:** las fotos viven en el bucket público `minuto-a-minuto` de
Supabase Storage. Todas las subidas pasan por `lib/supabase/storage.ts` con
el cliente `service role` (bypassa RLS de Storage), nunca desde el cliente
directamente.

---

## Relaciones

```
intentos (1) ──< posiciones (N)          intento_id → intentos.id
intentos (1) ──< minuto_a_minuto (N)     intento_id → intentos.id
```

Las demás tablas (`intenciones`, `comentarios`, `textos`) son independientes.

---

## RLS (Row Level Security)

| Tabla | anon (público) | service role (servidor) |
|---|---|---|
| `intentos` | SELECT solo el activo (`NOT cerrado`) | ALL |
| `posiciones` | SELECT solo `NOT descartado` del intento activo | ALL |
| `intenciones` | Ninguna política (cero acceso) | ALL |
| `comentarios` | SELECT `publico AND NOT oculto`; INSERT sin poder fijar `oculto` | ALL |
| `textos` | SELECT | ALL |
| `minuto_a_minuto` | SELECT solo entradas del intento activo (`NOT cerrado`) | ALL |

RLS se activa en las 5 tablas en `supabase/migrations/0001_esquema_inicial.sql`
y en `minuto_a_minuto` en `supabase/migrations/0002_minuto_a_minuto.sql`
(DT-013). El service role bypassa RLS por diseño de Supabase (no necesita
políticas explícitas); las políticas de los ficheros son únicamente para el
rol `anon`. Storage (bucket `minuto-a-minuto`) no tiene políticas propias:
es un bucket público, y todas las subidas pasan por el cliente service role.

Las columnas nuevas de `intentos` (`modo`, `destino_lat`, `destino_lon`,
`supabase/migrations/0003_modo_intento.sql`, DT-016) no cambian la política
RLS existente de `intentos_select_activo` — siguen siendo columnas del mismo
intento activo, ya visible en su totalidad para `anon`.

---

## Migración

**Ubicación:** `supabase/migrations/0001_esquema_inicial.sql` (5 tablas
iniciales), `supabase/migrations/0002_minuto_a_minuto.sql` (tabla
`minuto_a_minuto` + bucket de Storage, DT-013) y
`supabase/migrations/0003_modo_intento.sql` (columnas `modo`/`destino_lat`/
`destino_lon` de `intentos`, DT-016).

**Convención de carpeta:** `supabase/migrations/NNNN_slug.sql`, numeración
secuencial de 4 dígitos — la misma que usa la CLI oficial de Supabase
(`supabase migration new <slug>`), para que aplicar la migración el día que
exista el proyecto sea tan simple como pegarla en el editor SQL o correr
`supabase db push`.

**Contenido:** las 5 tablas de este documento, sus índices (incluidos el
único-activo de `intentos` y el de `posiciones` filtrado por `NOT
descartado`), y RLS activado con las políticas de la tabla de arriba.

---

## Clientes Supabase tipados

`lib/supabase/admin.ts` (`getSupabaseAdmin()`, service role — bypassa RLS,
solo server-side) y `lib/supabase/public.ts` (`getSupabasePublic()`, anon key
— sujeto a RLS). Ambos:

- Comparten el tipo `BaseDeDatos` (definido en `admin.ts`, importado por
  `public.ts`), espejo tipado de las 5 tablas de este documento.
- Se construyen de forma perezosa: la primera llamada a `getSupabaseAdmin()`
  / `getSupabasePublic()` lee las env vars y lanza si faltan. Importar el
  módulo, o que `pnpm build` recorra el árbol de imports, nunca falla por
  falta de credenciales — condición necesaria para poder compilar el
  proyecto antes de que exista el proyecto Supabase (F0).
- Cada `Row` de `BaseDeDatos` se envuelve en `Pick<T, keyof T>` en vez de usar
  el `interface` de `lib/types.ts` directamente. Es una particularidad de
  cómo `@supabase/supabase-js` infiere tipos: exige que `Row` sea
  estructuralmente asignable a `Record<string, unknown>`, y los `interface`
  de TypeScript no tienen index signature implícito. Sin el envoltorio,
  `.insert()`/`.update()` resuelven silenciosamente a `never` sin ningún
  error hasta que se usan con datos reales — documentado en el comentario de
  `admin.ts` junto al tipo.
