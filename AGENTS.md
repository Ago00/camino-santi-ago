# AGENTS.md — Camino de Santi·ago

## AVISO: Next.js 16 no es el Next.js que conoces

Esta versión tiene breaking changes respecto a las versiones anteriores — APIs,
convenciones y estructura de ficheros pueden diferir de los datos de entrenamiento.
**Lee los docs reales en `node_modules/next/dist/docs/` antes de escribir cualquier
código de Next.** Haz caso a los avisos de deprecación. La POC (`camino/`) usa la
misma versión y puede servir como referencia de patrones validados.

## Lo esencial del dominio antes de tocar código

### La regla no negociable de las dos trazas

Hay dos ficheros GeoJSON de la traza y tienen responsabilidades completamente
distintas. Mezclarlos es el bug más caro posible del proyecto.

| Fichero | Para qué | Longitud válida |
|---|---|---|
| `lib/traza/traza.geojson` | CÁLCULO (solo servidor) | SÍ — 100,2103 km |
| `lib/traza/traza-mapa.geojson` | PINTADO (se envía al cliente) | NO — acortada por DP |

`proyeccion.ts` **siempre** usa `traza.geojson`. El cliente **nunca** recibe
`traza.geojson` — solo los números del `Progreso`.

### El dominio puro

`lib/traza/proyeccion.ts` es puro: sin I/O, sin `Date.now()`, sin lectura de ficheros.
La traza entra como parámetro (`TrazaPreparada`). Los tests usan fixtures sintéticas.

### Los umbrales

`lib/traza/umbrales.ts` — no los pongas en línea en `proyeccion.ts`. El día del
reto puede hacer falta ajustar uno en caliente.

### Los tipos

`lib/types.ts` es el contrato entre capas. Si añades un campo al esquema de BD
en F2, actualiza aquí primero.

## Stack

- **Next.js 16.2.12** — App Router, TypeScript estricto
- **Tailwind v4** — `@import "tailwindcss"` en globals.css (no `@tailwind base` etc.)
- **pnpm** — gestor de paquetes. Siempre `pnpm`, nunca `npm` ni `yarn`.
- **Vitest** — tests unitarios del dominio

## Comandos

```bash
pnpm dev               # desarrollo
pnpm build             # build de producción
pnpm typecheck         # tsc --noEmit (debe dar cero errores)
pnpm lint              # eslint
pnpm test              # vitest run (todos los tests)
pnpm simplificar-traza # regenerar los dos GeoJSON desde la fuente
```

## Qué no instalar

- **Supabase** — entra en F2
- **MapLibre** — entra en F3

## Dónde vive cada tipo de código

Ver `docs/tecnico/arquitectura.md` para la tabla completa de capas y
responsabilidades.
