# Tarea en curso

## Prompt / decisión a implementar

Sustituir el `window.confirm()` + `<textarea>` plano que usa hoy "Finalizar"
(`components/admin/ActividadAcciones.tsx`) por un modal con:
- Mensaje de llegada editable (igual que hoy).
- Foto opcional: adjuntar/reemplazar/quitar, con compresión en el navegador
  (mismo patrón que el feed "minuto a minuto", DT-013/DT-017).
- Preview real (no aproximada) del recuadro kicker/título/mensaje tal como
  se ve en `components/publico/ModoLlegada.tsx`.

Decisión completa (ya no era DT-024 en el repo al empezar — el Implementador
la escribió al cerrar, ver nota de LESSONS.md sobre desviaciones que deben
quedar en el documento de decisiones): `docs/tecnico/decisiones-tecnicas.md`,
entrada **DT-024**.

## Rama

`feature/finalizar-preview-foto`

## Archivos modificados / creados

**Nuevos:**
- `supabase/migrations/0006_foto_llegada.sql` — columna `intentos.foto_llegada_url`
- `components/admin/ModalFinalizar.tsx`
- `components/publico/RecuadroLlegada.tsx` (extraído de `ModoLlegada.tsx`)
- `components/publico/FotoLlegada.tsx`
- `components/admin/SeccionActividad.test.ts`

**Modificados:**
- `lib/types.ts` — `Intento.foto_llegada_url`
- `lib/supabase/storage.ts` / `.test.ts` — `subirFotoLlegada()`, helper interno `subirFotoAlBucket`
- `app/admin/actions.ts` / `.test.ts` — `finalizarReto` pasa a `FormData` → `ResultadoPublicacion`
- `app/page.tsx` / `.test.ts` — `ModoLlegadaConectado` lee `foto_llegada_url` (`obtenerFotoLlegadaUrl`, consulta separada)
- `components/admin/SeccionActividad.tsx` — `obtenerIntentoActividad` (consulta separada), pasa `textos`/foto a `ActividadAcciones`
- `components/admin/ActividadAcciones.tsx` — "Finalizar" abre `ModalFinalizar`
- `components/publico/ModoLlegada.tsx` — usa `RecuadroLlegada`/`FotoLlegada`, pinta la foto si existe
- `app/admin/page.test.ts` — `beforeAll` con timeout propio (30 s) para el `import()` pesado (ver DEBT.md, entrada resuelta)
- `docs/tecnico/decisiones-tecnicas.md` (DT-024), `docs/tecnico/arquitectura.md`, `docs/tecnico/modelo-datos.md`, `CHANGELOG.md`, `DEBT.md`

## Quality gates

- `pnpm typecheck` — verde, 0 errores.
- `pnpm lint` — verde, 0 errores.
- `pnpm test` — 35/35 ficheros y 386/386 tests en verde. `pnpm test` completo
  reporta exit code 1 por un "Unhandled Error" de infraestructura de Vitest
  (`[vitest-worker]: Timeout calling "onTaskUpdate"`) originado en
  `lib/traza/proyeccion.ventana.test.ts` — fichero preexistente, no tocado en
  esta tarea, deuda ya documentada en `DEBT.md` (actualizada con esta
  observación). Verificado que `pnpm vitest run --exclude
  "**/proyeccion.ventana.test.ts"` da exit code 0 con los mismos 386 tests
  en verde.

## Decisiones de implementación (bloqueos menores resueltos sin pausar)

1. `finalizarReto` cambia de firma (`mensaje: string` → `FormData`) y de
   contrato de error (`throw` → `ResultadoPublicacion`), igual que
   `crearMinutoAMinuto` (DT-017) — necesario porque ahora puede fallar la
   subida de una foto, y Next redacta el mensaje de cualquier `throw` en
   producción. Documentado en DT-024.
2. `foto_llegada_url` se consulta por separado de `modo`/`destino_lat`/
   `destino_lon` (que ya tienen su propio fallback de compatibilidad con la
   migración 0003 sin aplicar) para no acoplar dos migraciones
   independientes en el mismo `select`.
3. `app/admin/page.test.ts` movido a `beforeAll` para el `import()` pesado —
   cierra una deuda preexistente que el crecimiento del árbol de imports de
   esta tarea convirtió en fallo consistente.

## Deuda generada

Ver `DEBT.md`: "Recordatorio: aplicar `supabase/migrations/0006_foto_llegada.sql`
contra producción" (Alta) y "Objeto huérfano en Storage al reemplazar la foto
de llegada" (Baja).
