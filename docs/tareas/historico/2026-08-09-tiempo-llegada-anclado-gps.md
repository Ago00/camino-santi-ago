# Tarea en curso

**Título:** Pantalla de llegada: tiempo/ritmo anclados al último GPS, no a "Finalizar"
**Tipo:** Bug (extensión de DT-020)
**Estado:** Implementación
**Iniciada:** 2026-08-09

## Prompt clarificado

DT-020 corrigió "durante" (ambos modos) para que tiempo en marcha y ritmo
medio se midan hasta el **último punto GPS real**, no hasta una referencia
que no viene de los datos. Al escribir DT-020 se asumió que "llegada" ya
cumplía ese criterio porque usa `ended_at` (un timestamp real de BD) en vez
de `ahora` — pero el usuario ha señalado, al revisar el resumen final, que
`ended_at` **tampoco** es un dato del GPS: es el momento en que alguien
pulsa el botón "Finalizar" en el panel de admin, que puede ocurrir varios
minutos después de que Santi diera su último paso real (guarda el móvil,
celebra, el admin tarda en escribir el mensaje de llegada...). Ese hueco se
contaría como tiempo caminado, alargando el tiempo total mostrado y
diluyendo el ritmo medio.

Es la misma familia de problema que DT-020 identificó — una referencia
temporal que no viene de los datos reales de posición — aplicada ahora a la
pantalla de resumen final en vez de a la pantalla en directo.

## Alcance

- **Incluye:** `ModoLlegada.tsx` (guiado) vía `app/page.tsx`
  (`ModoLlegadaConectado`, `formatearTiempoTotal`) y `ModoLlegadaLibre.tsx`
  (libre) vía `app/page.tsx` (`ModoLlegadaLibreConectado`) — su cálculo de
  tiempo en marcha y ritmo medio pasa a usar `ultimaPosicion?.ts` como
  referencia final en vez de `endedAt`.
- **Excluye explícitamente:** `started_at`/`ended_at` siguen existiendo y
  guardándose igual en BD (no se toca el esquema ni el flujo de
  Iniciar/Finalizar del panel admin) — solo cambia qué timestamp alimenta
  estas dos cifras concretas en pantalla. El resto de la pantalla de llegada
  (mensaje editable, mapa congelado, minuto a minuto) no se toca.

## Comportamiento en casos límite

- **Sin ninguna posición GPS en todo el intento** (caso extremo: se inicia y
  finaliza sin recibir nunca una posición real): tiempo en marcha y ritmo
  medio dan "—", igual que ya decidió DT-020 para "durante" en el mismo
  caso — no se inventa una referencia temporal que no sea un dato real, ni
  siquiera como último recurso.
- **`ended_at` posterior al último punto GPS por unos minutos** (el caso
  real que motiva esta tarea): el tiempo mostrado ya no incluye ese hueco.

## Diseño
Mockup: N/A — mismo componente `Stats.tsx`, solo cambia qué dato alimenta
dos de sus tres cifras.

## Decisión técnica / Diagnóstico

### Extensión de DT-020, aprobada por el usuario (2026-08-09)

Sin alternativas de diseño reales — es la aplicación directa del mismo
principio ya aprobado en DT-020 a dos sitios más. Ver la ampliación
añadida a DT-020 en `docs/tecnico/decisiones-tecnicas.md`.

1. **`app/page.tsx`**: en `ModoLlegadaConectado`, `tiempoTotal`/`ritmoMedio`
   pasan a calcularse con `progreso.ultimaPosicion?.ts ?? null` en vez de
   `endedAt`. Migrar `formatearTiempoTotal` (función privada) a usar la
   función compartida `calcularTiempoEnMarchaIntento` de `lib/ritmo.ts`
   (creada en la tarea anterior para sustituir exactamente este tipo de
   duplicado) — se toca esta lógica de todos modos, es el momento natural
   de cerrar ese duplicado en vez de mantenerlo.
