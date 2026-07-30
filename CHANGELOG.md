# Changelog

---

## 2026-07-30 — F1: Correcciones de seguridad y limpieza de dependencias

**Tipo:** Fix

Se parchean dos grupos de CVEs de alta severidad en dependencias transitivas de
Next.js mediante overrides de pnpm: `sharp` (4 CVEs en libvips) y `postcss`
(path traversal + XSS). Se elimina la dependencia fantasma `@turf/length` y se
reubica `@turf/simplify` en devDependencies. La auditoría de producción queda
en cero vulnerabilidades.

---

## 2026-07-30 — F1: Base del proyecto

**Tipo:** Feature

Se establece la base sobre la que se construyen las fases F2-F5. Incluye el
scaffolding completo (Next.js 16, TypeScript estricto, Tailwind v4, Vitest),
la traza del camino extendida hasta la Praza do Obradoiro (100,21 km), el
motor de cálculo de progreso con barra monótona y odómetro real, los tipos
de dominio que usarán las siguientes fases, y toda la documentación técnica
y de producto del framework.

La web muestra un placeholder sobrio. El diseño real entra en F3.
