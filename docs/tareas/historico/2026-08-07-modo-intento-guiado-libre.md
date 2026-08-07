# Tarea en curso

**Título:** Modo de intento configurable (guiado / libre con destino en línea recta)
**Tipo:** Feature
**Estado:** Implementación
**Iniciada:** 2026-08-07

## Prompt clarificado

Añadir un **modo de intento** configurable desde el panel admin, elegido en el
momento de pulsar "Iniciar" y fijo durante toda la vida de ese intento (para
cambiarlo hace falta "Reiniciar" y elegir de nuevo):

- **Modo guiado** (el actual, sin cambios): cálculo de progreso sobre la traza
  del Camino Portugués — %, km andados/restantes, ritmo, ETA, minuto a minuto
  con posición, filtro geográfico de 100 km en `/api/track`.
- **Modo libre** (nuevo): pensado para trazar otras rutas, en cualquier lugar.
  - Al iniciar, se fija un **destino** (lat/lon).
  - La web pública calcula y muestra **solo la distancia restante en línea
    recta** (haversine) entre la última posición conocida y el destino —
    reutilizando `haversineKm` ya existente en `lib/traza/proyeccion.ts`.
    **Sin** ETA, sin ritmo, sin barra de porcentaje.
  - El mapa **no muestra ninguna línea de ruta de fondo** (ni la traza del
    Camino Portugués ni ninguna otra) — solo el trazado de puntos GPS
    recibidos, conectados según van llegando.
  - `/api/track` **desactiva el filtro de plausibilidad geográfica de 100 km**
    (DT-006 capa 1) cuando el intento activo está en modo libre, porque ya no
    hay una traza fija contra la que comparar.
  - El resto de la web pública se mantiene igual: fases antes/durante/llegada,
    formulario de intenciones, comentarios, feed minuto a minuto.

### Alcance
- **Incluye:** columna(s) nuevas en `intentos` (modo + destino lat/lon), UI en
  admin para elegir modo y destino al iniciar, cálculo de distancia restante
  en línea recta, mapa sin línea de ruta en modo libre, desactivar filtro
  geográfico de ingesta en modo libre.
- **Excluye:** ETA, ritmo, % de progreso, odómetro de distancia realmente
  andada (solo se pinta el trazado, no se mide su longitud), soporte para más
  de un destino por intento, geocodificación de direcciones (el destino se
  introduce como lat/lon).

### Comportamiento en casos límite
- Intento en modo libre sin destino fijado (no debería poder ocurrir si el
  form lo exige): la web muestra el mapa con los puntos, sin cifra de
  distancia restante.
- Cambiar de modo a mitad de intento: no es posible — el modo es fijo al
  iniciar; para cambiarlo hay que Reiniciar.
- Intento en modo guiado: comportamiento 100% igual al actual, sin cambios
  visibles.

### Supuestos asumidos
- El destino se introduce como **lat/lon numérico** en el panel admin (no
  búsqueda de dirección ni clic en mapa) — mantiene la implementación simple.
- El modo/destino se guarda en la tabla `intentos` (no en `posiciones` ni en
  una tabla nueva) — es una propiedad del intento, igual que
  `fase`/`started_at`.
- No hace falta fase de diseño — es un toggle en el panel admin existente y
  una variante de renderizado del mapa/stats ya existentes, no una pantalla
  nueva.

Confirmado por el usuario.

## Diseño
Mockup: N/A

## Decisión técnica / Diagnóstico

**Opción B aprobada — camino paralelo con tipos unión.** Ver DT-016 en
`docs/tecnico/decisiones-tecnicas.md` para el análisis completo. Resumen:

- Migración nueva: `intentos.modo` (`'guiado' | 'libre'`, default
  `'guiado'`) + `intentos.destino_lat`/`destino_lon` (nullable). Se fija en
  `iniciarReto()` (transición `antes` → `durante`), inmutable durante la vida
  del intento.
- `ProgresoPublico` (`lib/types.ts`) pasa a unión discriminada por `modo`:
  rama `'guiado'` igual que hoy; rama `'libre'` con
  `distanciaRestanteKm: number | null`. `ultimaPosicion` presente en ambas
  ramas con el mismo tipo (no rompe `lib/progreso-cache.ts` ni
  `crearMinutoAMinuto`, DT-014).
- Función de dominio pura nueva (fuera de `lib/traza/proyeccion.ts`, que NO
  se toca) que calcula `distanciaRestanteKm` con `haversineKm` entre la
  última posición no descartada y el destino. Sin corredor, sin rechazo de
  velocidad implícita, sin anclaje de porcentaje — los puntos de modo libre
  se aceptan y dibujan sin validar si tienen sentido.
- `app/page.tsx` bifurca una sola vez según `intentoActivo.modo`, hacia
  componentes nuevos `ModoDuranteLibre`/`ModoLlegadaLibre` (sin ramas
  condicionales dentro de `ModoDurante`/`ModoLlegada` existentes).
- `components/mapa/Mapa.tsx` gana prop `variante: "ruta" | "libre"` — en
  `"libre"` omite traza de fondo y overlay de color, solo dibuja la
  polilínea de puntos recibidos. Reutiliza la inicialización de
  MapLibre/worker existente (no duplicar, ver `docs/LESSONS.md`).
- `app/api/track/route.ts`: reordenar para resolver primero `{id, modo}` del
  intento activo; el filtro de plausibilidad geográfica de 100 km (DT-006
  capa 1) solo se aplica si `modo === 'guiado'`.
