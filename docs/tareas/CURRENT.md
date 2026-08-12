# Tarea en curso

## Prompt clarificado

Pestaña "Tráfico" del panel admin (DT-023, `docs/tecnico/decisiones-tecnicas.md`):
- Contador reseteable (`config_trafico.cuenta_desde`, botón "Reset" con confirmación) en vez de rango fijo al intento activo.
- Clasificación de visitas en fases antes/durante/después del intento relevante (activo, o el más reciente si no hay ninguno activo), en memoria, sobre una única consulta de `visitas_web` filtrada por `ts >= cuenta_desde`.
- Pestañas por fase vía `?fase=`, mismo patrón que `?gran=`.

Nota: DT-023 no existía todavía en `decisiones-tecnicas.md` al empezar esta tarea (el fichero terminaba en DT-022) — se ha añadido como parte de esta tarea, con el contenido resumido en el prompt del Orquestador, para no dejar la documentación técnica desactualizada.

## Implementación

**Rama:** `feature/trafico-fases-reset`

**Archivos nuevos:**
- `supabase/migrations/0005_config_trafico.sql` — tabla `config_trafico`, fila única.
- `lib/trafico/fases.ts` + `lib/trafico/fases.test.ts` — clasificación pura por fase (dominio).

**Archivos modificados:**
- `lib/types.ts` — tipo `ConfigTrafico`.
- `lib/supabase/admin.ts` — tabla `config_trafico` en `BaseDeDatos`.
- `app/admin/actions.ts` — `resetearContadorTrafico` (al final del fichero).
- `lib/admin/navegacion.ts` — `FaseTraficoTab`/`esFaseTraficoValida`.
- `app/admin/page.tsx` — lee `?fase=`, lo pasa a `SeccionTrafico`.
- `components/admin/SeccionTrafico.tsx` — reescrito: lee `config_trafico`, intento relevante, clasifica por fase, selector de fase, botón Reset.
- `CHANGELOG.md`, `DEBT.md`, `docs/tecnico/decisiones-tecnicas.md` (nueva entrada DT-023).

## Quality gates

- `pnpm typecheck` — verde, cero errores.
- `pnpm lint` — verde, cero errores/warnings.
- `pnpm test` — verde, 399 tests (399 pasan, incluye 22 nuevos en `lib/trafico/fases.test.ts`).

## Alcance respetado

No se ha tocado ningún fichero de la lista de exclusión (`Mojon.tsx`, `DistanciaRestante.tsx`, `PerfilElevacion.tsx`, `Stats.tsx`, `IntencionForm.tsx`, `ComentarioForm.tsx`, `MuroComentarios.tsx`, `MinutoAMinuto.tsx`, `PeregrinoLibre.tsx`, `ModoLlegada.tsx`, `ActividadAcciones.tsx`). `app/admin/actions.ts` solo se ha tocado para añadir la acción nueva al final, sin reordenar ni modificar las existentes.

Sin bloqueos mayores. Sin push ni PR (lo gestiona el Orquestador desde el hilo principal).
