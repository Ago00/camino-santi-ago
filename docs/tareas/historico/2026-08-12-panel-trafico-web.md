# Tarea en curso

**Título:** Pestaña "Tráfico" en el panel admin (visitas a la web pública)
**Tipo:** Feature
**Estado:** Seguridad
**Iniciada:** 2026-08-12

## Prompt clarificado

Nueva pestaña "Tráfico" en el panel admin (`/admin?tab=trafico`), para ver
cuánta gente visita la web pública durante el reto (evento de un día que
puede cruzar medianoche).

**Rango:** desde el inicio del intento activo (campo `started_at` de
`intentos`, se fija al pasar a `durante`) hasta ahora — NO por día de
calendario.

**Captura de datos:**
- `proxy.ts` (hoy solo corre en `/admin/*`) se amplía para correr también en
  rutas públicas, excluyendo `/admin/*`, `/api/*` y assets estáticos
  (`_next/static`, imágenes, favicon...).
- Cookie anónima por visitante (se genera si no existe, se reutiliza si ya
  está) — sin login, sin datos personales, sin fingerprinting.
- Insert por petición matcheada en tabla nueva `visitas_web`: ruta,
  timestamp, id de visitante (cookie), referer si viene. Sin batching
  (volumen bajo, un solo día).
- `proxy.ts` pasa a ser `async`, espera el insert antes de responder. Si el
  insert falla, se ignora en silencio — nunca debe romper la petición del
  visitante real (mismo patrón defensivo que `/api/track`).

**Pestaña "Tráfico" (Server Component, patrón `SeccionActividad`):**
- Métricas resumen: visitas totales del intento, visitantes únicos.
- Gráfico de curva (no barras, por densidad de puntos con grano fino) de
  visitas en el tiempo, eje de horas debajo (etiquetas cada tramo razonable,
  marca destacada de "ahora" al final), scroll horizontal si no cabe.
- Selector de granularidad 5 min / 30 min / 1 hora: mismo gráfico, misma
  consulta en bruto, solo cambia el agrupado al pintar. Rango siempre
  completo (sin recortar ventana aunque sea grano fino — ej. 20h a 5 min ≈
  240 puntos, asumible con scroll).
- Desglose: tabla por página/ruta más visitada, tabla por origen (referer).
- No en directo — se actualiza al recargar la pestaña.

## Alcance
- Incluye: ampliación de `proxy.ts`, migración `visitas_web`, query de
  agregación por tramo dentro del rango del intento activo, nueva pestaña
  con gráfico + desglose + selector de granularidad.
- Excluye: tiempo real/websockets, exportar datos, filtrado de bots,
  geolocalización de visitantes, banner de consentimiento de cookies,
  exclusión de las visitas propias del dueño (no se filtra su tráfico).

## Casos límite
- Sin intento activo (fase `antes`, aún no se ha pulsado "Iniciar"): la
  pestaña debe manejarlo sin romper — no hay `started_at` con el que acotar
  el rango.
- Sin visitas todavía dentro del rango: gráfico vacío con mensaje, no error.
- Visitante con cookies bloqueadas: se cuenta la visita, pero no se agrupa
  con futuras visitas del mismo dispositivo (limitación conocida y aceptada).

## Supuestos asumidos
- Nombre de tabla `visitas_web` — el Arquitecto puede cambiarlo si prefiere
  otro, es una decisión técnica menor.
- Sin política de retención (igual que el resto de tablas del proyecto).
- Sin banner de consentimiento (cookie puramente funcional, sitio personal
  sin actividad comercial) — si Seguridad quiere revisarlo con más detalle
  en su fase, que lo señale explícitamente.

## Diseño
Mockup: N/A — mockups conceptuales ya iterados en conversación directa con el usuario (no en design sandbox), ver prompt clarificado.

## Decisión técnica / Diagnóstico
Ver DT-022 en `docs/tecnico/decisiones-tecnicas.md` (registrada íntegra ahí).
Resumen: tracking server-side en `proxy.ts` (Opción A, sobre Opción B de
beacon cliente descartada), tabla `visitas_web` sin RLS anon, pestaña
"Tráfico" como Server Component único con granularidad vía query string
(`?gran=`), gráfico SVG de curva con scroll horizontal.

