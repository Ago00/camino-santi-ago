# Tarea en curso

**Título:** Bug — no se puede arrancar el reto si `intentos` está vacía
**Tipo:** Bug
**Estado:** Diagnóstico completado (Debugger)
**Iniciada:** 2026-08-01

## Prompt clarificado

Con la base de datos de producción real (sin ninguna fila en `intentos`
todavía, caso real detectado por el usuario tras el despliegue de F4), la
sección Actividad del panel admin muestra "No hay ningún intento activo en
la base de datos" y no ofrece ningún botón — ni siquiera "Iniciar".

**Causa ya identificada en conversación con el usuario** (a confirmar/afinar
por el Debugger): ninguna de las Server Actions de `app/admin/actions.ts`
crea la primera fila de `intentos` desde cero.
- `iniciarReto()` exige que ya exista una fila con `cerrado = false` y
  `fase = 'antes'` — si no hay ninguna fila, lanza error.
- `reiniciarReto()` exige que ya exista una fila activa para cerrarla antes
  de crear la siguiente — tampoco sirve para el arranque desde cero.
- `/api/track` tampoco crea intentos: si no hay uno activo, ignora el punto
  en silencio (comportamiento correcto para ese endpoint, pero confirma que
  en ningún sitio de la app se siembra la primera fila).
- Durante F2 la verificación de `/api/track` contra Supabase real se hizo
  insertando manualmente una fila de intento por SQL — nunca se probó el
  arranque desde una base de datos completamente vacía a través de la app.

**Lo que se pide:** que el panel admin permita arrancar el reto la primera
vez sin que nadie tenga que tocar SQL en Supabase. El Debugger decide el
mecanismo concreto (por ejemplo: la sección Actividad ofrece una acción para
crear el primer intento cuando no hay ninguno, o `iniciarReto()` crea la fila
si no existe en vez de fallar) — es una decisión de implementación menor, no
arquitectónica: no cambia el esquema, no cambia el invariante de "un único
intento activo a la vez" (índice único `intentos_activo_unico` ya lo
garantiza), no afecta a `/api/track` ni a la web pública.

## Alcance
- **Incluye**: la sección Actividad y/o las Server Actions correspondientes,
  para que desde una BD vacía se pueda llegar a fase `durante` sin SQL manual.
- **Excluye**: cualquier cambio de esquema SQL; cualquier cambio en
  `/api/track`, `proxy.ts` o la autenticación de admin (ya verificados y
  cerrados en F4).

## Diseño
Mockup: N/A — es un fix de comportamiento sobre UI ya existente, sin cambio
visual significativo.

## Decisión técnica / Diagnóstico

### Causa raíz (confirmada leyendo el código real)

La hipótesis del Orquestador es correcta y queda confirmada con evidencia
exacta:

1. **`components/admin/SeccionActividad.tsx:19-30`** — el Server Component
   consulta `intentos` filtrando `cerrado = false` con `.maybeSingle()`. Si
   la tabla está vacía, `intentoActivo` es `null` y el componente entra en
   la rama `if (!intentoActivo)` (línea 25), que renderiza solo un párrafo
   informativo — **nunca monta `<ActividadAcciones />`**. No existe ningún
   camino de UI para crear una fila cuando esta consulta no devuelve nada.

2. **`app/admin/actions.ts`** — las 4 Server Actions de Actividad hacen
   todas la misma comprobación previa (`select ... .eq('cerrado', false)
   .maybeSingle()`) y **lanzan una excepción si `intentoActivo` es `null`**,
   antes de llegar a ningún `insert`/`update`:
   - `iniciarReto()` (líneas 63-70): exige fila con `fase === 'antes'`.
   - `finalizarReto()` (líneas 94-101): exige fila con `fase === 'durante'`.
   - `retomarReto()` (líneas 128-135): exige fila con `fase === 'llegada'`.
   - `reiniciarReto()` (líneas 157-165): exige *cualquier* fila activa antes
     de cerrarla (línea 169) y solo *entonces* insertar la siguiente (línea
     174) — el `insert` existe, pero es inalcanzable sin una fila previa que
     cerrar primero. No sirve como semilla desde cero.

   Ninguna acción hace un `insert` incondicional de la primera fila. No hay
   ningún seed script, cron ni trigger SQL que la siembre (confirmado
   revisando `supabase/migrations/0001_esquema_inicial.sql` completo y
   `docs/tecnico/arquitectura.md` — no se menciona ningún mecanismo de este
   tipo).

