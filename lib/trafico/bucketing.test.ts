import { describe, expect, it } from "vitest";
import { agruparVisitasEnTramos } from "@/lib/trafico/bucketing";

describe("agruparVisitasEnTramos", () => {
  it("devuelve un único tramo con cuenta 0 cuando no hay visitas en el rango", () => {
    const desde = new Date("2026-08-12T08:00:00.000Z");
    const hasta = new Date("2026-08-12T09:00:00.000Z");

    const tramos = agruparVisitasEnTramos([], desde, hasta, "30m");

    expect(tramos).toHaveLength(3); // 08:00, 08:30, 09:00
    expect(tramos.every((t) => t.cuenta === 0)).toBe(true);
    expect(tramos[0].inicio).toEqual(desde);
  });

  it("devuelve un único tramo cuando el rango tiene duración cero (recién iniciado el intento)", () => {
    const ahora = new Date("2026-08-12T08:00:00.000Z");

    const tramos = agruparVisitasEnTramos([], ahora, ahora, "5m");

    expect(tramos).toHaveLength(1);
    expect(tramos[0].inicio).toEqual(ahora);
    expect(tramos[0].cuenta).toBe(0);
  });

  it("cuenta una única visita en el tramo al que pertenece su marca temporal", () => {
    const desde = new Date("2026-08-12T08:00:00.000Z");
    const hasta = new Date("2026-08-12T09:00:00.000Z");
    const visitas = [{ ts: "2026-08-12T08:32:00.000Z" }];

    const tramos = agruparVisitasEnTramos(visitas, desde, hasta, "30m");

    expect(tramos.map((t) => t.cuenta)).toEqual([0, 1, 0]);
  });

  it("asigna una visita exactamente en el borde de un tramo al tramo que empieza ahí, no al anterior", () => {
    const desde = new Date("2026-08-12T08:00:00.000Z");
    const hasta = new Date("2026-08-12T09:00:00.000Z");
    // Exactamente en el límite entre el tramo [08:00,08:30) y [08:30,09:00).
    const visitas = [{ ts: "2026-08-12T08:30:00.000Z" }];

    const tramos = agruparVisitasEnTramos(visitas, desde, hasta, "30m");

    expect(tramos.map((t) => t.cuenta)).toEqual([0, 1, 0]);
  });

  it("asigna una visita exactamente en el instante `hasta` al último tramo", () => {
    const desde = new Date("2026-08-12T08:00:00.000Z");
    const hasta = new Date("2026-08-12T09:00:00.000Z");
    const visitas = [{ ts: hasta.toISOString() }];

    const tramos = agruparVisitasEnTramos(visitas, desde, hasta, "30m");

    expect(tramos.at(-1)?.cuenta).toBe(1);
  });

  it("agrupa varias visitas del mismo tramo en una sola cuenta", () => {
    const desde = new Date("2026-08-12T08:00:00.000Z");
    const hasta = new Date("2026-08-12T08:30:00.000Z");
    const visitas = [
      { ts: "2026-08-12T08:01:00.000Z" },
      { ts: "2026-08-12T08:05:00.000Z" },
      { ts: "2026-08-12T08:29:59.000Z" },
    ];

    const tramos = agruparVisitasEnTramos(visitas, desde, hasta, "30m");

    expect(tramos[0].cuenta).toBe(3);
  });

  it("ignora visitas fuera del rango [desde, hasta]", () => {
    const desde = new Date("2026-08-12T08:00:00.000Z");
    const hasta = new Date("2026-08-12T09:00:00.000Z");
    const visitas = [
      { ts: "2026-08-12T07:59:00.000Z" }, // antes del rango
      // Después del último tramo devuelto: el último tramo cubre
      // [hasta, hasta + duración), así que hay que irse más allá de eso.
      { ts: "2026-08-12T10:00:00.000Z" },
    ];

    const tramos = agruparVisitasEnTramos(visitas, desde, hasta, "30m");

    expect(tramos.every((t) => t.cuenta === 0)).toBe(true);
  });

  it("produce distinto número de tramos según la granularidad sobre el mismo rango", () => {
    const desde = new Date("2026-08-12T08:00:00.000Z");
    const hasta = new Date("2026-08-12T09:00:00.000Z");

    expect(agruparVisitasEnTramos([], desde, hasta, "5m")).toHaveLength(13);
    expect(agruparVisitasEnTramos([], desde, hasta, "30m")).toHaveLength(3);
    expect(agruparVisitasEnTramos([], desde, hasta, "1h")).toHaveLength(2);
  });
});
