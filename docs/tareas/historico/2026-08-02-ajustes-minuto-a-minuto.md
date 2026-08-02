# Tarea en curso

**Título:** Ajustes visuales del feed "Minuto a minuto"
**Tipo:** Feature (ajuste sobre feature ya cerrada)
**Estado:** Revisión
**Iniciada:** 2026-08-02

## Prompt clarificado

Dos cambios pedidos por el usuario tras probar la feature en producción:

1. **Posición del feed**: en ambos modos donde aparece (`ModoDurante.tsx` y
   `ModoLlegada.tsx`), el feed `<MinutoAMinuto>` está hoy colocado justo
   después del mapa y antes de `<Mojon>`/`<Stats>`. Debe moverse a **después
   de `<Stats>`** en los dos sitios.
2. **Protagonismo de la foto**: cuando una entrada tiene foto, hoy se ve como
   una miniatura pequeña (14x14) a la izquierda del texto. Debe pasar a verse
   **grande, ocupando el ancho de la tarjeta, con el texto debajo** — la foto
   como elemento principal, no como miniatura. Las entradas sin foto no
   cambian (siguen mostrando solo hora + texto, sin hueco para imagen).

## Alcance
- Incluye: `components/publico/ModoDurante.tsx`, `ModoLlegada.tsx`
  (reordenar), `components/publico/MinutoAMinuto.tsx` (rediseño de la
  tarjeta con foto).
- Excluye: cualquier cambio de backend, endpoint, Storage o Server Actions
  — puramente presentación. Sin cambio en la interacción de clic → mapa
  (se mantiene igual, solo cambia el layout visual de la tarjeta).

## Decisión técnica / Diagnóstico
Trivial — cambio de JSX/orden, sin arquitectura nueva. Sin DT nueva.

## Archivos modificados

- `components/publico/ModoDurante.tsx` — `<MinutoAMinuto>` movido de justo
  después del mapa a justo después de `<Stats>`. Ninguna prop cambiada.
- `components/publico/ModoLlegada.tsx` — mismo reordenamiento: `<Stats>`
  ahora antes que `<MinutoAMinuto>`.
- `components/publico/MinutoAMinuto.tsx` — rediseño de la tarjeta dentro del
  `.map()`: cuando `entrada.foto_url` existe, la tarjeta pasa a layout en
  columna (`<img className="h-48 w-full object-cover">` a ancho completo
  arriba, hora + texto debajo en su propio bloque con padding). Sin foto, la
  tarjeta no cambia (fila compacta original: `flex items-start gap-3 px-4
  py-3`). Sin cambios en `alPulsar`, polling, paginación ni props del
  componente.

## Quality gates

- `pnpm typecheck` — verde, cero errores.
- `pnpm lint` — verde, cero errores.
- `pnpm test` — verde, 201/201 tests (20 ficheros). Sin tests nuevos: cambio
  puramente de JSX/clases sin lógica de negocio nueva, conforme a la regla
  del framework de "sin testing de componentes React, no hay infraestructura".

## Verificación visual

Verificado contra un `pnpm dev` local apuntando a las mismas env vars de
producción/preview (`.env.local` existente en el proyecto). La fase activa
en este momento es "llegada" (`ModoLlegada`), que carga las entradas
server-side — permitió verificar el HTML renderizado real, incluida la
entrada real "Mirad que bonito" con `foto_url` de Supabase Storage:

- Orden confirmado en el HTML servido: "En marcha" / "Ritmo medio" (de
  `<Stats>`) aparecen antes que "Minuto a minuto" en el DOM — el
  reordenamiento se refleja correctamente.
- La entrada con foto renderiza `<img class="h-48 w-full object-cover">` a
  ancho completo, seguida de un bloque `<div class="min-w-0 px-4 py-3">` con
  hora ("01:18") y texto ("Mirad que bonito") debajo, en columna.
