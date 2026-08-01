# Tarea en curso

**Título:** Estadísticas (tiempo, distancia, ritmo) en la pantalla de llegada
**Tipo:** Feature
**Estado:** Revisión
**Iniciada:** 2026-08-01

## Prompt clarificado

En `components/publico/ModoLlegada.tsx`:
- Se retira el bloque de 2 cifras (km caminados / tiempo total) del cabecero
  celebratorio, que queda solo con logo, "Camino completado", el titular y el
  mensaje de llegada.
- Se añade, debajo del mapa, la misma rejilla de 3 estadísticas que ya usa el
  modo "durante" (componente `Stats.tsx`, reutilizado tal cual): **tiempo**
  (total del intento), **distancia** (km caminados,
  `progreso.odometroKm`), y **ritmo medio** (nuevo — km/h medio de todo el
  intento, calculado server-side en `app/page.tsx` con `startedAt`→`endedAt`,
  misma fórmula que `calcularRitmoMedio` de `ModoDurante.tsx` pero con
  `endedAt` en vez de "ahora").

Decidido con el usuario: rejilla de 3 cajas (opción recomendada), no añadir
solo el ritmo al cabecero existente.

### Alcance
- Incluye: `ModoLlegada.tsx` (quitar mini-stats del cabecero, añadir
  `<Stats>` tras el mapa), `app/page.tsx` (calcular y pasar `ritmoMedio`
  formateado a `ModoLlegada`, igual que ya hace con `tiempoTotal`).
- Excluye: `Mojon` (km restantes) — no aporta tras la llegada, no se añade.
  No se toca `ModoDurante.tsx` ni `Stats.tsx`.

### Supuestos asumidos
- Trivial en arquitectura: una sola solución razonable, sin pasar por
  Arquitecto con pausa de aprobación — reutilizar `Stats.tsx` tal cual y
  replicar la fórmula de ritmo ya validada en `ModoDurante.tsx`.
- La duplicación menor de `formatearKm` (ya existe en `ModoDurante.tsx`)
  queda a criterio del Implementador: puede extraerla a un util compartido
  o duplicarla, según lo que considere más limpio.

## Diseño
Mockup: N/A (ajuste sobre pantalla ya existente, sin sandbox de diseño)

## Decisión técnica / Diagnóstico
Trivial — ver "Supuestos asumidos". Sin DT nueva (no hay tradeoffs reales
que registrar).

## Archivos modificados

- `components/publico/ModoLlegada.tsx` — quitado el bloque de 2 cifras del
  cabecero; añadido `<Stats>` (import de `@/components/publico/Stats`) tras
  el bloque del mapa, con `tiempoEnMarcha={tiempoTotal}`,
  `kmAndados={formatearKm(progreso.odometroKm)}` (nueva función local,
  mismo formato `es-ES` con 1 decimal que ya usa `ModoDurante.tsx`, no
  redondeado a entero) y `ritmoMedio` (nueva prop). Añadida prop
  `ritmoMedio: string` a `ModoLlegadaProps`. Eliminada la variable
  `kmCaminados` que ya no se usa.
- `app/page.tsx` — `ModoLlegadaConectado` calcula `ritmoMedio` con la nueva
  función compartida `calcularRitmoMedioIntento` (`startedAt` → `endedAt`) y
  la pasa a `<ModoLlegada>`.
- `lib/ritmo.ts` (nuevo) — función pura `calcularRitmoMedioIntento`,
  extraída para ser compartida y testeable: misma fórmula que
  `calcularRitmoMedio` de `ModoDurante.tsx` (odómetro / horas transcurridas,
  formato `es-ES` 1 decimal), pero parametrizada por un instante final
  arbitrario (`Date | string | null`) en vez de asumir "ahora" — así sirve
  tanto para `ModoDurante` (final = ahora, sin tocarlo) como para
  `ModoLlegada` (final = `endedAt`). Devuelve `"—"` si falta el inicio, el
  final, o si el final no es posterior al inicio.
- `lib/ritmo.test.ts` (nuevo) — 7 tests unitarios: cálculo con string y con
  `Date`, fallback sin inicio, fallback sin final, reloj inconsistente
  (final <= inicio), formato con coma decimal, y odómetro cero.

### Decisión de estilo tomada (bloqueo menor, resuelto sin pausa)

El prompt dejaba a criterio del Implementador si la fórmula de ritmo vive
inline en `app/page.tsx` o se extrae a un sitio compartido con
`ModoDurante.tsx`. Se optó por extraerla a `lib/ritmo.ts` (dominio puro,
sin I/O) en vez de duplicarla inline en `page.tsx`, por dos motivos:
1. La regla del proyecto pide cubrir con test unitario cualquier cálculo
   puro que quede fuera de un componente — una función inline no exportada
   en un Server Component no es testeable directamente sin ese paso.
