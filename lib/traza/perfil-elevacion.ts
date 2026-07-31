/**
 * Dominio puro del perfil de elevación de la ruta.
 *
 * El dato en sí (lib/traza/perfil-elevacion.json) se genera una vez con
 * scripts/generar-perfil-elevacion.ts y se commitea — ver DT-009 en
 * docs/tecnico/decisiones-tecnicas.md. Este módulo solo calcula el desnivel
 * a partir del array {km, m}, sin I/O.
 */

import perfil from "./perfil-elevacion.json";

export interface PuntoPerfil {
  km: number;
  m: number;
}

export interface Desnivel {
  ascensoM: number;
  descensoM: number;
}

/**
 * Suma de deltas positivos (ascenso) y deltas negativos en valor absoluto
 * (descenso) entre puntos consecutivos del perfil. Con 0 o 1 puntos no hay
 * ningún tramo que medir: devuelve {0, 0}.
 */
export function calcularDesnivel(perfil: PuntoPerfil[]): Desnivel {
  let ascensoM = 0;
  let descensoM = 0;

  for (let i = 1; i < perfil.length; i++) {
    const delta = perfil[i].m - perfil[i - 1].m;
    if (delta > 0) {
      ascensoM += delta;
    } else {
      descensoM += Math.abs(delta);
    }
  }

  return { ascensoM, descensoM };
}

export const perfilElevacion: PuntoPerfil[] = perfil;