## Archivos modificados

**Nuevos:**
- `supabase/migrations/0004_visitas_web.sql`
- `lib/trafico/bucketing.ts` + `lib/trafico/bucketing.test.ts`
- `lib/trafico/desglose.ts` + `lib/trafico/desglose.test.ts`
- `lib/admin/navegacion.test.ts`
- `components/admin/SeccionTrafico.tsx`
- `components/admin/GraficoTraficoScroll.tsx`

**Modificados:**
- `lib/types.ts` (interfaz `VisitaWeb`)
- `lib/supabase/admin.ts` (tabla `visitas_web` en `BaseDeDatos`, con el envoltorio `Pick<T, keyof T>`; comentario de cabecera "5 tablas" → "todas las tablas")
- `proxy.ts` (async, `matcher` ampliado a `["/", "/admin/:path*"]`, bifurcación admin/público, captura de visitas con cookie `visitante_id`)
- `proxy.test.ts` (llamadas a `proxy()` ahora async + tests nuevos de la rama pública)
- `lib/admin/navegacion.ts` (tab "trafico", `esGranularidadValida`)
- `app/admin/page.tsx` (renderiza `SeccionTrafico` con `?gran=`)
- `docs/tecnico/modelo-datos.md` (entidad `visitas_web`, tabla RLS, sección de migración)
- `docs/tecnico/arquitectura.md` (estructura de carpetas: `lib/trafico/`, `components/admin/SeccionTrafico.tsx`/`GraficoTraficoScroll.tsx`, comentario de `proxy.ts`)
- `CHANGELOG.md` (entrada nueva)
- `DEBT.md` (entrada nueva: aplicar migración 0004 contra producción)

## Quality gates

- `pnpm typecheck` — verde, cero errores.
- `pnpm lint` — verde, cero errores.
- `pnpm test` — verde, 377/377 tests (35 ficheros).
- Verificación manual con `pnpm dev`: `GET /` responde 200, fija la cookie
  `visitante_id` (confirmado en cabeceras `Set-Cookie`), sin errores en
  consola del servidor pese a que la tabla `visitas_web` todavía no existe en
  el Supabase real de desarrollo (falla el insert en silencio, como se
  diseñó). `GET /admin` sigue redirigiendo a `/admin/login` (307).
  **No verificado visualmente** el render de la pestaña "Tráfico" ni el
  scroll automático del gráfico: `.env.local` local no tiene
  `ADMIN_PASSWORD`/`ADMIN_SESSION_SECRET` configuradas, así que no hay forma
  de iniciar sesión de admin en este entorno — limitación preexistente del
  entorno, no introducida por esta tarea. Recomendado verificar visualmente
  en la preview de Vercel antes de cerrar (docs/LESSONS.md: ninguna quality
  gate detecta problemas puramente visuales).

## Historial de revisión

### Reviewer — 2026-08-12 — ✅ Aprobado

**Resumen:** Implementación fiel a DT-022 en los cinco puntos verificados
(rango por `started_at`, granularidad vía `?gran=`, tracking server-side en
`proxy.ts` con fallo silencioso, `Row: Pick<T, keyof T>` aplicado a
`visitas_web`, componente cliente sin literal `[]`/`{}` como default de
prop). Sin bloqueantes.

**Verificado:**
- `proxy.ts`: bifurcación admin/público correcta, `async`, cookie
  `visitante_id` generada/reutilizada, insert envuelto en `try/catch` que
  nunca impide `NextResponse.next()` — cubierto con tests explícitos de
  fallo de insert, fallo de `getSupabaseAdmin()`, cookie nueva vs. reutilizada.
- `SeccionTrafico.tsx`: maneja sin romper el caso sin intento activo / sin
  `started_at` (mensaje explícito, no error) y el caso sin visitas
  (`obtenerTodasLasFilas` degrada a `[]` si la tabla `visitas_web` no existe
  todavía, sin lanzar).
