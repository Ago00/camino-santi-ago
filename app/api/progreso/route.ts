/**
 * GET /api/progreso — progreso público del intento activo.
 *
 * Cliente anon (lib/supabase/public.ts, sujeto a RLS): ya tiene acceso
 * legítimo al intento activo y a sus posiciones no descartadas (ver DT-007,
 * principio de mínimo privilegio).
 *
 * Bifurca según el modo del intento activo (DT-016):
 * - guiado: `prepararTraza` + `calcularProgreso` de lib/traza/proyeccion.ts
 *   (dominio ya cerrado y testeado, no se modifica) sobre
 *   `lib/traza/traza.geojson` (la traza de CÁLCULO — nunca
 *   traza-mapa.geojson, ver AGENTS.md), proyectado con `aProgresoPublico`.
 * - libre: `calcularProgresoLibre` de lib/traza/progreso-libre.ts (sin
 *   traza, distancia haversine al destino del intento).
 * En ambos casos el resultado es una rama de la unión `ProgresoPublico`.
 *
 * Caché en memoria de proceso con TTL de 15-20 s (DT-007): evita recalcular
 * en cada petición durante ráfagas de polling client-side (cada 30 s, varios
 * seguidores). No se persiste nada en BD ni se toca el esquema — la caché
 * vive únicamente mientras el proceso de Next.js esté vivo. El estado de
 * caché vive en `lib/progreso-cache.ts` (DT-014), compartido con
 * `crearMinutoAMinuto` (`app/admin/actions.ts`), que lo usa como snapshot de
 * la posición que la web pública está mostrando realmente (campo
 * `ultimaPosicion`, presente en ambas ramas de la unión).
 *
 * Rate limiting por IP (DT-011): 60 req/min. Responde 429 sin cuerpo al
 * exceder el límite, antes de consultar la caché o recalcular.
 *
 * Compatibilidad temporal con la migración sin aplicar (ver DEBT.md,
 * "recordatorio: aplicar supabase/migrations/0003_modo_intento.sql"): si las
 * columnas modo/destino_lat/destino_lon todavía no existen en la BD real, la
 * consulta del intento activo falla. Sin manejo explícito, ese error se leía
 * como "sin intento activo" (progresoVacio()) y la web pública mostraba la
 * fase "antes" aunque el intento real estuviera en "durante"/"llegada". En
 * ese caso se reintenta con el select mínimo (solo `id`) y se trata el
 * intento como modo 'guiado', el comportamiento exacto que este endpoint ya
 * tenía antes de DT-016.
 */

import { type NextRequest, NextResponse } from "next/server";
import {
  CACHE_TTL_MS,
  guardarCacheProgreso,
  limpiarCacheProgreso,
  obtenerCacheProgreso,
} from "@/lib/progreso-cache";
import { consumir, obtenerIpCliente } from "@/lib/rate-limit";
import { getSupabasePublic } from "@/lib/supabase/public";
import { cargarTrazaDeCalculo } from "@/lib/traza/cargar-traza";
import { calcularProgreso } from "@/lib/traza/proyeccion";
import { aProgresoPublico } from "@/lib/traza/progreso-publico";
import { calcularProgresoLibre } from "@/lib/traza/progreso-libre";
import type { Posicion, ProgresoPublico } from "@/lib/types";

export const runtime = "nodejs";

const LIMITE_POR_MINUTO = 60;
const VENTANA_MS = 60_000;

export { limpiarCacheProgreso };

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!consumir(obtenerIpCliente(request), LIMITE_POR_MINUTO, VENTANA_MS)) {
    return new NextResponse(null, { status: 429 });
  }

  const cache = obtenerCacheProgreso();
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cache.valor);
  }

  const progresoPublico = await calcularProgresoActual();

  guardarCacheProgreso(progresoPublico);

  return NextResponse.json(progresoPublico);
}

interface IntentoActivoConModo {
  id: number;
  modo: "guiado" | "libre";
  destino_lat: number | null;
  destino_lon: number | null;
}

async function calcularProgresoActual(): Promise<ProgresoPublico> {
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

  const { data: posiciones } = await supabase
    .from("posiciones")
    .select("*")
    .eq("intento_id", intento.id)
    .eq("descartado", false)
    .order("ts", { ascending: true });

  const historico: Posicion[] = posiciones ?? [];

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
