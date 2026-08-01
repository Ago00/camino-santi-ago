/**
 * Tests de integración de POST /api/admin/login: contraseña correcta/incorrecta,
 * ausencia de ADMIN_PASSWORD, y que la cookie fijada supera verificarSesion().
 *
 * El rate limiting (DT-011) agrupa por IP; las peticiones que no fijan
 * `x-forwarded-for` comparten la clave "ip-desconocida" (ver
 * lib/rate-limit.ts), por eso cada test usa una IP propia y se resetea el
 * limitador en cada caso para no interferir entre tests.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/admin/login/route";
import { NOMBRE_COOKIE_SESION, verificarSesion } from "@/lib/auth/admin-session";
import { reiniciarRateLimit } from "@/lib/rate-limit";

const PASSWORD_TEST = "contraseña-secreta-de-test";

function crearPeticion(body: unknown, ip = "203.0.113.1"): NextRequest {
  return new NextRequest("http://localhost/api/admin/login", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
  });
}

beforeEach(() => {
  vi.stubEnv("ADMIN_PASSWORD", PASSWORD_TEST);
  vi.stubEnv("ADMIN_SESSION_SECRET", "secreto-de-sesion-de-test-largo");
  reiniciarRateLimit();
});

describe("POST /api/admin/login", () => {
  it("responde 200 y fija una cookie de sesión válida con la contraseña correcta", async () => {
    const response = await POST(crearPeticion({ password: PASSWORD_TEST }));

    expect(response.status).toBe(200);
    const cookie = response.cookies.get(NOMBRE_COOKIE_SESION);
    expect(cookie).toBeDefined();
    expect(verificarSesion(cookie?.value)).toBe(true);
  });

  it("la cookie fijada es HttpOnly", async () => {
    const response = await POST(crearPeticion({ password: PASSWORD_TEST }));
    const cookie = response.cookies.get(NOMBRE_COOKIE_SESION);
    expect(cookie?.httpOnly).toBe(true);
  });

  it("responde 401 sin fijar cookie cuando la contraseña es incorrecta", async () => {
    const response = await POST(crearPeticion({ password: "contraseña-incorrecta" }));

    expect(response.status).toBe(401);
    expect(response.cookies.get(NOMBRE_COOKIE_SESION)).toBeUndefined();
  });

  it("responde 401 cuando la contraseña recibida tiene distinta longitud que la esperada", async () => {
    const response = await POST(crearPeticion({ password: "x" }));
    expect(response.status).toBe(401);
  });

  it("responde 400 cuando el body no trae password", async () => {
    const response = await POST(crearPeticion({}));
    expect(response.status).toBe(400);
  });

  it("responde 400 cuando el body es JSON malformado", async () => {
    const request = new NextRequest("http://localhost/api/admin/login", {
      method: "POST",
      body: "{ esto no es json",
      headers: { "content-type": "application/json" },
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("responde 401 sin distinguir el motivo cuando ADMIN_PASSWORD no está configurada", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("ADMIN_SESSION_SECRET", "secreto-de-sesion-de-test-largo");
    const response = await POST(crearPeticion({ password: PASSWORD_TEST }));
    expect(response.status).toBe(401);
  });
});

describe("POST /api/admin/login — rate limiting por IP (DT-011)", () => {
  it("responde 429 al superar 10 intentos en 15 minutos desde la misma IP, incluso con la contraseña correcta", async () => {
    const ip = "198.51.100.20";

    for (let i = 0; i < 10; i++) {
      const response = await POST(crearPeticion({ password: "contraseña-incorrecta" }, ip));
      expect(response.status).toBe(401);
    }

    const response = await POST(crearPeticion({ password: PASSWORD_TEST }, ip));
    expect(response.status).toBe(429);
  });

  it("no limita a una IP distinta aunque otra haya agotado su cupo de intentos", async () => {
    const ipBloqueada = "198.51.100.20";
    for (let i = 0; i < 10; i++) {
      await POST(crearPeticion({ password: "contraseña-incorrecta" }, ipBloqueada));
    }

    const response = await POST(crearPeticion({ password: PASSWORD_TEST }, "198.51.100.21"));
    expect(response.status).toBe(200);
  });
});
