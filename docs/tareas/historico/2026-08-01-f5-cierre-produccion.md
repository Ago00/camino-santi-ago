# Tarea en curso

**Título:** F5 — Cierre (rate limiting + auditoría completa + verificación de despliegue)
**Tipo:** Feature (cierre de fase)
**Estado:** Fix del bloqueante de Seguridad aplicado (ciclo 1/2) — pendiente de re-revisión de Seguridad
**Iniciada:** 2026-08-01

## Prompt clarificado

F5 — Cierre del proyecto `camino-santi-ago` antes del reto real. Incluye:

1. **Rate limiting** en los 6 endpoints marcados en `DEBT.md` como bloqueantes explícitos
   antes de producción real: `POST /api/track`, `POST /api/comentarios`,
   `POST /api/intenciones`, `GET /api/progreso`, `GET /api/comentarios`,
   `POST /api/admin/login`. Pasa por el Arquitecto primero (decisión de mecanismo —
   in-memory vs Upstash/KV vs Vercel Firewall — y sus tradeoffs de coste/precisión en
   un proyecto Hobby).
2. **Auditoría completa del Reviewer** sobre todo el código acumulado desde F1 (no solo
   el diff de rate limiting): arquitectura, tipado, tests, documentación, coherencia
   entre fases.
3. **Auditoría completa de Seguridad** (OWASP Top 10 + dependencias + revisión
   específica de RLS en las 5 tablas de Supabase) sobre todo el código acumulado.
4. **Verificación de despliegue a producción**: confirmar que `main` está desplegado en
   Vercel Production (`camino-santi-ago-sage.vercel.app`) sin errores de build ni
   runtime tras los cambios. Incluye comprobar que `ADMIN_PASSWORD` y
   `ADMIN_SESSION_SECRET` (no están en el `.env.local` local, aunque el login de F4
   depende de ellas) están cargadas en Vercel Production.
5. Cerrar en `DEBT.md` las entradas de rate limiting una vez resuelto.

**Fuera de alcance** (confirmado con el usuario):
- "Prueba real andando" — la hace Santi el día del reto, no en este pipeline.
- "Carga de textos finales" — la escribe y carga Santi directamente en el panel admin,
  fuera de este pipeline.

### Casos límite
- Si `ADMIN_PASSWORD`/`ADMIN_SESSION_SECRET` no están en Vercel Production: bloqueante,
  se avisa y se para antes de cerrar F5.
- Issues de Reviewer/Seguridad sobre código de F1-F4 ya cerradas: se corrigen antes de
  cerrar F5, máx. 2 ciclos por agente.

### Supuestos asumidos
- El mecanismo concreto de rate limiting lo decide el Arquitecto.
- "Deploy a producción" no requiere infraestructura nueva (el proyecto Vercel ya
  despliega en cada push a `main`); el objetivo es verificar que el estado final tras
  F5 queda desplegado limpio.

## Diseño
Mockup: N/A (sin UI nueva)

## Decisión técnica / Diagnóstico

**DT-011** (`docs/tecnico/decisiones-tecnicas.md`) — rate limiting en memoria
de proceso, módulo compartido `lib/rate-limit.ts` con `consumir(clave, limite,
ventanaMs): boolean` sobre un `Map` en scope de módulo (mismo patrón que
DT-007). Sin dependencias ni cuentas nuevas.

Límites aprobados (duplicados sobre la propuesta inicial, a petición del
usuario, para dar margen frente a picos de visitantes):

| Endpoint | Clave | Límite |
|---|---|---|
| `POST /api/track` | token | 40 req/min |
| `POST /api/comentarios` | IP (`x-forwarded-for`) | 10 req/min |
| `POST /api/intenciones` | IP | 10 req/min |
| `GET /api/progreso` | IP | 60 req/min |
| `GET /api/comentarios` | IP | 60 req/min |
| `POST /api/admin/login` | IP | 10 intentos/15 min |

Respuesta al exceder el límite: `429` (sin dar pistas de cuánto falta, mismo
criterio que el resto de rechazos silenciosos del proyecto — ver DT-006).

Tras el rate limiting, pasa a Reviewer y Seguridad con **alcance de auditoría
completa** sobre todo el código acumulado desde F1 (no solo este cambio),
según lo acordado con el usuario.

