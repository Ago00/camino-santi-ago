/**
 * Escalera de compresión de las fotos del "minuto a minuto" (DT-017): decide,
 * midiendo el resultado real de cada intento, la mayor calidad de imagen que
 * cabe en el presupuesto de bytes de la subida.
 *
 * Dominio puro: no toca `canvas`, `document` ni ningún API del navegador. La
 * codificación real entra como parámetro (`Codificador`), así que toda la
 * lógica de decisión se prueba en Node — el `canvas` del navegador no es
 * testeable con el entorno `node` de Vitest, pero esta lógica sí, y es donde
 * está el riesgo de equivocarse.
 *
 * Por qué una escalera y no parámetros fijos: en una foto de móvil el peso
 * está sobre todo en el encoder, no en los píxeles. Medido sobre las 4 fotos
 * reales del intento 10 (todas 4032×3024), a resolución nativa y calidad alta
 * ya se baja de 3,42 MB — recortar de entrada a 1600 px tiraría resolución
 * que no hacía falta tirar. Por eso se empieza por lo mejor y solo se baja un
 * peldaño cuando el tamaño **medido** no cabe: la tabla de DT-017 fija el
 * orden de la escalera, nunca se usa como predicción byte a byte.
 */

export type Dimensiones = {
  readonly ancho: number;
  readonly alto: number;
};

export type PeldanoCompresion = {
  /** Lado largo máximo en px. Nunca amplía: una foto menor se codifica tal cual. */
  readonly ladoLargoMaximoPx: number;
  /** Calidad JPEG (0-1) que se pide al encoder. */
  readonly calidadJpeg: number;
};

/**
 * Techo de resolución de los peldaños "a resolución nativa".
 *
 * No es una preferencia estética: **Safari en iOS limita el área del backing
 * store de un `<canvas>` a 16.777.216 px (4096×4096) y por encima de ese
 * límite no lanza ningún error** — `drawImage` no pinta nada y `toBlob`
 * devuelve un JPEG válido pero en blanco, que pasaría todas las validaciones
 * de tamaño y se publicaría. Los iPhone recientes capturan por defecto a
 * 24 MP (5712×4284) y pueden llegar a 48 MP (8064×6048), muy por encima de
 * ese techo.
 *
 * 4032 px es el lado largo de las fotos de 12 MP (4032×3024) sobre las que se
 * midió DT-017, y se elige por dos motivos a la vez:
 *   - esas fotos medidas siguen codificándose a resolución nativa, byte por
 *     byte igual que antes de introducir esta cota (4032 ≤ 4032, no se escala);
 *   - el peor caso posible de área, una imagen cuadrada, queda en
 *     4032×4032 = 16.257.024 px, por debajo del límite de iOS con margen.
 *
 * Efecto en una foto de 24 o 48 MP: se codifica a 4032×3024, exactamente la
 * resolución para la que existen las mediciones de DT-017.
 */
export const LADO_LARGO_MAXIMO_PX = 4032;

/**
 * Peldaños en orden de preferencia: primero se sacrifica calidad de encoder
 * (imperceptible en una foto de móvil vista en otro móvil) y solo después
 * resolución, que sí se nota.
 */
export const ESCALERA_COMPRESION: readonly PeldanoCompresion[] = [
  { ladoLargoMaximoPx: LADO_LARGO_MAXIMO_PX, calidadJpeg: 0.92 },
  { ladoLargoMaximoPx: LADO_LARGO_MAXIMO_PX, calidadJpeg: 0.85 },
  { ladoLargoMaximoPx: 3000, calidadJpeg: 0.85 },
  { ladoLargoMaximoPx: 2560, calidadJpeg: 0.85 },
  { ladoLargoMaximoPx: 2048, calidadJpeg: 0.82 },
  { ladoLargoMaximoPx: 1600, calidadJpeg: 0.8 },
];

export type Codificador = (dimensiones: Dimensiones, calidadJpeg: number) => Promise<Blob>;

export type ResultadoEscalera = {
  /** Primer resultado que cupo en el presupuesto o, si ninguno cupo, el más pequeño obtenido. */
  readonly datos: Blob;
  readonly dimensiones: Dimensiones;
  readonly peldano: PeldanoCompresion;
  readonly cabeEnPresupuesto: boolean;
};

/**
 * Dimensiones de destino de un peldaño, conservando la proporción original.
 * Nunca amplía: una foto ya pequeña se codifica a su tamaño nativo aunque el
 * peldaño permita más píxeles.
 */
export function calcularDimensionesDestino(
  originales: Dimensiones,
  ladoLargoMaximoPx: number
): Dimensiones {
  const ladoLargo = Math.max(originales.ancho, originales.alto);

  if (ladoLargo <= ladoLargoMaximoPx) {
    return originales;
  }

  const factor = ladoLargoMaximoPx / ladoLargo;
  return {
    // Mínimo 1 px: un canvas de 0 px de lado no se puede codificar, y una
    // proporción extrema (panorámica muy alargada) redondearía a 0 el lado corto.
    ancho: Math.max(1, Math.round(originales.ancho * factor)),
    alto: Math.max(1, Math.round(originales.alto * factor)),
  };
}

/**
 * Recorre la escalera de arriba abajo y devuelve el primer resultado cuyo
 * tamaño real cabe en `presupuestoBytes`, parando ahí (no se codifica de más:
 * cada intento cuesta CPU y batería del móvil que está andando).
 *
 * Si ningún peldaño cabe, devuelve el resultado más pequeño obtenido con
 * `cabeEnPresupuesto: false` — decidir qué hacer con él es de quien llama, que
 * es quien conoce el tope duro del servidor.
 *
 * Se omiten los peldaños que producirían exactamente la misma codificación que
 * uno ya probado (mismas dimensiones y misma calidad): ocurre con fotos
 * pequeñas, donde varios peldaños se quedan en la resolución nativa.
 */
export async function recorrerEscalera(
  dimensionesOriginales: Dimensiones,
  presupuestoBytes: number,
  codificar: Codificador,
  escalera: readonly PeldanoCompresion[] = ESCALERA_COMPRESION
): Promise<ResultadoEscalera> {
  if (escalera.length === 0) {
    throw new Error("La escalera de compresión no puede estar vacía.");
  }

  const yaCodificadas = new Set<string>();
  let masPequeno: ResultadoEscalera | null = null;

  for (const peldano of escalera) {
    const dimensiones = calcularDimensionesDestino(dimensionesOriginales, peldano.ladoLargoMaximoPx);
    const huella = `${dimensiones.ancho}x${dimensiones.alto}@${peldano.calidadJpeg}`;
    if (yaCodificadas.has(huella)) continue;
    yaCodificadas.add(huella);

    const datos = await codificar(dimensiones, peldano.calidadJpeg);

    if (datos.size <= presupuestoBytes) {
      return { datos, dimensiones, peldano, cabeEnPresupuesto: true };
    }
    if (masPequeno === null || datos.size < masPequeno.datos.size) {
      masPequeno = { datos, dimensiones, peldano, cabeEnPresupuesto: false };
    }
  }

  if (masPequeno === null) {
    // Inalcanzable: el primer peldaño nunca se omite por duplicado.
    throw new Error("La escalera de compresión no produjo ningún resultado.");
  }
  return masPequeno;
}
