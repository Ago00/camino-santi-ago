# Roadmap

Backlog vivo del proyecto. Estado: idea / definido / en curso / hecho.

---

## Fases principales

| Fase | Descripción | Estado |
|---|---|---|
| F0 | Infraestructura (repo, Supabase, Vercel, MapTiler, env vars) | **hecho** |
| F1 | Base (scaffolding, traza, dominio de progreso, tipos, docs) | **hecho** |
| F2 | Datos e ingesta (esquema SQL, RLS, `/api/track`, clientes Supabase) | **hecho y verificado en producción real** |
| F3 | Web pública (mapa, progreso, stats, formularios, textos) | hecho |
| F4 | Panel admin (login, proxy, secciones) | **hecho** |
| F5 | Cierre (Reviewer, Seguridad OWASP/RLS, deploy producción, prueba real) | **hecho (ingeniería)** |

---

## F0 — Infraestructura (hecha, 2026-07-31)

- [x] Repo GitHub `Ago00/camino-santi-ago` (público, por el límite de Vercel Hobby)
- [x] Proyecto Supabase nuevo (región eu-west-1, URL/anon/service role
      configuradas en `.env.local`) — 2026-07-30
- [x] Proyecto Vercel nuevo conectado al repo — desplegado y verificado en
      producción real (`https://camino-santi-ago-sage.vercel.app`) — 2026-07-31
- [x] Cuenta MapTiler (free tier) y su API key — verificada con una petición
      real de tiles antes de guardarla — 2026-07-31
- [x] Env vars cargadas en Vercel (Production): `NEXT_PUBLIC_SUPABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TRACK_TOKEN`,
      `NEXT_PUBLIC_MAPTILER_KEY`
- [x] `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` — cargadas en Vercel Production
      (confirmado en F5, 2026-08-01)

## F2 — Datos e ingesta

**Hecha y verificada contra Supabase real (2026-07-30).**

- [x] Escribir migración SQL (`supabase/migrations/0001_esquema_inicial.sql`)
- [x] Políticas RLS según la tabla del plan, incluidas en la migración
- [x] Route handler `/api/track` (ingesta OwnTracks con token +
      `timingSafeEqual` + filtro de plausibilidad geográfica de 100 km,
      DT-006 capa 1)
- [x] Cliente Supabase admin (`lib/supabase/admin.ts`) — construcción
      perezosa, no falla el build sin env vars
- [x] Cliente Supabase público (`lib/supabase/public.ts`) — ídem
- [x] Tests unitarios del endpoint con Supabase mockado (36 tests)
- [x] Aplicar la migración contra Supabase real — 5 tablas, RLS activo en
      las 5, verificado que `intenciones` es inaccesible para `anon` incluso
      con filas reales insertadas
- [x] Verificar `/api/track` con peticiones reales contra la BD viva (local y
      **en producción real, `camino-santi-ago-sage.vercel.app`**): token
      incorrecto → 401, punto fuera de rango → descartado sin guardar, punto
      válido → guardado correctamente. Encontrado y corregido un bug real en
      el proceso (`admin.ts` leía una env var inexistente — ver `BUGS.md`)
- [ ] Verificar con OwnTracks real desde el móvil (siguiente paso — hace
      falta una URL pública para que el teléfono pueda mandar peticiones)

## F3 — Web pública

**Hecha (2026-07-31).**

- [x] Página principal con 3 modos (antes/durante/llegada)
- [x] Componente mapa (MapLibre + overlay SVG, patrón POC)
- [x] Stats (barra, km andados, km restantes, tiempo, ritmo)
- [x] Cielo-reloj (degradado dinámico día→noche según hora real)
- [x] Mojón como cifra de km restantes
- [x] Peregrino animado (camiseta rojiblanca, cabeza que se enfada al pinchar)
- [x] Formulario de intenciones
- [x] Formulario de comentarios + hilo público
- [x] Sistema de textos (default en código + override desde BD)

## F4 — Panel admin

**Hecha (2026-08-01).**

