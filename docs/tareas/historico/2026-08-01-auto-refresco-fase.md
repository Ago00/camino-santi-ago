# Tarea en curso

**Título:** Auto-refresco de fase en la web pública
**Tipo:** Feature
**Estado:** Revisión
**Iniciada:** 2026-08-01

## Prompt clarificado

La web pública (`app/page.tsx`) debe detectar cuando cambia la `fase` del
intento activo (`antes` → `durante` → `llegada`, y también los casos
inversos: `Retomar` deshace `llegada`→`durante`, `Reiniciar` cierra el
intento y abre uno nuevo en `antes`) y **recargar la página automáticamente**,
sin que el visitante tenga que refrescar a mano. El cambio debe notarse en
menos de ~30-60 s desde que se pulsa el botón en el panel admin.

### Alcance
- Incluye: los 3 modos (`ModoAntes`, `ModoDurante`, `ModoLlegada`) detectan
  cambios de fase por polling periódico y recargan la página entera
  (`window.location.reload()`) cuando la fase servida ya no coincide con la
  que se está mostrando.
- Excluye: transiciones suaves/animadas entre modos (se acepta el parpadeo de
  una recarga completa, coherente con DT-007 — sin Realtime). Excluye
  cambios en "textos" (ya se reflejan en cada recarga normal).

### Comportamiento en casos límite
- Pestaña en segundo plano: el polling puede pausarse por el navegador; se
  recupera y recarga al volver a primer plano. Sin tratamiento especial.
- Dos cambios de fase muy seguidos: el visitante puede saltar directo al
  modo final sin ver el intermedio — aceptable.

### Supuestos asumidos
- El mecanismo concreto (endpoint a consultar, cadencia) lo decide el
  Arquitecto.

## Diseño
Mockup: N/A (sin cambio visual)

## Decisión técnica / Diagnóstico

**DT-012** (`docs/tecnico/decisiones-tecnicas.md`) — endpoint nuevo y
dedicado `GET /api/fase` (`select fase from intentos where not cerrado`,
sin cálculo de progreso, rate limit 60 req/min por IP, mismo criterio que
DT-011). Componente cliente único `RefrescoAlCambiarFase`
(`components/publico/`), renderizado una vez en `app/page.tsx` junto al modo
activo, recibe la fase actual como prop, hace polling cada 30 s y ejecuta
`window.location.reload()` si detecta un cambio. No se toca `ModoAntes`,
`ModoDurante` ni `ModoLlegada`.

## Archivos modificados

**Creados:**
- `app/api/fase/route.ts` — endpoint `GET /api/fase`: consulta mínima de la fase del intento activo, sin caché, rate limit 60 req/min por IP (mismo patrón que `app/api/progreso/route.ts`).
- `app/api/fase/route.test.ts` — tests del endpoint: las 3 fases posibles, fallback a `"antes"` sin intento activo, rate limit 429 al superar el cupo, no interferencia entre IPs distintas.
- `components/publico/RefrescoAlCambiarFase.tsx` — componente cliente sin render visible: polling cada 30 s a `/api/fase`, `window.location.reload()` si la fase servida difiere de `faseActual`.

**Modificados:**
- `app/page.tsx` — añadida una única instancia de `<RefrescoAlCambiarFase faseActual={fase} />`, junto al modo activo (cubre los 3 modos). No se ha tocado `ModoAntes.tsx`, `ModoDurante.tsx` ni `ModoLlegada.tsx`.
- `docs/tecnico/arquitectura.md` — añadidas filas a la tabla de estructura de carpetas para `app/api/fase/route.ts`, `components/publico/RefrescoAlCambiarFase.tsx` y `lib/rate-limit.ts` (esta última cierra la deuda pendiente registrada en `DEBT.md`).
- `CHANGELOG.md` — entrada de producto sobre el auto-refresco de fase.
- `DEBT.md` — cerrada la entrada "`docs/tecnico/arquitectura.md` no incluye `lib/rate-limit.ts` en la tabla de estructura".

**Decisión de alcance de testing (bloqueo menor, resuelto sin pausar):** no existe en todo el proyecto ningún test de componente React (ni `@testing-library`, ni `jsdom`/`happy-dom` en `package.json`). Siguiendo la instrucción explícita de la tarea, no se ha introducido una librería nueva solo para testear `RefrescoAlCambiarFase.tsx`. El testing automático de esta tarea se limita al endpoint `/api/fase`, que cubre toda la lógica de negocio real (consulta de fase, fallback, rate limiting). El componente cliente es deliberadamente trivial (un `useEffect` + `fetch` + comparación + `reload`), replica el patrón ya usado y no verificado con tests en `ModoDurante.tsx`.

## Quality gates

- **Typecheck** (`pnpm typecheck`): PASS — cero errores.
- **Lint** (`pnpm lint`): PASS — cero errores/warnings.
- **Tests** (`pnpm test`): PASS — 17 ficheros, 159 tests (6 nuevos en `app/api/fase/route.test.ts`).

## Historial de revisión

### Reviewer — 2026-08-01

**Veredicto: ✅ Aprobado — pasa a Seguridad.**