2. **`ModoLlegadaLibre.tsx`** (o su conector en `app/page.tsx`, según dónde
   viva el cálculo tras la tarea anterior): mismo cambio de referencia,
   `ultimaPosicion?.ts` en vez de `endedAt`.
3. `started_at`/`ended_at` NO desaparecen de las props ni de la BD — pueden
   seguir haciendo falta para otros usos de la pantalla (verificar si algo
   más los consume antes de quitarlos si ya no hiciera falta pasarlos).

**Tests obligatorios:**
- Pantalla de llegada (guiado y libre): tiempo/ritmo calculados con
  `ultimaPosicion.ts`, no con `endedAt` — test que use un escenario donde
  ambos difieren (por ejemplo, `ultimaPosicion.ts` varios minutos antes de
  `endedAt`) y verifique que el resultado coincide con el primero, no el
  segundo.
- Caso límite sin ninguna posición: sigue dando "—".
- Los tests existentes de "durante" (DT-020) no deben tocarse ni cambiar de
  comportamiento.

## Archivos modificados

- `lib/ritmo.ts` — comentario de cabecera actualizado con la ampliación de
  DT-020 (sin cambios de comportamiento en las funciones, ya eran genéricas).
- `app/page.tsx`:
  - `ModoLlegadaConectado` (exportada): `tiempoTotal`/`ritmoMedio` pasan a
    calcularse con `progreso.ultimaPosicion?.ts ?? null` en vez de `endedAt`,
    usando `calcularTiempoEnMarchaIntento`/`calcularRitmoMedioIntento` de
    `lib/ritmo.ts` — se elimina la función privada duplicada
    `formatearTiempoTotal` (cierre del duplicado que DT-020 dejó pendiente
    deliberadamente). El parámetro `endedAt` se retira de la firma (ya no lo
    consume nada en esta función).
  - `ModoLlegadaLibreConectado` (exportada): mismo cambio de referencia. El
    cálculo se traslada desde `ModoLlegadaLibre.tsx` (donde vivía tras la
    tarea anterior) al conector, mismo patrón que el modo guiado — así
    ambos "llegada" reciben las cifras ya formateadas como props, y queda
    testeable sin necesitar un test runner de componentes (ninguno de los
    dos conectores usa hooks). `endedAt` se retira de la firma.
  - Se añaden anotaciones de tipo de retorno explícitas
    (`Promise<ReactElement<ModoLlegadaProps>>` /
    `Promise<ReactElement<ModoLlegadaLibreProps>>`) para poder inspeccionar
    los props del elemento devuelto en los tests sin recurrir a `any`/`as`.
  - `Home()`: ya no pasa `endedAt` a ninguno de los dos conectores de
    "llegada" (columna `ended_at` de BD sin tocar; sigue leyéndose en
    `obtenerIntentoActivo`/`IntentoActivo`, solo deja de viajar hasta estas
    dos cifras).
- `components/publico/ModoLlegadaLibre.tsx`: pasa a recibir `tiempoEnMarcha`/
  `ritmoMedio` ya formateados como props (en vez de `startedAt`/`endedAt` +
  cálculo interno); se retiran los imports de `lib/ritmo.ts` que ya no usa.
  Interfaz `ModoLlegadaLibreProps` exportada (antes privada del módulo).
- `components/publico/ModoLlegada.tsx`: interfaz `ModoLlegadaProps` exportada
  (antes privada del módulo) — sin cambios de comportamiento.
- `app/page.test.ts`: mock de la tabla `minuto_a_minuto` (necesaria para
  ejercitar `ModoLlegadaConectado`/`ModoLlegadaLibreConectado`, que cargan el
  feed junto al progreso). Nuevos tests: `ModoLlegadaConectado()` y
  `ModoLlegadaLibreConectado()` — escenario con `ultimaPosicion.ts` y un
  `ended_at` hipotético varios minutos posterior, verificando que el
  resultado usa el primero; y caso límite sin ninguna posición GPS → "—".
