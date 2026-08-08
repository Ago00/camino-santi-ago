/**
 * Tests de la lógica de decisión de la escalera de compresión (DT-017).
 *
 * El `canvas` del navegador no existe en el entorno `node` de Vitest, así que
 * la codificación real entra como parámetro: aquí se inyecta un codificador
 * falso con tamaños controlados y se verifica **qué peldaño se elige y
 * cuántas veces se codifica**, que es toda la lógica que puede equivocarse.
 */

import { describe, expect, it, vi } from "vitest";
import {
  calcularDimensionesDestino,
  recorrerEscalera,
  ESCALERA_COMPRESION,
  type Codificador,
  type Dimensiones,
  type PeldanoCompresion,
} from "@/lib/imagen/escalera-compresion";

/** Blob de un tamaño exacto, que es lo único que mira la escalera. */
function blobDe(bytes: number): Blob {
  return new Blob([new Uint8Array(bytes)]);
}

const FOTO_IPHONE: Dimensiones = { ancho: 4032, alto: 3024 };

describe("calcularDimensionesDestino", () => {
  it("escala una foto horizontal por su lado largo conservando la proporción", () => {
    expect(calcularDimensionesDestino(FOTO_IPHONE, 2016)).toEqual({ ancho: 2016, alto: 1512 });
  });

  it("escala una foto vertical por su lado largo, que es el alto", () => {
    expect(calcularDimensionesDestino({ ancho: 3024, alto: 4032 }, 2016)).toEqual({
      ancho: 1512,
      alto: 2016,
    });
  });

  it("no amplía una foto más pequeña que el límite del peldaño", () => {
    expect(calcularDimensionesDestino({ ancho: 800, alto: 600 }, 2560)).toEqual({
      ancho: 800,
      alto: 600,
    });
  });

  it("deja las dimensiones intactas cuando el lado largo coincide exactamente con el límite", () => {
    expect(calcularDimensionesDestino({ ancho: 2560, alto: 1440 }, 2560)).toEqual({
      ancho: 2560,
      alto: 1440,
    });
  });

  it("redondea al píxel entero más cercano", () => {
    expect(calcularDimensionesDestino({ ancho: 4032, alto: 3021 }, 3000)).toEqual({
      ancho: 3000,
      alto: 2248,
    });
  });

  it("nunca devuelve un lado de 0 px en una proporción extrema", () => {
    const destino = calcularDimensionesDestino({ ancho: 20000, alto: 5 }, 1600);
    expect(destino).toEqual({ ancho: 1600, alto: 1 });
  });
});

/**
 * Límite documentado del área de un `<canvas>` en Safari iOS. Por encima de
 * él, `drawImage` no pinta y `toBlob` devuelve un JPEG en blanco **sin lanzar
 * ningún error**: una foto en blanco pasaría todas las validaciones de tamaño
 * y se publicaría. Por eso la escalera acota la resolución de origen.
 */
const AREA_MAXIMA_CANVAS_IOS_PX = 16_777_216;

describe("recorrerEscalera — techo de resolución (canvas de iOS)", () => {
  it("no codifica a resolución nativa una foto de 48 MP (8064×6048)", async () => {
    const codificar = vi.fn<Codificador>(async () => blobDe(1_000_000));

    const resultado = await recorrerEscalera({ ancho: 8064, alto: 6048 }, 3_500_000, codificar);

    expect(resultado.dimensiones).not.toEqual({ ancho: 8064, alto: 6048 });
    expect(resultado.dimensiones).toEqual({ ancho: 4032, alto: 3024 });
  });

  it("mantiene toda codificación por debajo del área máxima de canvas de iOS, incluso con una foto cuadrada enorme", async () => {
    const codificar = vi.fn<Codificador>(async () => blobDe(9_000_000));

    // Cuadrada: el peor caso de área para una cota por lado largo.
    await recorrerEscalera({ ancho: 12000, alto: 12000 }, 3_500_000, codificar);

    const areas = codificar.mock.calls.map(([dimensiones]) => dimensiones.ancho * dimensiones.alto);
    expect(Math.max(...areas)).toBeLessThan(AREA_MAXIMA_CANVAS_IOS_PX);
  });

  it("deja intactas las fotos de 12 MP medidas en DT-017: la cota no cambia lo ya aprobado", async () => {
    const codificar = vi.fn<Codificador>(async () => blobDe(3_000_000));

    const resultado = await recorrerEscalera(FOTO_IPHONE, 3_500_000, codificar);

    expect(resultado.dimensiones).toEqual(FOTO_IPHONE);
    expect(codificar).toHaveBeenCalledWith(FOTO_IPHONE, 0.92);
  });
});

