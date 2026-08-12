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

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

let AdminPage: (typeof import("@/app/admin/page"))["default"];
let crearSesion: (typeof import("@/lib/auth/admin-session"))["crearSesion"];

// El `import()` pesado se hace UNA vez en beforeAll, con su propio timeout
// holgado (30 s), en vez de dentro de cada test (ver DEBT.md: "app/admin/
// page.test.ts agota el timeout de 5 s en la primera ejecución de la suite
// completa"). Node cachea el módulo tras la primera importación, así que
// repetirlo por test no aportaba nada salvo pagar el coste de transformación
// contra el timeout de 5 s de cada `it()` — con DT-024 (ModalFinalizar +
// RecuadroLlegada/FotoLlegada + lib/envio/lib/imagen sumados al árbol del
// panel) ese coste dejó de caber incluso con caché de Vitest caliente,
// sobre todo compitiendo por CPU con `proyeccion.ventana.test.ts` en la
// misma ejecución completa de `pnpm test`. Sacar el import del timer por
// test es la solución robusta frente a la contención del runner completo,
// no solo subir el número del timeout.
beforeAll(async () => {
  AdminPage = (await import("@/app/admin/page")).default;
  crearSesion = (await import("@/lib/auth/admin-session")).crearSesion;
}, 30_000);

beforeEach(() => {
  vi.stubEnv("ADMIN_SESSION_SECRET", "secreto-de-sesion-de-test-largo");
  cookieSesionMock = undefined;
  redirectSpy.mockClear();
  getSupabaseAdminSpy.mockClear();
});

function renderizarAdminPage() {
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
