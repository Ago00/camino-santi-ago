/**
 * Tests de la única decisión pura de `preparar-foto.ts` (DT-017): con qué
 * fichero se acaba yendo la subida.
 *
 * El resto del módulo (decodificar en un `<img>`, dibujar en un `<canvas>`,
 * `toBlob`) es API de navegador y no existe en el entorno `node` de Vitest;
 * importar el módulo sí es seguro porque nada toca el DOM en su carga.
 */

import { describe, expect, it } from "vitest";
import { elegirFotoAEnviar } from "@/lib/imagen/preparar-foto";

function ficheroDe(bytes: number, tipo: string, nombre = "foto"): File {
  return new File([new Uint8Array(bytes)], nombre, { type: tipo });
}

describe("elegirFotoAEnviar", () => {
  it("envía el original cuando el navegador no pudo recodificar", () => {
    const original = ficheroDe(1_000, "image/png");
    expect(elegirFotoAEnviar(original, null)).toBe(original);
  });

  it("envía la versión recodificada cuando pesa menos que el original", () => {
    const original = ficheroDe(4_000_000, "image/jpeg");
    const recodificada = ficheroDe(2_000_000, "image/jpeg");
    expect(elegirFotoAEnviar(original, recodificada)).toBe(recodificada);
  });

  it("conserva el original si recodificarlo lo ha engordado", () => {
    const original = ficheroDe(150_000, "image/jpeg");
    const recodificada = ficheroDe(900_000, "image/jpeg");
    expect(elegirFotoAEnviar(original, recodificada)).toBe(original);
  });

  it("envía la recodificada aunque sea mayor si el formato del original no se acepta en Storage", () => {
    const heicDeIphone = ficheroDe(1_500_000, "image/heic");
    const recodificada = ficheroDe(2_500_000, "image/jpeg");
    expect(elegirFotoAEnviar(heicDeIphone, recodificada)).toBe(recodificada);
  });

  it("envía la recodificada cuando el original llega sin tipo MIME", () => {
    const sinTipo = ficheroDe(100, "");
    const recodificada = ficheroDe(900, "image/jpeg");
    expect(elegirFotoAEnviar(sinTipo, recodificada)).toBe(recodificada);
  });

  it("prefiere el original ante un empate exacto de tamaño, para no recomprimir sin ganancia", () => {
    const original = ficheroDe(500_000, "image/webp");
    const recodificada = ficheroDe(500_000, "image/jpeg");
    expect(elegirFotoAEnviar(original, recodificada)).toBe(original);
  });
});
