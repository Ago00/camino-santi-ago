/**
 * calcularProgresoActual(): calcula el `ProgresoPublico` del intento activo
 * en este preciso momento — consulta el intento activo (con compatibilidad
 * temporal si la migración `0003_modo_intento.sql` todavía no está aplicada,
 * ver `DEBT.md`), trae el histórico completo de posiciones (paginado, DT-018;
 * ambos modos desde CURRENT.md/DT-020 — ver nota de cierre de DT-018 en
 * docs/tecnico/decisiones-tecnicas.md) y delega el cálculo de dominio a
 * `calcularProgreso`/`calcularProgresoLibre`.
 *
 * Extraída de `app/api/progreso/route.ts` (DT-019,
 * docs/tecnico/decisiones-tecnicas.md) para que `GET /api/progreso` y
 * `crearMinutoAMinuto` (`app/admin/actions.ts`) compartan exactamente la
 * misma lógica sin duplicarla. `route.ts` no cambia de comportamiento — solo
 * pasa a importar esta función en vez de definirla. `crearMinutoAMinuto` la
 * usa como camino de respaldo cuando la caché compartida
 * (`lib/progreso-cache.ts`, DT-007/DT-014) está vacía en la instancia
 * serverless que atiende la publicación: en vez de guardar `lat`/`lon` a
 * `null` directamente, recalcula con esta misma función — así la posición
 * guardada en el feed coincide siempre con "la última posición enviada y
 * pintada" (el mismo objetivo de DT-014), incluso en el camino de respaldo,
 * nunca con una lectura en bruto de `posiciones` que podría no ser la que el
 * dominio considera válida (en modo guiado, `calcularProgreso` puede
 * descartar el último punto por velocidad implícita imposible).
 *
 * Sin caché propia: no lee ni escribe `lib/progreso-cache.ts` — eso lo
 * decide quien llama (`route.ts` siempre; `crearMinutoAMinuto` solo si la
 * caché estaba vacía).
 */

import { getSupabasePublic } from "@/lib/supabase/public";
import { obtenerTodasLasFilas } from "@/lib/supabase/paginacion";
import { cargarTrazaDeCalculo } from "@/lib/traza/cargar-traza";
import { calcularProgreso } from "@/lib/traza/proyeccion";
import { aProgresoPublico } from "@/lib/traza/progreso-publico";
import { calcularProgresoLibre } from "@/lib/traza/progreso-libre";
import type { Posicion, ProgresoPublico } from "@/lib/types";

interface IntentoActivoConModo {
  id: number;
  modo: "guiado" | "libre";
  destino_lat: number | null;
  destino_lon: number | null;
}