## Archivos modificados

**Nuevos:**
- `lib/rate-limit.ts` — módulo compartido de rate limiting en memoria (DT-011): `consumir(clave, limite, ventanaMs)`, `obtenerIpCliente(request)`, `reiniciarRateLimit()` (para tests).
- `lib/rate-limit.test.ts` — tests unitarios: cupo dentro del límite, borde exacto, rechazo sostenido tras agotar el cupo, aislamiento entre claves, expiración/reinicio de ventana con reloj controlado, extracción de IP desde `x-forwarded-for` (incluye fallback sin cabecera).

**Modificados (aplicación del rate limit):**
- `app/api/track/route.ts` — 40 req/min por token, tras validar el token y antes de tocar BD.
- `app/api/track/route.test.ts` — tests de 429 al superar el límite y de que un token inválido no consume cupo del token correcto.
- `app/api/comentarios/route.ts` — GET 60 req/min por IP, POST 10 req/min por IP.
- `app/api/comentarios/route.test.ts` — tests de 429 en GET y POST, no interferencia entre IPs.
- `app/api/intenciones/route.ts` — POST 10 req/min por IP.
- `app/api/intenciones/route.test.ts` — tests de 429 y no interferencia entre IPs.
- `app/api/progreso/route.ts` — GET 60 req/min por IP; cambia la firma de `GET()` a `GET(request: NextRequest)` para poder leer la IP.
- `app/api/progreso/route.test.ts` — actualizados todos los tests existentes para pasar una `NextRequest` mockada (antes llamaban `GET()` sin argumentos); añadidos tests de 429 y no interferencia entre IPs; añadido `reiniciarRateLimit()` en `beforeEach`.
- `app/api/admin/login/route.ts` — 10 intentos/15 min por IP.
- `app/api/admin/login/route.test.ts` — tests de 429 tras 10 intentos (incluso con contraseña correcta) y no interferencia entre IPs; todas las peticiones ahora fijan `x-forwarded-for` explícito para no compartir cupo entre tests.

**Documentación:**
- `CHANGELOG.md` — entrada nueva.
- `DEBT.md` — entrada "Sin rate limiting en `/api/track`" cerrada con nota de resolución.
- `docs/tareas/CURRENT.md` — esta sección y la de quality gates.

**Fix del bloqueante de Seguridad (A01 — Control de acceso roto, ciclo 1/2):**
- `app/admin/page.tsx` — `AdminPage` ahora llama a `verificarSesion()`
  (`lib/auth/admin-session.ts`) leyendo la cookie `admin_session` con
  `cookies()` de `next/headers`, y corta con `redirect("/admin/login")` de
  `next/navigation` **antes** de leer `searchParams` o renderizar cualquier
  sección (`SeccionActividad`, `SeccionPosicion`, `SeccionIntenciones`,
  `SeccionComentarios`, `SeccionTextos`), que son las que efectivamente leen
  con `getSupabaseAdmin()`. Mismo patrón que `requerirSesion()` ya usa en
  `app/admin/actions.ts` (DT-010): no se asume que `proxy.ts` ya filtró la
  petición, sino que se verifica de forma independiente en el propio
  componente. Se añade como segunda capa de defensa en profundidad, sin
  sustituir a `proxy.ts` (que sigue siendo la primera capa y además renueva la
  cookie).
- Un único punto de verificación en `app/admin/page.tsx` es suficiente: las
  cinco Server Components de sección (`components/admin/Seccion*.tsx`) no son
  rutas ni tienen segmento propio — solo se instancian dentro de `AdminPage`,
  sin forma de renderizarse de forma independiente. Duplicar la comprobación
  en cada una habría sido redundante sin aportar seguridad adicional real.
- `app/admin/page.test.ts` (nuevo) — tres tests: (1) sin cookie de sesión,
  `AdminPage` redirige a `/admin/login` y `getSupabaseAdmin()` nunca se
  invoca (verifica que no se filtra ningún dato, no solo que hay redirect);
  (2) con cookie manipulada/inválida, mismo comportamiento; (3) con cookie de
  sesión válida (`crearSesion()` real), la página renderiza sin redirigir.
  Sigue el estilo de mocks de `app/admin/actions.test.ts` (mock de
  `next/headers`) y `proxy.test.ts` (sesión real vía `crearSesion()`). El
  fichero se nombró `.test.ts` (no `.tsx`) porque `vitest.config.ts` solo
  incluye `**/*.test.ts` y el test no necesita JSX.
