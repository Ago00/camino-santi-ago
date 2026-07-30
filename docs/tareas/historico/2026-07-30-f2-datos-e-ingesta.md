# Tarea en curso

**Título:** F2 — Datos e ingesta (código, sin cuentas todavía)
**Tipo:** Feature
**Estado:** Implementación
**Iniciada:** 2026-07-30
**Rama:** `feature/f2-datos-ingesta`

## Prompt clarificado

Santi no puede dar de alta las cuentas de F0 (Supabase, Vercel) ahora mismo,
pero pide avanzar lo que se pueda. F2 normalmente requiere una base de datos
real para verificarse de extremo a extremo — esta tarea es **el código de F2
completo y correcto, con la parte que exige credenciales reales aplazada**.

### Alcance

**Incluye (no necesita cuentas):**
- Migración SQL: esquema completo (`intentos`, `posiciones`, `intenciones`,
  `comentarios`, `textos`) + políticas RLS, tal como está cerrado en el plan.
  Lista para pegar en el editor SQL de Supabase en cuanto exista el proyecto.
- `lib/supabase/admin.ts` y `lib/supabase/public.ts` — clientes tipados. No
  fallan al construirse sin env vars (fallan solo al usarse, que es lo
  correcto: el build no debe depender de secretos).
- `app/api/track/route.ts` — endpoint de ingesta, con las dos defensas de
  DT-006: token comparado en tiempo constante + filtro de plausibilidad
  geográfica (100 km) contra `lib/traza/traza.geojson`.
- Tests unitarios de la lógica del endpoint con el cliente de Supabase
  mockado (validación de token, filtro geográfico, forma de la respuesta) —
  no dependen de una BD real.
- Documentación: `docs/tecnico/modelo-datos.md` actualizado, roadmap con el
  ítem de F4 ampliado (DT-006), `DEBT.md` corregido (ya no "irreversible").

**Excluye (bloqueado por F0, queda anotado como pendiente):**
- Ejecutar la migración contra un Supabase real.
- Probar el endpoint con una petición real (`curl` simulando OwnTracks) contra
  una BD viva.
- Verificar con la app OwnTracks real desde el móvil.
- Deploy a Vercel.

Cuando F0 esté lista, lo que queda es: pegar la migración, poner las env vars,
y verificar — no diseñar ni escribir código.

### Decisión de producto de Santi (2026-07-30)

Confirmó, tras preguntárselo, que el ancla de progreso **sí es recuperable**
desde el panel de admin (no hay que tocar la BD a mano) — lo cual corrige la
gravedad que Seguridad le había dado en `DEBT.md`. A partir de ahí decidió
**DT-006**: filtro geográfico de 100 km en `/api/track` (F2) + el botón de
"descartar" en el panel (F4) ampliado de "último punto" a "cualquier punto del
histórico".

## Diseño

Mockup: N/A — sin UI en esta tarea.

## Decisión técnica / Diagnóstico

Ver `docs/tecnico/decisiones-tecnicas.md` → **DT-006**. Resumen:

- Filtro de plausibilidad geográfica: rechazar (sin guardar, `200` con
  respuesta vacía, sin dar pistas al remitente — mismo patrón que la POC) todo
  punto a más de 100 km de la traza de cálculo.
- Token: comparación en tiempo constante (`crypto.timingSafeEqual`), nunca
  `===` de cadenas.
- El endpoint solo inserta si hay un intento activo (`not cerrado`); si no,
  responde `200` con `[]` sin guardar — igual que el patrón validado en la POC.
- Esquema y RLS: tal como están cerrados en
  `docs/tecnico/plan-ejecucion-v1.md` (sección "Esquema Supabase" y tabla RLS).
  No se reabren en esta tarea.

## Archivos modificados

**Nuevos:**
- `supabase/migrations/0001_esquema_inicial.sql` — esquema completo (5 tablas,
  índices, RLS). No ejecutado nunca contra un Supabase real.
- `lib/supabase/admin.ts` — cliente service role, construcción perezosa,
  tipo `BaseDeDatos` compartido.
