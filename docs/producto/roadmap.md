# Roadmap

Backlog vivo del proyecto. Estado: idea / definido / en curso / hecho.

---

## Fases principales

| Fase | Descripción | Estado |
|---|---|---|
| F0 | Infraestructura (repo, Supabase, Vercel, MapTiler, env vars) | **en curso** (Supabase y Vercel hechos; MapTiler pendiente, no bloquea) |
| F1 | Base (scaffolding, traza, dominio de progreso, tipos, docs) | **hecho** |
| F2 | Datos e ingesta (esquema SQL, RLS, `/api/track`, clientes Supabase) | **hecho y verificado en producción real** |
| F3 | Web pública (mapa, progreso, stats, formularios, textos) | definido |
| F4 | Panel admin (login, middleware, secciones) | definido |
| F5 | Cierre (Reviewer, Seguridad OWASP/RLS, deploy producción, prueba real) | definido |

---

## F0 — Infraestructura (en curso, bloquea F2)

Las altas de cuentas las hace Santi; el código no las necesitó en F1 pero F2 no
puede empezar sin ellas.

- [x] Repo GitHub `Ago00/camino-santi-ago` (público, por el límite de Vercel Hobby)
- [x] Proyecto Supabase nuevo (región eu-west-1, URL/anon/service role
      configuradas en `.env.local`) — 2026-07-30
- [x] Proyecto Vercel nuevo conectado al repo — desplegado y verificado en
      producción real (`https://camino-santi-ago-sage.vercel.app`) — 2026-07-31
- [ ] Cuenta MapTiler (free tier) y su API key — no bloquea nada hasta F3
- [x] Env vars cargadas en Vercel (Production): `NEXT_PUBLIC_SUPABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TRACK_TOKEN`
- [ ] `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `NEXT_PUBLIC_MAPTILER_KEY` —
      pendientes, no bloquean hasta F3/F4

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

- [ ] Página principal con 3 modos (antes/durante/llegada)
- [ ] Componente mapa (MapLibre + overlay SVG, patrón POC)
- [ ] Stats (barra, km andados, km restantes, tiempo, ritmo)
- [ ] Cielo-reloj (degradado dinámico día→noche según hora real)
- [ ] Mojón como cifra de km restantes
- [ ] Peregrino animado (camiseta rojiblanca, cabeza que se enfada al pinchar)
- [ ] Formulario de intenciones
- [ ] Formulario de comentarios + hilo público
- [ ] Sistema de textos (default en código + override desde BD)

## F4 — Panel admin

- [ ] Página de login
- [ ] Middleware protegiendo `/admin/*`
- [ ] Sección Actividad (Iniciar / Finalizar / Reiniciar)
- [ ] Sección Posición (fichar, ver última, **descartar cualquier punto del
      histórico** — no solo el último; DT-006 capa 2, defensa complementaria
      al filtro geográfico de F2 contra el envenenamiento del ancla de
      progreso)
- [ ] Sección Intenciones (leer, eliminar)
- [ ] Sección Comentarios (ocultar, mostrar, eliminar, filtrar)
- [ ] Sección Textos (editar)

## F5 — Cierre

- [ ] Reviewer del código
- [ ] Agente de Seguridad (OWASP Top 10, auditoría de dependencias, RLS)
- [ ] Deploy a producción
- [ ] Prueba real andando (como la POC)
- [ ] Carga de textos finales desde el panel

---

## Ideas v2 (fuera de alcance v1)

- Hitos automáticos (cada pueblo, cada 10 km)
- Minuto a minuto (feed de mensajes en directo, editable desde admin)
- Bot de Telegram
- Contador de seguidores (presencia en localStorage + BD)
- Geocodificación inversa ("Ahora: cerca de Redondela") en web pública