- No se ha tocado `lib/auth/admin-session.ts`, `proxy.ts` ni ninguna de las 6
  rutas ya revisadas y aprobadas de rate limiting — fuera del alcance de este
  fix.

## Quality gates

- **Typecheck** (`pnpm typecheck`): verde, 0 errores.
- **Lint** (`pnpm lint`): verde, 0 errores/warnings.
- **Tests** (`pnpm test`): verde, 153/153 tests pasando (16 ficheros) —
  incluye los 3 tests nuevos de `app/admin/page.test.ts` sobre el fix de esta
  ronda, además de los 150 previos (rate limiting, sesión, RLS, etc.).

## Historial de revisión

### Reviewer — 2026-08-01 — Auditoría completa F1-F5

**Veredicto: ✅ Aprobado — pasa a Seguridad.**

Alcance: auditoría completa de todo el código acumulado (F1-F5), no solo el
diff de rate limiting, según lo pedido.

**Rate limiting (DT-011):** implementación correcta y completa. `lib/rate-limit.ts`
es un módulo puro y bien testeado (bordes exactos, expiración de ventana con
reloj controlado, aislamiento entre claves). Las 6 rutas aplican exactamente
los límites, claves y respuesta `429` acordados en la tabla de DT-011. Tests
de integración por ruta cubren 429 al superar cupo, no interferencia entre
IPs/tokens, y el caso importante de que un token inválido no consuma cupo del
token correcto en `/api/track`.

**Arquitectura y capas:** coherente con `arquitectura.md` en todo el código
revisado (dominio puro sin I/O en `proyeccion.ts`, endpoints con validación
Zod en la frontera, server actions con verificación de sesión propia sin
confiar en `proxy.ts`, tipos en `lib/types.ts`). La regla de las dos trazas se
respeta en todo el código: `/api/track` y `/api/progreso` usan
`cargar-traza.ts` (cálculo); nada usa `traza-mapa.geojson` para cómputo.

**Tipado:** sin `any`, sin `as unknown as`, sin `@ts-ignore`/`@ts-expect-error`
en ningún fichero de `app/`, `lib/`, `components/`, `scripts/`. Datos externos
validados con Zod en los 6 endpoints y en los formularios de servidor.

**Tests:** cobertura adecuada según criterio senior — dominio puro cubierto en
`proyeccion.test.ts`, integración en las rutas con riesgo real, sin exigir E2E
innecesario.

**Documentación:** `CHANGELOG.md` y `DEBT.md` reflejan fielmente F5 — la
entrada de rate limiting está correctamente cerrada con nota de resolución.