- `lib/supabase/public.ts` — cliente anon, construcción perezosa.
- `lib/traza/cargar-traza.ts` — carga+prepara `traza.geojson` desde disco,
  cacheado en memoria de proceso (único punto de I/O sobre la traza de cálculo).
- `app/api/track/route.ts` — endpoint de ingesta OwnTracks. **No probado
  contra una BD real** (bloqueado por F0) — ver comentario al inicio del
  fichero y nota abajo.
- `app/api/track/route.test.ts` — 9 tests con el cliente Supabase mockado.

**Modificados:**
- `lib/traza/proyeccion.ts` — añadida `separacionDeTrazaM()` (exportada),
  reutilizada por el filtro geográfico del endpoint; no duplica la lógica de
  proyección de `calcularProgreso`.
- `lib/traza/umbrales.ts` — añadido `SEPARACION_TRAZA_MAX_KM = 100` (DT-006).
- `docs/tecnico/modelo-datos.md` — referencia a la migración real, nota de
  estado pendiente de verificación, sección de clientes tipados.
- `docs/producto/roadmap.md` — F2 marcado con sus ítems completados/pendientes;
  ítem de F4 ampliado de "descartar último punto" a "cualquier punto del
  histórico" (DT-006 capa 2).
- `DEBT.md` — corregida la entrada de envenenamiento del ancla: ya no
  "irreversible", capa 1 (F2) implementada, capa 2 (F4) pendiente.
- `docs/LESSONS.md` — nueva entrada sobre el bug de tipado de
  `@supabase/supabase-js` con `interface` vs mapped types en `Row`.
- `CHANGELOG.md` — entrada de F2.
- `package.json` / `pnpm-lock.yaml` — añadidas dependencias
  `@supabase/supabase-js` y `zod`.

## Verificación pendiente (bloqueada por F0)

Ninguna parte de F2 se ha probado contra un proyecto Supabase real: ni la
migración SQL, ni el endpoint `/api/track` con una petición real (curl u
OwnTracks), ni las políticas RLS. Todo lo anterior está escrito y testeado
con mocks/fixtures, pero requiere verificación de integración en cuanto F0
esté lista. Marcado también en el propio `app/api/track/route.ts` (comentario
de cabecera) y en `docs/tecnico/modelo-datos.md`.

## Quality gates

Las 4 en verde:

- `pnpm typecheck` → sin errores.
- `pnpm lint` → sin errores.
- `pnpm test` → 30/30 tests pasando (21 de `proyeccion.test.ts` + 9 nuevos de
  `route.test.ts`).
- `pnpm build` → build de producción completo, verificado explícitamente
  **sin** ninguna env var de Supabase/TRACK_TOKEN definida en el entorno.

Nota: durante la verificación, `rtk pnpm typecheck` dio un falso positivo de
"completado" mientras el comando interno fallaba por un problema de
npm/pnpm en el wrapper de rtk. Las gates reales se confirmaron ejecutando
`pnpm typecheck`/`pnpm build` directamente (sin el prefijo rtk) hasta ver el
resultado íntegro.

## Historial de revisión

### Reviewer — 2026-07-30 — ✅ APROBADO

**Resumen:** el código coincide exactamente con lo aprobado (DT-006, plan de
ejecución v1). La migración SQL replica el esquema y las políticas RLS del
plan campo a campo, incluida la ausencia de política pública en `intenciones`
(tabla más sensible). Los clientes Supabase tienen construcción perezosa
verificada y fallan con mensajes claros al usarse sin configurar. El endpoint
implementa correctamente las dos defensas de DT-006 (token en tiempo
constante vía SHA-256 + `timingSafeEqual`, filtro geográfico de 100 km). Los
9 tests del endpoint son de calidad real: mock fiel a la forma encadenada del
cliente Supabase y aserciones explícitas de que `insert` no se llama en cada
caso de rechazo. `separacionDeTrazaM()` reutiliza la proyección de
`calcularProgreso` sin duplicar lógica, y `calcularProgreso` no cambió de
comportamiento (mismos tests de dominio que F1, 21/21). La entrada de
`LESSONS.md` sobre `Pick<T, keyof T>` es técnicamente correcta y el arreglo
en `admin.ts` es real. `DEBT.md` refleja con precisión el estado de las dos
capas de DT-006 (capa 1 implementada, capa 2 pendiente, prioridad Alta
mantenida). No se coló nada de F3/F4 (sin componentes, sin rutas nuevas
fuera de `/api/track`).