/**
 * Compatibilidad temporal con la migración sin aplicar (ver DEBT.md,
 * "recordatorio: aplicar supabase/migrations/0003_modo_intento.sql"): si las
 * columnas modo/destino_lat/destino_lon todavía no existen en la BD real, la
 * consulta del intento activo falla. Sin manejo explícito, ese error se leía
 * como "sin intento activo" (progresoVacio()) y la web pública mostraba la
 * fase "antes" aunque el intento real estuviera en "durante"/"llegada". En
 * ese caso se reintenta con el select mínimo (solo `id`) y se trata el
 * intento como modo 'guiado', el comportamiento exacto que este endpoint ya
 * tenía antes de DT-016.
 *
 * Histórico de posiciones (DT-018, docs/tecnico/decisiones-tecnicas.md):
 * ambos modos necesitan el histórico COMPLETO, paginado con
 * `obtenerTodasLasFilas` (lib/supabase/paginacion.ts, tope de seguridad de
 * 50.000 filas), sin el corte a 1000 filas de PostgREST.
 * - Modo guiado: `calcularProgreso` lo necesitaba desde siempre — el
 *   odómetro suma distancia real entre cada par consecutivo, y el máximo
 *   monótono se calcula sobre toda la secuencia. La proyección en sí usa
 *   ventana deslizante (lib/traza/proyeccion.ts) para que traer el
 *   histórico completo siga siendo rápido a escala de un día entero de reto.
 * - Modo libre: hasta CURRENT.md/DT-020, `calcularProgresoLibre` solo usaba
 *   la posición más reciente, así que este endpoint (con polling cada 30 s)
 *   pedía únicamente esa fila (`order(ts desc).limit(1)`) — optimización de
 *   DT-018. Desde que `calcularProgresoLibre` también calcula `odometroKm`
 *   (suma de tramos entre posiciones consecutivas), esa premisa dejó de ser
 *   cierta: con un histórico de una sola fila el odómetro devuelto en cada
 *   poll era siempre 0, aunque la carga inicial de página (con el histórico
 *   completo, `app/page.tsx`) mostrara el valor correcto — revertido a pedir
 *   el histórico completo, igual que modo guiado. Ver la nota de cierre de
 *   DT-018 en docs/tecnico/decisiones-tecnicas.md: el coste adicional es
 *   solo de lectura/paginación (no hay ventana deslizante ni proyección
 *   sobre traza en modo libre — `calcularProgresoLibre` es O(n) trivial,
 *   sin relación con el vector de denegación de servicio que motivó S1/S2),
 *   y queda acotado por el mismo tope de `obtenerTodasLasFilas` y por la
 *   misma caché compartida TTL 20 s que ya paga modo guiado
 *   (`lib/progreso-cache.ts`, DT-007).
 */
export async function calcularProgresoActual(): Promise<ProgresoPublico> {
  const supabase = getSupabasePublic();

  const { data: intentoActivo, error: errorIntento } = await supabase
    .from("intentos")
    .select("id, modo, destino_lat, destino_lon")
    .eq("cerrado", false)
    .maybeSingle();

  const intento: IntentoActivoConModo | null = errorIntento
    ? await obtenerIntentoActivoModoGuiado(supabase)
    : intentoActivo;

  if (!intento) {
    return progresoVacio();
  }

  const historico = await obtenerHistoricoCompleto(supabase, intento.id);

  if (intento.modo === "libre") {
    const destino =
      intento.destino_lat !== null && intento.destino_lon !== null
        ? { lat: intento.destino_lat, lon: intento.destino_lon }
        : null;
    return calcularProgresoLibre(historico, destino);
  }

  const traza = cargarTrazaDeCalculo();
  const progreso = calcularProgreso(historico, traza);

  return aProgresoPublico(progreso);
}

/**
 * Histórico completo de posiciones no descartadas del intento, ascendente
 * por `ts` (DT-018) — usado por ambos modos desde CURRENT.md/DT-020 (antes,
 * modo libre solo pedía la última posición; ver docstring de arriba y la
 * nota de cierre de DT-018).
 */
async function obtenerHistoricoCompleto(
  supabase: ReturnType<typeof getSupabasePublic>,
  intentoId: number
): Promise<Posicion[]> {
  return obtenerTodasLasFilas<Posicion>((desde, hasta) =>
    supabase
      .from("posiciones")
      .select("*")
      .eq("intento_id", intentoId)
      .eq("descartado", false)
      .order("ts", { ascending: true })
      .range(desde, hasta)
  );
}

/**
 * Compatibilidad temporal: reintenta con el select mínimo (solo `id`) cuando
 * la consulta con `modo`/`destino_lat`/`destino_lon` falla por columnas
 * inexistentes, y trata el intento como modo 'guiado' sin destino.
 */
async function obtenerIntentoActivoModoGuiado(
  supabase: ReturnType<typeof getSupabasePublic>
): Promise<IntentoActivoConModo | null> {
  const { data } = await supabase
    .from("intentos")
    .select("id")
    .eq("cerrado", false)
    .maybeSingle();

  return data ? { id: data.id, modo: "guiado", destino_lat: null, destino_lon: null } : null;
}

function progresoVacio(): ProgresoPublico {
  const traza = cargarTrazaDeCalculo();
  return aProgresoPublico(calcularProgreso([], traza));
}
