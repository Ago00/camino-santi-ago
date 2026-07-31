/**
 * Tests de proxy.ts: redirección a /admin/login sin sesión válida, paso
 * libre a /admin/login, y acceso permitido con cookie válida.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { crearSesion, NOMBRE_COOKIE_SESION } from "@/lib/auth/admin-session";

beforeEach(() => {
  vi.stubEnv("ADMIN_SESSION_SECRET", "secreto-de-sesion-de-test-largo");
});

function peticionA(pathname: string, cookieValor?: string): NextRequest {
  const request = new NextRequest(`http://localhost${pathname}`);
  if (cookieValor !== undefined) {
    request.cookies.set(NOMBRE_COOKIE_SESION, cookieValor);
  }
  return request;
}

describe("proxy", () => {
  it("deja pasar /admin/login sin cookie de sesión", () => {
    const response = proxy(peticionA("/admin/login"));
    expect(response.status).toBe(200); // NextResponse.next() no redirige
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirige a /admin/login cuando no hay cookie de sesión", () => {
    const response = proxy(peticionA("/admin"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/admin/login");
  });

  it("redirige a /admin/login cuando la cookie es inválida (manipulada)", () => {
    const response = proxy(peticionA("/admin", "cookie.invalida"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/admin/login");
  });

  it("permite el acceso a /admin con una cookie de sesión válida", () => {
    const cookieValida = crearSesion();
    const response = proxy(peticionA("/admin", cookieValida));
    expect(response.headers.get("location")).toBeNull();
  });

  it("renueva la cookie (Set-Cookie) en cada petición válida a /admin/*", () => {
    const cookieValida = crearSesion();
    const response = proxy(peticionA("/admin/posicion", cookieValida));
    const setCookie = response.cookies.get(NOMBRE_COOKIE_SESION);
    expect(setCookie).toBeDefined();
    expect(setCookie?.value).not.toBe(""); // hay una cookie nueva fijada
  });
});