**Bloqueantes:** ninguno.

**Recomendaciones (registradas en `DEBT.md`):**
- `payloadOwnTracks` (Zod) no valida rango físico de `lat`/`lon`/`tst`. Cubierto
  de facto por el filtro geográfico de 100 km, pero de forma incidental, no
  por contrato explícito. Prioridad Baja.
- Sin test explícito de "body vacío"/"JSON malformado" en `route.test.ts`
  (la rama de código ya existe y es trivial, pero no está testeada
  directamente).
- Revisar en F3/F4, cuando `getSupabasePublic()`/`getSupabaseAdmin()` se
  llamen desde más puntos, que el error por falta de env vars no degrade a
  un 500 genérico sin contexto en los logs.

**Veredicto:** ✅ Aprobado — pasa a Seguridad.

### Seguridad — 2026-07-30 — ✅ APROBADO

**Alcance de la auditoría:** OWASP Top 10 completo (no delta) sobre F2, dado
que `/api/track` es el primer endpoint público del proyecto con acceso a BD.
Cubre `app/api/track/route.ts`, `route.test.ts`,
`supabase/migrations/0001_esquema_inicial.sql`, `lib/supabase/admin.ts`,
`lib/supabase/public.ts`, `lib/traza/proyeccion.ts` (`separacionDeTrazaM`),
`lib/traza/cargar-traza.ts`, `lib/traza/umbrales.ts`, `lib/types.ts`,
`pnpm-workspace.yaml`, `package.json`/`pnpm-lock.yaml`.

**A01/A07 — Endpoint como superficie de ataque.**
- Comparación de token verificada como correcta: SHA-256 produce siempre 32
  bytes, así que `timingSafeEqual` nunca lanza por longitud distinta y no
  hay rama condicional dependiente del input antes de la comparación
  constante. El único timing distinguible sería la longitud de la entrada
  al hash (más bytes -> más bloques SHA-256), pero eso ya lo controla el
  atacante enviando el string que quiera, no filtra nada sobre el secreto.
- Caso TRACK_TOKEN no configurado: verificado en el código que el operador
  de negación sobre undefined o cadena vacía corta con OR de cortocircuito
  antes de invocar la comparación de token. Probado explícitamente con
  Node: si el token esperado fuera cadena vacía, comparar cadena vacía
  contra cadena vacía devolvería true (hash de cadena vacía coincide
  consigo mismo), pero ese camino es inalcanzable porque la negación de
  cadena vacía ya corta el OR antes. No hay bypass.
- Rate limiting / fuerza bruta del token: no implementado. Aceptable para
  el estado actual (F2, sin Vercel, endpoint no desplegado ni alcanzable
  desde internet todavía) pero debe registrarse como deuda explícita antes
  de exponer el endpoint en producción — no estaba en DEBT.md y se pide
  añadirlo (ver Issues).

**A05 — RLS de la migración.** Revisada línea a línea:
- intenciones: RLS activado sin ninguna policy para anon, cero acceso
  público, correcto y explícitamente comentado en el SQL.
- posiciones: policy de SELECT exige punto no descartado Y que pertenezca
  a un intento no cerrado, no expone posiciones descartadas ni de intentos
  históricos al rol anon. Correcto.
- intentos: policy de SELECT exige not cerrado, el histórico de intentos
  pasados no es visible por anon. Correcto.
- comentarios: INSERT público con check que impide oculto=true, cierra un
  vector de bypass de moderación. SELECT exige público y no oculto.
- textos: SELECT abierto a todo, coherente con su propósito, sin datos
  sensibles.
- Ningún grant ni policy de UPDATE/DELETE para anon en ninguna tabla: el
  rol público es estrictamente de solo lectura (y un INSERT acotado en
  comentarios). Correcto y mínimo privilegio real.