3. El índice único `intentos_activo_unico` (migración, línea 29:
   `create unique index ... on intentos ((true)) where not cerrado`) es un
   índice parcial: solo impide que existan **dos** filas con `cerrado =
   false` simultáneamente. No impone ningún obstáculo a insertar la
   *primera* fila cuando la tabla está vacía — cualquier solución que inserte
   solo cuando la comprobación previa confirme que no hay ninguna fila activa
   respeta el invariante intacto (mismo patrón que ya usa `reiniciarReto`).

**Por qué no se detectó antes:** confirma el patrón ya registrado en
`docs/LESSONS.md` (lección de F0/F2 sobre no verificar contra una BD vacía
real) — F2 verificó `/api/track` insertando manualmente una fila de intento
por SQL, y F4 (panel admin) nunca se probó de punta a punta contra un
proyecto Supabase recién creado sin ninguna fila. Todos los flujos de
Actividad se diseñaron y probaron asumiendo implícitamente que siempre existe
ya una fila `cerrado = false` de la que partir.

### Solución propuesta

Añadir una Server Action nueva, específica para el arranque desde cero, en
vez de sobrecargar `iniciarReto()` con un comportamiento distinto (crear vs.
transicionar son dos operaciones semánticamente distintas — mantenerlas
separadas es más legible y evita que `iniciarReto()` tenga dos caminos con
significados distintos según el estado de la BD):

1. **`app/admin/actions.ts`** — nueva función `crearPrimerIntento()`:
   - Llama a `requerirSesion()` igual que el resto.
   - Comprueba que no exista ya ninguna fila con `cerrado = false`
     (`select id ... eq('cerrado', false).maybeSingle()`); si ya existe,
     lanza (`"Ya existe un intento activo."`) — evita duplicar filas activas
     incluso ante una doble invocación, y deja que el índice único sea la
     última red de seguridad ante una carrera real (mismo patrón defensivo
     que ya usa `reiniciarReto`, que también podría chocar con el índice
     único en teoría y no se protege más que con esta comprobación previa).
   - Si no hay ninguna, `insert({ fase: 'antes' })` (mismo insert mínimo que
     ya usa `reiniciarReto()` en la línea 174 — la fila nace con los defaults
     de columna: `cerrado = false`, `started_at`/`ended_at`/`mensaje_llegada`
     = `null`).
   - Si el `insert` falla (p. ej. violación del índice único por una
     carrera), lanza `"No se pudo crear el intento."` — igual que el resto
     de acciones.
   - Llama a `revalidarAdmin()` al terminar.

2. **`components/admin/SeccionActividad.tsx`** — cuando `intentoActivo` es
   `null` (líneas 25-31), en vez de (o además de) el párrafo informativo,
   ofrecer una acción para crear el primer intento. Opción más simple y
   consistente con el resto del fichero: extraer un pequeño Client Component
   (p. ej. `components/admin/CrearPrimerIntentoBoton.tsx`) que reutilice
   `BotonConfirmable` ya existente, mismo patrón que usan las demás
   transiciones:
   ```tsx
   <BotonConfirmable
     etiqueta="Iniciar primer intento"
     etiquetaPendiente="Creando…"
     mensajeConfirmacion="¿Crear el primer intento? Se creará en fase 'antes'."
     accion={crearPrimerIntento}
   />
   ```
   Mantener el texto informativo existente ("No hay ningún intento activo…")
   junto al botón, no sustituirlo — sigue siendo cierto y da contexto.

3. **No tocar** `iniciarReto()`, `finalizarReto()`, `retomarReto()`,
   `reiniciarReto()`, `/api/track`, `proxy.ts`, autenticación, ni el esquema
   SQL — todos siguen asumiendo correctamente que ya existe una fila activa,
   que es una precondición válida una vez `crearPrimerIntento()` se ha usado
   una vez.

4. **Tests**: añadir un test de integración (con el cliente Supabase
   mockeado, mismo patrón que ya exista para las otras acciones si lo hay, o
   al menos un test unitario de la lógica de comprobación) que cubra:
   - Tabla vacía → `crearPrimerIntento()` inserta y no lanza.
   - Ya existe una fila activa → `crearPrimerIntento()` lanza y no inserta
     una segunda (regresión directa contra el invariante del índice único).

### Archivos implicados
- `app/admin/actions.ts:59-80` (contexto: por qué `iniciarReto` no sirve),
  `:153-178` (contexto: por qué `reiniciarReto` no sirve) — nueva función
  `crearPrimerIntento()` a añadir en la sección "Actividad".
- `components/admin/SeccionActividad.tsx:25-31` — rama sin acción a
  reemplazar por el nuevo botón.
- `components/admin/BotonConfirmable.tsx` — se reutiliza tal cual, sin
  cambios.