2. Evita una tercera copia de la misma fórmula (ya existía una en
   `ModoDurante.tsx`); ambas quedan alineadas con una única fuente de
   verdad para la fórmula de ritmo, parametrizada por el instante final.

`ModoDurante.tsx` no se ha tocado (fuera de alcance): su función local
`calcularRitmoMedio` sigue igual, simplemente ahora hay una lógica
equivalente reutilizable en `lib/ritmo.ts` para el caso de "final fijo"
que no tenía cabida en la firma original. La pequeña duplicación de
`formatearKm` en `ModoLlegada.tsx` se mantiene (no extraída), tal y como
permitían los supuestos asumidos en el prompt clarificado.

## Quality gates

- `pnpm typecheck` — verde, cero errores.
- `pnpm lint` — verde, cero errores.
- `pnpm test` — verde, 166 tests (18 ficheros), incluidos los 7 nuevos de
  `lib/ritmo.test.ts`.
- Verificación visual manual: se montó temporalmente una ruta de preview
  aislada (`app/preview-llegada-temporal/`, eliminada antes de cerrar la
  tarea, nunca commiteada) que renderiza `ModoLlegada` con datos ficticios,
  porque no había forma de forzar la fase "llegada" en el intento real de
  Supabase sin tocar datos de producción. El HTML servido por `pnpm dev`
  confirma: cabecero sin el bloque de 2 cifras (logo, "Camino completado",
  titular, mensaje), y justo tras el mapa la rejilla de 3 cajas de `Stats`
  con los valores esperados y el formato correcto (p. ej. "106,4" para km,
  no "106").

## Historial de revisión

### Reviewer — 2026-08-01 — ✅ Aprobado

**Verificado:**
- `lib/ritmo.ts` es dominio puro real: sin `Date.now()`, sin I/O, instante
  final recibido como parámetro (`Date | string | null`), coherente con el
  patrón ya usado en `proyeccion.ts`.
- Tests de `lib/ritmo.test.ts` cubren los bordes reales: sin inicio, sin
  final, final == inicio, final < inicio, formato con coma decimal (es-ES),
  string vs. `Date` como instante final, odómetro cero. No solo happy path.
- `formatearKm` en `ModoLlegada.tsx` (líneas 86-88) es idéntica carácter a
  carácter a la de `ModoDurante.tsx` (líneas 114-116): mismo locale `es-ES`,
  mismos `minimumFractionDigits`/`maximumFractionDigits: 1`. Sin divergencia.
- La extracción a `lib/ritmo.ts` en vez de duplicar inline en `page.tsx` está
  justificada: una función pura no exportada en un Server Component no es
  testeable de forma aislada, y el framework exige test unitario para lógica
  de negocio pura. No es abstracción especulativa (una función exportada,
  sin interfaces/factories).
- Cabecero de `ModoLlegada.tsx` coherente tras quitar las 2 cifras: logo,
  "Camino completado", título, mensaje — sin huecos ni restos de
  `kmCaminados`.
- Alcance respetado: `git`/glob confirman que `ModoDurante.tsx` y
  `Stats.tsx` no se tocaron. No queda rastro en el árbol de fuente de la
  ruta de preview temporal (`app/preview-llegada-temporal/` no existe);
  únicamente quedan artefactos de build en `.next/dev/`, ignorados por git
  (`.gitignore` línea `/.next/`) y no versionados — consistente con lo
  reportado por el Implementador.
- Tipado estricto: sin `any`, sin `as`, sin `@ts-ignore` en ninguno de los
  ficheros tocados.
- `CHANGELOG.md` tiene entrada correspondiente, en tono de producto.

**Recomendación (no bloqueante, registrada en `DEBT.md`):** `lib/ritmo.ts`
no defiende contra `startedAt`/`endedAt` con formato de fecha inválido
(`new Date("basura")` → `NaN`, propaga silenciosamente a `"NaN,N"` en vez de
`"—"`). No es una regresión de esta tarea — el mismo comportamiento ya
existe sin test en `ModoDurante.tsx` y en `formatearTiempoTotal` de
`page.tsx` — pero al centralizar la fórmula en un módulo de dominio con
tests, es el punto natural para blindarlo a futuro.

**Pendiente de confirmar por el usuario (no bloqueante):** el resultado
visual final del cabecero simplificado y la rejilla de `Stats` en la
pantalla de llegada no se ha visto en una preview real con datos de
Supabase — el Implementador verificó con una ruta temporal ya eliminada.
Confirmar en la preview de Vercel tras el PR (ver lección de F3 en
`docs/LESSONS.md` sobre no dar por buena una UI solo con quality gates de
código).