- Nota de diseño: RLS nunca se ha ejecutado contra un Supabase real (F0
  pendiente). El razonamiento SQL es correcto por lectura, pero la
  verificación de integración sigue pendiente, tal como ya está declarado
  en el propio fichero y en CURRENT.md. No es bloqueante para esta fase,
  pero se deja constancia de que Seguridad no ha podido confirmar el
  comportamiento real de Postgres, solo la corrección del SQL tal como
  está escrito.

**A03 — Validación de entrada.** Verificado con prueba directa en Node:
z.number() de Zod rechaza NaN e Infinity/-Infinity por defecto, así que
esos valores nunca llegan a separacionDeTrazaM(). Sin ese corte habría
sido un problema real: nearestPointOnLine con NaN/NaN lanza una excepción
no capturada dentro del handler (sin try/catch alrededor del paso 3,
produciría un 500), y con Infinity/Infinity no lanza pero devuelve
distancia null, que el código convierte con el operador de fallback a 0,
es decir, un Infinity habría pasado el filtro geográfico como si estuviera
a 0 metros de la traza, si Zod no lo cortara antes. Confirmado que ese
vector está cerrado por Zod (usa Number.isFinite internamente), no de
forma incidental. Se confirma la observación ya registrada en DEBT.md
(prioridad Baja): la falta de rango físico explícito en lat/lon es
cobertura incidental del filtro de 100 km para valores finitos fuera de
rango, consistente con lo ya documentado, no se añade nada nuevo.

**A09 — Logging.** Revisado el endpoint completo: no hay ninguna llamada a
console en route.ts, admin.ts, public.ts, cargar-traza.ts. No se loguea el
token, el body del payload, ni la IP del remitente. Los errores de
Supabase se consumen para decidir el flujo pero nunca se exponen en la
respuesta ni se imprimen. Sin issues.

**A08 — Integridad / uso de service_role.** Confirmado que es intencional
y coherente: getSupabaseAdmin() solo se importa desde route.ts
(server-only, runtime nodejs), nunca desde código que pueda ejecutarse en
cliente. El insert construye el objeto campo a campo (intento_id, lat,
lon, ts, batt, acc, fuente) en vez de hacer spread del payload validado,
no hay mass-assignment ni forma de que el remitente inyecte
descartado=true u otro campo no contemplado. El bypass de RLS vía
service_role es el patrón esperado para un endpoint de ingesta
server-to-server con su propia autenticación, no una forma accidental de
saltarse controles.

**A02 — Fallos criptográficos.** SHA-256 es adecuado para este uso
(comparación en tiempo constante de un token secreto, no almacenamiento de
contraseñas). Sin secretos hardcoded en el código fuente: TRACK_TOKEN,
SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL se leen todos de process.env.
Confirmado que ninguna env var sensible usa el prefijo NEXT_PUBLIC_ salvo
las deliberadamente públicas (URL y ANON_KEY de Supabase, diseñada para
ser pública y depender de RLS). No existe ningún fichero .env en el repo.

**A04 — Diseño inseguro.** El filtro geográfico y la comparación de token
son controles de servidor puros, no dependen de nada del cliente ni son
saltables manipulando el payload. Correcto.

**A10 — SSRF.** El endpoint no realiza ninguna petición HTTP saliente con
URLs derivadas de input de usuario. Sin superficie SSRF en este código.

**A06 — Auditoría de dependencias.**
- pnpm audit --prod: sin vulnerabilidades conocidas (limpio).
- pnpm audit completo (incluye devDependencies): 1 vulnerabilidad alta,
  brace-expansion (DoS por expansión de longitud no acotada), arrastrada
  transitivamente por eslint y vitest coverage (vía minimatch). Es tooling
  de desarrollo, no llega a producción ni al bundle servido, no bloquea
  por no ser código de ejecución en runtime, pero se deja nota para
  actualizar cuando haya nueva versión disponible.
- Overrides de F1 (sharp y postcss) siguen vigentes: verificados en
  pnpm-workspace.yaml (no en package.json, patrón correcto de pnpm
  workspaces) y reflejados en pnpm-lock.yaml. No se han deshecho.