- `docs/tecnico/decisiones-tecnicas.md`: ampliación de DT-020 (ya presente al
  llegar a esta tarea, escrita por el Arquitecto/Debugger antes del
  Implementador).
- `docs/tecnico/arquitectura.md`: comentarios de `ritmo.ts` y
  `ModoLlegadaLibre.tsx` actualizados (referencia final `ultimaPosicion?.ts`,
  no `ended_at`; ubicación del cálculo en el conector).
- `CHANGELOG.md`: entrada nueva.

## Quality gates

- `pnpm typecheck` — 0 errores.
- `pnpm lint` — 0 errores.
- `pnpm test` — 334/334 tests en verde (30 ficheros), incluidos los 4 tests
  nuevos de `app/page.test.ts` y los 14 tests preexistentes de
  `lib/ritmo.test.ts` (DT-020, "durante") sin tocar ni cambiar de
  comportamiento.

## Historial de revisión

### Implementador (2026-08-09)

Implementado según lo aprobado (ampliación de DT-020 en
`decisiones-tecnicas.md`). Un matiz de implementación resuelto como bloqueo
menor, documentado aquí por transparencia:

- **Dónde vive el cálculo en modo libre.** CURRENT.md dejaba abierto si el
  cambio se aplicaba dentro de `ModoLlegadaLibre.tsx` (donde vivía) o en su
  conector. Se optó por trasladarlo al conector (`ModoLlegadaLibreConectado`,
  `app/page.tsx`), por dos motivos: (1) queda simétrico con
  `ModoLlegadaConectado`/`ModoLlegada.tsx` (el modo guiado ya recibía las
  cifras formateadas como props, no las calculaba dentro del componente
  cliente) — inconsistencia de diseño que esta misma tarea ya tocaba de
  todos modos; (2) sin esto, testear la regla "usa `ultimaPosicion.ts`, no
  `ended_at`" habría exigido introducir un test runner de componentes
  (React Testing Library) que el proyecto no tiene, solo para poder invocar
  un componente cliente con `useState`. Con el cálculo en el conector
  (`async function` sin hooks, solo construye JSX), el mismo patrón de test
  ya usado para `obtenerIntentoActivo`/`calcularProgresoDelIntento` (llamar
  la función exportada e inspeccionar el resultado) cubre también estos dos
  casos, sin dependencias nuevas. No afecta al comportamiento visible: el
  usuario ve las mismas cifras, calculadas igual.

Sin bloqueos mayores. Sin deuda técnica nueva generada. No se ha tocado deuda
existente no relacionada.

### Reviewer (2026-08-09)

**Veredicto: ✅ Aprobado — pasa a Seguridad.**

Verificado contra el prompt clarificado, DT-020 y su ampliación, y los 9
ficheros del alcance:

- El cambio coincide exactamente con lo aprobado: `ModoLlegadaConectado`/
  `ModoLlegadaLibreConectado` usan `progreso.ultimaPosicion?.ts ?? null` como
  referencia final, `Home()` ya no pasa `endedAt` a ninguno de los dos
  conectores, y `started_at`/`ended_at` siguen en `IntentoActivo` y en BD sin
  tocar.
- Bloqueo menor del Implementador (mover el cálculo de modo libre al
  conector) es razonable y no tiene alternativa mejor: confirmado que
  `vitest.config.ts` usa `environment: "node"` y `include: ["**/*.test.ts"]`
  (excluye `.tsx`), y `package.json` no tiene React Testing Library ni
  `jsdom` — no había ningún patrón de test de componentes disponible en el
  proyecto. El cambio es simétrico con `ModoLlegadaConectado` (ya existente)
  y no altera ningún comportamiento visible.
- Caso límite "sin ninguna posición GPS": cubierto con tests reales
  (`app/page.test.ts`, ambos conectores) que aseguran "—" en tiempo y ritmo.
