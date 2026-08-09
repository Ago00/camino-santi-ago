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

/**
 * Filtro de plausibilidad geográfica en `/api/track` (DT-006, capa 1 de la
 * defensa contra el envenenamiento del ancla de progreso). Un punto a más
 * de 100 km de la traza se rechaza sin guardar, sin dar pistas al remitente.
 * Deliberadamente generoso: cubre cualquier situación real (incluido un
 * coche de apoyo puntual) y solo corta puntos absurdos o maliciosos.
 */
export const SEPARACION_TRAZA_MAX_KM = 100;

/**
 * Ventana deslizante de `calcularProgreso` (DT-018,
 * docs/tecnico/decisiones-tecnicas.md): número de segmentos de traza a cada
 * lado del índice del último punto proyectado en los que se busca primero.
 * Sin esto, cada punto del histórico proyecta contra los ~7.951 vértices
 * completos de la traza — medido: 281 s con el histórico de un día completo
 * de reto (~7.200 puntos), muy por encima de cualquier timeout de función
 * serverless. Como el histórico se procesa en orden cronológico y una
 * persona caminando no teletransporta, casi siempre basta con mirar cerca
 * de donde proyectó el punto anterior. ±30 segmentos ≈ ±417 m de corredor
 * a cada lado (medido sobre traza.geojson: separación media entre vértices
 * consecutivos ≈ 13,9 m) — margen amplio para el ruido GPS normal entre dos
 * posiciones consecutivas a cadencia de 15 s.
 */
export const VENTANA_PROYECCION_SEGMENTOS = 30;

/**
 * Umbral de distancia (metros) por encima del cual la mejor coincidencia
 * dentro de la ventana deslizante se descarta y se reintenta con un escaneo
 * completo de la traza (DT-018) — el comportamiento exacto de antes de la
 * ventana, así que nunca da un resultado peor ni distinto, solo más lento en
 * ese caso puntual. Debe quedar por ENCIMA de `DESVIO_MENOR_MAX_M` (250 m):
 * así cualquier punto en ruta o con desvío menor siempre se resuelve por
 * ventana (rápido), y solo un desvío mayor real o un hueco largo en el
 * histórico (varias horas sin señal seguidas de un salto de varios
 * kilómetros) puede disparar el escaneo completo.
 */
export const VENTANA_PROYECCION_FALLBACK_MAX_M = 300;

/**
 * Tope de seguridad (S1, endurecimiento post-revisión de Seguridad de
 * DT-018): número máximo de escaneos completos de la traza que
 * `calcularProgreso` puede pagar en una sola invocación. Sin este tope, el
 * propio mecanismo de respaldo es un vector de denegación de servicio: el
 * umbral de 300 m de `VENTANA_PROYECCION_FALLBACK_MAX_M` es tres órdenes de
 * magnitud más estricto que el filtro de plausibilidad geográfica de
 * `/api/track` (100 km, DT-006), así que alguien con el token filtrado
 * podría mandar puntos deliberadamente a más de 300 m entre sí (pero dentro
 * de esos 100 km, y a velocidad plausible con huecos de tiempo) para forzar
 * un escaneo completo por punto — el mismo coste de ~39 ms/punto que esta
 * tarea entera existe para evitar, y que además se repite en cada
 * recálculo futuro porque los puntos quedan persistidos.
 *
 * Con ~39 ms medidos por escaneo completo (DT-018), 50 fallbacks acotan el
 * peor caso a ~2 s por invocación — muy lejos de cualquier timeout
 * serverless, y muy por encima de cuántas veces se desviaría Santi de
 * verdad más de 300 m durante 30 h reales (unas pocas, no cientos). Al
 * superar el tope, los puntos restantes usan el resultado de la ventana tal
 * cual (aunque su precisión sea peor) en vez de seguir pagando el escaneo
 * completo — degradación aceptada solo bajo un histórico ya anómalo
 * (ataque activo o un desvío masivo genuino), nunca en uso normal.
 */
export const VENTANA_PROYECCION_MAX_FALLBACKS = 50;
