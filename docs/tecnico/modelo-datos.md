# Modelo de datos

Esquema Supabase (PostgreSQL). El schema SQL completo está en
`docs/tecnico/plan-ejecucion-v1.md`. Este documento describe las entidades,
sus relaciones y los invariantes críticos que el código debe respetar.

---

## Entidades

### `intentos`

Representa un intento de completar el reto. Puede haber N intentos en la BD,
pero solo uno activo a la vez.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | bigint PK | Generado automáticamente |
| `fase` | text | `'antes' \| 'durante' \| 'llegada'` |
| `cerrado` | boolean | `true` cuando se usa "Reiniciar" |
| `started_at` | timestamptz | Se fija al pasar a `durante` |
| `ended_at` | timestamptz | Se fija al pasar a `llegada` |
| `mensaje_llegada` | text | Editable desde el admin antes de finalizar |
| `created_at` | timestamptz | Automático |

**Invariante crítico:** `CREATE UNIQUE INDEX intentos_activo_unico ON intentos ((true)) WHERE NOT cerrado` — solo un intento abierto a la vez. La BD lo garantiza, no solo el código.

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

---

## Relaciones

```
intentos (1) ──< posiciones (N)   intento_id → intentos.id
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