**Deuda técnica abierta relevante para el cierre:** revisadas las entradas de
prioridad Media sobre calibración de mojones y validación del tramo final de
la traza (ambas dicen explícitamente "antes del día del reto", no "antes de
cerrar F5"). Con criterio senior: **no bloquean F5**. Son deuda de producto
sobre datos que solo pueden validarse pisando la ruta real (Santi no puede
calibrar mojones ni verificar el tramo dibujado a mano sin andar el Camino),
no deuda de código de esta tarea. F5 es cierre de ingeniería (rate limiting +
auditoría + verificación de despliegue); esas dos entradas son tareas
operativas de Santi el propio día o la víspera. Correctamente registradas y
con prioridad ya asignada — no requieren una acción nueva de este pipeline.

**Recomendaciones (no bloqueantes, añadidas a `DEBT.md`):**
1. Comentarios de cabecera obsoletos en `app/api/track/route.ts`,
   `lib/supabase/admin.ts` y `lib/supabase/public.ts` que afirman "no probado
   contra Supabase real" / "bloqueado por F0" — falso desde F2, con Supabase
   real en producción desde hace tres fases. Mismo patrón ya detectado antes
   en `EnlacePaginacion.tsx` (ver `DEBT.md`), ahora recurrente — ver
   `docs/LESSONS.md`, nueva entrada añadida.
2. `docs/tecnico/arquitectura.md` no incluye `lib/rate-limit.ts` en la tabla
   de estructura de carpetas, pese a ser infraestructura compartida activa
   usada por las 6 rutas públicas — mismo patrón que la entrada ya abierta
   sobre el perfil de elevación.

**Lo que está bien:** el patrón de rechazo silencioso (429 sin cuerpo, mismo
criterio que el resto de rechazos del proyecto) se aplicó con consistencia en
las 6 rutas sin excepciones. Los tests de rate limiting evitan el error común
de probar solo "se bloquea al superar el límite" — también verifican
aislamiento entre claves y that un actor malicioso (token/IP inválidos) no
pueda agotar el cupo de un actor legítimo.

**Siguiente paso:** Agente de Seguridad revisa a continuación (auditoría
completa OWASP Top 10 + dependencias + RLS, según alcance de esta tarea).

### Seguridad — 2026-08-01 — Auditoría completa F1-F5 (OWASP Top 10 + dependencias + RLS)

**Veredicto: ❌ Bloqueado — vuelve al Implementador.**

Alcance: OWASP Top 10 sobre todo `app/`, `lib/`, `proxy.ts`; `pnpm audit`;
RLS de las 5 tablas contra `supabase/migrations/0001_esquema_inicial.sql`.

**Issue bloqueante (A01 — Control de acceso roto):**

`app/admin/page.tsx` y las cinco Server Components de datos que renderiza
(`components/admin/SeccionActividad.tsx`, `SeccionIntenciones.tsx`,
`SeccionComentarios.tsx`, `SeccionPosicion.tsx`, y transitivamente
`lib/textos/obtener-textos.ts` para `SeccionTextos.tsx`) leen con
`getSupabaseAdmin()` (service role, bypassa RLS) — en particular
`SeccionIntenciones.tsx` expone en claro el contenido de `intenciones`, la
tabla que el propio `modelo-datos.md` documenta como "cero acceso" para
`anon" y que el producto promete a terceros como "solo la leeré yo" (ver
`IntencionForm.tsx`) — **sin verificar la sesión de admin dentro del propio
componente**. Toda la protección de esa lectura depende únicamente de que
`proxy.ts` haya interceptado la petición HTTP que sirve `/admin`.

Esto contradice el principio que el propio proyecto ya adoptó y documentó en
DT-010 y en la cabecera de `app/admin/actions.ts`: *"cada Server Action
verifica la sesión por sí misma... nunca asumir que otra capa ya lo hizo"*,
justificado explícitamente porque un cambio de matcher en `proxy.ts` (o,
añado aquí, cualquier vía de renderizado que no pase por el proxy — un
prefetch de RSC, una llamada interna, un error de configuración futuro en
`config.matcher`) podría dejar una ruta sin cobertura sin que nadie lo note.
Ese razonamiento se aplicó con disciplina a las mutaciones pero no a las
lecturas, que son exactamente donde vive el dato más sensible de todo el
proyecto (intenciones de terceros). Es una única capa de defensa para el
activo más protegido del modelo de datos — contradice mínimo privilegio y
defensa en profundidad.

**Fix requerido:** cada Server Component de datos bajo `/admin` (o al menos
`AdminPage` en `app/admin/page.tsx`, verificando una vez antes de renderizar
cualquier sección) debe llamar a `verificarSesion()` (ya existe en
`lib/auth/admin-session.ts`, reutilizable sin cambios) y cortar
explícitamente si la cookie no es válida — igual que ya hace
`requerirSesion()` en `app/admin/actions.ts`. No requiere infraestructura
nueva, solo aplicar el patrón ya existente en el punto que falta.

**Resto de la auditoría — sin issues:**

- **A01 (resto):** los 6 endpoints públicos (`/api/track`, `/api/comentarios`
  GET/POST, `/api/intenciones`, `/api/progreso`, `/api/admin/login`) no
  asumen autenticación salvo donde corresponde (token/IP para rate limit);
  las Server Actions de `app/admin/actions.ts` verifican sesión de forma
  independiente en cada una, sin excepción, correcto conforme a DT-010.
- **A02 (criptografía):** `lib/auth/admin-session.ts` firma con
  HMAC-SHA256 y compara con `timingSafeEqual` tras igualar longitudes vía
  hash fijo — sin timing leak por longitud. Mismo patrón correcto en
  `/api/track` (token) y `/api/admin/login` (password). Sin secretos
  hardcoded en el código fuente; `.env.local` contiene credenciales reales
  (URL, anon key, service role key, `TRACK_TOKEN`, `SUPABASE_DB_URL`) pero
  está correctamente listado en `.gitignore` y confirmado sin presencia en
  el historial de git. Ningún secreto usa prefijo `NEXT_PUBLIC_`
  indebidamente — `NEXT_PUBLIC_SUPABASE_URL` es la URL pública del proyecto
  (no secreta) por diseño, documentado en `admin.ts`.
- **A03 (inyección):** sin SQL concatenado — todo el acceso a datos pasa por
  el query builder de `@supabase/supabase-js`. Sin `eval`/`new Function`.
  Validación Zod en la frontera de los 6 endpoints y en las Server Actions
  (`guardarTexto` valida la clave contra `CLAVES_TEXTOS`). Sin `as unknown as`
  ni `any` en el código de producción revisado.
- **A04 (diseño inseguro):** el filtro geográfico de 100 km en `/api/track`
  (DT-006) y el rate limiting de DT-011 son coherentes entre sí y con el
  resto del sistema — ambos aplican server-side, sin depender de nada del
  cliente, y el orden de comprobación (token → rate limit → payload → filtro
  geográfico → intento activo) es consistente en el único endpoint donde
  aplican ambas defensas.
- **A05 (configuración):** ningún endpoint filtra detalles internos —
  todos los `error` devueltos al cliente son genéricos
  (`"no se pudo guardar..."`), nunca el mensaje real de Postgres/Supabase ni
  un stack trace. Sin `console.log`/`console.error` de datos sensibles en
  `app/` ni `lib/`.
- **A06 (dependencias):** `pnpm audit` — sin vulnerabilidades conocidas.
- **A07 (autenticación):** sesión de admin gestionada con cookie HMAC propia
  pero con el mismo nivel de garantía criptográfica que una librería
  estándar (ver DT-010, decisión razonada); `HttpOnly`, `Secure`,
  `SameSite=lax`. Login ahora con rate limit de 10 intentos/15 min por IP
  (DT-011) — cierra el vector de fuerza bruta que estaba abierto y
  registrado en `DEBT.md`. Sin fijación de sesión: `crearSesion()` genera un
  valor nuevo en cada login y en cada renovación, nunca reutiliza uno
  existente ni acepta uno provisto por el cliente.
- **A08 (integridad):** los datos externos (payload OwnTracks, comentarios,
  intenciones, login) se validan siempre con Zod server-side, aunque el
  cliente ya valide en el formulario. Sin confiar en validación de cliente
  en ningún punto revisado.
- **A09 (logging):** sin logging de contraseñas, tokens ni datos personales
  encontrado en el código.
- **A10 (SSRF):** no hay código que construya URLs a partir de input de
  usuario para hacer requests server-side. `scripts/generar-perfil-elevacion.ts`
  llama a Open-Elevation con una URL fija, y solo en un script manual, nunca
  en producción (DT-009) — no aplica.
- **RLS (las 5 tablas):** el SQL real en
  `supabase/migrations/0001_esquema_inicial.sql` coincide exactamente con lo
  documentado en `modelo-datos.md` y con la tabla de referencia de la tarea:
  `intentos` (SELECT anon solo `not cerrado`), `posiciones` (SELECT anon solo
  `not descartado` del intento activo), `intenciones` (RLS activado, cero
  políticas para `anon` → cero acceso), `comentarios` (SELECT anon
  `publico and not oculto`; INSERT anon con `with check (oculto = false)`,
  impidiendo fijar `oculto=true` desde el cliente), `textos` (SELECT anon
  `using (true)`). Sin discrepancia entre el SQL real y la documentación.
  Nota (no bloqueante, ya registrada como deuda documental en `DEBT.md`): el
  comentario de cabecera de la migración todavía dice "no se ha ejecutado
  nunca contra un proyecto real", igual que los comentarios ya detectados por
  el Reviewer en `admin.ts`/`public.ts`/`track/route.ts` — mismo patrón
  recurrente, no es un hallazgo nuevo de Seguridad.
- **Datos de terceros:** la moderación de comentarios (ocultar/mostrar/
  eliminar) y de intenciones (eliminar) es real en `app/admin/actions.ts`,
  cada acción verificando sesión. El único problema real de acceso a estos
  datos de terceros es el issue bloqueante de arriba (lectura sin
  verificación propia en las Server Components).

**Siguiente paso:** el Implementador aplica el fix (verificación de sesión en
`app/admin/page.tsx` o en cada sección de datos), y el código vuelve a pasar
por Seguridad antes de cerrar F5.

### Seguridad — 2026-08-01 — Re-revisión del fix del issue A01 (ciclo 1/2)

**Veredicto: ✅ Aprobado sin reservas — issue A01 resuelto, F5 puede cerrarse.**

Alcance: verificación puntual del fix descrito en la entrada del Implementador
de arriba ("Fix del bloqueante de Seguridad, ciclo 1/2"). No se repite la
auditoría OWASP completa ni la de RLS — ya aprobadas y sin cambios desde
entonces.

**1. Camino de ejecución real (no solo presencia de la llamada):**
En `app/admin/page.tsx`, `verificarSesion()` se invoca leyendo la cookie
`admin_session` vía `cookies()` de `next/headers` (líneas 36-38), y
`redirect("/admin/login")` (línea 39) corta la ejecución de la función async
antes de leer `searchParams` (línea 42) y antes de que el JSX que instancia
cualquier `Seccion*` se evalúe (líneas 61-65). Confirmado además que las
Server Components de sección (`components/admin/Seccion*.tsx`) viven fuera de
`app/` — no tienen segmento de ruta propio, por lo que no son alcanzables sin
pasar por `AdminPage`. Un único punto de verificación es realmente suficiente
en la práctica, no solo en teoría.

**2. Tests — demuestran ausencia de fuga de datos, no solo redirect:**
`app/admin/page.test.ts` mockea `@/lib/supabase/admin` con un spy y afirma
explícitamente `expect(getSupabaseAdminSpy).not.toHaveBeenCalled()` en los dos
casos negativos (sin cookie; cookie manipulada/inválida), además de verificar
el redirect. El tercer test usa `crearSesion()` real (no mockea
`verificarSesion`) para confirmar el camino positivo. Esto prueba lo pedido:
que sin sesión válida no se filtra ningún dato, no únicamente que hay un
redirect.

**3. Fuente única de verdad, sin reimplementación:**
El fix reutiliza `verificarSesion()` de `lib/auth/admin-session.ts` tal cual
— `git diff` confirma ese fichero sin cambios respecto a la auditoría
anterior. Mismo mecanismo HMAC-SHA256 + `timingSafeEqual` ya auditado, mismo
criterio de "cualquier fallo es sesión inválida sin distinguir motivo". No
existe una segunda noción de qué es una sesión válida.

**4. Alcance respetado:**
`git diff --stat` sobre `proxy.ts` y `lib/auth/admin-session.ts`: sin
cambios. Las 6 rutas de rate limiting (DT-011) no muestran modificaciones
adicionales a las ya aprobadas. El único cambio de este ciclo es
`app/admin/page.tsx` + `app/admin/page.test.ts` (nuevo), según lo declarado.

**5. Quality gates ejecutados de forma independiente (no solo el resumen del
Implementador):**
- `pnpm typecheck`: verde, 0 errores.
- `pnpm lint`: verde, 0 errores/warnings.
- `pnpm test`: verde, 153/153 tests (16 ficheros), incluyendo los 3 nuevos de
  `app/admin/page.test.ts`.

**Sin issues nuevos.** El fix no introduce ninguna vulnerabilidad ni
regresión. No hay comportamiento adicional que revisar fuera de lo ya cubierto
en la auditoría completa anterior (que sigue vigente, al no haberse tocado
ese código).

**Siguiente paso:** F5 puede cerrarse. Sin bloqueantes pendientes de
Seguridad.