- Dependencias nuevas de F2 (supabase-js, zod) no introducen
  vulnerabilidades conocidas.

**DT-006 — evaluación de diseño.** El filtro de 100 km cierra de forma
efectiva el vector original señalado en la revisión de F1.1 (un punto
absurdamente adelantado envenenando el ancla) para cualquier valor finito
fuera de rango razonable, y la comparación de token en tiempo constante
cierra el vector de fuerza bruta por timing. Con la capa 2 de F4 aún
pendiente, el hueco que sigue abierto y ya está correctamente identificado
en DT-006/DEBT.md es el caso de alguien con el token válido insertando un
punto dentro de los 100 km pero muy adelantado en la traza, la capa 1 no
puede distinguir ese caso de un desvío real, es una limitación de diseño
reconocida, no un fallo de implementación. No se ha encontrado ningún
vector adicional no cubierto por el análisis ya documentado en DT-006.

**Issues encontrados:**

1. [DEBT.md, nueva entrada requerida] A04 — Ausencia de rate limiting en
   /api/track. No es bloqueante para cerrar F2 en su estado actual (el
   endpoint no está desplegado, F0/Vercel pendiente), pero no puede
   quedar como silencio: debe registrarse explícitamente en DEBT.md antes
   de que el endpoint sea accesible desde internet en producción. Sin
   rate limiting, un token filtrado (por captura de la config de
   OwnTracks en el móvil, logs de Vercel, etc.) permite spam de
   inserciones sin límite hacia posiciones. Prioridad recomendada: Media
   (no compromete la integridad del ancla, eso ya lo cubre DT-006, pero
   permite ensuciar el histórico y agotar cuota de BD). Solución
   propuesta: rate limiting a nivel de Vercel Edge Config/middleware o
   límite simple por IP y ventana temporal en el propio handler, a
   implementar antes de F5 (día del reto) o del primer deploy público.

**Sin issues — categorías revisadas explícitamente sin hallazgos:**
- A01 — control de acceso: correcto en RLS y en el endpoint.
- A02 — criptografía: correcto, sin secretos expuestos.
- A03 — inyección: sin SQL concatenado (Supabase client parametriza), Zod
  corta NaN e Infinity antes de Turf, sin eval ni Function dinámica.
- A05 — configuración: RLS correcto por lectura del SQL (pendiente de
  verificación de integración ya conocida y no bloqueante para F2).
- A07 — autenticación: sin sesiones artesanales, token server-side.
- A08 — integridad: service_role usado correctamente, sin mass-assignment.
- A09 — logging: sin datos sensibles logueados.
- A10 — SSRF: no aplica, sin requests salientes con input de usuario.

**Veredicto:** APROBADO. El único hallazgo (ausencia de rate limiting) no
es bloqueante para el cierre de F2 dado que el endpoint no está expuesto a
internet todavía (sin F0/Vercel), pero es condición para el despliegue
real: debe quedar registrado en DEBT.md con prioridad Media antes de
cerrar la tarea, para que no se pierda de vista antes de F5. Tarea lista
para cerrar en su alcance actual (código, sin cuentas).

### Implementador — 2026-07-30 — Ronda final de limpieza

Aplicados los 4 arreglos pedidos tras la doble aprobación:
1. `payloadOwnTracks` (Zod) ahora exige `lat` en `[-90, 90]`, `lon` en
   `[-180, 180]` y `tst` positivo (sin cota superior). Entrada de `DEBT.md`
   correspondiente marcada como resuelta.
2. Añadidos 2 tests a `route.test.ts`: body vacío y JSON malformado, ambos
   verificando `200` + `[]` + `insert` no llamado.
3. Nueva entrada en `DEBT.md`: ausencia de rate limiting en `/api/track`,
   prioridad Media, bloqueante para el despliegue real (no para F2).
4. `CHANGELOG.md` actualizado con esta ronda de endurecimiento.

Gates: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` — las 4 en
verde (typecheck ejecutado sin el prefijo `rtk`, ver nota anterior sobre el
falso positivo).
