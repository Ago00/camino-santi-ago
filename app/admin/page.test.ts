/**
 * Test de la segunda capa de defensa (A01, ver docs/tareas/CURRENT.md —
 * hallazgo de Seguridad 2026-08-01): `AdminPage` debe verificar la sesión por
 * sí misma, sin asumir que `proxy.ts` ya la filtró, y cortar ANTES de leer
 * ningún dato con `getSupabaseAdmin()` (service role, bypassa RLS). Mismo
 * criterio que ya cubre `app/admin/actions.test.ts` para las Server Actions.
 *
 * Se mockea `next/navigation` (redirect lanza, igual que en producción) y
 * `@/lib/supabase/admin` para poder comprobar que, sin sesión válida, jamás
 * se invoca `getSupabaseAdmin()` — es decir, que no se filtra ningún dato
 * (en particular el de `intenciones`, la tabla más sensible del modelo).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

let cookieSesionMock: string | undefined;

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (nombre: string) =>
      nombre === "admin_session" && cookieSesionMock !== undefined
        ? { name: nombre, value: cookieSesionMock }
        : undefined,
  })),
}));

class RedirectSentinel extends Error {
  constructor(public readonly destino: string) {
    super("NEXT_REDIRECT");
  }
}

const redirectSpy = vi.fn((destino: string) => {
  throw new RedirectSentinel(destino);
});

vi.mock("next/navigation", () => ({
  redirect: (destino: string) => redirectSpy(destino),
}));

const getSupabaseAdminSpy = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: getSupabaseAdminSpy,
}));

beforeEach(() => {
  vi.stubEnv("ADMIN_SESSION_SECRET", "secreto-de-sesion-de-test-largo");
  cookieSesionMock = undefined;
  redirectSpy.mockClear();
  getSupabaseAdminSpy.mockClear();
});

async function renderizarAdminPage() {
  const { default: AdminPage } = await import("@/app/admin/page");
  return AdminPage({ searchParams: Promise.resolve({}) });
}

describe("AdminPage", () => {
  it("redirige a /admin/login sin cookie de sesión, sin leer ningún dato", async () => {
    cookieSesionMock = undefined;

    await expect(renderizarAdminPage()).rejects.toBeInstanceOf(RedirectSentinel);

    expect(redirectSpy).toHaveBeenCalledWith("/admin/login");
    expect(getSupabaseAdminSpy).not.toHaveBeenCalled();
  });

  it("redirige a /admin/login con una cookie de sesión inválida (manipulada), sin leer ningún dato", async () => {
    cookieSesionMock = "cookie.invalida";

    await expect(renderizarAdminPage()).rejects.toBeInstanceOf(RedirectSentinel);

    expect(redirectSpy).toHaveBeenCalledWith("/admin/login");
    expect(getSupabaseAdminSpy).not.toHaveBeenCalled();
  });

  it("renderiza sin redirigir cuando la cookie de sesión es válida", async () => {
    const { crearSesion } = await import("@/lib/auth/admin-session");
    cookieSesionMock = crearSesion();
    getSupabaseAdminSpy.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });

    const resultado = await renderizarAdminPage();

    expect(redirectSpy).not.toHaveBeenCalled();
    expect(resultado).toBeTruthy();
  });
});
