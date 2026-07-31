/**
 * POST /api/admin/login — autenticación del admin único.
 *
 * Recibe la contraseña, la compara contra `ADMIN_PASSWORD` en tiempo
 * constante (mismo patrón que `TRACK_TOKEN` en `/api/track`: hashear ambos
 * valores a longitud fija antes de `timingSafeEqual`, para no reintroducir
 * un timing leak con un early-return por longitud distinta) y, si coincide,
 * fija la cookie de sesión HttpOnly (DT-010).
 *
 * Sin rate limiting (deuda registrada en DEBT.md, agrupada con los demás
 * endpoints pendientes de F5).
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { crearSesion, NOMBRE_COOKIE_SESION } from "@/lib/auth/admin-session";

export const runtime = "nodejs";

const TTL_COOKIE_SEGUNDOS = 7 * 24 * 60 * 60;

const cuerpoLogin = z.object({
  password: z.string().min(1),
});

function passwordEsValida(passwordRecibida: string, passwordEsperada: string): boolean {
  const hashRecibido = createHash("sha256").update(passwordRecibida).digest();
  const hashEsperado = createHash("sha256").update(passwordEsperada).digest();
  return timingSafeEqual(hashRecibido, hashEsperado);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let bodyJson: unknown;
  try {
    bodyJson = await request.json();
  } catch {
    return NextResponse.json({ error: "cuerpo de la petición inválido" }, { status: 400 });
  }

  const parsed = cuerpoLogin.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json({ error: "contraseña requerida" }, { status: 400 });
  }

  const passwordEsperada = process.env.ADMIN_PASSWORD;

  // Sin ADMIN_PASSWORD configurada, no hay nada válido con lo que comparar:
  // se rechaza igual que una contraseña incorrecta, sin distinguir el caso.
  if (!passwordEsperada || !passwordEsValida(parsed.data.password, passwordEsperada)) {
    return NextResponse.json({ error: "contraseña incorrecta" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(NOMBRE_COOKIE_SESION, crearSesion(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: TTL_COOKIE_SEGUNDOS,
  });
  return response;
}
