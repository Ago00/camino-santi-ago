/**
 * Tests unitarios de aProgresoPublico(). Verifica que la proyección nunca
 * arrastra los campos internos de Posicion (batt/acc/intento_id/fuente/
 * descartado) — cierra la deuda de seguridad registrada en DEBT.md.
 */

import { describe, it, expect } from "vitest";
import { aProgresoPublico } from "./progreso-publico";
import type { Posicion, Progreso } from "@/lib/types";

function posicionCompleta(overrides: Partial<Posicion> = {}): Posicion {
  return {
    id: 1,
    intento_id: 7,
    lat: 42.55,
    lon: -8.64,
    ts: "2026-09-12T10:00:00.000Z",
    batt: 42,
    acc: 8.5,
    fuente: "app",
    descartado: false,
    created_at: "2026-09-12T10:00:01.000Z",
    ...overrides,
  };
}

function progresoBase(overrides: Partial<Progreso> = {}): Progreso {
  return {
    porcentaje: 57.3,
    kmAvanzados: 59.1,
    kmRestantes: 42.7,
    odometroKm: 61.4,
    estado: "en-ruta",
    separacionM: 12.4,
    ultimaPosicion: posicionCompleta(),
    puntosDescartados: 3,
    puntoProyectado: { lat: 42.551, lon: -8.641 },
    ...overrides,
  };
}

describe("aProgresoPublico", () => {
  it("conserva las métricas de progreso agregadas sin modificarlas", () => {
    const publico = aProgresoPublico(progresoBase());

    expect(publico.porcentaje).toBe(57.3);
    expect(publico.kmAvanzados).toBe(59.1);
    expect(publico.kmRestantes).toBe(42.7);
    expect(publico.odometroKm).toBe(61.4);
    expect(publico.estado).toBe("en-ruta");
  });

  it("proyecta ultimaPosicion a solo lat/lon/ts", () => {
    const publico = aProgresoPublico(progresoBase());

    expect(publico.ultimaPosicion).toEqual({
      lat: 42.55,
      lon: -8.64,
      ts: "2026-09-12T10:00:00.000Z",
    });
  });

  it("nunca expone batt, acc, intento_id, fuente ni descartado de ultimaPosicion", () => {
    const publico = aProgresoPublico(progresoBase());
    const claves = Object.keys(publico.ultimaPosicion ?? {});

    expect(claves).not.toContain("batt");
    expect(claves).not.toContain("acc");
    expect(claves).not.toContain("intento_id");
    expect(claves).not.toContain("fuente");
    expect(claves).not.toContain("descartado");
    expect(claves.sort()).toEqual(["lat", "lon", "ts"]);
  });

  it("no expone separacionM, puntosDescartados ni puntoProyectado (internos del dominio, no del contrato público)", () => {
    const publico = aProgresoPublico(progresoBase());
    const claves = Object.keys(publico);

    expect(claves).not.toContain("separacionM");
    expect(claves).not.toContain("puntosDescartados");
    // DT-021: puntoProyectado es exclusivo del admin (lib/traza/datos-mapa-admin.ts),
    // el público nunca debe recibirlo.
    expect(claves).not.toContain("puntoProyectado");
  });

  it("devuelve ultimaPosicion null cuando el progreso no tiene ninguna posición válida", () => {
    const publico = aProgresoPublico(progresoBase({ ultimaPosicion: null }));

    expect(publico.ultimaPosicion).toBeNull();
  });

  it("marca siempre modo: 'guiado' (discriminante de la unión ProgresoPublico, DT-016)", () => {
    const publico = aProgresoPublico(progresoBase());

    expect(publico.modo).toBe("guiado");
  });
});
