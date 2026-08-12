/**
 * Estado de navegación del panel admin derivado de la query string: pestaña
 * activa (?tab=), filtro de comentarios (?filtroComentarios=) y granularidad
 * del gráfico de tráfico (?gran=, DT-022), con sus validadores. Vive fuera
 * de components/admin/ (esos ficheros tienen
 * "use client") porque Next.js 16 trata TODO lo exportado de un módulo
 * "use client" como límite cliente-servidor — incluidas funciones puras sin
 * ningún hook. `app/admin/page.tsx` (Server Component) necesita llamar a
 * estos validadores directamente, así que deben vivir en un módulo sin
 * directiva.
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
