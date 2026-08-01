# Tarea en curso

**Título:** Minuto a minuto (feed en directo con fotos)
**Tipo:** Feature
**Estado:** Revisión
**Iniciada:** 2026-08-01

## Prompt clarificado

Nueva sección **"Minuto a minuto"** (ítem de `docs/producto/roadmap.md`,
"Ideas v2 (fuera de alcance v1)", hasta ahora sin definir — se define aquí,
ampliado con fotos).

### Contenido de cada entrada
- Hora de publicación (visible en la entrada).
- Texto corto.
- Foto opcional (subida real de imagen, no URL — implica añadir Supabase
  Storage al proyecto Supabase ya existente, sin cuenta nueva).
- Posición asociada: la última posición conocida de Santi en el momento de
  publicar (snapshot de lat/lon guardado en la propia entrada, no calculado
  al vuelo por el visitante).

### Quién publica
Solo Santi, desde el panel admin (mismo login único ya existente,
`ADMIN_PASSWORD`). Puede crear, editar y eliminar sus propias entradas —
sin flujo de moderación (a diferencia de comentarios públicos, esto es
contenido propio, no de terceros).

### Dónde se ve en la web pública
- **"durante"**: junto al mapa/stats, con **polling de entradas nuevas**
  (aparecen solas arriba mientras el visitante mira la pantalla) — a
  diferencia de `MuroComentarios.tsx` actual, que no hace polling. Esto es
  deliberado: el objetivo es que se sienta "en directo" (comentario de
  fútbol), no un muro estático.
- **"llegada"**: el feed completo visible como recopilatorio, **sin
  polling** (el modo "llegada" ya está diseñado para quedar congelado en el
  momento de llegar).

### Interacción con el mapa
Al pinchar una entrada con posición asociada, el mapa se centra ahí y
muestra un **marcador temporal** solo para esa entrada (desaparece al
pinchar otra entrada o cerrar). **No** se pintan marcadores permanentes de
todas las entradas a la vez — decisión explícita para no saturar el mapa
(preocupación planteada por el usuario).

### Paginación
Reutiliza el mismo patrón offset/"cargar más" que `MuroComentarios.tsx`.

## Alcance
- Incluye: nueva tabla en Supabase, Supabase Storage para fotos, sección
  nueva en el panel admin (crear/editar/eliminar entradas con foto), sección
  nueva en la web pública (feed en "durante" con polling + recopilatorio en
  "llegada"), interacción de clic → resaltar punto en el mapa.
- Excluye: moderación (no aplica, contenido propio del admin); marcadores
  permanentes en el mapa; publicación por nadie que no sea el admin único.

## Diseño
Mockup: **aprobado** — `design-sandbox/app/camino/admin-minuto-a-minuto/page.tsx`
(panel admin) y `design-sandbox/app/camino/durante-minuto-a-minuto/page.tsx`
(web pública, modo "durante", con la interacción de clic → marcador temporal
en el mapa). Decisiones de diseño:
- Estilo bespoke inline (colores/tipografía), sin shadcn — coherente con que
  el proyecto real tampoco usa shadcn en ningún componente.
- Admin: composer (texto + adjuntar foto + publicar en verde `#2F5D50`) +
  lista con Editar/Eliminar (rojo `#B03A2E`), mismos colores que
  `BotonConfirmable`/`EnlacePaginacion` ya existentes.
- Cada entrada guarda la posición (km/lat-lon) en el momento de publicar,
  visible internamente pero no como cifra en la web pública.
  el mapa muestra un marcador temporal en esa posición con animación
  spring (aparece/desaparece), sin marcadores permanentes de las demás
  entradas — así no se satura el mapa por defecto.
El Arquitecto debe leer ambos mockups como especificación visual. El
Implementador debe seguirlos fielmente. El Reviewer debe verificar que la
implementación coincide. Al cerrar la tarea, ambos ficheros de mockup se
eliminan del sandbox.

