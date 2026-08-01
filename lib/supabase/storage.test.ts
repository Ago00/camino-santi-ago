/**
 * Tests de subirFotoMinutoAMinuto: validación de tipo MIME y tamaño (borde
 * del sistema, antes de tocar Storage), construcción del nombre único, y
 * propagación de errores de Supabase con mensaje apto para el usuario.
 *
 * Mock de lib/supabase/admin (mismo patrón que app/admin/actions.test.ts).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const uploadSpy = vi.fn().mockResolvedValue({ error: null });
const getPublicUrlSpy = vi.fn(() => ({
  data: { publicUrl: "https://supabase.example.com/storage/v1/object/public/minuto-a-minuto/foo.jpg" },
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({
    storage: {
      from: vi.fn(() => ({
        upload: uploadSpy,
        getPublicUrl: getPublicUrlSpy,
      })),
    },
  })),
}));

const { subirFotoMinutoAMinuto } = await import("@/lib/supabase/storage");

function crearArchivo(opciones: { type: string; size: number }): File {
  const contenido = new Uint8Array(opciones.size);
  return new File([contenido], "foto", { type: opciones.type });
}

beforeEach(() => {
  uploadSpy.mockClear();
  getPublicUrlSpy.mockClear();
});

describe("subirFotoMinutoAMinuto — validación de tipo MIME", () => {
  it("acepta image/jpeg", async () => {
    const url = await subirFotoMinutoAMinuto(crearArchivo({ type: "image/jpeg", size: 100 }));
    expect(url).toContain("minuto-a-minuto");
    expect(uploadSpy).toHaveBeenCalled();
  });

  it("acepta image/png", async () => {
    await subirFotoMinutoAMinuto(crearArchivo({ type: "image/png", size: 100 }));
    expect(uploadSpy).toHaveBeenCalled();
  });

  it("acepta image/webp", async () => {
    await subirFotoMinutoAMinuto(crearArchivo({ type: "image/webp", size: 100 }));
    expect(uploadSpy).toHaveBeenCalled();
  });

  it("rechaza un tipo MIME no permitido (p. ej. application/pdf) sin llamar a Storage", async () => {
    await expect(
      subirFotoMinutoAMinuto(crearArchivo({ type: "application/pdf", size: 100 }))
    ).rejects.toThrow(/formato/i);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it("rechaza image/gif (parece imagen pero no está en la lista permitida)", async () => {
    await expect(
      subirFotoMinutoAMinuto(crearArchivo({ type: "image/gif", size: 100 }))
    ).rejects.toThrow(/formato/i);
    expect(uploadSpy).not.toHaveBeenCalled();
  });
});

describe("subirFotoMinutoAMinuto — validación de tamaño", () => {
  it("acepta un fichero justo en el límite de 8 MB", async () => {
    await subirFotoMinutoAMinuto(crearArchivo({ type: "image/jpeg", size: 8 * 1024 * 1024 }));
    expect(uploadSpy).toHaveBeenCalled();
  });

  it("rechaza un fichero que supera 8 MB sin llamar a Storage", async () => {
    await expect(
      subirFotoMinutoAMinuto(crearArchivo({ type: "image/jpeg", size: 8 * 1024 * 1024 + 1 }))
    ).rejects.toThrow(/tamaño/i);
    expect(uploadSpy).not.toHaveBeenCalled();
  });
});

describe("subirFotoMinutoAMinuto — nombre único y URL pública", () => {
  it("sube con un nombre que incluye la extensión correspondiente al MIME", async () => {
    await subirFotoMinutoAMinuto(crearArchivo({ type: "image/png", size: 100 }));
    const [nombreSubido] = uploadSpy.mock.calls[0] as [string, File, unknown];
    expect(nombreSubido).toMatch(/\.png$/);
  });

  it("devuelve la URL pública obtenida de getPublicUrl", async () => {
    const url = await subirFotoMinutoAMinuto(crearArchivo({ type: "image/jpeg", size: 100 }));
    expect(url).toBe("https://supabase.example.com/storage/v1/object/public/minuto-a-minuto/foo.jpg");
  });
});

describe("subirFotoMinutoAMinuto — error de Storage", () => {
  it("lanza un mensaje apto para el usuario si Supabase devuelve error", async () => {
    uploadSpy.mockResolvedValueOnce({ error: new Error("fallo de red") });
    await expect(
      subirFotoMinutoAMinuto(crearArchivo({ type: "image/jpeg", size: 100 }))
    ).rejects.toThrow(/no se pudo subir/i);
  });
});