- `GraficoTraficoScroll.tsx`: único `"use client"` de la pestaña, `useEffect`
  con deps `[]`, sin ningún literal `[]`/`{}` como default de prop — lección
  del bucle infinito de `Mapa.tsx` aplicada correctamente (y referenciada en
  el propio comentario de cabecera).
- `lib/supabase/admin.ts`: `visitas_web` añadida a `BaseDeDatos` con el
  envoltorio `Row: Pick<VisitaWeb, keyof VisitaWeb>` — lección aplicada.
- `lib/trafico/bucketing.ts`/`desglose.ts`: dominio puro, sin I/O, tests
  cubren rango vacío, rango de duración cero, borde exacto de tramo, cuenta
  agrupada, filtrado fuera de rango, distinta granularidad sobre el mismo
  rango, referer inválido/ausente — no son solo happy-path.
- Documentación: `CHANGELOG.md`, `modelo-datos.md`, `arquitectura.md`
  actualizados y coherentes con el código. `DEBT.md` ya incluía, antes de
  esta revisión, tanto el recordatorio de aplicar la migración 0004 (mismo
  patrón que 0003) como el hueco de `docs/producto/` — con prioridad Baja y
  bien justificado como no bloqueante, exactamente el criterio de la lección
  registrada sobre este patrón.

**Recomendaciones (no bloqueantes, registradas en `DEBT.md`):**
- Cookie `visitante_id` sin `httpOnly` en `proxy.ts` — nada del cliente la
  necesita leer, se recomienda añadir `httpOnly: true`.
- Tipo `GranularidadTrafico` definido de forma independiente en
  `lib/trafico/bucketing.ts` y `lib/admin/navegacion.ts` — se recomienda que
  `navegacion.ts` importe el tipo desde `bucketing.ts` en vez de
  redefinirlo.

**Veredicto:** ✅ Aprobado — pasa al Agente de Seguridad.

### Seguridad — 2026-08-12 — ✅ Sin vulnerabilidades

**Estándares aplicados:** OWASP Top 10 (incluida auditoría de dependencias, A06).

**Revisado:** `proxy.ts`, `supabase/migrations/0004_visitas_web.sql`,
`lib/supabase/admin.ts`, `components/admin/SeccionTrafico.tsx`,
`components/admin/GraficoTraficoScroll.tsx`, `lib/trafico/bucketing.ts`,
`lib/trafico/desglose.ts`.

**Puntos concretos verificados (ver prompt de la tarea):**
1. **Datos externos (Referer, cookie)** — el insert en `visitas_web` usa
   `.insert({...})` del SDK de `@supabase/supabase-js` (parametrizado,
   PostgREST), sin concatenación de strings — sin vector de inyección SQL
   (A03). `referer` se guarda en una columna `text` sin límite explícito de
   longitud: evaluado como no bloqueante — en la práctica está acotado por el
   límite de tamaño de cabeceras HTTP de la plataforma (Vercel), el proyecto
   es de bajo tráfico (evento personal de un día) y el mismo patrón de "sin
   límite adicional aplicado por el propio código" ya existe hoy en columnas
   `text` de otras tablas del proyecto (p. ej. `comentarios`, `intenciones`)
   sin que se haya tratado como vulnerabilidad. No es, por tanto, un vector
   nuevo cualitativamente distinto introducido por esta tarea.
