/**
 * Límites de tamaño de las fotos del feed "minuto a minuto" (DT-017).
 *
 * El límite que de verdad manda no es nuestro: Vercel rechaza en el edge, con
 * `413` y `x-vercel-error: FUNCTION_PAYLOAD_TOO_LARGE`, cualquier petición de
 * más de ~4,5 MB — **antes** de invocar la función, así que ni una línea del
 * proyecto llega a ejecutarse y el usuario solo ve un fallo mudo. Medido
 * contra producción el 2026-08-08: 4,0 y 4,3 MB llegan a la función (401),
 * 4,5 / 5 / 6 MB devuelven 413. Ese corte no se puede subir desde la
 * aplicación (ver el comentario de `bodySizeLimit` en `next.config.ts`).
 *
 * De ahí que los dos números de este fichero estén por debajo de ese corte:
 * el límite que se aplique debe ser el nuestro, con nuestro mensaje.
 *
 * Este módulo lo comparten cliente y servidor a propósito (el compresor del
 * navegador y la validación de `lib/supabase/storage.ts`): si cada lado
 * tuviera su propia constante, podrían separarse y el cliente enviaría fotos
 * que el servidor rechaza.
 */

/**
 * Tope duro de la foto ya preparada, validado en servidor y comprobado
 * también en cliente antes de gastar la subida.
 *
 * 4 MiB ≈ 4,19 MB. Sumando el resto del `FormData` (texto de hasta 500
 * caracteres), las cabeceras de parte de `multipart/form-data` y el sobre de
 * la Server Action, el cuerpo real ronda los 4,2 MB — por debajo de los
 * 4,3 MB que se midieron llegando a la función, y con ~300 KB de margen sobre
 * el primer tamaño que se midió rechazado.
 */
export const TAMANO_MAXIMO_FOTO_BYTES = 4 * 1024 * 1024;

/**
 * Objetivo de la escalera de compresión del navegador (`escalera-compresion.ts`).
 *
 * 3,5 MiB ≈ 3,67 MB: deliberadamente por debajo de `TAMANO_MAXIMO_FOTO_BYTES`
 * para que una foto recodificada nunca quede en el filo del tope del servidor.
 * El margen absorbe que el encoder JPEG del navegador rinde peor que
 * libvips/mozjpeg (con el que se midió la tabla de DT-017): si un peldaño se
 * pasa por poco, la escalera baja al siguiente en vez de enviar algo que el
 * edge pueda cortar.
 */
export const PRESUPUESTO_COMPRESION_BYTES = 3.5 * 1024 * 1024;

/**
 * Formatos que acepta el servidor al subir a Storage.
 *
 * Vive aquí, y no en `lib/supabase/storage.ts`, porque el cliente necesita la
 * misma lista: cuando decide si enviar el fichero original en vez de su
 * versión recodificada, tiene que saber si ese original es un formato que el
 * servidor va a aceptar (un HEIC de iPhone, por ejemplo, no lo es).
 * `lib/supabase/storage.ts` no se puede importar desde el navegador — arrastra
 * el cliente `service role`.
 */
export const TIPOS_MIME_PERMITIDOS = ["image/jpeg", "image/png", "image/webp"] as const;

export type TipoMimePermitido = (typeof TIPOS_MIME_PERMITIDOS)[number];

export function esMimePermitido(tipo: string): tipo is TipoMimePermitido {
  return (TIPOS_MIME_PERMITIDOS as readonly string[]).includes(tipo);
}

/**
 * Describe un tamaño en MB para mensajes de error.
 *
 * Vive junto a las constantes para que ningún mensaje pueda contradecirlas:
 * el texto "supera el máximo (4 MB)" se deriva del propio número, no se
 * escribe a mano (el proyecto ya tiene deuda registrada por comentarios y
 * mensajes que dejaron de coincidir con el código).
 */
export function formatearMegabytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes.toLocaleString("es-ES", { maximumFractionDigits: 1 })} MB`;
}