## Decisión técnica / Diagnóstico

**DT-013** (`docs/tecnico/decisiones-tecnicas.md`) — resumen:
- Tabla `minuto_a_minuto` (id, intento_id FK, texto, foto_url nullable, lat,
  lon, created_at, updated_at). RLS: `anon` SELECT solo del intento activo
  (`not cerrado`), cero escritura para `anon`.
- Supabase Storage, bucket público `minuto-a-minuto`, subida solo vía
  Server Action con `service role` (bypassa RLS de Storage).
- Editar = solo texto, no la foto (borrar+recrear si la foto está mal).
- `Mapa.tsx`: nueva prop opcional `puntoResaltado: {lat, lon, hora} | null`,
  aditiva.
- "durante": polling cada 30s de entradas nuevas (extiende DT-007), sin
  Realtime. "llegada": carga única, sin polling (modo ya congelado).
- Mockups aprobados como spec visual:
  `design-sandbox/app/camino/admin-minuto-a-minuto/page.tsx` y
  `design-sandbox/app/camino/durante-minuto-a-minuto/page.tsx` — eliminar
  ambos del sandbox al cerrar esta tarea.

## Archivos modificados

**Nuevos:**
- `supabase/migrations/0002_minuto_a_minuto.sql` — tabla `minuto_a_minuto` + bucket Storage (sin aplicar; pendiente de que el usuario la ejecute contra Supabase)
- `lib/supabase/storage.ts` + `lib/supabase/storage.test.ts` — subida de fotos a Storage, validación MIME/tamaño
- `app/api/minuto-a-minuto/route.ts` + `route.test.ts` — GET paginado + poll incremental
- `components/admin/ComposerMinutoAMinuto.tsx` — composer del panel admin
- `components/admin/EntradaMinutoAMinuto.tsx` — fila con editar inline + eliminar
- `components/admin/SeccionMinutoAMinuto.tsx` — sección del panel admin (Server Component)
- `components/publico/MinutoAMinuto.tsx` — feed público (paginado + poll opcional + clic → mapa)

**Modificados:**
- `next.config.ts` — `experimental.serverActions.bodySizeLimit: "10mb"` (fix de Seguridad: por defecto Next.js limita a 1 MB el body de Server Actions, rechazando fotos de móvil normales antes de llegar a `crearMinutoAMinuto`)
- `lib/types.ts` — interfaz `MinutoAMinuto`
- `lib/supabase/admin.ts` — tabla `minuto_a_minuto` en `BaseDeDatos` (patrón `Pick<T, keyof T>`)
- `app/admin/actions.ts` + `actions.test.ts` — `crearMinutoAMinuto`, `editarMinutoAMinuto`, `eliminarMinutoAMinuto`
- `lib/admin/navegacion.ts` — tab `minutoaminuto` en `TABS_ADMIN`
- `app/admin/page.tsx` — caso `"minutoaminuto"` → `SeccionMinutoAMinuto`
- `components/mapa/Mapa.tsx` — prop opcional `puntoResaltado` (aditiva, sin cambiar comportamiento previo)
- `components/publico/ModoDurante.tsx` — estado `puntoResaltado` + `<MinutoAMinuto polling>` tras el mapa
- `components/publico/ModoLlegada.tsx` — pasa a Client Component (mismo patrón de estado); `<MinutoAMinuto polling={false}>`
- `app/page.tsx` — `ModoLlegadaConectado` carga las entradas de `minuto_a_minuto` y las pasa a `ModoLlegada`

**Documentación:**
- `CHANGELOG.md`, `docs/tecnico/arquitectura.md`, `docs/tecnico/modelo-datos.md`, este fichero

**Eliminados:**
- `design-sandbox/app/camino/admin-minuto-a-minuto/` (carpeta completa)
- `design-sandbox/app/camino/durante-minuto-a-minuto/` (carpeta completa)

## Quality gates