- [x] Página de login (`/admin/login`, contraseña única)
- [x] `proxy.ts` protegiendo `/admin/*` (Next 16 renombró `middleware.ts` a
      `proxy.ts`, ver DT-010) + verificación de sesión independiente en cada
      Server Action
- [x] Sección Actividad: Iniciar / Finalizar / **Retomar** (deshace un
      Finalizar sobre el mismo intento, sin confirmación) / Reiniciar (cierra
      el intento y abre uno nuevo, con confirmación — disponible desde
      `durante` y desde `llegada`)
- [x] Sección Posición (ver última, **descartar cualquier punto del
      histórico** — no solo el último; DT-006 capa 2, defensa complementaria
      al filtro geográfico de F2 contra el envenenamiento del ancla de
      progreso). No incluye "fichar posición ahora" (geolocalización manual
      de respaldo): retirado explícitamente del alcance, se confía en
      OwnTracks.
- [x] Sección Intenciones (leer, eliminar — borrado real, la tabla no tiene
      soft-delete)
- [x] Sección Comentarios (ocultar, mostrar, eliminar, filtrar)
- [x] Sección Textos (editar las 6 claves de `lib/textos/defaults.ts`)

## F5 — Cierre

**Ingeniería hecha (2026-08-01).**

- [x] Rate limiting en los 6 endpoints públicos/sensibles (DT-011), cerrando
      la deuda técnica que lo marcaba como bloqueante explícito antes de
      producción real
- [x] Reviewer del código — auditoría completa F1-F5, sin bloqueantes
- [x] Agente de Seguridad (OWASP Top 10, auditoría de dependencias, RLS) —
      auditoría completa F1-F5; un bloqueante encontrado y corregido (control
      de acceso en lectura de datos de admin sin verificación de sesión
      propia), re-revisado y aprobado
- [x] Verificación de despliegue a producción — env vars de admin confirmadas
      en Vercel Production
- [ ] Prueba real andando (como la POC) — pendiente, solo puede hacerla Santi
      el día del reto
- [ ] Carga de textos finales desde el panel — pendiente, la hace Santi
      directamente en el panel admin cuando tenga los textos definitivos

## Post-F5 — Minuto a minuto (hecho, 2026-08-02)

Idea promovida desde "Ideas v2" y ampliada con fotos. Ver DT-013
(`docs/tecnico/decisiones-tecnicas.md`) y
`docs/tareas/historico/2026-08-02-minuto-a-minuto.md`.

- [x] Tabla `minuto_a_minuto` + Supabase Storage (bucket público) — **migración
      `0002_minuto_a_minuto.sql` pendiente de aplicar contra Supabase real**
- [x] Panel admin: publicar (texto + foto opcional), editar texto, eliminar
- [x] Web pública: feed en "durante" (con auto-actualización) y recopilatorio
      en "llegada"
- [x] Clic en una entrada → marcador temporal en el mapa con la posición en
      la que se publicó (sin saturar el mapa con marcadores permanentes)
- [x] Reviewer y Seguridad aprobados

---

## Post-F5 — Mapa: traza real vs. traza oficial (hecho, 2026-08-12)

Mapa público en modo guiado pinta el recorrido GPS real en vez de la traza
oficial (mismo comportamiento que modo libre); panel admin gana pestaña
"Mapa" con ambas trazas y el punto de referencia del cálculo. Ver DT-021
(`docs/tecnico/decisiones-tecnicas.md`) y
`docs/tareas/historico/2026-08-12-mapa-traza-real-vs-oficial.md`.

- [x] Mapa público, modo guiado: pinta `puntosGps` (real), no la traza
      oficial recortada; marcador de destino ⛪
- [x] Panel admin: pestaña "Mapa" nueva (traza real + oficial + línea de
      referencia al punto proyectado)
- [x] Reviewer y Seguridad aprobados (2 rondas de Seguridad — bloqueante de
      coste corregido)

---

## Ideas v2 (fuera de alcance v1)

- Hitos automáticos (cada pueblo, cada 10 km)
- Bot de Telegram
- Contador de seguidores (presencia en localStorage + BD)
- Geocodificación inversa ("Ahora: cerca de Redondela") en web pública
