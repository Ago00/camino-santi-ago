/**
 * Tests de las Server Actions de admin: verificación de sesión obligatoria en
 * cada una (defensa independiente de proxy.ts, ver DT-010), y las
 * transiciones de fase de Actividad — en particular Retomar (mismo intento,
 * ended_at a null) vs Reiniciar (cierra y abre uno nuevo), que son la parte
 * más fácil de confundir de esta tarea.
 *
 * Mock de lib/supabase/admin (mismo patrón que app/api/track/route.test.ts) y
 * de next/headers (cookies()) y next/cache (revalidatePath()).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let cookieSesionMock: string | undefined;

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (nombre: string) =>
      nombre === "admin_session" && cookieSesionMock !== undefined
        ? { name: nombre, value: cookieSesionMock }
        : undefined,
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

interface IntentoMock {
  id: number;
  fase: "antes" | "durante" | "llegada";
  cerrado?: boolean;
}

let intentoActivoMock: IntentoMock | null = null;
const updateSpy = vi.fn().mockReturnValue({
  eq: vi.fn().mockResolvedValue({ error: null }),
});
const insertIntentoSpy = vi.fn().mockResolvedValue({ error: null });
const deleteSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
const upsertSpy = vi.fn().mockResolvedValue({ error: null });

function crearBuilderFalso() {
  return {
    from: vi.fn((tabla: string) => {
      if (tabla === "intentos") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: intentoActivoMock, error: null }),
          update: updateSpy,
          insert: insertIntentoSpy,
        };
      }
      if (tabla === "posiciones" || tabla === "comentarios") {
        return { update: updateSpy, delete: deleteSpy };
      }
      if (tabla === "intenciones") {
        return { delete: deleteSpy };
      }
      if (tabla === "textos") {
        return { upsert: upsertSpy };
      }
      throw new Error(`Tabla no mockada: ${tabla}`);
    }),
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => crearBuilderFalso()),
}));

vi.mock("@/lib/auth/admin-session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/admin-session")>(
    "@/lib/auth/admin-session"
  );
  return actual; // usamos la implementación real de verificarSesion/crearSesion
});

const {
  iniciarReto,
  finalizarReto,
  retomarReto,
  reiniciarReto,
  descartarPosicion,
  eliminarIntencion,
  ocultarComentario,
  mostrarComentario,
  eliminarComentario,
  guardarTexto,
} = await import("@/app/admin/actions");
const { crearSesion } = await import("@/lib/auth/admin-session");

beforeEach(() => {
  vi.stubEnv("ADMIN_SESSION_SECRET", "secreto-de-test-largo-y-suficiente");
  cookieSesionMock = crearSesion();
  intentoActivoMock = null;
  updateSpy.mockClear();
  insertIntentoSpy.mockClear();
  deleteSpy.mockClear();
  upsertSpy.mockClear();
});

describe("verificación de sesión (defensa independiente de proxy.ts)", () => {
  it("iniciarReto lanza si no hay cookie de sesión", async () => {
    cookieSesionMock = undefined;
    await expect(iniciarReto()).rejects.toThrow(/sesión/i);
  });

  it("descartarPosicion lanza con una cookie de sesión manipulada", async () => {
    cookieSesionMock = "payloadfalso.firmafalsa";
    await expect(descartarPosicion(1)).rejects.toThrow(/sesión/i);
  });

  it("guardarTexto lanza con una cookie de sesión expirada", async () => {
    cookieSesionMock = crearSesion(new Date(Date.now() - 8 * 24 * 60 * 60 * 1000));
    await expect(guardarTexto("reto_titulo", "nuevo")).rejects.toThrow(/sesión/i);
  });
});

describe("Actividad — transiciones de fase", () => {
  it("iniciarReto pasa de 'antes' a 'durante' fijando started_at", async () => {
    intentoActivoMock = { id: 1, fase: "antes" };
    await iniciarReto();

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ fase: "durante", started_at: expect.any(String) })
    );
  });

  it("iniciarReto lanza si el intento activo no está en fase 'antes'", async () => {
    intentoActivoMock = { id: 1, fase: "durante" };
    await expect(iniciarReto()).rejects.toThrow(/antes/i);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("finalizarReto pasa de 'durante' a 'llegada' con el mensaje y ended_at", async () => {
    intentoActivoMock = { id: 1, fase: "durante" };
    await finalizarReto("  Gracias por acompañarme  ");

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        fase: "llegada",
        ended_at: expect.any(String),
        mensaje_llegada: "Gracias por acompañarme",
      })
    );
  });

  it("finalizarReto rechaza un mensaje vacío o solo espacios", async () => {
    intentoActivoMock = { id: 1, fase: "durante" };
    await expect(finalizarReto("   ")).rejects.toThrow(/vacío/i);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("retomarReto vuelve a 'durante' SOBRE EL MISMO intento, con ended_at a null (no crea ni cierra nada)", async () => {
    intentoActivoMock = { id: 7, fase: "llegada" };
    await retomarReto();

    expect(updateSpy).toHaveBeenCalledWith({ fase: "durante", ended_at: null });
    expect(insertIntentoSpy).not.toHaveBeenCalled();
  });

  it("retomarReto lanza si el intento activo no está en fase 'llegada'", async () => {
    intentoActivoMock = { id: 1, fase: "durante" };
    await expect(retomarReto()).rejects.toThrow(/llegada/i);
  });

  it("reiniciarReto cierra el intento actual (cerrado=true) Y crea uno nuevo en 'antes' (a diferencia de Retomar)", async () => {
    intentoActivoMock = { id: 3, fase: "llegada" };
    await reiniciarReto();

    expect(updateSpy).toHaveBeenCalledWith({ cerrado: true });
    expect(insertIntentoSpy).toHaveBeenCalledWith({ fase: "antes" });
  });

  it("reiniciarReto funciona también desde fase 'durante' (abortar en marcha)", async () => {
    intentoActivoMock = { id: 3, fase: "durante" };
    await reiniciarReto();

    expect(updateSpy).toHaveBeenCalledWith({ cerrado: true });
    expect(insertIntentoSpy).toHaveBeenCalledWith({ fase: "antes" });
  });

  it("reiniciarReto lanza si no hay ningún intento activo", async () => {
    intentoActivoMock = null;
    await expect(reiniciarReto()).rejects.toThrow(/activo/i);
    expect(insertIntentoSpy).not.toHaveBeenCalled();
  });
});

describe("Posición", () => {
  it("descartarPosicion marca descartado=true por id", async () => {
    await descartarPosicion(99);
    expect(updateSpy).toHaveBeenCalledWith({ descartado: true });
  });
});

describe("Intenciones (hard delete)", () => {
  it("eliminarIntencion llama a delete() (borrado real, sin soft-delete)", async () => {
    await eliminarIntencion(5);
    expect(deleteSpy).toHaveBeenCalled();
  });
});

describe("Comentarios", () => {
  it("ocultarComentario marca oculto=true", async () => {
    await ocultarComentario(10);
    expect(updateSpy).toHaveBeenCalledWith({ oculto: true });
  });

  it("mostrarComentario marca oculto=false (revierte ocultar)", async () => {
    await mostrarComentario(10);
    expect(updateSpy).toHaveBeenCalledWith({ oculto: false });
  });

  it("eliminarComentario llama a delete() (hard delete)", async () => {
    await eliminarComentario(10);
    expect(deleteSpy).toHaveBeenCalled();
  });
});

describe("Textos", () => {
  it("guardarTexto hace upsert de una clave conocida", async () => {
    await guardarTexto("reto_titulo", "Nuevo título");
    expect(upsertSpy).toHaveBeenCalledWith({ clave: "reto_titulo", valor: "Nuevo título" });
  });

  it("guardarTexto lanza con una clave desconocida (defensa contra claves arbitrarias)", async () => {
    await expect(guardarTexto("clave_inventada", "valor")).rejects.toThrow(/desconocida/i);
    expect(upsertSpy).not.toHaveBeenCalled();
  });
});
