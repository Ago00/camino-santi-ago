/**
 * Umbrales del dominio de progreso.
 *
 * Centralizados aquí para poder ajustarlos en caliente sin buscarlos
 * esparcidos por el código — especialmente útil si hay que afinar durante
 * el reto, con Santi andando y el reloj corriendo.
 *
 * Cada constante lleva un comentario del POR QUÉ ese valor, no del qué es
 * (el nombre ya lo dice).
 */

/**
 * El error típico de GPS urbano es 10-30 m. 50 m da margen sin clasificar
 * como desvío el ruido normal de señal entre edificios o bajo árboles.
 */
export const EN_RUTA_MAX_M = 50;

/**
 * Por encima de 250 m ya no es ruido de GPS: Santi se ha ido por otra calle
 * o ha tomado un atajo. La barra sigue proyectándose sobre el plan.
 */
export const DESVIO_MENOR_MAX_M = 250;

/**
 * Velocidad máxima plausible andando con carga + margen generoso.
 * Por encima de 15 km/h entre dos puntos consecutivos es un salto GPS,
 * no movimiento real. El punto se descarta y no contamina el odómetro.
 */
export const VELOCIDAD_MAX_KMH = 15;

/**
 * Puntos con precisión peor que 150 m son tan imprecisos que sumarlos
 * al odómetro introduciría más error que información. No se rechazan del
 * todo (la barra los usa para proyectar), pero no suman al odómetro.
 */
export const PRECISION_MAX_M = 150;