**Veredicto:** ✅ Aprobado — pasa a Seguridad.

### Seguridad — 2026-08-01 — ✅ Sin vulnerabilidades

**Estándares aplicados:** OWASP Top 10 (incluida auditoría de dependencias
A06). Proyecto sin requisitos adicionales (no maneja GDPR/PCI/salud) — no
aplica agente de seguridad extendido.

**Alcance confirmado:** `git status --porcelain` + `git diff main --stat`
muestran exactamente 7 ficheros: `app/page.tsx`,
`components/publico/ModoLlegada.tsx`, `lib/ritmo.ts` (nuevo, untracked),
`lib/ritmo.test.ts` (nuevo, untracked), `CHANGELOG.md`, `DEBT.md`,
`docs/tareas/CURRENT.md`. Ninguno inesperado. Sin endpoints nuevos, sin
Server Actions nuevas, sin cambios en autenticación/autorización/RLS —
confirma la evaluación previa de que no aplica auditoría OWASP completa de
superficie de ataque.

**Verificado:**
- **A01 (control de acceso):** sin cambios en rutas, permisos ni políticas
  RLS. `startedAt`/`endedAt`/`progreso` en `ModoLlegadaConectado`
  (`app/page.tsx`) proceden de `intentoActivo` (ya leído server-side con los
  mismos permisos previos) y de `calcularProgresoDelIntento` — ninguna
  entrada nueva de cliente.
- **A02 (criptografía):** sin secretos, tokens ni datos sensibles
  introducidos. `lib/ritmo.ts` no toca nada sensible, solo fechas y un
  número (odómetro).
- **A03 (inyección):** sin SQL, sin `eval`/`Function`, sin interpolación en
  comandos de sistema. `calcularRitmoMedioIntento` es aritmética pura sobre
  `Date`/`number` con salida por `toLocaleString`; el resultado se renderiza
  en JSX (React escapa por defecto), nunca se inyecta como HTML crudo.
- **A04 (diseño inseguro):** no aplica — sin flujo de negocio crítico nuevo
  (pagos, autenticación, operaciones irreversibles). El cálculo es
  presentacional, no gobierna ninguna decisión de negocio.
- **A05 (configuración):** sin credenciales ni variables de entorno nuevas.
- **A06 (dependencias):** `pnpm audit` → 0 vulnerabilidades (info/low/
  moderate/high/critical) sobre 595 dependencias totales. Sin cambios en
  `package.json`/`pnpm-lock.yaml` en este diff.
- **A07 (autenticación):** sin cambios en gestión de sesiones ni rutas
  protegidas.
- **A08 (integridad de datos):** sin `as` para saltarse tipado; `progreso`
  tipado como `ProgresoPublico` (import de `@/lib/types`), no como el
  `Progreso` interno. Verificado en `lib/types.ts:148-155`:
  `ProgresoPublico` solo expone `porcentaje`, `kmAvanzados`, `kmRestantes`,
  `odometroKm`, `estado`, `ultimaPosicion` (tipo público) — ningún campo
  privado del `Progreso`/`Posicion` interno se filtra a `ModoLlegada.tsx`,
  mismo criterio ya cerrado en F5.
- **A09 (logging/errores):** sin `console.log` ni logs nuevos en los
  ficheros tocados; sin exposición de detalles internos al cliente.
- **A10 (SSRF):** no aplica — sin requests a URLs construidas con input de
  usuario.

**Sobre el riesgo específico de `lib/ritmo.ts` con fechas inválidas
(deuda ya registrada por el Reviewer):** confirmado que no es un issue de
seguridad, solo cosmético. Con `startedAt`/`endedAt` corruptos,
`new Date("basura").getTime()` produce `NaN`; el guard `horasTranscurridas
<= 0` no captura `NaN` (toda comparación con `NaN` es `false` en JS), así
que se llega a `(odometroKm / NaN).toLocaleString(...)`, que devuelve el
string `"NaN"` sin lanzar excepción. No hay crash, no hay DoS (sin bucles ni
recursión), no hay fuga de información interna (stack traces, nombres de
tabla), y el string nunca se usa como sink de HTML sin escapar (JSX escapa
por defecto). Además, `started_at`/`ended_at` los escribe el propio backend
(Server Actions del panel admin), nunca un input de usuario externo directo
— superficie de explotación nula en la práctica. De acuerdo con la
prioridad Baja ya registrada en `DEBT.md` ("`calcularRitmoMedioIntento` (y
sus equivalentes) no se defienden contra fechas inválidas").

**Sin issues.**

**Veredicto:** ✅ Sin vulnerabilidades — tarea lista para cerrar.
