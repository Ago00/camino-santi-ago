/**
 * Test de las env vars reales que lee getSupabaseAdmin().
 *
 * A diferencia de app/api/track/route.test.ts (que mockea todo el módulo
 * lib/supabase/admin y por tanto nunca ejecuta su código real), este test
 * instancia el cliente de verdad — sin conectar a ninguna BD, solo
 * construirlo — para verificar los nombres exactos de env vars que lee.
 *
 * Nace de un bug real: getSupabaseAdmin() leía `SUPABASE_URL` (variable que
 * nunca existió en el proyecto) en vez de `NEXT_PUBLIC_SUPABASE_URL` (la
 * definida en el plan y usada por lib/supabase/public.ts). Con .env.local
 * configurado según el plan, el cliente admin lanzaba en el primer uso real
 * — un fallo que ningún test con mocks podía detectar. Ver docs/LESSONS.md.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

describe("getSupabaseAdmin", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("construye el cliente sin lanzar cuando NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY están definidas", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto-test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "clave-service-role-de-prueba");

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");

    expect(() => getSupabaseAdmin()).not.toThrow();
  });

  it("lanza si falta NEXT_PUBLIC_SUPABASE_URL", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "clave-service-role-de-prueba");

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");

    expect(() => getSupabaseAdmin()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("lanza si falta SUPABASE_SERVICE_ROLE_KEY", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto-test.supabase.co");

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");

    expect(() => getSupabaseAdmin()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("no confunde SUPABASE_URL (sin prefijo, variable inexistente) con NEXT_PUBLIC_SUPABASE_URL", async () => {
    // Regresión directa del bug: si el código volviera a leer SUPABASE_URL
    // a secas, esta variable "trampa" haría pasar el test incorrectamente.
    vi.stubEnv("SUPABASE_URL", "https://no-deberia-usarse.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "clave-service-role-de-prueba");

    const { getSupabaseAdmin } = await import("@/lib/supabase/admin");

    expect(() => getSupabaseAdmin()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });
});
