/**
 * Tests de proxy.ts:
 * - /admin/*: redirección a /admin/login sin sesión válida, paso libre a
 *   /admin/login, acceso permitido con cookie válida (DT-010).
 * - /: captura de visitas en visitas_web (DT-022) — genera/reutiliza la
 *   cookie de visitante, y un fallo del insert nunca impide
 *   NextResponse.next().
 *
 * Mock de lib/supabase/admin: mismo patrón que app/api/track/route.test.ts —
 * builder falso que registra la llamada a `.from("visitas_web").insert(...)`
 * sin tocar red.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { crearSesion, NOMBRE_COOKIE_SESION } from "@/lib/auth/admin-session";

// ---------------------------------------------------------------------------
// Mock de lib/supabase/admin
// ---------------------------------------------------------------------------

const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
let getSupabaseAdminDebeLanzar = false;

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => {
    if (getSupabaseAdminDebeLanzar) {
      throw new Error("Faltan env vars de Supabase");
    }
    return {
      from: vi.fn((tabla: string) => {
        if (tabla === "visitas_web") {
          return { insert: insertSpy };
        }
        throw new Error(`Tabla no mockada: ${tabla}`);
      }),
    };
  }),
}));

// Import dinámico posterior al mock (proxy.ts importa getSupabaseAdmin).
const { proxy, NOMBRE_COOKIE_VISITANTE } = await import("@/proxy");

beforeEach(() => {
  vi.stubEnv("ADMIN_SESSION_SECRET", "secreto-de-sesion-de-test-largo");
  insertSpy.mockClear();
  getSupabaseAdminDebeLanzar = false;
});

function peticionA(pathname: string, cookieValor?: string, headers?: Record<string, string>): NextRequest {
  const request = new NextRequest(`http://localhost${pathname}`, { headers });
  if (cookieValor !== undefined) {
    request.cookies.set(NOMBRE_COOKIE_SESION, cookieValor);
  }
  return request;
}

// ---------------------------------------------------------------------------
// /admin/* (DT-010)
// ---------------------------------------------------------------------------

describe("proxy — /admin/*", () => {
  it("deja pasar /admin/login sin cookie de sesión", async () => {
    const response = await proxy(peticionA("/admin/login"));
    expect(response.status).toBe(200); // NextResponse.next() no redirige
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirige a /admin/login cuando no hay cookie de sesión", async () => {
    const response = await proxy(peticionA("/admin"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/admin/login");
  });

  it("redirige a /admin/login cuando la cookie es inválida (manipulada)", async () => {
    const response = await proxy(peticionA("/admin", "cookie.invalida"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/admin/login");
  });

  it("permite el acceso a /admin con una cookie de sesión válida", async () => {
    const cookieValida = crearSesion();
    const response = await proxy(peticionA("/admin", cookieValida));
    expect(response.headers.get("location")).toBeNull();
  });

  it("renueva la cookie (Set-Cookie) en cada petición válida a /admin/*", async () => {
    const cookieValida = crearSesion();
    const response = await proxy(peticionA("/admin/posicion", cookieValida));
    const setCookie = response.cookies.get(NOMBRE_COOKIE_SESION);
    expect(setCookie).toBeDefined();
    expect(setCookie?.value).not.toBe(""); // hay una cookie nueva fijada
  });

  it("no inserta ninguna visita al pasar por /admin/*", async () => {
    await proxy(peticionA("/admin/login"));
    expect(insertSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// / (DT-022 — captura de visitas)
// ---------------------------------------------------------------------------

function peticionPublica(headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/", { headers });
}

function peticionPublicaConCookieVisitante(visitanteId: string): NextRequest {
  const request = new NextRequest("http://localhost/");
  request.cookies.set("visitante_id", visitanteId);
  return request;
}

describe("proxy — / (captura de visitas)", () => {
  it("responde sin redirigir y sirve la petición normalmente", async () => {
    const response = await proxy(peticionPublica());
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("genera una cookie de visitante nueva cuando no existe y la fija en la respuesta", async () => {
    const response = await proxy(peticionPublica());
    const cookieFijada = response.cookies.get(NOMBRE_COOKIE_VISITANTE);
    expect(cookieFijada).toBeDefined();
    expect(cookieFijada?.value).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reutiliza la cookie de visitante existente en vez de generar una nueva", async () => {
    const visitanteIdExistente = "11111111-1111-4111-8111-111111111111";
    const response = await proxy(peticionPublicaConCookieVisitante(visitanteIdExistente));

    // No hace falta volver a fijarla: ya existía en la petición.
    const cookieFijada = response.cookies.get(NOMBRE_COOKIE_VISITANTE);
    expect(cookieFijada).toBeUndefined();
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ visitante_id: visitanteIdExistente })
    );
  });

  it("inserta la visita con ruta, timestamp, visitante_id y referer", async () => {
    await proxy(peticionPublica({ referer: "https://ejemplo.com/pagina" }));

    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        ruta: "/",
        referer: "https://ejemplo.com/pagina",
        visitante_id: expect.any(String),
        ts: expect.any(String),
      })
    );
  });

  it("inserta referer null cuando no viene la cabecera", async () => {
    await proxy(peticionPublica());

    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ referer: null }));
  });

  it("sigue sirviendo la petición (NextResponse.next()) aunque el insert falle", async () => {
    insertSpy.mockRejectedValueOnce(new Error("relation \"visitas_web\" does not exist"));

    const response = await proxy(peticionPublica());

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("sigue sirviendo la petición aunque getSupabaseAdmin() lance (env vars ausentes)", async () => {
    getSupabaseAdminDebeLanzar = true;

    const response = await proxy(peticionPublica());

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
