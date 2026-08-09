import { describe, expect, it } from "vitest";
import { calcularRitmoMedioIntento, calcularTiempoEnMarchaIntento } from "@/lib/ritmo";

describe("calcularRitmoMedioIntento", () => {
  it("calcula el ritmo medio como odómetro entre horas transcurridas hasta el final indicado", () => {
    const inicio = "2026-08-01T06:00:00.000Z";
    const final = "2026-08-01T16:00:00.000Z"; // 10 horas
    expect(calcularRitmoMedioIntento(50, inicio, final)).toBe("5,0");
  });

  it("acepta un Date como instante final, no solo un string ISO", () => {
    const inicio = "2026-08-01T06:00:00.000Z";
    const final = new Date("2026-08-01T08:00:00.000Z"); // 2 horas
    expect(calcularRitmoMedioIntento(10, inicio, final)).toBe("5,0");
  });

  it("devuelve — si no hay instante de inicio", () => {
    expect(calcularRitmoMedioIntento(50, null, "2026-08-01T16:00:00.000Z")).toBe("—");
  });

  it("devuelve — si no hay instante final (intento sin cerrar)", () => {
    expect(calcularRitmoMedioIntento(50, "2026-08-01T06:00:00.000Z", null)).toBe("—");
  });

  it("devuelve — si el instante final es anterior o igual al de inicio (reloj inconsistente)", () => {
    const mismo = "2026-08-01T06:00:00.000Z";
    expect(calcularRitmoMedioIntento(50, mismo, mismo)).toBe("—");
    expect(calcularRitmoMedioIntento(50, "2026-08-01T06:00:00.000Z", "2026-08-01T05:00:00.000Z")).toBe("—");
  });

  it("formatea con una cifra decimal usando coma como separador (es-ES)", () => {
    const inicio = "2026-08-01T00:00:00.000Z";
    const final = "2026-08-01T03:00:00.000Z"; // 3 horas
    expect(calcularRitmoMedioIntento(10, inicio, final)).toBe("3,3");
  });

  it("devuelve 0,0 si el odómetro es cero", () => {
    const inicio = "2026-08-01T00:00:00.000Z";
    const final = "2026-08-01T02:00:00.000Z";
    expect(calcularRitmoMedioIntento(0, inicio, final)).toBe("0,0");
  });
});

describe("calcularTiempoEnMarchaIntento", () => {
  it("formatea el tiempo transcurrido como H:MM hasta el instante final indicado", () => {
    const inicio = "2026-08-01T06:00:00.000Z";
    const final = "2026-08-01T16:30:00.000Z"; // 10 h 30 min
    expect(calcularTiempoEnMarchaIntento(inicio, final)).toBe("10:30");
  });

  it("acepta un Date como instante final, no solo un string ISO", () => {
    const inicio = "2026-08-01T06:00:00.000Z";
    const final = new Date("2026-08-01T08:15:00.000Z"); // 2 h 15 min
    expect(calcularTiempoEnMarchaIntento(inicio, final)).toBe("2:15");
  });

  it("devuelve — si no hay instante de inicio", () => {
    expect(calcularTiempoEnMarchaIntento(null, "2026-08-01T16:00:00.000Z")).toBe("—");
  });

  it("devuelve — si no hay instante final (intento sin cerrar y sin referencia GPS)", () => {
    expect(calcularTiempoEnMarchaIntento("2026-08-01T06:00:00.000Z", null)).toBe("—");
  });

  it("devuelve — si el instante final es anterior o igual al de inicio (reloj inconsistente)", () => {
    const mismo = "2026-08-01T06:00:00.000Z";
    expect(calcularTiempoEnMarchaIntento(mismo, mismo)).toBe("—");
    expect(calcularTiempoEnMarchaIntento("2026-08-01T06:00:00.000Z", "2026-08-01T05:00:00.000Z")).toBe("—");
  });

  it("no añade cero a la izquierda en las horas, pero sí en los minutos", () => {
    const inicio = "2026-08-01T00:00:00.000Z";
    const final = "2026-08-01T00:05:00.000Z"; // 5 minutos
    expect(calcularTiempoEnMarchaIntento(inicio, final)).toBe("0:05");
  });

  it("trunca los minutos (no redondea) igual que el patrón previo de ModoDurante.tsx", () => {
    const inicio = "2026-08-01T00:00:00.000Z";
    const final = "2026-08-01T00:01:59.000Z"; // 1 min 59 s → 1 min, no 2
    expect(calcularTiempoEnMarchaIntento(inicio, final)).toBe("0:01");
  });
});