- El test que distingue `ultimaPosicion.ts` de `endedAt` es sólido: la
  aserción explícita `not.toBe("5:07")`/`not.toBe("1:37")` documenta el valor
  que daría la regresión, y como ninguno de los dos conectores recibe ya
  `endedAt` en su firma, cualquier reversión que reintroduzca esa referencia
  rompería el test (no hay forma de que "por casualidad" ambas referencias
  den el mismo resultado en los escenarios usados).
- `lib/ritmo.test.ts` (14 tests, DT-020) verificado carácter por carácter:
  sin tocar, mismo contenido y mismo número de tests que declara CURRENT.md.
- Migración de `formatearTiempoTotal` a `calcularTiempoEnMarchaIntento`
  limpia: la función compartida ya estaba validada por DT-020 con el mismo
  criterio de truncado/formato ("H:MM", sin redondeo), y `ModoDurante.tsx` ya
  la usaba desde antes — no hay indicio de regresión de formato.
- `ModoLlegadaProps`/`ModoLlegadaLibreProps` exportadas únicamente para
  tipar el retorno de los conectores (`Promise<ReactElement<...>>`) y los
  tests — superficie pública mínima, justificada.
- Documentación: `arquitectura.md` y `CHANGELOG.md` reflejan el cambio con
  precisión; `decisiones-tecnicas.md` (ampliación de DT-020) coincide con lo
  implementado.
- Sin `any`/`as`/`@ts-ignore` en los ficheros tocados.

**Recomendación (no bloqueante, ya registrada en `DEBT.md`):** la entrada de
deuda "`calcularRitmoMedioIntento` (y sus equivalentes) no se defienden
contra fechas inválidas" (2026-08-01) describía la falta de guardarraíl
contra `NaN` en "tres sitios" (`ModoDurante.tsx`, `formatearTiempoTotal` de
`app/page.tsx`, `lib/ritmo.ts`). Con esta tarea, esa triplicación ya no
existe — todo el cálculo pasa por `lib/ritmo.ts`. Actualizada la entrada en
`DEBT.md` con una nota de 2026-08-09 para que no quede desactualizada
(mismo criterio que la lección de LESSONS.md sobre desviaciones no
reflejadas en el documento correspondiente); prioridad sin cambios (Baja),
el problema de fondo sigue sin resolver, solo que ahora en un único punto.

Sin patrones recurrentes nuevos que ameriten entrada en `LESSONS.md` — el
patrón "mover cálculo al conector Server Component para que sea testeable
sin RTL" ya estaba establecido (DT-020/Estadísticas), esta tarea solo lo
aplica de forma simétrica al modo libre.

Seguridad debe revisar a continuación.

### Agente de Seguridad (2026-08-09)

**Estándares aplicados:** OWASP Top 10 (incluyendo auditoría de dependencias, A06).

**Alcance revisado:** los 9 ficheros del diff de la rama
`fix/tiempo-llegada-anclado-gps` (`app/page.tsx`, `app/page.test.ts`,
`components/publico/ModoLlegada.tsx`, `components/publico/ModoLlegadaLibre.tsx`,
`lib/ritmo.ts`, `CHANGELOG.md`, `DEBT.md`,
`docs/tecnico/decisiones-tecnicas.md`, `docs/tecnico/arquitectura.md`), sin
ficheros nuevos, confirmado con `git status`/`git diff --stat`.

**Repaso OWASP Top 10:**

- **A01 (control de acceso):** sin endpoints ni server actions tocados. El
  cálculo se mueve entre Server Components ya autenticados/sin autenticación
  requerida (la web pública ya expone estas cifras hoy); no cambia quién
  puede ver qué.
- **A02 (criptografía):** sin secretos, tokens ni datos sensibles
  involucrados — solo timestamps de posición GPS ya expuestos previamente en
  `ProgresoPublico`.
- **A03 (inyección):** sin queries nuevas, sin concatenación de strings, sin
  `eval`/`new Function`. Los timestamps se pasan a `new Date(string)`, que ya
  se usaba igual antes de esta tarea (mismo patrón preexistente en
  `lib/ritmo.ts`).
