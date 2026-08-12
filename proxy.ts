/**
 * Dos responsabilidades distintas, bifurcadas por `pathname` (DT-022):
 *
 * 1. `/admin/*` — protege el panel (excepto `/admin/login`), sin cambios de
 *    comportamiento respecto a DT-010.
 * 2. `/` — captura de visitas a la web pública, server-side, para la pestaña
 *    "Tráfico" del admin: lee/crea una cookie anónima de visitante (sin
 *    datos personales, sin fingerprinting) e inserta una fila en
 *    `visitas_web` antes de responder.
 *
 * Next.js 16 renombró `middleware.ts` a `proxy.ts` (función `proxy()`, no
 * `middleware()`) — ver node_modules/next/dist/docs/.../proxy.md y DT-010.
 * Proxy usa runtime Node.js por defecto en Next 16, así que `node:crypto`
 * (usado en lib/auth/admin-session.ts y aquí para `randomUUID()`) funciona
 * sin restricciones.
 *
 * IMPORTANTE: esto NO es la única defensa de `/admin/*`. Las Server Actions
 * de `app/admin/actions.ts` se sirven como POST a la misma ruta donde se
 * invocan — un cambio de matcher aquí podría dejarlas sin cobertura sin que
 * se note. Cada Server Action verifica la sesión por sí misma.
 *
 * `proxy()` pasa a ser async (antes síncrono): la rama pública espera el
 * insert en `visitas_web` antes de responder. Si ese insert falla —incluida
 * la tabla no existiendo todavía en producción porque la migración
 * `0004_visitas_web.sql` no se ha aplicado aún, ver DEBT.md, mismo escenario
 * ya vivido con `0003_modo_intento.sql`— el error se ignora en silencio y la
 * petición del visitante real se sirve igual: nunca debe romperse la carga
 * de la web pública por esto (mismo criterio defensivo que `/api/track`).
 */

import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { crearSesion, NOMBRE_COOKIE_SESION, verificarSesion } from "@/lib/auth/admin-session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const config = {
  matcher: ["/", "/admin/:path*"],
};

const TTL_COOKIE_SESION_SEGUNDOS = 7 * 24 * 60 * 60;

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin")) {
    return proxyAdmin(request);
  }

  return proxyPublico(request);
}

// ---------------------------------------------------------------------------
// /admin/* — sesión (DT-010, sin cambios de comportamiento)
// ---------------------------------------------------------------------------

function proxyAdmin(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  const cookieSesion = request.cookies.get(NOMBRE_COOKIE_SESION)?.value;

  if (!verificarSesion(cookieSesion)) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  const response = NextResponse.next();
  response.cookies.set(NOMBRE_COOKIE_SESION, crearSesion(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: TTL_COOKIE_SESION_SEGUNDOS,
  });
  return response;
}

// ---------------------------------------------------------------------------
// / — captura de visitas (DT-022)
// ---------------------------------------------------------------------------

export const NOMBRE_COOKIE_VISITANTE = "visitante_id";

/** ~1 año — cookie funcional, no de sesión: se reutiliza entre visitas. */
const TTL_COOKIE_VISITANTE_SEGUNDOS = 400 * 24 * 60 * 60;

async function proxyPublico(request: NextRequest): Promise<NextResponse> {
  const cookieVisitanteExistente = request.cookies.get(NOMBRE_COOKIE_VISITANTE)?.value;
  const visitanteId = cookieVisitanteExistente ?? randomUUID();

  await registrarVisita(request, visitanteId);

  const response = NextResponse.next();
  if (!cookieVisitanteExistente) {
    response.cookies.set(NOMBRE_COOKIE_VISITANTE, visitanteId, {
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: TTL_COOKIE_VISITANTE_SEGUNDOS,
    });
  }
  return response;
}

/**
 * Inserta la visita en `visitas_web`. Nunca lanza: cualquier fallo (tabla
 * inexistente porque la migración 0004 no se aplicó todavía, env vars de
 * Supabase ausentes, error de red...) se ignora en silencio.
 */
async function registrarVisita(request: NextRequest, visitanteId: string): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from("visitas_web").insert({
      ruta: request.nextUrl.pathname,
      ts: new Date().toISOString(),
      visitante_id: visitanteId,
      referer: request.headers.get("referer"),
    });
  } catch {
    // Ver comentario de cabecera: nunca debe romper la petición del visitante real.
  }
}
