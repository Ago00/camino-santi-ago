/**
 * Protege `/admin/*` excepto `/admin/login` (DT-010).
 *
 * Next.js 16 renombró `middleware.ts` a `proxy.ts` (función `proxy()`, no
 * `middleware()`) — ver node_modules/next/dist/docs/.../proxy.md y DT-010.
 * Proxy usa runtime Node.js por defecto en Next 16, así que `node:crypto`
 * (usado dentro de lib/auth/admin-session.ts) funciona sin restricciones.
 *
 * IMPORTANTE: esto NO es la única defensa. Las Server Actions de
 * `app/admin/actions.ts` se sirven como POST a la misma ruta donde se
 * invocan — un cambio de matcher aquí podría dejarlas sin cobertura sin que
 * se note. Cada Server Action verifica la sesión por sí misma.
 *
 * La cookie se renueva (TTL deslizante) en cada petición válida a `/admin/*`
 * para que Santi no tenga que volver a loguearse en mitad del reto.
 */

import { type NextRequest, NextResponse } from "next/server";
import { crearSesion, NOMBRE_COOKIE_SESION, verificarSesion } from "@/lib/auth/admin-session";

export const config = {
  matcher: ["/admin/:path*"],
};

const TTL_COOKIE_SEGUNDOS = 7 * 24 * 60 * 60;

export function proxy(request: NextRequest): NextResponse {
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
    maxAge: TTL_COOKIE_SEGUNDOS,
  });
  return response;
}
