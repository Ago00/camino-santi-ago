# Tarea en curso

**Título:** Fotos del feed "Minuto a minuto" sin recortar
**Tipo:** Feature (ajuste sobre PR abierto #14, misma rama)
**Estado:** Revisión
**Iniciada:** 2026-08-02

## Prompt clarificado

La foto de cada entrada con imagen se muestra hoy en una caja de altura fija
(`h-48 w-full object-cover`), que recorta la foto para rellenar el hueco.
El usuario quiere que la foto se vea completa, sin recortar. Decisión
tomada con el usuario: quitar la altura fija y dejar que la imagen muestre
su proporción real (`w-full h-auto`), en vez de añadir un visor a pantalla
completa (más complejidad, descartado explícitamente).

## Alcance
- Incluye: `components/publico/MinutoAMinuto.tsx`, solo la clase de la
  imagen dentro de la tarjeta con foto.
- Excluye: cualquier visor/lightbox a pantalla completa (descartado).

## Decisión técnica / Diagnóstico
Trivial — cambio de una clase Tailwind. Sin DT nueva.

## Archivos modificados
- `components/publico/MinutoAMinuto.tsx` — la clase de la imagen de la
  tarjeta con foto pasa de `h-48 w-full object-cover` a `w-full h-auto`
  (única línea tocada; sin cambios de lógica, sin visor/lightbox).
- `CHANGELOG.md` — añadida la línea del ajuste a la entrada ya existente de
  esta misma rama ("Ajustes visuales del feed 'Minuto a minuto' tras
  feedback real").

## Quality gates
- `pnpm typecheck` — verde, cero errores.
- `pnpm lint` — verde, cero errores.
- `pnpm test` — verde, 201 tests / 20 ficheros, todos en verde.
- Verificación visual: dev server local ya en marcha (puerto 3001,
  `.env.local` real) contra la entrada real "Mirad que bonito" (id 3,
  foto real en Supabase Storage). Confirmado por HTML server-renderizado
  que la imagen de esa entrada lleva exactamente `w-full h-auto` y cero
  ocurrencias de `object-cover`/`h-48`. `postcss.config.mjs` existe
  (Tailwind operativo, ver `docs/LESSONS.md`). Limitación: no se dispuso
  de herramientas de navegador (MCP) en este entorno de subagente para
  tomar una captura de pantalla real del renderizado; la verificación se
  basó en el HTML servido por el propio dev server con datos reales, no
  en una build estática ni en mocks.

## Historial de revisión

### Reviewer — 2026-08-02
✅ Aprobado. Único cambio real confirmado: línea 163 de
`components/publico/MinutoAMinuto.tsx`, clase de la imagen
`h-48 w-full object-cover` → `w-full h-auto`; cero ocurrencias restantes de
`h-48`/`object-cover` en el fichero. Resto de la tarjeta sin tocar (contenedor
`motion.button` con `overflow-hidden rounded-xl`, bloque hora/texto,
`alPulsar`, estado `seleccionada`, rama sin foto). No rompe el layout: es el
patrón estándar para altura natural de imagen y no depende de otros elementos
de la tarjeta. `CHANGELOG.md` actualizado, quality gates en verde. Sin
bloqueantes ni recomendaciones. Pasa a Seguridad.

### Seguridad — 2026-08-02
✅ Sin vulnerabilidades. Único cambio: clase Tailwind `h-48 w-full object-cover` → `w-full h-auto` en `components/publico/MinutoAMinuto.tsx`; sin lógica, datos ni endpoints. Sin superficie OWASP que auditar. Lista para cerrar.
