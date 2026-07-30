# Roadmap

Backlog vivo del proyecto. Estado: idea / definido / en curso / hecho.

---

## Fases principales

| Fase | Descripción | Estado |
|---|---|---|
| F0 | Infraestructura (repo, Supabase, Vercel, MapTiler, env vars) | **en curso** |
| F1 | Base (scaffolding, traza, dominio de progreso, tipos, docs) | **hecho** |
| F2 | Datos e ingesta (esquema SQL, RLS, `/api/track`, clientes Supabase) | definido |
| F3 | Web pública (mapa, progreso, stats, formularios, textos) | definido |
| F4 | Panel admin (login, middleware, secciones) | definido |
| F5 | Cierre (Reviewer, Seguridad OWASP/RLS, deploy producción, prueba real) | definido |

---

## F0 — Infraestructura (en curso, bloquea F2)

Las altas de cuentas las hace Santi; el código no las necesitó en F1 pero F2 no
puede empezar sin ellas.

- [x] Repo GitHub `Ago00/camino-santi-ago` (público, por el límite de Vercel Hobby)
- [ ] Proyecto Supabase nuevo (anotar URL, anon key y service role key)
- [ ] Proyecto Vercel nuevo conectado al repo
- [ ] Cuenta MapTiler (free tier) y su API key
- [ ] Env vars cargadas en Vercel: `NEXT_PUBLIC_SUPABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TRACK_TOKEN`,
      `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `NEXT_PUBLIC_MAPTILER_KEY`

## F2 — Datos e ingesta (próxima)

- [ ] Aplicar esquema SQL (Drizzle migration o Supabase migration)
- [ ] Configurar RLS según la tabla del plan
- [ ] Route handler `/api/track` (ingesta OwnTracks con token + timingSafeEqual)
- [ ] Cliente Supabase admin (`lib/supabase/admin.ts`)
- [ ] Cliente Supabase público (`lib/supabase/public.ts`)
- [ ] Verificar con OwnTracks real desde el móvil

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
- [ ] Sección Posición (fichar, ver última, descartar)
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
