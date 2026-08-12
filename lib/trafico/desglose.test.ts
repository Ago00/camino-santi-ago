import { describe, expect, it } from "vitest";
import { agruparPorOrigen, agruparPorRuta } from "@/lib/trafico/desglose";

describe("agruparPorRuta", () => {
  it("devuelve un array vacío sin visitas", () => {
    expect(agruparPorRuta([])).toEqual([]);
  });

  it("agrupa y ordena por cuenta descendente", () => {
    const visitas = [
      { ruta: "/", referer: null },
      { ruta: "/", referer: null },
      { ruta: "/otra", referer: null },
    ];

    expect(agruparPorRuta(visitas)).toEqual([
      { ruta: "/", cuenta: 2 },
      { ruta: "/otra", cuenta: 1 },
    ]);
  });
});

describe("agruparPorOrigen", () => {
  it("agrupa las visitas sin referer como 'Directo'", () => {
    const visitas = [
      { ruta: "/", referer: null },
      { ruta: "/", referer: null },
    ];

    expect(agruparPorOrigen(visitas)).toEqual([{ origen: "Directo", cuenta: 2 }]);
  });

  it("agrupa por dominio del referer, ignorando la ruta y el protocolo", () => {
    const visitas = [
      { ruta: "/", referer: "https://ejemplo.com/pagina-uno" },
      { ruta: "/", referer: "http://ejemplo.com/otra-pagina" },
      { ruta: "/", referer: "https://otro-sitio.com/" },
    ];

    expect(agruparPorOrigen(visitas)).toEqual([
      { origen: "ejemplo.com", cuenta: 2 },
      { origen: "otro-sitio.com", cuenta: 1 },
    ]);
  });

  it("cuenta un referer que no es una URL válida en vez de perder la visita", () => {
    const visitas = [{ ruta: "/", referer: "no-es-una-url" }];

    expect(agruparPorOrigen(visitas)).toEqual([{ origen: "no-es-una-url", cuenta: 1 }]);
  });
});