describe("recorrerEscalera", () => {
  it("se queda en resolución nativa y calidad alta cuando el primer peldaño ya cabe", async () => {
    const codificar = vi.fn(async () => blobDe(3_000_000));

    const resultado = await recorrerEscalera(FOTO_IPHONE, 3_500_000, codificar);

    expect(resultado.cabeEnPresupuesto).toBe(true);
    expect(resultado.dimensiones).toEqual(FOTO_IPHONE);
    expect(resultado.peldano).toEqual(ESCALERA_COMPRESION[0]);
    expect(codificar).toHaveBeenCalledTimes(1);
  });

  it("baja de calidad antes que de resolución cuando el primer peldaño se pasa", async () => {
    const codificar = vi.fn(async (_dimensiones: Dimensiones, calidad: number) =>
      blobDe(calidad === 0.92 ? 4_000_000 : 2_400_000)
    );

    const resultado = await recorrerEscalera(FOTO_IPHONE, 3_500_000, codificar);

    expect(resultado.cabeEnPresupuesto).toBe(true);
    expect(resultado.dimensiones).toEqual(FOTO_IPHONE);
    expect(resultado.peldano.calidadJpeg).toBe(0.85);
    expect(codificar).toHaveBeenCalledTimes(2);
  });

  it("reduce dimensiones solo cuando ninguna calidad a resolución nativa cabe", async () => {
    const codificar = vi.fn(async (dimensiones: Dimensiones) =>
      blobDe(dimensiones.ancho === 4032 ? 6_000_000 : 1_000_000)
    );

    const resultado = await recorrerEscalera(FOTO_IPHONE, 3_500_000, codificar);

    expect(resultado.cabeEnPresupuesto).toBe(true);
    expect(resultado.dimensiones).toEqual({ ancho: 3000, alto: 2250 });
    expect(codificar).toHaveBeenCalledTimes(3);
  });

  it("acepta el resultado que iguala exactamente el presupuesto", async () => {
    const codificar = vi.fn(async () => blobDe(3_500_000));

    const resultado = await recorrerEscalera(FOTO_IPHONE, 3_500_000, codificar);

    expect(resultado.cabeEnPresupuesto).toBe(true);
    expect(codificar).toHaveBeenCalledTimes(1);
  });

  it("devuelve el resultado más pequeño obtenido y lo marca como que no cabe si ningún peldaño entra", async () => {
    const tamanosPorLlamada = [9_000_000, 8_000_000, 7_000_000, 6_000_000, 5_000_000, 4_000_000];
    let llamada = 0;
    const codificar = vi.fn(async () => blobDe(tamanosPorLlamada[llamada++]));

    const resultado = await recorrerEscalera(FOTO_IPHONE, 3_500_000, codificar);

    expect(resultado.cabeEnPresupuesto).toBe(false);
    expect(resultado.datos.size).toBe(4_000_000);
    expect(resultado.dimensiones).toEqual({ ancho: 1600, alto: 1200 });
    expect(codificar).toHaveBeenCalledTimes(ESCALERA_COMPRESION.length);
  });

  it("devuelve el más pequeño aunque no sea el último peldaño probado", async () => {
    const tamanosPorLlamada = [9_000_000, 4_000_000, 5_000_000, 6_000_000, 7_000_000, 8_000_000];
    let llamada = 0;
    const codificar = vi.fn(async () => blobDe(tamanosPorLlamada[llamada++]));

    const resultado = await recorrerEscalera(FOTO_IPHONE, 3_500_000, codificar);

    expect(resultado.cabeEnPresupuesto).toBe(false);
    expect(resultado.datos.size).toBe(4_000_000);
  });

  it("no codifica dos veces la misma combinación de dimensiones y calidad", async () => {
    // Una foto de 1200 px de lado largo se queda en resolución nativa en todos
    // los peldaños: solo cambian las calidades distintas (0,92 / 0,85 / 0,82 / 0,80).
    const codificar = vi.fn<Codificador>(async () => blobDe(9_000_000));

    await recorrerEscalera({ ancho: 1200, alto: 900 }, 1_000, codificar);

    const combinaciones = codificar.mock.calls.map(
      ([dimensiones, calidad]) => `${dimensiones.ancho}x${dimensiones.alto}@${calidad}`
    );
    expect(new Set(combinaciones).size).toBe(combinaciones.length);
    expect(combinaciones).toEqual([
      "1200x900@0.92",
      "1200x900@0.85",
      "1200x900@0.82",
      "1200x900@0.8",
    ]);
  });

  it("propaga el error del codificador sin seguir bajando peldaños", async () => {
    const codificar = vi.fn(async () => {
      throw new Error("El navegador no pudo codificar la imagen a JPEG.");
    });

    await expect(recorrerEscalera(FOTO_IPHONE, 3_500_000, codificar)).rejects.toThrow(/JPEG/);
    expect(codificar).toHaveBeenCalledTimes(1);
  });

  it("lanza si la escalera está vacía en vez de devolver un resultado inventado", async () => {
    const codificar = vi.fn(async () => blobDe(1));
    const escaleraVacia: readonly PeldanoCompresion[] = [];

    await expect(
      recorrerEscalera(FOTO_IPHONE, 3_500_000, codificar, escaleraVacia)
    ).rejects.toThrow(/vacía/);
    expect(codificar).not.toHaveBeenCalled();
  });
});