- Admin: `iniciarReto()` recibe `modo` y (si libre) `destinoLat`/`destinoLon`;
  `ActividadAcciones.tsx` gana el selector de modo + inputs de destino antes
  de "Iniciar".

**Fuera de alcance (explícito):** ETA, ritmo, % de progreso, odómetro de
distancia real andada en modo libre; geocodificación de direcciones;
cambiar de modo a mitad de intento.

Aprobado por el usuario.

## Archivos modificados

**Migración nueva**
- `supabase/migrations/0003_modo_intento.sql` — `intentos.modo` (`'guiado'|'libre'`,
  default `'guiado'`) + `intentos.destino_lat`/`destino_lon` (nullable). No aplicada
  contra Supabase real (sin acceso), solo escrita.

**Dominio (`lib/`)**
- `lib/types.ts` — `ModoIntento`, `Intento.modo`/`destino_lat`/`destino_lon`;
  `ProgresoPublico` pasa a unión discriminada (`ProgresoPublicoGuiado` |
  `ProgresoPublicoLibre`).
- `lib/traza/proyeccion.ts` — única modificación: se exporta `haversineKm`
  (sin tocar su lógica ni el resto del módulo).
- `lib/traza/progreso-libre.ts` (nuevo) + `progreso-libre.test.ts` (nuevo) —
  `calcularProgresoLibre()`, dominio puro del modo libre.
- `lib/traza/progreso-publico.ts` — `aProgresoPublico()` añade `modo: "guiado"`
  al resultado (tipo de retorno ahora `ProgresoPublicoGuiado`).
- `lib/traza/progreso-publico.test.ts` — test nuevo del discriminante `modo`.
- `lib/progreso-cache.ts` — sin cambios de código (genérico sobre `ProgresoPublico`).
- `lib/progreso-cache.test.ts` — fixtures actualizadas a la unión + test de la rama libre.

**Ingesta y progreso público**
- `app/api/track/route.ts` — reordenado: resuelve `{id, modo}` del intento activo
  antes del filtro geográfico (DT-006 capa 1), que ahora solo aplica en modo guiado.
- `app/api/track/route.test.ts` — mocks con `modo`; test nuevo de bypass en libre.
- `app/api/progreso/route.ts` — bifurca el cálculo por `modo` del intento activo.
- `app/api/progreso/route.test.ts` — tests nuevos de bifurcación guiado/libre.

**Admin**
- `app/admin/actions.ts` — `iniciarReto(params)` recibe `{modo, destinoLat?,
  destinoLon?}`, validado con Zod (`discriminatedUnion`); en libre guarda destino
  junto con la transición de fase, en guiado no toca esas columnas.
- `app/admin/actions.test.ts` — llamadas a `iniciarReto` actualizadas + tests
  nuevos (destino guardado en libre, rechazo sin destino/fuera de rango, guiado
  no toca destino_lat/lon).
- `components/admin/ActividadAcciones.tsx` — selector de modo + inputs de
  destino (solo si libre) antes de "Iniciar".

**Web pública**
- `app/page.tsx` — bifurca una sola vez por `intentoActivo.modo` hacia los
  componentes nuevos; helpers `destinoDelIntento`, `obtenerHistoricoPosiciones`
  (refactor menor, reutilizado por ambos modos), `calcularProgresoLibreDelIntento`.
- `components/mapa/Mapa.tsx` — prop `variante: "ruta" | "libre"` (default
  `"ruta"`, comportamiento original intacto); en `"libre"` pinta solo la
  polilínea de `puntosGps`, sin traza de fondo ni overlay andado/restante.
- `components/publico/DistanciaRestante.tsx` (nuevo) — cifra de distancia
  restante, hermano visual de `Mojon.tsx` sin barra de progreso.
- `components/publico/ModoDuranteLibre.tsx` (nuevo), `ModoLlegadaLibre.tsx`
  (nuevo) — variantes libres de `ModoDurante`/`ModoLlegada`, sin tocar esos
  ficheros (que ganan tipado más estricto: `ProgresoPublicoGuiado` en vez de
  la unión, ya que ahora son exclusivos del modo guiado).
- `components/publico/ModoDurante.tsx`, `ModoLlegada.tsx` — solo cambio de tipo
  de prop (`ProgresoPublico` → `ProgresoPublicoGuiado`), sin cambio de comportamiento.

**Documentación**
- `docs/tecnico/arquitectura.md`, `docs/tecnico/modelo-datos.md` — ficheros/
  columnas nuevas, filtro condicional de `/api/track`, invariante de modo.
- `CHANGELOG.md`, `DEBT.md` — ver entradas correspondientes.

## Decisión de implementación no cubierta explícitamente por DT-016 (documentada aquí, sin bloquear)

DT-016 no especifica cómo llega al mapa el "trazado de puntos GPS recibidos,
conectados según van llegando" en modo libre — el contrato de `ProgresoPublico`
(rama libre) solo expone `ultimaPosicion` (la última), no un histórico. Solución
adoptada (sin ampliar el contrato de `ProgresoPublico` ni añadir un endpoint
público nuevo):
- Carga inicial: `app/page.tsx` (Server Component) consulta una vez el histórico
  completo de `posiciones` del intento (mismo patrón/tabla que ya usa para modo
  guiado) y lo pasa como prop `puntosGpsIniciales`/`puntosGps` a los componentes
  nuevos.