- `pnpm typecheck` — verde, cero errores.
- `pnpm lint` — verde, cero errores/warnings.
- `pnpm test` — verde, 201/201 tests (incluye los nuevos de `storage.test.ts`,
  `actions.test.ts` ampliado y `minuto-a-minuto/route.test.ts`).
- `pnpm build` — verde, build de producción completo sin errores, incluida
  la nueva ruta `/api/minuto-a-minuto`.
- Verificación visual: dev server local (puerto 3410) responde 200 en `/` y
  `/admin` (redirige a login como se espera). No se pudo verificar
  visualmente la UI nueva en fase "durante"/"llegada" porque la migración
  `0002_minuto_a_minuto.sql` todavía no está aplicada contra el proyecto
  Supabase real (fuera de alcance del Implementador, ver instrucción
  explícita de la tarea) — sin la tabla, forzar esas fases fallaría al leer
  `minuto_a_minuto`. Pendiente de verificación visual real tras aplicar la
  migración.

### Fix de Seguridad — límite de body de Server Actions (2026-08-02)

Añadido `experimental.serverActions.bodySizeLimit: "10mb"` a
`next.config.ts` (sintaxis verificada contra
`node_modules/next/dist/docs/.../serverActions.md` y contra el tipo real
`ExperimentalConfig` de `next/dist/server/config-shared.d.ts` de la versión
instalada, 16.2.12 — sigue anidada bajo `experimental`, sin breaking change
en esta opción concreta). 8 MB es el límite real de la foto
(`TAMANO_MAXIMO_BYTES` en `lib/supabase/storage.ts`); 10 MB deja margen para
el resto de campos del `FormData` y el overhead de `multipart/form-data`
(boundaries, cabeceras de parte), como indica la propia doc de Next.

- `pnpm typecheck`, `pnpm lint`, `pnpm test` (201/201), `pnpm build` — los
  cuatro en verde tras el cambio.
- Verificación adicional (sin depender de Supabase real, que sigue sin la
  migración aplicada): se cargó la configuración real de Next con su propio
  `loadConfig` interno (`next/dist/server/config`), el mismo mecanismo que
  usa el servidor al arrancar — `config.experimental.serverActions.bodySizeLimit`
  resuelve a `"10mb"`. El build de producción también lo confirma en su
  salida: `Experiments (use with caution): · serverActions`. Esto verifica
  que Next.js reconoce y resuelve la opción tal como está escrita.
  **No verificable sin la migración aplicada:** que una subida real de una
  foto de 2-8 MB a través de `crearMinutoAMinuto` complete en runtime contra
  Supabase real sin el error de límite excedido — requiere la tabla
  `minuto_a_minuto` y el bucket Storage ya creados. Se deja explícito en vez
  de asumirlo.

## Historial de revisión

### Reviewer — 2026-08-02

**Veredicto: ✅ Aprobado — pasa a Seguridad.**

Revisado el diff completo de la rama contra `main`. Alcance coincide con lo
aprobado (DT-013, prompt clarificado): tabla `minuto_a_minuto`, Storage,
Server Actions, endpoint público, componentes admin/público, prop aditiva de
`Mapa.tsx`, `ModoLlegada.tsx` a Client Component. Sin desviaciones de scope.

Puntos de mayor riesgo verificados explícitamente, sin bloqueantes:
- `lib/supabase/admin.ts`: `Row: Pick<MinutoAMinuto, keyof MinutoAMinuto>` —
  sigue el patrón exacto de LESSONS.md.
- RLS de `0002_minuto_a_minuto.sql`: política `select_intento_activo`
  correcta (mismo criterio que `posiciones`); sin políticas de
  insert/update/delete para `anon` (cero escritura pública, correcto);
  bucket Storage público sin políticas propias (documentado y coherente,
  las subidas van vía service role).
- `lib/supabase/storage.ts`: valida MIME y tamaño antes de llamar a
  `.upload()`, con tests que cubren tipo no permitido, tipo "casi válido"
  (`image/gif`), límite exacto de 8 MB y el byte que lo supera.