- **A04 (diseño inseguro):** no aplica — no es un flujo crítico (auth, pagos,
  operación irreversible); es una cifra de solo lectura en una pantalla
  pública. `started_at`/`ended_at` y el flujo Iniciar/Finalizar del panel
  admin no se tocan.
- **A05 (configuración):** sin credenciales ni variables de entorno tocadas.
- **A06 (dependencias):** confirmado que `package.json`/`pnpm-lock.yaml` no
  aparecen en el diff (`git status`/`git diff --stat` limpios en ambos) — no
  se añadió ninguna dependencia. `pnpm audit` ejecutado en la raíz del
  proyecto: **"No known vulnerabilities found"**.
- **A07 (autenticación):** sin cambios en gestión de sesión ni rutas
  protegidas.
- **A08 (integridad de datos):** `progreso.ultimaPosicion` no es input de
  cliente — es el resultado de `calcularProgresoDelIntento`/
  `calcularProgresoLibreDelIntento`, calculado server-side a partir de la
  tabla `posiciones` en BD. Verificado `lib/traza/progreso-publico.ts`
  (`aProgresoPublico`): la proyección a `ProgresoPublico` sigue exponiendo
  únicamente `{ lat, lon, ts }` de `ultimaPosicion`, sin `batt`, `acc`,
  `intento_id`, `fuente` ni `descartado` — mover el cálculo de tiempo/ritmo
  de `ModoLlegadaLibre.tsx` a su conector no reintroduce ningún campo
  interno; sigue leyendo solo `.ts`, ya presente en el tipo público. Sin
  `as` para saltarse tipado en ninguno de los ficheros tocados.
- **A09 (logging):** sin `console.log`/logs nuevos; los timestamps GPS no son
  dato sensible y ya se mostraban en pantalla antes de esta tarea. Ningún
  error nuevo devuelto al cliente con detalle interno.
- **A10 (SSRF):** no aplica — sin requests salientes a URLs construidas con
  input de usuario.

**Puntos específicos señalados en la invocación:**

- `ModoLlegadaProps`/`ModoLlegadaLibreProps` pasan de privadas a exportadas:
  solo son interfaces de props de componentes React ya usados en la misma
  pantalla pública (`ModoLlegada.tsx`, `ModoLlegadaLibre.tsx`); no exponen
  ningún límite de confianza nuevo ni datos que no viajaran ya al cliente
  dentro de esos mismos componentes. Sin impacto de seguridad.
- `endedAt` deja de viajar hasta `ModoLlegadaConectado`/
  `ModoLlegadaLibreConectado`/`ModoLlegada.tsx`/`ModoLlegadaLibre.tsx`:
  confirmado que la columna `ended_at` sigue en `lib/types.ts`
  (`IntentoActivo.ended_at`) y se sigue leyendo/escribiendo sin cambios en
  `app/admin/actions.ts` (flujo Iniciar/Finalizar del panel admin) — no se
  rompe ninguna otra dependencia de esa prop.

## Issues encontrados

Ninguno.

## Sin issues

Confirmado explícitamente: no se ha encontrado ningún issue de seguridad en
el alcance revisado (OWASP Top 10 completo + auditoría de dependencias). El
cambio no introduce lectura ni cómputo nuevo de datos, no amplía ninguna
superficie de exposición, no toca autenticación/autorización, no añade
dependencias y `pnpm audit` está limpio.

## Veredicto

✅ Sin vulnerabilidades — tarea lista para cerrar (pendiente de que el
Orquestador abra el PR).


---

Este archivo es la pizarra compartida entre todos los agentes del pipeline: los
subagentes corren aislados y no ven la conversación, así que lo único que
comparten es lo que está escrito aquí. Lo gobierna el Orquestador, que lo crea al
empezar cada tarea con la plantilla del framework y lo archiva al cerrarla.
