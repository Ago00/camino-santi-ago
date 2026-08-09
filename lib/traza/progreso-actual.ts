/**
 * calcularProgresoActual(): calcula el `ProgresoPublico` del intento activo
 * en este preciso momento — consulta el intento activo (con compatibilidad
 * temporal si la migración `0003_modo_intento.sql` todavía no está aplicada,
 * ver `DEBT.md`), trae el histórico de posiciones que corresponda según el
 * modo (paginado completo en guiado, DT-018; solo la última posición en
 * libre) y delega el cálculo de dominio a `calcularProgreso`/
 * `calcularProgresoLibre`.
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
 * - Modo guiado: `calcularProgreso` necesita el histórico COMPLETO (el
 *   odómetro suma distancia real entre cada par consecutivo, y el máximo
 *   monótono se calcula sobre toda la secuencia) — se trae paginado con
 *   `obtenerTodasLasFilas` (lib/supabase/paginacion.ts), sin el corte a
 *   1000 filas de PostgREST. La proyección en sí usa ventana deslizante
 *   (lib/traza/proyeccion.ts) para que traer el histórico completo siga
 *   siendo rápido a escala de un día entero de reto.
 * - Modo libre: `calcularProgresoLibre` solo usa la posición no descartada
 *   más reciente, así que este endpoint (con polling cada 30 s) pide
 *   únicamente esa fila (`order(ts desc).limit(1)`) en vez de todo el
 *   histórico — mismo resultado, sin traer miles de filas para quedarse
 *   con una.
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

  if (intento.modo === "libre") {
    // Solo hace falta la posición no descartada más reciente (DT-018): traer
    // el histórico completo aquí sería pagar el coste de miles de filas cada
    // 30 s de polling para quedarse con una sola.
    const { data: ultimaPosicion } = await supabase
      .from("posiciones")
      .select("*")
      .eq("intento_id", intento.id)
      .eq("descartado", false)
      .order("ts", { ascending: false })
      .limit(1)
      .maybeSingle();

    const historico: Posicion[] = ultimaPosicion ? [ultimaPosicion] : [];
    const destino =
      intento.destino_lat !== null && intento.destino_lon !== null
        ? { lat: intento.destino_lat, lon: intento.destino_lon }
        : null;
    return calcularProgresoLibre(historico, destino);
  }

  // Modo guiado: calcularProgreso necesita el histórico completo (DT-018).
  const historico = await obtenerTodasLasFilas<Posicion>((desde, hasta) =>
    supabase
      .from("posiciones")
      .select("*")
      .eq("intento_id", intento.id)
      .eq("descartado", false)
      .order("ts", { ascending: true })
      .range(desde, hasta)
  );

  const traza = cargarTrazaDeCalculo();
  const progreso = calcularProgreso(historico, traza);

  return aProgresoPublico(progreso);
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
