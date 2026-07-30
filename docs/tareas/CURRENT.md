# Tarea en curso

**Título:** F1 — Base del proyecto (scaffolding + traza + proyección + tipos)
**Tipo:** Feature
**Estado:** Arquitectura
**Iniciada:** 2026-07-30

## Prompt clarificado

Crear el proyecto `camino-santi-ago` desde cero con la base sobre la que se
construyen F2-F5 del plan (`docs/tecnico/plan-ejecucion-v1.md`). F1 no toca base
de datos, ni red, ni UI real: entrega cimientos y el corazón del dominio.

1. **Scaffolding.** Next.js 16.2.x (misma familia que la POC; ver `AGENTS.md`:
   esta versión rompe convenciones conocidas, hay que leer
   `node_modules/next/dist/docs/` antes de escribir código), App Router,
   TypeScript estricto sin `any`, Tailwind v4, ESLint, **pnpm**. Vitest para
   tests unitarios puros. Home placeholder sin diseño (F3 la sustituye).
2. **Estructura de carpetas** según el plan, creando solo las que llevan
   archivos reales en F1 — sin carpetas fantasma esperando a F4.
3. **Traza.** Original (6.911 puntos, 511 KB) en `docs/`; simplificada en
   `lib/traza/traza.geojson`, generada por `scripts/simplificar-traza.ts`
   (Douglas-Peucker). **Invariante: la longitud simplificada sigue siendo
   100,000 km.** Si la traza encoge, la barra nunca llega al 100%.
4. **`lib/traza/proyeccion.ts`** — dominio puro, sin I/O: (histórico, traza) =>
   Progreso. Avance proyectado, barra monótona, odómetro haversine real, km
   restantes return-aware, estado `en-ruta | desvio-menor | desvio-mayor`.
5. **`lib/types.ts`** — tipos de dominio derivados del esquema del plan
   (`Intento`, `Posicion`, `Fase`, `Progreso`…), contrato para F2-F4.
6. **Documentación base** del framework + `CHANGELOG.md` + `DEBT.md` +
   `CLAUDE.md`/`AGENTS.md`.

### Alcance

- **Incluye:** repo, scaffolding, tooling, traza simplificada, `proyeccion.ts`
  con tests, tipos de dominio, documentación base.
- **Excluye:** esquema SQL y RLS, `/api/track`, clientes Supabase (F2) · mapa,
  web pública, componentes (F3) · admin, middleware, auth (F4).

### Comportamiento en casos límite de `proyeccion.ts`

| Caso | Comportamiento |
|---|---|
| Histórico vacío / 1 punto | Progreso en cero, sin reventar. Odómetro 0, estado `en-ruta` |
| Retroceso sobre sus pasos | La barra **no baja** (máximo histórico). El odómetro **sí sube** |
| Desvío pequeño (~80 m) | `desvio-menor`; el avance se sigue proyectando sobre el plan |
| Desvío grande (~2 km) | `desvio-mayor`; al reenganchar, el tramo del plan saltado cuenta como avanzado |
| Salto GPS imposible (300 km en 1 min) | Rechazado por velocidad; no contamina odómetro ni barra |
| Punto `descartado` | Se ignora como si no existiera; reversible |
| Llegada al Obradoiro | Barra exactamente 100%, km restantes 0 |

### Supuestos asumidos

- Next 16.2.12 fijada, no `create-next-app` a ciegas: la POC ya validó esa versión.
- Solo se instalan las dependencias que F1 usa (Turf, Vitest). MapLibre y
  Supabase entran en su fase, para no arrastrar peso muerto.
- La traza original se versiona además de la simplificada: es la fuente
  regenerable y el CC BY-SA 4.0 exige conservar la atribución.
- Los tests de `proyeccion.ts` son unitarios puros con fixtures sintéticas.

### Decisión de producto del usuario (2026-07-30)

**La meta es la Praza do Obradoiro**, no donde muere la traza oficial de la
Xunta (Praza da Quintana, 93 m en línea recta por detrás de la catedral).

## Diseño

Mockup: N/A — F1 no tiene UI. El diseño aprobado del sandbox se aplica en F3.

## Decisión técnica / Diagnóstico

(pendiente)

## Archivos modificados

(pendiente)

## Quality gates

(pendiente)

## Historial de revisión

(pendiente)
