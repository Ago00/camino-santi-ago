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
  "ruta_badge",
  "hito_salida_kicker",
  "recorrido_kicker",
  "recorrido_titulo",
  "recorrido_descripcion",
  "quien_camina_kicker",
  "por_intenciones_kicker",
  "por_intenciones_titulo",
  "cierre_antes_titulo",
  "quien_camina_nombre",
  "quien_camina_subtitulo",
  "mojon_destino_kicker",
  "mojon_subtitulo",
  "mojon_origen_label",
  "distancia_restante_kicker",
  "distancia_restante_subtitulo",
  "perfil_label_distancia",
  "perfil_label_ascenso",
  "perfil_label_descenso",
  "perfil_origen_nombre",
  "perfil_destino_nombre",
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
  ruta_badge: "O Porriño → Santiago · ~100 km",
  hito_salida_kicker: "La salida · km 0",
  recorrido_kicker: "El recorrido",
  recorrido_titulo: "De O Porriño a Santiago",
  recorrido_descripcion:
    "100 km por el Camino Portugués. Este es el trazado completo — cuando arranque, lo verás pintarse en directo.",
  quien_camina_kicker: "Quién camina",
  por_intenciones_kicker: "Por qué lo hago",
  por_intenciones_titulo: "Por intenciones",
  cierre_antes_titulo: "Santiago te espera",
  quien_camina_nombre: "Santi",
  quien_camina_subtitulo: "Peregrino de una noche",
  mojon_destino_kicker: "Santiago",
  mojon_subtitulo: "te faltan para llegar",
  mojon_origen_label: "O Porriño · 0",
  distancia_restante_kicker: "Destino",
  distancia_restante_subtitulo: "en línea recta hasta el destino",
  perfil_label_distancia: "distancia",
  perfil_label_ascenso: "ascenso",
  perfil_label_descenso: "descenso",
  perfil_origen_nombre: "O Porriño",
  perfil_destino_nombre: "Santiago",
};