- Server Actions (`crearMinutoAMinuto`, `editarMinutoAMinuto`,
  `eliminarMinutoAMinuto`): las tres llaman a `requerirSesion()` como primera
  línea. `editarMinutoAMinuto` solo toca `texto`+`updated_at`, verificado con
  test explícito. Tests cubren texto vacío, límite de 500 caracteres, sin
  sesión, sin intento activo.
- `GET /api/minuto-a-minuto`: modo paginado y modo poll (`despuesDeId`) bien
  diferenciados (uno excluye al otro, tests lo cubren), rate limit 60/min por
  IP igual que el resto de endpoints DT-011, usa `getSupabasePublic()` (no
  admin) — mínimo privilegio respetado.
- `components/mapa/Mapa.tsx`: `puntoResaltado` es aditiva de verdad — valor
  por defecto `null`, no altera ninguna rama existente del overlay SVG ni de
  las dos trazas.
- `ModoLlegada.tsx`: pasa a Client Component correctamente — las entradas de
  `minuto_a_minuto` se cargan en `app/page.tsx` (Server Component,
  `cargarEntradasMinutoAMinuto`) y llegan como prop ya resuelta; no hay
  ninguna llamada a Supabase/fetch de servidor dentro del Client Component.
- Fidelidad visual a los mockups: colores reutilizados correctamente
  (`#2F5D50` verde de publicar/guardar, rojo de `BotonConfirmable` para
  eliminar, mismo estilo de card `rounded-xl border` que
  `SeccionComentarios`/`MuroComentarios`).
- Tipado estricto: sin `any`, sin `as` de escape. Zod en el borde de
  `GET /api/minuto-a-minuto`.
- Documentación: `CHANGELOG.md`, `arquitectura.md` y `modelo-datos.md`
  actualizados y coherentes con el código real (verificado línea a línea,
  no solo confiando en `CURRENT.md`).

**Recomendaciones (no bloqueantes, registradas en `DEBT.md`):**
1. `docs/producto/roadmap.md` sigue listando "Minuto a minuto" bajo "Ideas
   v2 (fuera de alcance v1)" sin marcar como hecho, y
   `docs/producto/funcionalidades.md` no describe la nueva sección desde el
   punto de vista de usuario — pese a que la feature ya está implementada y
   documentada técnicamente. Es responsabilidad del Agente de Producto, pero
   queda desactualizado si nadie lo revisita.
2. En `MinutoAMinuto.tsx`, el poll incremental asume que `entradas[0]` es
   siempre la entrada más reciente (usado como `despuesDeId`). Es correcto
   mientras `id` autoincremental y `created_at desc` estén siempre
   correlacionados (lo están, dado que ambos son server-generated en el
   mismo insert), pero no hay ningún comentario que documente esa
   invariante ni un test que la ponga a prueba con IDs fuera de orden
   temporal (no debería poder ocurrir, pero si algún día se permite
   backfill o edición de `created_at`, este supuesto se rompería en
   silencio).

**No se pudo verificar en runtime contra Supabase real** (migración 0002 sin
aplicar, según instrucción explícita de la tarea) — revisado el SQL por
escrito con atención, sin poder confirmar comportamiento contra una BD viva.
Mismo precedente que la migración 0001.

El Agente de Seguridad debe revisar a continuación.

### Seguridad — 2026-08-02

**Veredicto: ✅ Sin vulnerabilidades — tarea lista para cerrar** (con un hallazgo no bloqueante de fiabilidad, ver abajo).

**Alcance revisado:** diff completo contra `main` (`git diff main --stat`, 16
ficheros) — sin repetir la auditoría OWASP completa de F5, que sigue vigente
para el código que esta tarea no toca. `pnpm audit` ejecutado sobre el
proyecto completo: 0 vulnerabilidades (info/low/moderate/high/critical) en
595 dependencias totales.