- `supabase/migrations/0001_esquema_inicial.sql:29` — solo como referencia
  del invariante a respetar, sin modificar.

**Clasificación: Fix simple.** Toca como mucho 2-3 archivos
(`actions.ts` + `SeccionActividad.tsx` + un componente cliente nuevo pequeño
y opcional), no cambia el esquema, no tiene impacto en otras features, y la
solución es obvia y directa siguiendo el mismo patrón ya validado en el
resto del fichero (`reiniciarReto` ya hace exactamente el mismo tipo de
`insert` mínimo). No hay tradeoffs relevantes entre alternativas.

**Siguiente paso:** Implementador directo.

## Archivos modificados

- `app/admin/actions.ts` — nueva Server Action `crearPrimerIntento()`
  (sección Actividad): `requerirSesion()` → comprueba que no exista ya una
  fila `cerrado = false` → si existe, lanza `"Ya existe un intento activo."`
  → si no, `insert({ fase: 'antes' })` → `revalidarAdmin()`. No se ha tocado
  ninguna de las 10 acciones existentes.
- `components/admin/SeccionActividad.tsx` — cuando `intentoActivo` es
  `null`, ahora renderiza el párrafo informativo existente (sin cambios) +
  `<CrearPrimerIntentoBoton />`.
- `components/admin/CrearPrimerIntentoBoton.tsx` (nuevo) — Client Component
  mínimo que reutiliza `BotonConfirmable` tal cual, mismo patrón que
  `DescartarPosicionBoton.tsx` / los botones de `ActividadAcciones.tsx`.
- `app/admin/actions.test.ts` — nuevo `describe("Actividad — arranque desde
  cero (crearPrimerIntento)")` con 3 tests: inserta cuando la tabla está
  vacía, lanza y NO inserta una segunda fila si ya hay un intento activo
  (regresión directa del invariante del índice único), y lanza sin cookie de
  sesión.

## Quality gates

- **Typecheck** (`pnpm typecheck`): verde, cero errores.
- **Lint** (`pnpm lint`): verde, cero errores.
- **Test** (`pnpm test`): verde, 128/128 tests (14 ficheros), incluidos los
  3 nuevos de `crearPrimerIntento`.

## Historial de revisión

- **Implementador (2026-08-01):** implementado exactamente según el
  diagnóstico del Debugger, sin desviaciones. No se ha tocado
  `iniciarReto`, `finalizarReto`, `retomarReto`, `reiniciarReto`,
  `/api/track`, `proxy.ts` ni el esquema SQL. No se ha levantado preview
  local: el `.env.local` del proyecto apunta a la misma instancia de
  Supabase de producción mencionada en el diagnóstico del bug, y accionar
  el botón nuevo (aunque fuera solo para verificación visual) dispararía un
  `insert` real en `intentos` fuera del alcance del Implementador. En su
  lugar se verificó que el componente nuevo reutiliza exactamente
  `BotonConfirmable` y las mismas clases Tailwind (`space-y-*`) ya
  renderizadas en producción por el resto de `SeccionActividad.tsx` — no
  introduce ninguna clase ni estilo nuevo sin probar, así que no aplica el
  riesgo de `docs/LESSONS.md` sobre CSS no compilado. Pendiente de Reviewer
  y Seguridad.

- **Reviewer (2026-08-01): ✅ Aprobado.** Verificado contra el diagnóstico:
  (1) `crearPrimerIntento()` llama a `requerirSesion()` igual que las 10
  acciones existentes; (2) comprueba explícitamente que no exista fila
  `cerrado=false` antes de insertar (defensa previa, no solo el índice
  único) y el test de regresión (`app/admin/actions.test.ts:134-138`)
  cubre este caso verificando además que `insertIntentoSpy` no se llama;
  (3) confirmado leyendo `actions.ts` completo que las 10 Server Actions
  existentes no se tocaron — cambio estrictamente aditivo; (4)
  `CrearPrimerIntentoBoton.tsx` reutiliza `BotonConfirmable` sin lógica de
  confirmación propia, mismo patrón que `DescartarPosicionBoton.tsx`. Sin
  `any`/`as`/`@ts-ignore`. `CHANGELOG.md` actualizado correctamente. Única
  observación: el Reviewer no dispuso de herramienta de shell para
  ejecutar typecheck/lint/test de forma independiente en esta ronda; se
  confía en el reporte del Implementador (128/128) dado que el patrón de
  test es idéntico a otros ya verificados en tareas previas. No es
  bloqueante. Sin bloqueantes ni recomendaciones nuevas para `DEBT.md`.
  Pasa a Seguridad.
