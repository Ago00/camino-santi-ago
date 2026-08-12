/**
 * Textos por defecto de la web pública. Cada clave puede sobreescribirse
 * desde la tabla `textos` (edición vía panel admin, F4). F3 solo lee: si la
 * clave no existe en BD, se usa el valor de aquí — la web nunca sale en
 * blanco (ver docs/tecnico/modelo-datos.md, tabla `textos`).
 *
 * Añadir una clave nueva requiere código (hay que decidir dónde se pinta).
 * Editar el contenido de una clave existente no requiere código.
 */

export const CLAVES_TEXTOS = [
  "reto_titulo",
  "reto_descripcion",
  "quien_camina",
  "por_intenciones",
  "cierre_antes",
  "mensaje_llegada_default",
  "llegada_kicker",
  "llegada_titulo",
  "llegada_libre_kicker",
  "llegada_libre_titulo",
] as const;

export type ClaveTexto = (typeof CLAVES_TEXTOS)[number];

export const TEXTOS_POR_DEFECTO: Record<ClaveTexto, string> = {
  reto_titulo: "El reto",
  reto_descripcion:
    "Voy a caminar los últimos ~100 km del Camino Portugués sin dormir, de una sola vez (24–30 h), desde O Porriño hasta la tumba del Apóstol en Santiago. Un solo empujón, día y noche, hasta llegar.",
  quien_camina:
    "Aquí una foto mía y dos líneas de quién soy y por qué me lío a andar 100 km del tirón.",
  por_intenciones:
    "No es un reto deportivo: lo ofrezco por intenciones. Si quieres, déjame la tuya más abajo — camino también por ella. Anónima o con tu nombre, como prefieras.",
  cierre_antes:
    "Cuando empiece la marcha, aquí podrás seguirla en directo, kilómetro a kilómetro.",
  mensaje_llegada_default:
    "Gracias por acompañarme y por cada intención. Todo lo caminado queda aquí como recuerdo.",
  llegada_kicker: "Camino completado",
  llegada_titulo: "¡Ha llegado a Santiago!",
  llegada_libre_kicker: "Intento completado",
  llegada_libre_titulo: "¡Ha llegado!",
};
