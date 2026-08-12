/**
 * Estado de navegación del panel admin derivado de la query string: pestaña
 * activa (?tab=), filtro de comentarios (?filtroComentarios=), granularidad
 * del gráfico de tráfico (?gran=, DT-022) y fase de tráfico mostrada
 * (?fase=, DT-023), con sus validadores. Vive fuera de components/admin/
 * (esos ficheros tienen "use client") porque Next.js 16 trata TODO lo
 * exportado de un módulo "use client" como límite cliente-servidor —
 * incluidas funciones puras sin ningún hook. `app/admin/page.tsx` (Server
 * Component) necesita llamar a estos validadores directamente, así que deben
 * vivir en un módulo sin directiva.
 */

export const TABS_ADMIN = [
  { valor: "actividad", etiqueta: "Actividad" },
  { valor: "posicion", etiqueta: "Posición" },
  { valor: "mapa", etiqueta: "Mapa" },
  { valor: "intenciones", etiqueta: "Intenciones" },
  { valor: "comentarios", etiqueta: "Comentarios" },
  { valor: "minutoaminuto", etiqueta: "Minuto a minuto" },
  { valor: "trafico", etiqueta: "Tráfico" },
  { valor: "textos", etiqueta: "Textos" },
] as const;

export type TabAdmin = (typeof TABS_ADMIN)[number]["valor"];

export function esTabValida(valor: string | null): valor is TabAdmin {
  return TABS_ADMIN.some((tab) => tab.valor === valor);
}

export type FiltroComentario = "todos" | "publicos" | "ocultos";

export function esFiltroComentarioValido(valor: string | undefined): valor is FiltroComentario {
  return valor === "todos" || valor === "publicos" || valor === "ocultos";
}

/** Granularidad del gráfico de la pestaña "Tráfico" (DT-022). Default "30m". */
export type GranularidadTrafico = "5m" | "30m" | "1h";

export function esGranularidadValida(valor: string | undefined): valor is GranularidadTrafico {
  return valor === "5m" || valor === "30m" || valor === "1h";
}

/**
 * Fase de tráfico mostrada en la pestaña "Tráfico" (DT-023): antes/durante/
 * después del intento relevante. Sin default fijo aquí — depende del estado
 * del intento (`faseTraficoPorDefecto`, `lib/trafico/fases.ts`), así que
 * `app/admin/page.tsx` solo usa este validador para saber si el valor de la
 * URL es utilizable o hay que recurrir a ese default.
 */
export type FaseTraficoTab = "antes" | "durante" | "despues";

export function esFaseTraficoValida(valor: string | undefined): valor is FaseTraficoTab {
  return valor === "antes" || valor === "durante" || valor === "despues";
}
