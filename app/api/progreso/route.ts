/**
 * GET /api/progreso — progreso público del intento activo.
 *
 * Cliente anon (lib/supabase/public.ts, sujeto a RLS): ya tiene acceso
 * legítimo al intento activo y a sus posiciones no descartadas (ver DT-007,
 * principio de mínimo privilegio).
 *
 * Usa `prepararTraza` + `calcularProgreso` de lib/traza/proyeccion.ts (dominio
 * ya cerrado y testeado, no se modifica) sobre `lib/traza/traza.geojson` (la
 * traza de CÁLCULO — nunca traza-mapa.geojson, ver AGENTS.md). Proyecta el
 * resultado a `ProgresoPublico` antes de responder.
 *
 * Caché en memoria de proceso con TTL de 15-20 s (DT-007): evita recalcular
 * calcularProgreso() en cada petición durante ráfagas de polling client-side
 * (cada 30 s, varios seguidores). No se persiste nada en BD ni se toca el
 * esquema — la caché vive únicamente mientras el proceso de Next.js esté vivo.
 * El estado de caché vive en `lib/progreso-cache.ts` (DT-014), compartido con
 * `crearMinutoAMinuto` (`app/admin/actions.ts`), que lo usa como snapshot de
 * la posición que la web pública está mostrando realmente.
 *
 * Rate limiting por IP (DT-011): 60 req/min. Responde 429 sin cuerpo al
 * exceder el límite, antes de consultar la caché o recalcular.
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

async function calcularProgresoActual(): Promise<ProgresoPublico> {
  const supabase = getSupabasePublic();

  const { data: intentoActivo } = await supabase
    .from("intentos")
    .select("id")
    .eq("cerrado", false)
    .maybeSingle();

  if (!intentoActivo) {
    return progresoVacio();
  }

  const { data: posiciones } = await supabase
    .from("posiciones")
    .select("*")
    .eq("intento_id", intentoActivo.id)
    .eq("descartado", false)
    .order("ts", { ascending: true });

  const historico: Posicion[] = posiciones ?? [];
  const traza = cargarTrazaDeCalculo();
  const progreso = calcularProgreso(historico, traza);

  return aProgresoPublico(progreso);
}

function progresoVacio(): ProgresoPublico {
  const traza = cargarTrazaDeCalculo();
  return aProgresoPublico(calcularProgreso([], traza));
}