**1. Subida de ficheros (`lib/supabase/storage.ts`) — el punto más sensible:**
- Validación MIME: solo `foto.type` (whitelist `image/jpeg`, `image/png`,
  `image/webp`), sin magic-byte sniffing. Es técnicamente falsificable, pero
  el riesgo real está acotado por dos factores: (a) `crearMinutoAMinuto` exige
  `requerirSesion()` antes de tocar la foto — no es un endpoint público, hace
  falta sesión de admin válida; (b) la whitelist excluye `image/svg+xml` y
  cualquier tipo `text/*`/`application/*`, que son los vectores reales de XSS
  vía Storage (SVG con `<script>`, HTML servido como si fuera imagen). Con
  jpeg/png/webp falsos-pero-mal-etiquetados, el `contentType` que se fija
  explícitamente en `.upload()` es el valor ya validado contra la whitelist
  (no el que reportaría el navegador al servir el objeto después), así que
  Supabase Storage sirve el objeto con ese Content-Type y no como HTML.
  Riesgo residual aceptado explícitamente: si el dispositivo del admin único
  estuviera comprometido, el atacante podría subir un fichero jpeg/png/webp
  con contenido no-imagen, pero no un vector de ejecución de script en el
  navegador de un visitante — riesgo teórico y de impacto bajo dado el
  contexto (admin único, autenticado, whitelist sin tipos ejecutables). No
  bloqueante.
- Límite de tamaño (8 MB, `TAMANO_MAXIMO_BYTES`): se comprueba con
  `foto.size` antes de llamar a `.upload()`, correcto a nivel de código. Pero
  verificado contra la documentación real de Next.js instalado
  (`node_modules/next/dist/docs/.../serverActions.md`): **Next.js aplica por
  defecto un límite de 1 MB al body completo de una Server Action**
  (`serverActions.bodySizeLimit`, no configurado en `next.config.ts` de este
  proyecto), precisamente para evitar consumo excesivo de recursos al
  parsear peticiones grandes. Esto significa que, en la práctica, el límite
  real efectivo hoy es 1 MB (más restrictivo que los 8 MB documentados y
  testeados en `storage.test.ts`), y la protección contra agotamiento de
  memoria por fichero gigante la da la plataforma antes de que el código de
  aplicación se ejecute — no hay vulnerabilidad de seguridad aquí (el sistema
  es más restrictivo de lo pensado, no menos). **No es un hallazgo de
  seguridad bloqueante**, pero es un bug funcional real: fotos de móvil
  típicas (2-8 MB) serán rechazadas por Next.js con un error genérico antes
  de llegar a `subirFotoMinutoAMinuto`, contradiciendo el límite de 8 MB
  documentado en DT-013 y cubierto por tests que nunca se ejecutaron contra
  el comportamiento real de la plataforma. Recomiendo registrarlo en
  `DEBT.md` (o corregirlo añadiendo `experimental.serverActions.bodySizeLimit:
  '9mb'` a `next.config.ts`) antes de dar la feature por funcionalmente
  completa — lo señalo aquí porque lo detecté durante la auditoría de
  seguridad, pero es responsabilidad del Implementador/Reviewer, no bloquea
  el cierre de seguridad.
- Nombre de fichero: generado íntegramente en servidor
  (`${Date.now()}-${crypto.randomUUID()}.${extension}`), la extensión sale de
  un mapa fijo derivado del MIME ya validado — `foto.name` (el nombre
  original del usuario) no se usa en ningún punto. Sin riesgo de path
  traversal ni de inyección de caracteres. Confirmado con `grep`, cero usos
  de `foto.name`.