- Crecimiento en vivo ("durante"): cada poll de 30 s a `/api/progreso` (ya
  existente) trae `ultimaPosicion`; si su `ts` es distinto del último conocido,
  el cliente añade ese punto al array local. Limitación aceptada y registrada en
  `DEBT.md`: si el tracker envía más de un punto dentro de la misma ventana de
  30 s, solo el último de esa ventana se añade al trazado (no se pierden datos
  en BD, solo en la representación visual en directo).

## Quality gates

- `pnpm typecheck` — verde (0 errores).
- `pnpm lint` — verde (0 errores/warnings).
- `pnpm test` — verde, 226/226 tests (incluye 15 tests nuevos: 8 en
  `progreso-libre.test.ts`, más los añadidos a `route.test.ts` de `/api/track`
  y `/api/progreso`, `actions.test.ts`, `progreso-cache.test.ts` y
  `progreso-publico.test.ts`).
- `pnpm build` — verde, compila y genera todas las rutas sin error.
- Verificación visual en navegador: **no realizada** — el Implementador no
  dispone en esta sesión de herramienta de navegador/preview. Recomendado antes
  de cerrar la tarea: comprobar en local o en la preview de Vercel que (a) el
  panel admin muestra el selector de modo/destino en fase "antes" y (b) el mapa
  en modo libre no pinta ninguna línea de ruta de fondo (LESSONS.md: las
  quality gates de código no garantizan que el CSS/UI se vea bien).

## Fix de compatibilidad post-revisión: migración 0003 sin aplicar en producción

Detectado por el **Orquestador** (no por un agente del pipeline) verificando
esta rama en directo contra el Supabase real de producción, después de la
Ronda 1 de Reviewer y Seguridad ya aprobadas: la migración
`supabase/migrations/0003_modo_intento.sql` (columnas `modo`/`destino_lat`/
`destino_lon` de `intentos`, DT-016) todavía no está aplicada en producción
(se aplicará más adelante, por separado). Con el código de esta rama
desplegado y la migración sin aplicar, las consultas que seleccionan esas
columnas fallaban contra la BD real (`column intentos.modo does not exist`,
code 42703) y, sin manejo explícito del error, ese fallo se interpretaba como
"sin intento activo": la web pública mostraba la pantalla "antes del reto"
aunque el intento 8 estuviera realmente en fase `durante` (seguimiento real
en marcha), y `/api/track` descartaba en silencio cada punto GPS recibido sin
insertarlo.

**Fix aplicado (sin tocar la migración, sin cambiar el diseño aprobado en
DT-016):**
- `app/page.tsx` (`obtenerIntentoActivo`, ahora exportada): si la consulta
  con `modo`/`destino_lat`/`destino_lon` falla, reintenta con el select
  mínimo previo a DT-016 y devuelve el intento con `modo: "guiado"`,
  `destino_lat: null`, `destino_lon: null` por defecto — la fase real se
  sigue mostrando.
- `app/api/track/route.ts` — mismo patrón de fallback sobre el select
  `id, modo` del intento activo: en caso de error, reintenta con `select
  ("id")` y trata el intento como modo guiado (con el filtro geográfico de
  100 km activo, DT-006).
- `app/api/progreso/route.ts` — mismo patrón sobre `select("id, modo,
  destino_lat, destino_lon")`.
