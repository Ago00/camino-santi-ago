import { describe, expect, it } from "vitest";
import { clasificarVisitasPorFase, faseDeVisita, faseTraficoPorDefecto, rangoDeFase } from "@/lib/trafico/fases";

const AHORA = new Date("2026-08-12T12:00:00.000Z");

describe("faseDeVisita", () => {
  it("clasifica como 'antes' cuando no hay ningún intento", () => {
    const visita = { ts: "2026-08-10T00:00:00.000Z" };
    expect(faseDeVisita(visita, null)).toBe("antes");
  });

  it("clasifica como 'antes' cuando el intento no ha empezado (sin startedAt)", () => {
    const visita = { ts: "2026-08-10T00:00:00.000Z" };
    expect(faseDeVisita(visita, { startedAt: null, endedAt: null })).toBe("antes");
  });

  it("clasifica como 'antes' una visita anterior a startedAt", () => {
    const intento = { startedAt: new Date("2026-08-12T08:00:00.000Z"), endedAt: null };
    const visita = { ts: "2026-08-12T07:59:59.000Z" };
    expect(faseDeVisita(visita, intento)).toBe("antes");
  });

  it("clasifica como 'durante' una visita exactamente en startedAt (borde incluido)", () => {
    const intento = { startedAt: new Date("2026-08-12T08:00:00.000Z"), endedAt: null };
    const visita = { ts: "2026-08-12T08:00:00.000Z" };
    expect(faseDeVisita(visita, intento)).toBe("durante");
  });

  it("clasifica como 'durante' una visita posterior a startedAt sin endedAt (intento en marcha)", () => {
    const intento = { startedAt: new Date("2026-08-12T08:00:00.000Z"), endedAt: null };
    const visita = { ts: "2026-08-12T11:00:00.000Z" };
    expect(faseDeVisita(visita, intento)).toBe("durante");
  });

  it("clasifica como 'despues' una visita exactamente en endedAt (borde pertenece a 'despues')", () => {
    const intento = {
      startedAt: new Date("2026-08-12T08:00:00.000Z"),
      endedAt: new Date("2026-08-12T10:00:00.000Z"),
    };
    const visita = { ts: "2026-08-12T10:00:00.000Z" };
    expect(faseDeVisita(visita, intento)).toBe("despues");
  });

  it("clasifica como 'durante' una visita justo antes de endedAt", () => {
    const intento = {
      startedAt: new Date("2026-08-12T08:00:00.000Z"),
      endedAt: new Date("2026-08-12T10:00:00.000Z"),
    };
    const visita = { ts: "2026-08-12T09:59:59.999Z" };
    expect(faseDeVisita(visita, intento)).toBe("durante");
  });

  it("clasifica como 'despues' una visita muy posterior a un intento cerrado", () => {
    const intento = {
      startedAt: new Date("2026-08-12T08:00:00.000Z"),
      endedAt: new Date("2026-08-12T10:00:00.000Z"),
    };
    const visita = { ts: "2026-08-12T11:30:00.000Z" };
    expect(faseDeVisita(visita, intento)).toBe("despues");
  });
});

describe("clasificarVisitasPorFase", () => {
  it("reparte las visitas en los tres cubos preservando el orden relativo", () => {
    const intento = {
      startedAt: new Date("2026-08-12T08:00:00.000Z"),
      endedAt: new Date("2026-08-12T10:00:00.000Z"),
    };
    const visitas = [
      { ts: "2026-08-12T07:00:00.000Z" }, // antes
      { ts: "2026-08-12T09:00:00.000Z" }, // durante
      { ts: "2026-08-12T11:00:00.000Z" }, // despues
      { ts: "2026-08-12T06:00:00.000Z" }, // antes
    ];

    const resultado = clasificarVisitasPorFase(visitas, intento);

    expect(resultado.antes).toEqual([visitas[0], visitas[3]]);
    expect(resultado.durante).toEqual([visitas[1]]);
    expect(resultado.despues).toEqual([visitas[2]]);
  });

  it("mete todo en 'antes' cuando no hay ningún intento nunca", () => {
    const visitas = [{ ts: "2026-08-10T00:00:00.000Z" }, { ts: "2026-08-11T00:00:00.000Z" }];

    const resultado = clasificarVisitasPorFase(visitas, null);

    expect(resultado.antes).toHaveLength(2);
    expect(resultado.durante).toHaveLength(0);
    expect(resultado.despues).toHaveLength(0);
  });
});