- Las entradas sin foto ("Dos", "Uno", "Va duro el camino") conservan la
  clase original `flex w-full items-start gap-3 rounded-xl border px-4 py-3`
  sin cambios.

No se ha comprobado con captura de pantalla real en navegador (sin acceso a
herramientas de navegador/computer-use en este entorno de ejecución), pero
el HTML/CSS resultante se inspeccionó directamente contra los datos reales
de producción y coincide con lo especificado.

## Historial de revisión

### Reviewer — 2026-08-02 — ✅ Aprobado

**Verificado:**
- Reordenamiento `<Stats>` antes de `<MinutoAMinuto>` confirmado en
  `ModoDurante.tsx` (tras `<Mojon>`) y en `ModoLlegada.tsx`. Coincide con lo
  acordado en ambos sitios, no solo en uno.
- Tarjeta sin foto (`MinutoAMinuto.tsx`): className sin cambios, sigue siendo
  `flex w-full items-start gap-3 rounded-xl border px-4 py-3 ...` — layout
  compacto en fila preservado.
- Interacción de clic (`alPulsar`, `disabled={!tienePosicion}`, resaltado de
  borde/fondo vía `style` con `esActiva`) vive en el `motion.button` exterior,
  no en el contenido condicional que se rediseñó — no se tocó ni rompió en
  ninguna de las dos variantes (con/sin foto).
- Sin cambios fuera de alcance: props, tipos (`EntradaMinutoAMinutoPublica`,
  `RespuestaFeed`, `PuntoResaltado`) y endpoints intactos.
- Tipado estricto: sin `any`, sin `as`. El único `eslint-disable` de la
  imagen es preexistente y ya justificado, no introducido en esta tarea.
- `CHANGELOG.md` actualizado con entrada clara orientada a producto.
- Sin tests nuevos: correcto conforme al framework (cambio de JSX/clases sin
  lógica de negocio nueva).

**Bloqueantes:** ninguno.
**Recomendaciones:** ninguna.

Aprobado — pasa a Seguridad.

### Seguridad — 2026-08-02 — ✅ Aprobado

**Estándares aplicados:** OWASP Top 10.

**Alcance verificado:** diff real contra `main` limitado a
`ModoDurante.tsx`, `ModoLlegada.tsx`, `MinutoAMinuto.tsx`, `CHANGELOG.md` y
`docs/tareas/CURRENT.md` (confirmado con `git diff main --stat`). Sin
cambios en `package.json`/lockfile, por lo que no aplica auditoría de
dependencias nueva para esta tarea.

**Revisión:**
- `ModoDurante.tsx` / `ModoLlegada.tsx`: únicamente se reordena la
  posición de `<MinutoAMinuto>` respecto a `<Stats>`. Mismas props, mismo
  componente, sin superficie de seguridad nueva.
- `MinutoAMinuto.tsx`: el `<img src={entrada.foto_url}>` sigue siendo un
  atributo normal de un elemento `<img>` estándar (mismo
  `eslint-disable @next/next/no-img-element` preexistente, ya justificado,
  no introducido en esta tarea). Solo cambia la clase CSS (`h-14 w-14` →
  `h-48 w-full object-cover`) y la estructura del contenedor (fila →
  columna). No hay `dangerouslySetInnerHTML` ni interpolación en
  `href`/`src` de forma insegura.
- `entrada.texto` se sigue renderizando como children de JSX normal
  (`{entrada.texto}`), con el auto-escapado habitual de React. No se ha
  añadido ningún punto nuevo donde el texto se renderice fuera de JSX
  normal.
- Sin endpoints, Server Actions, RLS ni Storage tocados. Sin datos
  sensibles, secretos ni logs nuevos. Sin requests a URLs construidas con
  input de usuario (A10 no aplica).

**Issues encontrados:** ninguno.

**Veredicto:** ✅ Sin vulnerabilidades — tarea lista para cerrar.