- `app/admin/actions.ts` (`iniciarReto`): cuando `modo === 'guiado'`, el
  objeto `cambios` del `UPDATE` ya no incluye `modo` en absoluto (antes lo
  fijaba explícitamente a `'guiado'`) — así "Iniciar" en modo guiado
  funciona sin tocar una columna que puede no existir todavía. En modo
  `'libre'` no cambia nada: si la migración no está aplicada, sigue
  fallando con el mensaje de error ya existente ("No se pudo iniciar el
  reto."), aceptado porque modo libre requiere la migración y el efecto es
  visible solo para el admin, nunca una regresión silenciosa de cara al
  público.

**Tests nuevos** (mockeando el cliente Supabase para que la consulta con las
columnas nuevas devuelva `{ data: null, error: {...} }` y la de fallback sí
devuelva datos): `app/page.test.ts` (nuevo, 3 tests), `app/api/track/
route.test.ts` (+3 tests) y `app/api/progreso/route.test.ts` (+2 tests).
`app/admin/actions.test.ts` actualizado: los tests de `iniciarReto` en modo
guiado ahora verifican que `modo` no se incluye en el `UPDATE` (antes
verificaban lo contrario).

**Quality gates tras el fix:** `pnpm typecheck` verde, `pnpm lint` verde,
`pnpm test` verde (234/234, +8 nuevos), `pnpm build` verde.

**Deuda registrada:** `DEBT.md`, "Recordatorio: aplicar
`supabase/migrations/0003_modo_intento.sql` contra producción" — prioridad
Alta, para que no se olvide y quede trazado hasta que alguien confirme que
la migración ya se aplicó.

## Historial de revisión

### Ronda 1 — Reviewer (2026-08-07)

**Veredicto: ✅ Aprobado — pasa a Seguridad.**

Verificado contra DT-016 y el framework, punto por punto:

1. `lib/traza/proyeccion.ts` — única modificación real es exportar
   `haversineKm` (con JSDoc nuevo). El resto del módulo (dominio guiado,
   umbrales, `calcularProgreso`, `separacionDeTrazaM`) queda intacto. Cumple.
2. `lib/traza/progreso-libre.ts` — confirmado sin corredor, sin rechazo de
   velocidad implícita, sin anclaje de porcentaje. Solo haversine entre la
   última posición no descartada (por `ts`, no por orden de array) y el
   destino. Tests (`progreso-libre.test.ts`) cubren histórico vacío, sin
   destino, posiciones descartadas y selección por `ts` más reciente.
3. `ProgresoPublico` es unión discriminada por `modo` (`lib/types.ts`),
   `ultimaPosicion: UltimaPosicionPublica | null` idéntico en ambas ramas —
   `lib/progreso-cache.ts` y `crearMinutoAMinuto` lo leen sin narrowing ni
   casts. Cero `any`/`as unknown as`/`@ts-ignore` en todo el diff (grep
   completo sin resultados).
4. `app/api/track/route.ts` — reordenado: `{id, modo}` del intento activo se
   resuelve antes del filtro geográfico DT-006; el filtro solo aplica si
   `modo === 'guiado'`. Test nuevo confirma que en modo libre un punto a
   >100 km de la traza SÍ se inserta. El resto del flujo en modo guiado
   (token, rate limit, payload, inserción) no cambia de orden ni de
   comportamiento.
5. Modo inmutable: solo `iniciarReto()` escribe `modo`/`destino_lat`/
   `destino_lon`; `reiniciarReto()` abre un intento nuevo vía `insert({fase:
   "antes"})`, sin heredar el modo anterior (default BD `'guiado'`). Ninguna
   otra Server Action toca esas columnas.
6. Zod en los bordes: `iniciarReto` usa `z.discriminatedUnion("modo", ...)`
   con el mismo rango físico que `/api/track` (lat -90..90, lon -180..180).
   Tests cubren destino ausente y destino fuera de rango.
7. `components/mapa/Mapa.tsx`, variante `"ruta"` (default): la rama nueva
   `variante === "libre"` es un `if` con `return` temprano en
   `recalcularOverlay`; el código de la rama `"ruta"` que sigue debajo queda
   igual que antes. `ModoAntes.tsx`/`ModoDurante.tsx`/`ModoLlegada.tsx`
   (modo guiado) nunca pasan `variante`, así que siguen en el valor por
   defecto sin cambios.
8. Decisión no cubierta por DT-016 (carga inicial server-side + acumulación
   cliente vía poll de 30 s, con la limitación de posibles puntos
   intermedios perdidos en la misma ventana): razonable — no amplía el
   contrato público ni añade endpoint nuevo, y la limitación está bien
   registrada en `DEBT.md` ("Modo libre (DT-016): el trazado en vivo del
   mapa solo capta 1 punto GPS por ventana de polling (30 s)").
9. `CHANGELOG.md`, `DEBT.md`, `arquitectura.md`, `modelo-datos.md` reflejan
   el estado real. Único hallazgo: `docs/producto/funcionalidades.md`,
   `decisiones-producto.md` y `roadmap.md` no mencionan el modo libre/guiado
   — mismo patrón recurrente ya visto con "Minuto a minuto". Registrado como
   recomendación en `DEBT.md` y como lección recurrente en `docs/LESSONS.md`
   (no bloqueante: no es responsabilidad del Implementador).
10. Verificación visual: no realizada por el Implementador (sin herramienta
    de navegador en su sesión), explícitamente marcado como pendiente en
    este documento. Confirmado por el Reviewer como pendiente para el
    Orquestador antes del cierre — no es bloqueante de esta revisión, pero
    debe hacerse antes de dar la tarea por cerrada del todo (ver
    `docs/LESSONS.md`, "ninguna quality gate detecta que Tailwind no esté
    generando CSS real" — mismo principio: código+tests en verde no
    garantiza la UI).

**Recomendaciones (no bloqueantes, registradas en `DEBT.md`):**
- `docs/producto/funcionalidades.md`/`decisiones-producto.md`/`roadmap.md`
  no reflejan el modo libre/guiado (nueva entrada en `DEBT.md`).
- El comentario de cabecera de `app/api/track/route.ts` sigue con el texto
  obsoleto "NO SE HA PROBADO CONTRA UNA BASE DE DATOS REAL... bloqueado por
  F0" (deuda preexistente ya registrada en `DEBT.md`, prioridad baja — no es
  nueva, solo se señala porque este archivo se volvió a tocar en esta tarea
  sin corregirlo).

**Lo que está bien:** la separación de dominio (Opción B de DT-016) se
respetó con disciplina — cero acoplamiento entre `calcularProgreso` y
`calcularProgresoLibre`, tipos unión sin opcionales sueltos, y los tests
nuevos son específicos de comportamiento (no solo happy path: cubren
selección por `ts`, posiciones descartadas, destino ausente, rango físico
inválido).

**Siguiente paso:** Agente de Seguridad.

---

### Ronda 1 — Seguridad (2026-08-07)

**Veredicto: Sin vulnerabilidades — tarea lista para cerrar.**

Estándares aplicados: OWASP Top 10 (todos los proyectos), incluyendo auditoría
de dependencias (A06). Este proyecto no tiene agente de seguridad propio
adicional (sin GDPR/ASVS/PCI explícitos), así que el global cubre el scope
completo. Revisión hecha sobre el diff real (`git diff`, working tree —
`main` y la rama de la tarea apuntan al mismo commit, todo el trabajo está en
cambios sin commitear), no solo el resumen de este documento.

**Puntos específicos de la tarea (más allá del checklist genérico):**

1. **Bypass del filtro geográfico de 100 km (DT-006 capa 1) en modo libre —
   bien acotado, sin vector de escalado a modo guiado.**
   `app/api/track/route.ts`: el `modo` que decide si se aplica el filtro se
   lee de la fila `intentos` en BD (`select("id, modo")`), nunca del payload
   del cliente — el payload OwnTracks (`payloadOwnTracks`, Zod) solo admite
   `_type`, `lat`, `lon`, `tst`, `batt`, `acc`; no hay ningún campo `modo` que
   un atacante pueda inyectar. No hay carrera explotable: `modo` se fija una
   única vez en `iniciarReto()` (transición `antes` → `durante`, protegida
   por `requerirSesion()`) y ya no cambia durante la vida del intento —
   `reiniciarReto()` no hereda el modo, abre un intento nuevo vía
   `insert({fase: "antes"})` que cae en el default de BD (`guiado`,
   migración `0003_modo_intento.sql`). Grep completo de `app/admin/actions.ts`
   confirma que ninguna otra Server Action escribe `modo`, `destino_lat` ni
   `destino_lon`. Conclusión: el bypass es exactamente lo que aprobó DT-016
   — no hay forma de forzarlo sobre un intento en modo guiado.

2. **Rate limiting (DT-011) intacto en ambos modos, sin combinarse con el
   bypass geográfico.** En `app/api/track/route.ts` el orden es: (1) token
   en tiempo constante, (2) `consumir(tokenRecibido, 40, 60000)` — 429 si se
   excede —, y solo después (3) parseo de payload, (4) resolución de
   `{id, modo}`, (5) filtro geográfico condicional. El rate limit se aplica
   antes de conocer el modo del intento, así que no hay combinación posible
   de "sin geo-filtro + sin límite de peticiones": con el token correcto, un
   atacante en modo libre sigue limitado a 40 req/min igual que en modo
   guiado. El test nuevo de `route.test.ts` ("inserta el punto aunque esté a
   más de 100 km... en modo libre") no toca ni desactiva el rate limit; el
   test existente de 429 sigue verde.

3. **Validación Zod de `destinoLat`/`destinoLon` en `iniciarReto`.**
   `parametrosIniciarReto` (`app/admin/actions.ts`) es un
   `z.discriminatedUnion("modo", ...)`: rama libre exige
   `destinoLat: z.number().min(-90).max(90)` y
   `destinoLon: z.number().min(-180).max(180)` — mismo rango físico exacto
   que `payloadOwnTracks` en `/api/track/route.ts`. `safeParse` rechaza
   valores no numéricos, NaN, fuera de rango o ausentes antes de construir
   `cambios`; si falla, lanza sin llamar a `supabase.update(...)` (confirmado
   con `expect(updateSpy).not.toHaveBeenCalled()` en los tests nuevos). No
   hay ningún cast que se salte esta validación — la fuente de verdad para lo
   que se persiste es siempre `datos.data` (salida de Zod), no `params`
   directamente. No hay forma de guardar un destino fuera de rango ni no
   numérico.

4. **Autorización de `iniciarReto`: sin regresión.** Primera línea del
   cuerpo de la función sigue siendo `await requerirSesion()`, igual que las
   otras 14 Server Actions del fichero — mismo patrón, mismo helper, sin
   bypass ni condición especial para el nuevo parámetro `params`.

5. **Datos expuestos al cliente en modo libre: sin campos internos
   filtrados.** `ProgresoPublicoLibre` (`lib/types.ts`) solo expone `modo`,
   `distanciaRestanteKm` y `ultimaPosicion`; `ultimaPosicion` se construye
   explícitamente en `lib/traza/progreso-libre.ts`
   (`{ lat: ultima.lat, lon: ultima.lon, ts: ultima.ts }`) — nunca se
   propaga el objeto `Posicion` completo, así que `batt`, `acc`,
   `intento_id`, `fuente` y `descartado` no llegan al cliente (mismo
   criterio ya cerrado en DEBT.md sobre `ProgresoPublico`/`Progreso`). El
   histórico de puntos para el mapa (`app/page.tsx`,
   `calcularProgresoLibreDelIntento` → `puntosGps`) hace el mismo
   `.map((p) => ({ lat: p.lat, lon: p.lon }))`, incluso más restrictivo de
   lo pedido (ni siquiera expone `ts`) — sin filtración de campos internos.

**Resto del checklist OWASP sobre los ficheros modificados de esta tarea:**

- **A01 (control de acceso):** todas las Server Actions tocadas
  (`iniciarReto`) y no tocadas del mismo fichero verifican sesión
  explícitamente. Los endpoints públicos (`/api/track`, `/api/progreso`)
  siguen usando el cliente Supabase correcto para su privilegio
  (`getSupabaseAdmin()` en ingesta server-to-server con token propio,
  `getSupabasePublic()` sujeto a RLS en progreso público) — sin cambios de
  privilegio introducidos por esta tarea.
- **A02 (criptografía):** sin secretos nuevos hardcoded; la comparación de
  token sigue siendo `timingSafeEqual` sobre hash SHA-256 (sin tocar). Las
  coordenadas de destino no son datos sensibles (destino público del reto,
  mismo criterio que `started_at`/`mensaje_llegada`, ya expuestos).
- **A03 (inyección):** cero SQL crudo — todo vía el query builder de
  Supabase (`.eq()`, `.update()`, `.insert()`, `.select()` con lista de
  columnas explícita). Sin `eval`, sin `new Function`, sin interpolación de
  input de usuario en comandos.
- **A04 (diseño inseguro):** el modo es inmutable por diseño de servidor
  (columna con default + un único punto de escritura), no por convención de
  UI — un cliente que llame a `iniciarReto` manipulando el payload sigue
  sujeto a la validación Zod y a `requerirSesion()`. Rate limits no dependen
  del frontend (ver punto 2).
- **A05 (configuración):** sin credenciales ni API keys nuevas en el código.
  `TRACK_TOKEN` sigue sin prefijo `NEXT_PUBLIC_` (sin cambios). Ninguna
  variable de entorno nueva introducida por esta tarea.
- **A06 (componentes vulnerables):** `pnpm audit --prod` ejecutado sobre la
  raíz del proyecto, resultado: sin vulnerabilidades conocidas. Sin
  dependencias nuevas añadidas por esta tarea (no hay cambios en
  `package.json`/`pnpm-lock.yaml`).
- **A07 (identificación/autenticación):** la sesión de admin sigue
  gestionada por `lib/auth/admin-session.ts` (sin tocar en esta tarea);
  ninguna ruta nueva depende solo de validación en cliente — el selector de
  modo/destino en `ActividadAcciones.tsx` es UX (deshabilita el botón si el
  destino no es válido), pero la validación real y bloqueante vive en el
  servidor (`parametrosIniciarReto.safeParse`).
- **A08 (integridad de datos):** los datos del cliente (`params` de
  `iniciarReto`, payload de `/api/track`) se revalidan siempre en el
  servidor con Zod, aunque el cliente ya valide. Cero casts de tipo para
  saltarse validación en todo el diff (grep sin resultados en los ficheros
  tocados).
- **A09 (logging):** sin logs nuevos en los ficheros tocados (el único
  `console.error` de `Mapa.tsx` es preexistente, fuera del diff, y no
  loguea datos sensibles). El mensaje de error lanzado por `iniciarReto`
  (destino inválido) no expone detalles internos: sin stack traces, sin
  nombres de tabla/columna.
- **A10 (SSRF):** ningún código de esta tarea construye URLs con input de
  usuario para hacer requests salientes. Las coordenadas de destino se usan
  solo para cálculo matemático local (`haversineKm`), nunca como parte de
  una URL o petición HTTP.

**RLS (Supabase, verificado por lectura de migraciones — sin acceso al
proyecto Supabase real, no aplicado todavía):** las columnas nuevas
`modo`/`destino_lat`/`destino_lon` viven en la tabla `intentos`, que ya
tiene RLS activado (`0001_esquema_inicial.sql`) con una única policy
`intentos_select_activo` (`using (not cerrado)`) para `anon`. La policy es a
nivel de fila, no de columna, así que las columnas nuevas quedan cubiertas
automáticamente por la misma regla que ya protege `started_at`/
`mensaje_llegada` — visibles solo mientras el intento está activo, nunca
para intentos cerrados. `0003_modo_intento.sql` no declara (ni necesita)
policies propias. Exponer el destino en línea recta al público es la
intención de producto de DT-016 (se muestra en `DistanciaRestante.tsx`), no
una fuga de datos.

**Sin issues.**

**Siguiente paso:** tarea lista para cerrar (pendiente de la verificación
visual en navegador ya señalada por el Reviewer, que no es un bloqueo de
Seguridad).

---

### Ronda 2 — Reviewer (2026-08-07)

**Contexto de esta ronda:** revisión específica del "Fix de compatibilidad
post-revisión" (ver sección de este documento), aplicado después de que
Ronda 1 de Reviewer y Seguridad ya hubieran aprobado la tarea, a raíz del
hallazgo del Orquestador verificando en vivo contra el Supabase real de
producción (migración `0003_modo_intento.sql` sin aplicar).

**Veredicto: ✅ Aprobado — pasa a Seguridad** (Ronda 2, específica sobre el
fix; Seguridad solo vio el código de Ronda 1 y no este fix nuevo).

Verificado punto por punto contra lo pedido:

1. **¿El fallback distingue "columna no existe" de otros errores genuinos?**
   No — los tres puntos (`app/page.tsx` `obtenerIntentoActivo`, `app/api/track/route.ts`,
   `app/api/progreso/route.ts`) activan el reintento con el select mínimo
   ante cualquier `error` de la consulta ampliada, sin comprobar
   `error.code === "42703"` ni loguear nada. Analizado el impacto real: en
   el peor caso (el select de fallback también falla), el resultado es
   exactamente el mismo comportamiento que el sistema ya tenía **antes** de
   DT-016 (se trata como "sin intento activo" / se descarta el punto GPS) —
   no hay regresión de comportamiento respecto al estado previo a esta
   feature, y es coherente con el patrón de degradación silenciosa ya
   establecido en todo el proyecto (`respuestaVacia()` en `/api/track` nunca
   da pistas). El único coste real es de observabilidad durante la ventana
   de compatibilidad: no se puede distinguir en logs "esperado, falta
   aplicar la migración" de "error real, investigar". **No bloqueante**
   (sin regresión funcional) — registrado como recomendación en `DEBT.md`.
2. **¿Triplicación aceptable?** El mismo patrón vive en 3 ficheros con
   columnas, cliente Supabase (admin vs. público) y forma de retorno
   distintos en cada uno. Dado que es código explícitamente temporal
   (destinado a quedar inactivo/candidato a eliminar tras aplicar la
   migración, ya documentado así en `DEBT.md`), forzar una abstracción
   compartida ahora añadiría complejidad sin beneficio real — coherente con
   el criterio del framework contra abstracciones especulativas. Aceptado
   sin cambios; registrado en `DEBT.md` para reconsiderar solo si el
   fallback termina viviendo mucho más tiempo del previsto.
3. **`iniciarReto` en modo guiado, migración aplicada:** confirmado sin
   riesgo. Todo intento nuevo se crea vía `insert({fase: "antes"})` (en
   `crearPrimerIntento`/`reiniciarReto`), que nunca fija `modo` explícito y
   por tanto siempre cae en el default de BD (`'guiado'` una vez la
   migración esté aplicada). Como el `UPDATE` de `iniciarReto` en modo
   guiado ya no toca la columna `modo`, el valor que queda es siempre el
   que puso el default al crear la fila — nunca hay un escenario donde haga
   falta reescribirlo explícitamente a `'guiado'`, porque ninguna otra
   Server Action lo cambia a `'libre'` fuera de `iniciarReto` en modo libre
   sobre ese mismo intento. Sin regresión cuando la migración esté aplicada.
4. **Tests nuevos:** revisados `app/page.test.ts` (nuevo, 3 tests),
   `app/api/track/route.test.ts` (+3 tests) y `app/api/progreso/route.test.ts`
   (+2 tests), más la actualización de `app/admin/actions.test.ts`. Todos
   mockean explícitamente el error de Postgres (`"column intentos.modo does
   not exist"`) en la consulta ampliada y datos reales en el select de
   fallback, con asserts específicos de comportamiento (fase real
   preservada, filtro geográfico aplicado en el fallback, `insertSpy`/
   `updateSpy` verificados con `not.toHaveBeenCalled()` donde corresponde,
   no solo status 200 genérico). No son tautológicos.
5. **`DEBT.md`:** la entrada "Recordatorio: aplicar
   `supabase/migrations/0003_modo_intento.sql` contra producción" cumple el
   formato estándar completo (Fecha/Contexto/Problema/Impacto/Solución
   propuesta/Prioridad) con prioridad **Alta**, explica el efecto exacto si
   no se aplica y confirma que el fallback queda inactivo por sí solo en
   cuanto se aplique — correctamente registrada, no es un parche que quede
   sin seguimiento.

**Recomendaciones (no bloqueantes, registradas en `DEBT.md`):**
- El fallback no distingue el error 42703 de otros errores genuinos de
  Supabase ni loguea nada — sin regresión, pero reduce observabilidad
  mientras dure la ventana de compatibilidad.
- Triplicación del patrón de fallback en 3 ficheros — aceptada dado que es
  código temporal, reconsiderar solo si vive más tiempo del previsto.

**Lección registrada en `docs/LESSONS.md`:** "Una migración escrita y
aprobada no es una migración aplicada: verificar contra el entorno real
antes de dar una tarea por cerrada" — ninguno de los agentes del pipeline
estándar (Implementador, Reviewer, Seguridad) verificó el estado real de la
migración contra producción; lo encontró el Orquestador por fuera del
pipeline automático. Mismo principio ya visto con el CSS de Tailwind no
generado: hay fallos que solo se manifiestan verificando contra el sistema
real, nunca contra código o tests aislados.

**Lo que está bien:** el fix es defensivo sin ser invasivo — en los tres
puntos, el peor caso posible (ambas consultas fallan) reproduce
exactamente el comportamiento pre-DT-016, sin ningún escenario nuevo de
fallo introducido. La decisión de omitir `modo` del `UPDATE` en modo
guiado (en vez de forzarlo a `'guiado'` explícitamente) es la solución
mínima correcta, aprovechando que el default de BD ya cubre ese caso.

**Siguiente paso:** Agente de Seguridad (Ronda 2, sobre el fix de
compatibilidad específicamente — el código de Ronda 1 ya fue aprobado por
Seguridad sin cambios desde entonces).

---

### Ronda 2 — Seguridad (2026-08-07)

**Contexto de esta ronda:** revisión específica del "Fix de compatibilidad
post-revisión" (columnas `modo`/`destino_lat`/`destino_lon` sin aplicar
todavía en producción — ver sección de este documento y `DEBT.md`). La
Ronda 1 de Seguridad ya había aprobado sin issues el código de DT-016; esta
ronda cubre únicamente el fix nuevo sobre `app/page.tsx`,
`app/api/track/route.ts`, `app/api/progreso/route.ts` y `app/admin/actions.ts`.

**Veredicto: ✅ Sin vulnerabilidades — tarea lista para cerrar.**

Estándares aplicados: OWASP Top 10 (única política de seguridad de este
proyecto, sin requisitos adicionales GDPR/ASVS/PCI). Revisión hecha leyendo
el código real de los cuatro ficheros tocados en el fix, no solo el resumen
de este documento.

**Puntos específicos pedidos para esta ronda:**

1. **El fallback NO desactiva el filtro geográfico de `/api/track` — sigue
   siendo más restrictivo, nunca menos.** `app/api/track/route.ts`, líneas
   157-179: si la consulta `select("id, modo")` falla (`errorIntento`), el
   reintento con `select("id")` fija explícitamente `modoIntento = "guiado"`
   antes de llegar al paso 5 (`if (modoIntento === "guiado") { ...filtro de
   100 km... }`). El único efecto del fallback sobre el filtro geográfico es
   que se aplica con más frecuencia (cualquier fallo de columna cae a modo
   guiado = filtro activo), nunca que se salte. No hay ninguna rama donde un
   error de Postgres derive en `modoIntento = "libre"` ni en omitir el `if`
   del paso 5. Mismo patrón, mismo resultado, en `app/api/progreso/route.ts`
   (`obtenerIntentoActivoModoGuiado` devuelve siempre `modo: "guiado"`, nunca
   `"libre"`) — confirma que el cálculo cae a `calcularProgreso` (traza fija)
   y no a `calcularProgresoLibre` en el camino de fallback. Sin vector de
   bypass del filtro DT-006 vía error de compatibilidad.
2. **Sin filtración de errores de Postgres al cliente.** En los tres puntos
   de fallback (`app/page.tsx` `obtenerIntentoActivo`, `app/api/track/route.ts`,
   `app/api/progreso/route.ts`) el objeto `error`/`errorIntento` de Supabase
   se usa únicamente como condición booleana (`if (error)`, `if (errorIntento)`)
   para decidir si reintentar — nunca se serializa, se loguea ni se incluye
   en la respuesta HTTP. Búsqueda de `console.` sobre `app/` sin resultados:
   no hay ningún `console.log`/`console.error` nuevo que pudiera volcar el
   mensaje de Postgres (`column intentos.modo does not exist`, nombres de
   tabla/columna) a logs de producción. Las respuestas al cliente en caso de
   fallo total (ambas consultas fallan) son las mismas genéricas de siempre:
   `respuestaVacia()` (`[]`, 200) en `/api/track`, `progresoVacio()` (JSON
   del progreso sin datos) en `/api/progreso`, y `null` (fase "antes") en
   `app/page.tsx` — ninguna expone stack traces, códigos de error de
   Postgres ni nombres internos. En `app/admin/actions.ts`, `iniciarReto`
   sigue lanzando únicamente el mensaje genérico `"No se pudo iniciar el
   reto."` (no `error.message`) si el `UPDATE` en modo libre falla contra la
   migración sin aplicar.
3. **`iniciarReto` sigue exigiendo `requerirSesion()` como primera línea,
   sin cambios en la ruta de autorización.** `await requerirSesion();` es la
   primera sentencia del cuerpo de la función, antes de
   `parametrosIniciarReto.safeParse(params)` y antes de tocar BD — igual que
   las otras 14 Server Actions del fichero. El cambio de esta ronda (omitir
   `modo` del objeto `cambios` del `UPDATE` cuando `datos.data.modo ===
   "guiado"`) es puramente de qué columnas se escriben, no toca ni rodea la
   comprobación de sesión ni la validación Zod previa. Sin regresión de
   A01/A07.
4. **Resto del checklist OWASP sobre los ficheros de esta ronda
   (`app/page.tsx`, `app/api/track/route.ts`, `app/api/progreso/route.ts`,
   `app/admin/actions.ts`):**
   - **A01 (control de acceso):** sin cambios de privilegio — `/api/track` y
     `/api/progreso` siguen usando `getSupabaseAdmin()`/`getSupabasePublic()`
     respectivamente, igual que antes del fix; `iniciarReto` sigue exigiendo
     sesión (punto 3).
   - **A02 (criptografía):** sin cambios en esta ronda — la comparación de
     token (`tokenEsValido`, SHA-256 + `timingSafeEqual`) no se toca.
   - **A03 (inyección):** el fallback añade únicamente llamadas adicionales
     al query builder de Supabase (`.select("id")`, mismo patrón que las
     consultas existentes) — cero SQL crudo, cero interpolación de strings.
   - **A04 (diseño inseguro):** el fallback no depende de nada que el
     cliente controle (ni payload, ni headers, ni query params) — se activa
     solo por el resultado real de la consulta a BD, evaluado en servidor.
   - **A05 (configuración):** sin variables de entorno ni credenciales
     nuevas introducidas por el fix.
   - **A06 (componentes vulnerables):** `pnpm audit --prod` ejecutado de
     nuevo sobre la raíz del proyecto en esta ronda: **sin vulnerabilidades
     conocidas**. Sin cambios en `package.json`/`pnpm-lock.yaml`.
   - **A07 (identificación/autenticación):** sin cambios — `requerirSesion()`
     intacta (punto 3); el fallback no crea ninguna vía nueva de acceso al
     panel admin.
   - **A08 (integridad de datos):** el fallback no introduce ningún `as` de
     TypeScript para saltarse tipado — en `app/page.tsx` y
     `app/api/progreso/route.ts` el objeto de fallback se construye como
     literal tipado explícito (`{ id: data.id, modo: "guiado", destino_lat:
     null, destino_lon: null }`), coherente con la interfaz declarada, sin
     cast. Búsqueda de `as unknown` / `as any` sobre los ficheros de esta
     ronda: sin resultados.
   - **A09 (logging):** sin logs nuevos que expongan datos sensibles ni
     errores internos (punto 2). Ningún dato personal (posiciones GPS,
     tokens) se loguea en el fix.
   - **A10 (SSRF):** el fix no construye ninguna URL ni hace ninguna
     petición saliente nueva — solo consultas adicionales al mismo cliente
     Supabase ya usado en el resto del endpoint.

**Sin issues.**

**Siguiente paso:** tarea lista para cerrar (queda pendiente, como ya
señaló el Reviewer en Ronda 1 y Ronda 2, la verificación visual en
navegador — no es un bloqueo de Seguridad — y aplicar
`supabase/migrations/0003_modo_intento.sql` contra producción, ya
registrado en `DEBT.md` con prioridad Alta).

---

Este archivo es la pizarra compartida entre todos los agentes del pipeline: los
subagentes corren aislados y no ven la conversación, así que lo único que
comparten es lo que está escrito aquí. Lo gobierna el Orquestador, que lo crea al
empezar cada tarea con la plantilla del framework y lo archiva al cerrarla.