2. **Cookie `visitante_id`** — generada con `randomUUID()` de `node:crypto`
   (fuente aleatoria criptográficamente adecuada, 122 bits de entropía), no
   con contador ni timestamp — no es predecible. Un visitante puede limpiar
   cookies o fijar manualmente un valor arbitrario para inflar/falsear el
   conteo de "visitantes únicos", pero es una limitación de producto ya
   documentada y aceptada explícitamente en el prompt clarificado ("Visitante
   con cookies bloqueadas..."), no un fallo de autenticación — la cookie no
   protege ningún recurso, solo agrupa una métrica analítica interna.
3. **Exposición entre visitantes** — confirmado por grep: `visitas_web` solo
   se referencia desde `proxy.ts` (insert, `getSupabaseAdmin()`) y desde
   `SeccionTrafico.tsx` (select, también `getSupabaseAdmin()`, service role,
   bypassa RLS deliberadamente). Ningún route handler público ni Server
   Component fuera de `/admin/*` la lee. `app/admin/page.tsx` verifica
   `verificarSesion()` explícitamente (línea 46) antes de renderizar
   cualquier pestaña, incluida `SeccionTrafico` — defensa en profundidad
   además del filtro de `proxy.ts`, coherente con la advertencia del propio
   comentario de cabecera de `proxy.ts` sobre que las Server Actions (y aquí,
   los Server Components del admin) no dependen solo del matcher.
4. **DoS/coste por falta de rate limiting en `/`** — real pero no es un
   vector nuevo: la ausencia de rate limiting en `/` ya está identificada y
   aceptada como riesgo conocido en `DEBT.md` (entrada de
   `calcularProgresoLibreDelIntento`/coste de lectura en `/`, cerrada con
   mitigación de caché). El insert añadido por esta tarea es una escritura
   adicional de coste bajo y constante por petición (una fila, sin bucles),
   sin agravar la clase de riesgo (sigue sin haber ninguna cota de frecuencia
   por IP en `/`, igual que antes de esta tarea). No se considera un hallazgo
   nuevo bloqueante — coherente con el criterio ya aplicado en entradas
   previas de `DEBT.md` a riesgos de coste de la misma naturaleza en esta
   misma ruta.
5. **Logging/errores** — el `catch` de `registrarVisita()` en `proxy.ts` no
   loguea nada (ni siquiera `console.warn`) y nunca propaga el error al
   cliente: `NextResponse.next()` se devuelve siempre igual. Cero fuga de
   stack traces, nombres de tabla o detalles internos hacia el visitante.
6. **RLS de `visitas_web` vs. `intenciones`** — confirmado leyendo ambas
   migraciones: mismo patrón exacto (`enable row level security` sin
   ninguna `create policy` para `anon`), cero acceso público real, solo
   `service role` vía `getSupabaseAdmin()`. No es una variante más laxa.
7. **Otros OWASP Top 10:**
   - A01/A07: `/admin/*` sigue con la misma lógica de sesión de DT-010, sin
     cambios de comportamiento — verificado en el propio diff de `proxy.ts`.
   - A02: sin secretos hardcoded ni en logs en los ficheros de esta tarea;
     `SUPABASE_SERVICE_ROLE_KEY` sigue sin prefijo `NEXT_PUBLIC_`.
   - A08: el `referer` se trata siempre como dato no confiable — `dominioDeReferer`
     (`lib/trafico/desglose.ts`) usa `try { new URL(referer) } catch`, nunca
     un `as` para forzarlo a URL válida; el string crudo, si no es una URL
     válida, se renderiza como children de JSX (`<span>{fila.etiqueta}</span>`),
     que React escapa automáticamente — sin `dangerouslySetInnerHTML` en
     ningún componente de la tarea, sin XSS almacenado.
   - A10 (SSRF): ningún código de la tarea hace requests salientes a URLs
     construidas con input de usuario (el `referer` solo se parsea con
     `new URL()` para extraer el hostname, nunca se usa para hacer fetch).
   - A06: `pnpm audit` ejecutado contra la raíz del proyecto — 0
     vulnerabilidades (info/low/moderate/high/critical), 595 dependencias
     totales. Esta tarea no añade ninguna dependencia nueva a `package.json`
     (confirmado por lectura directa).

**Sin issues.** No se ha encontrado ninguna vulnerabilidad bloqueante en el
scope de esta tarea. Las dos recomendaciones ya señaladas por el Reviewer
(cookie `visitante_id` sin `httpOnly`, tipo `GranularidadTrafico` duplicado)
están correctamente registradas en `DEBT.md` con prioridad Baja — la primera
se evaluó también desde el ángulo de seguridad (sección "Cookie
`visitante_id`" arriba): impacto bajo, sin datos sensibles, no bloqueante.

**Veredicto:** ✅ Sin vulnerabilidades — tarea lista para cerrar.