- Bucket público: `supabase/migrations/0002_minuto_a_minuto.sql` lo crea con
  `public: true` y sin políticas de Storage propias (las subidas van vía
  service role, que bypassa RLS de Storage). No hay forma de listar el bucket
  completo vía el cliente anon estándar de Supabase Storage (el listado
  requiere la API de Storage con las credenciales adecuadas o políticas
  explícitas de `SELECT` sobre `storage.objects`, que aquí no existen para
  `anon`); el acceso público es únicamente por URL directa de cada objeto, y
  los nombres son aleatorios (`Date.now()` + UUID v4) — inadivinables en la
  práctica. Correcto.

**2. `GET /api/minuto-a-minuto`:**
- Rate limiting: 60 req/min por IP, mismo patrón que DT-011 (`consumir`,
  `obtenerIpCliente`). Correcto.
- `despuesDeId` (y `offset`/`limit`) validados con Zod
  (`z.coerce.number().int().min(...)`), con límite propio `LIMITE_POLL=50`
  para el modo poll que no depende de lo que pida el cliente. Sin inyección
  posible (query builder de Supabase, sin SQL crudo).
- Respuesta: `CAMPOS_PUBLICOS = "id, texto, foto_url, lat, lon, created_at"`
  — excluye `intento_id` y `updated_at`. Mismo criterio ya usado en
  `UltimaPosicionPublica`/`ProgresoPublico` (mínimo privilegio). `app/page.tsx`
  (`cargarEntradasMinutoAMinuto`) usa la misma proyección explícita de campos,
  no `select("*")`. Correcto.

**3. RLS y Server Actions:**
- `crearMinutoAMinuto`, `editarMinutoAMinuto`, `eliminarMinutoAMinuto`: las
  tres llaman a `requerirSesion()` como primera línea, de forma
  independiente, sin depender de `proxy.ts` — mismo patrón que el resto de
  `app/admin/actions.ts` y que el fix de F5 (A01). Verificado leyendo las
  tres funciones completas, no solo el patrón por inspección superficial.
- `0002_minuto_a_minuto.sql`: única política es `select_intento_activo` (for
  select), sin ninguna política de insert/update/delete para `anon` —
  confirmado comparando con `0001_esquema_inicial.sql`, mismo criterio que
  `posiciones`/`intenciones`. Cero escritura pública real.
- Nota menor no bloqueante: la política de 0002 no usa `to anon` explícito
  (a diferencia de las de 0001, que sí lo hacen); el rol por defecto de una
  policy sin `to` es `PUBLIC`, que en este proyecto es equivalente en
  efecto porque no existe ningún rol `authenticated` distinto con
  privilegios especiales sobre esta tabla. Cosmético/consistencia, no un
  problema de seguridad — se puede homogeneizar en una futura migración.

**4. Texto libre en las entradas:** `entrada.texto` se renderiza siempre vía
JSX (`{entrada.texto}` en `MinutoAMinuto.tsx` y `EntradaMinutoAMinuto.tsx`),
React escapa por defecto. Búsqueda de `dangerouslySetInnerHTML` en todo el
proyecto: cero resultados en código de producción (solo una mención en un
documento histórico de tarea). Sin riesgo de XSS.

**5. Datos de terceros / privacidad:** confirmado que el contenido es
siempre del propio admin (Server Actions autenticadas, sin flujo de
moderación de terceros, correcto según el alcance). `lat`/`lon` es un
snapshot de la misma tabla `posiciones` que ya es pública hoy en modo
"durante" (`GET /api/progreso`) — no añade ninguna superficie de exposición
de posición nueva, solo la redistribuye en otro punto de la UI.

**Variables de entorno:** `NEXT_PUBLIC_SUPABASE_URL` es la única variable
`NEXT_PUBLIC_` relacionada con Supabase (documentado en `admin.ts` como no
secreta por diseño — la URL de un proyecto Supabase no requiere
confidencialidad, la protección la da RLS). `SUPABASE_SERVICE_ROLE_KEY` sin
prefijo público. Sin cambios de riesgo respecto a F5.

**Sin issues bloqueantes de seguridad.**

**Veredicto: ✅ Sin vulnerabilidades — tarea lista para cerrar.**
