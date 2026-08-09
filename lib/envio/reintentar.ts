/**
 * Reintento con espera creciente para el envío de formularios del panel admin
 * (DT-017).
 *
 * Por qué existe: el panel se usa andando por Galicia con 4G irregular; el
 * fallo típico no es que el servidor diga que no, es que la petición no llega.
 * Reintentar dos veces en segundos convierte la mayoría de esos fallos en una
 * publicación correcta sin que Santi tenga que hacer nada.
 *
 * Por qué no hay cola persistente (decisión explícita de DT-017): iOS Safari
 * no soporta Background Sync, así que ninguna web puede seguir subiendo con la
 * pantalla bloqueada. Prometer "se envía cuando haya cobertura" sería falso;
 * lo honesto es reintentar mientras la página está delante y, si aun así
 * falla, decirlo y conservar el texto y la foto.
 *
 * Dominio puro: la espera entra como parámetro, así que los tests no dependen
 * de temporizadores reales.
 */

import { esErrorReintentable } from "@/lib/envio/errores-de-envio";

/** Intentos totales, incluido el primero. */
export const INTENTOS_POR_DEFECTO = 3;
export const ESPERA_INICIAL_MS_POR_DEFECTO = 1_000;

export type OpcionesReintento = {
  readonly intentos?: number;
  readonly esperaInicialMs?: number;
  readonly esperar?: (ms: number) => Promise<void>;
  /** Se llama antes de cada reintento, para poder enseñarlo en pantalla. */
  readonly alReintentar?: (numeroDeIntento: number, esperaMs: number) => void;
};

/**
 * Espera antes del intento número `numeroDeIntento` (2 para el primer
 * reintento). Crece al doble en cada vuelta: 1 s, 2 s, 4 s… — suficiente para
 * que una celda saturada se recupere, sin que Santi se quede mirando el móvil.
 */
export function calcularEsperaMs(numeroDeIntento: number, esperaInicialMs: number): number {
  return esperaInicialMs * 2 ** (numeroDeIntento - 2);
}

const esperarConTemporizador = (ms: number): Promise<void> =>
  new Promise((resolver) => setTimeout(resolver, ms));

/**
 * Ejecuta `operacion` y la reintenta mientras falle con un error reintentable.
 * Propaga el último error si se agotan los intentos, y el error tal cual —sin
 * esperar ni reintentar— si no es reintentable.
 */
export async function ejecutarConReintentos<T>(
  operacion: () => Promise<T>,
  opciones: OpcionesReintento = {}
): Promise<T> {
  const intentos = opciones.intentos ?? INTENTOS_POR_DEFECTO;
  const esperaInicialMs = opciones.esperaInicialMs ?? ESPERA_INICIAL_MS_POR_DEFECTO;
  const esperar = opciones.esperar ?? esperarConTemporizador;

  let ultimoError: unknown;

  for (let numeroDeIntento = 1; numeroDeIntento <= intentos; numeroDeIntento++) {
    try {
      return await operacion();
    } catch (error) {
      if (!esErrorReintentable(error)) throw error;
      ultimoError = error;

      const quedanIntentos = numeroDeIntento < intentos;
      if (!quedanIntentos) break;

      const siguiente = numeroDeIntento + 1;
      const esperaMs = calcularEsperaMs(siguiente, esperaInicialMs);
      opciones.alReintentar?.(siguiente, esperaMs);
      await esperar(esperaMs);
    }
  }

  throw ultimoError;
}
