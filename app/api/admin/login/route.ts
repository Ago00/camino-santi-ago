/**
 * POST /api/admin/login — autenticación del admin único.
 *
 * Recibe la contraseña, la compara contra `ADMIN_PASSWORD` en tiempo
 * constante (mismo patrón que `TRACK_TOKEN` en `/api/track`: hashear ambos
 * valores a longitud fija antes de `timingSafeEqual`, para no reintroducir
 * un timing leak con un early-return por longitud distinta) y, si coincide,
 * fija la cookie de sesión HttpOnly (DT-010).
 *
 * Rate limiting por IP (DT-011): 10 intentos / 15 min, para frenar fuerza
 * bruta sobre la contraseña. Responde 429 sin cuerpo al exceder el límite.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { crearSesion, NOMBRE_COOKIE_SESION } from "@/lib/auth/admin-session";
import { consumir, obtenerIpCliente } from "@/lib/rate-limit";

export const runtime = "nodejs";

const TTL_COOKIE_SEGUNDOS = 7 * 24 * 60 * 60;
const LIMITE_INTENTOS = 10;
const VENTANA_MS = 15 * 60_000;

const cuerpoLogin = z.object({
  password: z.string().min(1),
});

function passwordEsValida(passwordRecibida: string, passwordEsperada: string): boolean {
  const hashRecibido = createHash("sha256").update(passwordRecibida).digest();
  const hashEsperado = createHash("sha256").update(passwordEsperada).digest();
  return timingSafeEqual(hashRecibido, hashEsperado);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!consumir(obtenerIpCliente(request), LIMITE_INTENTOS, VENTANA_MS)) {
    return new NextResponse(null, { status: 429 });
  }

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
