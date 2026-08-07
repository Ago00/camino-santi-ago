/**
 * Tests de las Server Actions de admin: verificación de sesión obligatoria en
 * cada una (defensa independiente de proxy.ts, ver DT-010), y las
 * transiciones de fase de Actividad — en particular Retomar (mismo intento,
 * ended_at a null) vs Reiniciar (cierra y abre uno nuevo), que son la parte
 * más fácil de confundir de esta tarea.
 *
 * Mock de lib/supabase/admin (mismo patrón que app/api/track/route.test.ts) y
 * de next/headers (cookies()) y next/cache (revalidatePath()).
 *
 * `crearMinutoAMinuto` (DT-014) lee su snapshot de posición de la caché
 * compartida `lib/progreso-cache.ts` (no de `posiciones`, que ya no se
 * consulta desde esta Server Action) — se usa la implementación real del
 * módulo, escribiéndola/limpiándola directamente en cada test con
 * `guardarCacheProgreso`/`limpiarCacheProgreso`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { guardarCacheProgreso, limpiarCacheProgreso } from "@/lib/progreso-cache";
import type { ProgresoPublico } from "@/lib/types";

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
const insertMinutoAMinutoSpy = vi.fn().mockResolvedValue({ error: null });
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
      if (tabla === "posiciones") {
        // crearMinutoAMinuto ya no consulta esta tabla (DT-014): el snapshot
        // de posición sale de la caché compartida (lib/progreso-cache.ts).
        // Se mantiene el builder mínimo por si otra acción futura la usa.
        return {
          update: updateSpy,
        };
      }
      if (tabla === "comentarios") {
        return { update: updateSpy, delete: deleteSpy };
      }
      if (tabla === "intenciones") {
        return { delete: deleteSpy };
      }
      if (tabla === "textos") {
        return { upsert: upsertSpy };
      }
      if (tabla === "minuto_a_minuto") {
        return {
          insert: insertMinutoAMinutoSpy,
          update: updateSpy,
          delete: deleteSpy,
        };
      }
      throw new Error(`Tabla no mockada: ${tabla}`);
    }),
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => crearBuilderFalso()),
}));

const subirFotoSpy = vi.fn().mockResolvedValue("https://example.com/foto.jpg");
vi.mock("@/lib/supabase/storage", () => ({
  subirFotoMinutoAMinuto: (...args: unknown[]) => subirFotoSpy(...args),
}));

vi.mock("@/lib/auth/admin-session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/admin-session")>(
    "@/lib/auth/admin-session"
  );
  return actual; // usamos la implementación real de verificarSesion/crearSesion
});

const {
  crearPrimerIntento,
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
  crearMinutoAMinuto,
  editarMinutoAMinuto,
  eliminarMinutoAMinuto,
} = await import("@/app/admin/actions");
const { crearSesion } = await import("@/lib/auth/admin-session");

beforeEach(() => {
  vi.stubEnv("ADMIN_SESSION_SECRET", "secreto-de-test-largo-y-suficiente");
  cookieSesionMock = crearSesion();
  intentoActivoMock = null;
  limpiarCacheProgreso();
  updateSpy.mockClear();
  insertIntentoSpy.mockClear();
  insertMinutoAMinutoSpy.mockClear();
  deleteSpy.mockClear();
  upsertSpy.mockClear();
  subirFotoSpy.mockClear();
});

describe("verificación de sesión (defensa independiente de proxy.ts)", () => {
  it("iniciarReto lanza si no hay cookie de sesión", async () => {
    cookieSesionMock = undefined;
    await expect(iniciarReto({ modo: "guiado" })).rejects.toThrow(/sesión/i);
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

describe("Actividad — arranque desde cero (crearPrimerIntento)", () => {
  it("crea el primer intento en fase 'antes' cuando la tabla está vacía", async () => {
    intentoActivoMock = null;
    await crearPrimerIntento();

    expect(insertIntentoSpy).toHaveBeenCalledWith({ fase: "antes" });
  });

  it("lanza y no inserta una segunda fila si ya existe un intento activo (regresión del índice único)", async () => {
    intentoActivoMock = { id: 1, fase: "antes" };
    await expect(crearPrimerIntento()).rejects.toThrow(/ya existe/i);
    expect(insertIntentoSpy).not.toHaveBeenCalled();
  });

  it("crearPrimerIntento lanza si no hay cookie de sesión", async () => {
    cookieSesionMock = undefined;
    await expect(crearPrimerIntento()).rejects.toThrow(/sesión/i);
    expect(insertIntentoSpy).not.toHaveBeenCalled();
  });
});

describe("Actividad — transiciones de fase", () => {
  it("iniciarReto pasa de 'antes' a 'durante' fijando started_at (modo guiado)", async () => {
    intentoActivoMock = { id: 1, fase: "antes" };
    await iniciarReto({ modo: "guiado" });

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ fase: "durante", started_at: expect.any(String) })
    );
  });

  it("iniciarReto en modo guiado no incluye modo/destino_lat/destino_lon en el UPDATE (compatibilidad con la migración 0003 sin aplicar, DT-016)", async () => {
    intentoActivoMock = { id: 1, fase: "antes" };
    await iniciarReto({ modo: "guiado" });

    const cambios = updateSpy.mock.calls[0][0];
    expect(cambios).not.toHaveProperty("modo");
    expect(cambios).not.toHaveProperty("destino_lat");
    expect(cambios).not.toHaveProperty("destino_lon");
  });

  it("iniciarReto en modo libre guarda destino_lat/destino_lon junto con la transición de fase (DT-016)", async () => {
    intentoActivoMock = { id: 1, fase: "antes" };
    await iniciarReto({ modo: "libre", destinoLat: 42.3, destinoLon: -8.6 });

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        fase: "durante",
        modo: "libre",
        destino_lat: 42.3,
        destino_lon: -8.6,
      })
    );
  });

  it("iniciarReto en modo libre lanza sin actualizar si falta el destino", async () => {
    intentoActivoMock = { id: 1, fase: "antes" };
    await expect(iniciarReto({ modo: "libre" })).rejects.toThrow(/destino/i);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("iniciarReto en modo libre lanza sin actualizar si el destino está fuera de rango físico", async () => {
    intentoActivoMock = { id: 1, fase: "antes" };
    await expect(
      iniciarReto({ modo: "libre", destinoLat: 200, destinoLon: -8.6 })
    ).rejects.toThrow(/destino/i);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("iniciarReto lanza si el intento activo no está en fase 'antes'", async () => {
    intentoActivoMock = { id: 1, fase: "durante" };
    await expect(iniciarReto({ modo: "guiado" })).rejects.toThrow(/antes/i);
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

describe("Minuto a minuto (DT-013, snapshot de posición vía DT-014)", () => {
  function formDataConTexto(texto: string, foto?: File): FormData {
    const formData = new FormData();
    formData.set("texto", texto);
    if (foto) formData.set("foto", foto);
    return formData;
  }

  /** Progreso público de test mínimo, solo con la posición que interesa a estos tests. */
  function progresoPublicoConPosicion(
    ultimaPosicion: ProgresoPublico["ultimaPosicion"]
  ): ProgresoPublico {
    return {
      modo: "guiado",
      porcentaje: 10,
      kmAvanzados: 10,
      kmRestantes: 90,
      odometroKm: 10,
      estado: "en-ruta",
      ultimaPosicion,
    };
  }

  it("crearMinutoAMinuto inserta con el snapshot de posición de la caché compartida de /api/progreso", async () => {
    intentoActivoMock = { id: 4, fase: "durante" };
    guardarCacheProgreso(
      progresoPublicoConPosicion({ lat: 42.3, lon: -8.6, ts: "2026-08-02T10:00:00.000Z" })
    );

    await crearMinutoAMinuto(formDataConTexto("Cruzando el puente"));

    expect(insertMinutoAMinutoSpy).toHaveBeenCalledWith({
      intento_id: 4,
      texto: "Cruzando el puente",
      foto_url: null,
      lat: 42.3,
      lon: -8.6,
    });
    expect(subirFotoSpy).not.toHaveBeenCalled();
  });

  it("crearMinutoAMinuto deja lat/lon a null si la caché de progreso no tiene ultimaPosicion todavía", async () => {
    intentoActivoMock = { id: 4, fase: "durante" };
    guardarCacheProgreso(progresoPublicoConPosicion(null));

    await crearMinutoAMinuto(formDataConTexto("¡Arrancamos!"));

    expect(insertMinutoAMinutoSpy).toHaveBeenCalledWith(
      expect.objectContaining({ lat: null, lon: null })
    );
  });

  it("crearMinutoAMinuto deja lat/lon a null si la caché de progreso está vacía (sin fallback a posiciones)", async () => {
    intentoActivoMock = { id: 4, fase: "durante" };
    limpiarCacheProgreso(); // caché vacía: ya limpiada en beforeEach, explícito por claridad

    await crearMinutoAMinuto(formDataConTexto("Sin caché todavía"));

    expect(insertMinutoAMinutoSpy).toHaveBeenCalledWith(
      expect.objectContaining({ lat: null, lon: null })
    );
  });

  it("crearMinutoAMinuto usa el valor cacheado aunque esté fuera de su TTL de 20 s (no se revalida aquí)", async () => {
    intentoActivoMock = { id: 4, fase: "durante" };
    guardarCacheProgreso(
      progresoPublicoConPosicion({ lat: 42.1, lon: -8.5, ts: "2026-08-02T09:00:00.000Z" })
    );
    // No se comprueba el TTL al leer la caché desde crearMinutoAMinuto (ver
    // DT-014): basta con que exista un valor, esté o no dentro de los 20 s.
    // Se simula "tiempo transcurrido" avanzando Date.now, sin usar
    // vi.restoreAllMocks() (rompería los spies globales de este fichero).
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);

    await crearMinutoAMinuto(formDataConTexto("Sigo aquí"));

    expect(insertMinutoAMinutoSpy).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 42.1, lon: -8.5 })
    );
    dateNowSpy.mockRestore();
  });

  it("crearMinutoAMinuto sube la foto antes de insertar cuando se adjunta una", async () => {
    intentoActivoMock = { id: 4, fase: "durante" };
    const foto = new File([new Uint8Array(10)], "foto.jpg", { type: "image/jpeg" });

    await crearMinutoAMinuto(formDataConTexto("Con foto", foto));

    expect(subirFotoSpy).toHaveBeenCalledWith(foto);
    expect(insertMinutoAMinutoSpy).toHaveBeenCalledWith(
      expect.objectContaining({ foto_url: "https://example.com/foto.jpg" })
    );
  });

  it("crearMinutoAMinuto lanza sin insertar si el texto está vacío", async () => {
    intentoActivoMock = { id: 4, fase: "durante" };
    await expect(crearMinutoAMinuto(formDataConTexto("   "))).rejects.toThrow(/vacío/i);
    expect(insertMinutoAMinutoSpy).not.toHaveBeenCalled();
  });

  it("crearMinutoAMinuto lanza sin insertar si el texto supera 500 caracteres", async () => {
    intentoActivoMock = { id: 4, fase: "durante" };
    await expect(crearMinutoAMinuto(formDataConTexto("a".repeat(501)))).rejects.toThrow(/500/);
    expect(insertMinutoAMinutoSpy).not.toHaveBeenCalled();
  });

  it("crearMinutoAMinuto lanza sin insertar si no hay ningún intento activo", async () => {
    intentoActivoMock = null;
    await expect(crearMinutoAMinuto(formDataConTexto("texto"))).rejects.toThrow(/activo/i);
    expect(insertMinutoAMinutoSpy).not.toHaveBeenCalled();
  });

  it("crearMinutoAMinuto lanza si no hay cookie de sesión", async () => {
    cookieSesionMock = undefined;
    await expect(crearMinutoAMinuto(formDataConTexto("texto"))).rejects.toThrow(/sesión/i);
    expect(insertMinutoAMinutoSpy).not.toHaveBeenCalled();
  });

  it("editarMinutoAMinuto actualiza solo texto y updated_at", async () => {
    await editarMinutoAMinuto(9, "  Texto corregido  ");
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ texto: "Texto corregido", updated_at: expect.any(String) })
    );
  });

  it("editarMinutoAMinuto lanza sin actualizar con texto vacío", async () => {
    await expect(editarMinutoAMinuto(9, "   ")).rejects.toThrow(/vacío/i);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("editarMinutoAMinuto lanza sin actualizar con texto de más de 500 caracteres", async () => {
    await expect(editarMinutoAMinuto(9, "a".repeat(501))).rejects.toThrow(/500/);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("eliminarMinutoAMinuto llama a delete() (hard delete, sin tocar Storage)", async () => {
    await eliminarMinutoAMinuto(9);
    expect(deleteSpy).toHaveBeenCalled();
  });
});