Verificado contra `AGENTS.md`, `docs/tecnico/arquitectura.md`, DT-012, DT-007
y DT-011:

- `app/api/fase/route.ts` sigue exactamente el mismo orden y estilo que
  `app/api/progreso/route.ts`: rate limit antes de tocar BD, `runtime =
  "nodejs"`, 429 sin cuerpo, consulta mínima (`select fase ... maybeSingle()`,
  sin `calcularProgreso()`, sin caché — justificado y coherente con DT-012).
- El fallback a `"antes"` sin intento activo coincide literalmente con el
  criterio de `app/page.tsx:32` (`intentoActivo?.fase ?? "antes"`).
- `RefrescoAlCambiarFase.tsx`: cleanup correcto del `setInterval` (`return ()
  => clearInterval(id)`), sin fugas de memoria. Sin lógica de negocio
  enterrada (solo compara `fase !== faseActual` y recarga). Tipado estricto,
  sin `any`, usa el tipo `Fase` de `lib/types.ts`. Replica el patrón ya
  existente y no cuestionado de `ModoDurante.tsx` (mismo `useEffect` +
  `setInterval` + `fetch` + cleanup).
- Verificado directamente (no solo confiando en lo que dice el
  Implementador): `package.json` no tiene `@testing-library/react`, `jsdom`
  ni `happy-dom`; `vitest.config.ts` tiene `environment: "node"` e
  `include: ["**/*.test.ts"]` (excluye `.tsx`). No existe infraestructura de
  testing de componentes en el proyecto. La decisión de no introducirla solo
  para este componente trivial es razonable y está bien documentada.
- `app/page.tsx`: integración mínima y correcta, una sola instancia junto al
  modo activo, sin tocar `ModoAntes`/`ModoDurante`/`ModoLlegada`.
- `docs/tecnico/arquitectura.md` actualizado con las 3 filas nuevas
  (`app/api/fase/route.ts`, `components/publico/RefrescoAlCambiarFase.tsx`,
  `lib/rate-limit.ts`). `DEBT.md` cierra correctamente la entrada pendiente
  sobre `lib/rate-limit.ts` no reflejado en la tabla de estructura.
  `CHANGELOG.md` tiene la entrada de producto correspondiente.
- Tests del endpoint (`route.test.ts`) cubren las 3 fases, el fallback, el
  429 al superar cupo y la no interferencia entre IPs — mismo patrón que
  `progreso/route.test.ts`. Sin happy-path únicamente.

Sin bloqueantes. Sin recomendaciones nuevas (no se ha detectado deuda
adicional generada por esta tarea). Pasa al Agente de Seguridad.

### Seguridad — 2026-08-01

**Veredicto: ✅ Sin vulnerabilidades — tarea lista para cerrar.**

Revisión focalizada (no repite la auditoría OWASP completa de F5; scope
acotado a lo tocado por DT-012, confirmado con `git diff main --stat`).

**Estándares aplicados:** OWASP Top 10 (foco en A01 control de acceso, A03
inyección/exposición de datos, A04 diseño inseguro del lado cliente).

**Revisado:**
- `app/api/fase/route.ts`: `select("fase")` explícito sobre `intentos`, la
  respuesta serializa únicamente `{ fase }`. No hay forma de que exponga
  columnas de `intentos` distintas de `fase`, ni datos de `posiciones`,
  `intenciones` o `comentarios` — esas tablas no se consultan. El fallback a
  `"antes"` sin intento activo es idéntico al de `app/page.tsx:32`: no
  introduce una forma de distinguir "sin intento" de "intento en fase antes"
  que no exista ya en la home pública.
- Rate limiting: usa literalmente `consumir()`/`obtenerIpCliente()` de
  `lib/rate-limit.ts`, mismo límite (60/min), misma ventana (60s), rate limit
  evaluado antes de tocar BD, 429 sin cuerpo — idéntico patrón a
  `app/api/progreso/route.ts` (DT-011, ya auditado). Confirmado también por
  los tests de `route.test.ts` (60 OK + 429 al 61, no interferencia entre
  IPs).
- `components/publico/RefrescoAlCambiarFase.tsx`: sin
  `dangerouslySetInnerHTML`, sin `eval`/`new Function`, sin URLs construidas
  con input externo (`fetch("/api/fase")` es un literal fijo). El único
  efecto (`window.location.reload()`) depende exclusivamente de comparar la
  respuesta del propio endpoint de mismo origen contra la prop `faseActual`
  — ningún canal controlable por un tercero (sin lectura de query params,
  hash o `postMessage`) puede disparar ni alterar la recarga.
- Confirmado con `git diff main --stat` que la tarea NO toca
  `lib/auth/admin-session.ts`, `proxy.ts`, ninguna de las 6 rutas de DT-011
  ni `app/admin/page.tsx`. El único cambio en `app/page.tsx` es aditivo
  (import + una línea de render de `RefrescoAlCambiarFase`), sin alterar
  `obtenerIntentoActivo()` ni el resto de la lógica del Server Component.

**Sin issues.**

Tarea lista para cerrar.
