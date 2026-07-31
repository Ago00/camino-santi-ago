/**
 * Cielo-reloj: tinte cosmético del mapa según la hora real del sistema.
 *
 * Dominio puro: sin I/O, sin `Date.now()` implícito (la fecha entra como
 * parámetro). Franjas fijas, sin cálculo astronómico (supuesto asumido y
 * aprobado en docs/tareas/CURRENT.md):
 *   día       08:00–20:00
 *   atardecer 20:00–21:30
 *   noche     21:30–06:00
 *   amanecer  06:00–08:00
 */

export type BandaHoraria = "dia" | "atardecer" | "noche" | "amanecer";

const MINUTOS_INICIO_DIA = 8 * 60;
const MINUTOS_INICIO_ATARDECER = 20 * 60;
const MINUTOS_INICIO_NOCHE = 21 * 60 + 30;
const MINUTOS_INICIO_AMANECER = 6 * 60;

/** Devuelve la banda horaria cosmética correspondiente a la hora local de `fecha`. */
export function bandaHoraria(fecha: Date): BandaHoraria {
  const minutos = fecha.getHours() * 60 + fecha.getMinutes();

  if (minutos >= MINUTOS_INICIO_DIA && minutos < MINUTOS_INICIO_ATARDECER) {
    return "dia";
  }
  if (minutos >= MINUTOS_INICIO_ATARDECER && minutos < MINUTOS_INICIO_NOCHE) {
    return "atardecer";
  }
  if (minutos >= MINUTOS_INICIO_AMANECER && minutos < MINUTOS_INICIO_DIA) {
    return "amanecer";
  }
  // Resto: 21:30–24:00 y 00:00–06:00
  return "noche";
}
