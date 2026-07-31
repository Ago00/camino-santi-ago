import { beforeEach, describe, expect, it, vi } from "vitest";
import { crearSesion, verificarSesion } from "@/lib/auth/admin-session";

describe("admin-session", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_SESSION_SECRET", "secreto-de-test-suficientemente-largo");
  });

  it("una cookie recién creada es válida en el mismo instante", () => {
    const ahora = new Date("2026-08-01T10:00:00Z");
    const cookie = crearSesion(ahora);
    expect(verificarSesion(cookie, ahora)).toBe(true);
  });

  it("sigue siendo válida justo antes de cumplir el TTL de 7 días", () => {
    const ahora = new Date("2026-08-01T10:00:00Z");
    const cookie = crearSesion(ahora);
    const justoAntes = new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000 - 1000);
    expect(verificarSesion(cookie, justoAntes)).toBe(true);
  });

  it("expira pasados los 7 días de TTL", () => {
    const ahora = new Date("2026-08-01T10:00:00Z");
    const cookie = crearSesion(ahora);
    const despuesDeExpirar = new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000 + 1000);
    expect(verificarSesion(cookie, despuesDeExpirar)).toBe(false);
  });

  it("rechaza una cookie con la firma alterada", () => {
    const cookie = crearSesion(new Date());
    const [payload] = cookie.split(".");
    const cookieManipulada = `${payload}.firmafalsaquenocoincide00000000000000000`;
    expect(verificarSesion(cookieManipulada)).toBe(false);
  });

  it("rechaza una cookie con el payload alterado (exp adelantado) aunque la firma original se reutilice", () => {
    const cookie = crearSesion(new Date("2026-08-01T10:00:00Z"));
    const [, firma] = cookie.split(".");
    const payloadFalso = Buffer.from(JSON.stringify({ exp: Date.now() + 999_999_999_999 })).toString(
      "base64url"
    );
    expect(verificarSesion(`${payloadFalso}.${firma}`)).toBe(false);
  });

  it("rechaza una cookie firmada con un secreto distinto (ej. tras rotar ADMIN_SESSION_SECRET)", () => {
    const cookieConSecretoViejo = crearSesion(new Date());
    vi.stubEnv("ADMIN_SESSION_SECRET", "otro-secreto-completamente-distinto");
    expect(verificarSesion(cookieConSecretoViejo)).toBe(false);
  });

  it("rechaza valores sin el formato payload.firma", () => {
    expect(verificarSesion("valor-sin-punto")).toBe(false);
    expect(verificarSesion("a.b.c")).toBe(false);
    expect(verificarSesion("")).toBe(false);
  });

  it("rechaza null y undefined sin lanzar", () => {
    expect(verificarSesion(null)).toBe(false);
    expect(verificarSesion(undefined)).toBe(false);
  });

  it("rechaza un payload que no es JSON válido tras decodificar", () => {
    const payloadCorrupto = Buffer.from("esto no es json").toString("base64url");
    const cookie = crearSesion(new Date());
    const [, firmaOriginal] = cookie.split(".");
    // La firma no coincidirá con el payload corrupto, pero comprobamos
    // explícitamente que el parseo de JSON tampoco puede lanzar sin control.
    expect(verificarSesion(`${payloadCorrupto}.${firmaOriginal}`)).toBe(false);
  });

  it("lanza al crear una sesión si falta ADMIN_SESSION_SECRET", () => {
    vi.unstubAllEnvs();
    expect(() => crearSesion(new Date())).toThrow(/ADMIN_SESSION_SECRET/);
  });

  it("verificarSesion devuelve false (no lanza) si falta ADMIN_SESSION_SECRET", () => {
    const cookie = crearSesion(new Date());
    vi.unstubAllEnvs();
    expect(verificarSesion(cookie)).toBe(false);
  });
});