describe("faseTraficoPorDefecto", () => {
  it("devuelve 'antes' cuando el reto no ha empezado", () => {
    expect(faseTraficoPorDefecto(null)).toBe("antes");
    expect(faseTraficoPorDefecto({ startedAt: null, endedAt: null })).toBe("antes");
  });

  it("devuelve 'durante' cuando el intento está en marcha", () => {
    const intento = { startedAt: new Date("2026-08-12T08:00:00.000Z"), endedAt: null };
    expect(faseTraficoPorDefecto(intento)).toBe("durante");
  });

  it("devuelve 'durante' cuando el intento ya llegó (cerrado)", () => {
    const intento = {
      startedAt: new Date("2026-08-12T08:00:00.000Z"),
      endedAt: new Date("2026-08-12T10:00:00.000Z"),
    };
    expect(faseTraficoPorDefecto(intento)).toBe("durante");
  });
});

describe("rangoDeFase", () => {
  const cuentaDesde = new Date("2026-08-01T00:00:00.000Z");

  it("'antes' sin intento cubre desde cuentaDesde hasta ahora", () => {
    expect(rangoDeFase("antes", cuentaDesde, null, AHORA)).toEqual({ desde: cuentaDesde, hasta: AHORA });
  });

  it("'antes' con intento cubre desde cuentaDesde hasta startedAt", () => {
    const startedAt = new Date("2026-08-12T08:00:00.000Z");
    const intento = { startedAt, endedAt: null };
    expect(rangoDeFase("antes", cuentaDesde, intento, AHORA)).toEqual({ desde: cuentaDesde, hasta: startedAt });
  });

  it("'durante' es null cuando no hay ningún intento", () => {
    expect(rangoDeFase("durante", cuentaDesde, null, AHORA)).toBeNull();
  });

  it("'durante' es null cuando el intento no ha empezado (sin startedAt)", () => {
    expect(rangoDeFase("durante", cuentaDesde, { startedAt: null, endedAt: null }, AHORA)).toBeNull();
  });

  it("'durante' cubre desde startedAt hasta ahora si el intento sigue en marcha", () => {
    const startedAt = new Date("2026-08-12T08:00:00.000Z");
    const intento = { startedAt, endedAt: null };
    expect(rangoDeFase("durante", cuentaDesde, intento, AHORA)).toEqual({ desde: startedAt, hasta: AHORA });
  });

  it("'durante' cubre desde startedAt hasta endedAt si el intento está cerrado", () => {
    const startedAt = new Date("2026-08-12T08:00:00.000Z");
    const endedAt = new Date("2026-08-12T10:00:00.000Z");
    const intento = { startedAt, endedAt };
    expect(rangoDeFase("durante", cuentaDesde, intento, AHORA)).toEqual({ desde: startedAt, hasta: endedAt });
  });

  it("'despues' es null cuando no hay ningún intento", () => {
    expect(rangoDeFase("despues", cuentaDesde, null, AHORA)).toBeNull();
  });

  it("'despues' es null cuando el intento sigue en marcha (sin endedAt)", () => {
    const intento = { startedAt: new Date("2026-08-12T08:00:00.000Z"), endedAt: null };
    expect(rangoDeFase("despues", cuentaDesde, intento, AHORA)).toBeNull();
  });

  it("'despues' cubre desde endedAt hasta ahora cuando el intento está cerrado", () => {
    const endedAt = new Date("2026-08-12T10:00:00.000Z");
    const intento = { startedAt: new Date("2026-08-12T08:00:00.000Z"), endedAt };
    expect(rangoDeFase("despues", cuentaDesde, intento, AHORA)).toEqual({ desde: endedAt, hasta: AHORA });
  });
});
