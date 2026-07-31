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
 */

import { NextResponse } from "next/server";
import { getSupabasePublic } from "@/lib/supabase/public";
import { cargarTrazaDeCalculo } from "@/lib/traza/cargar-traza";
import { calcularProgreso } from "@/lib/traza/proyeccion";
import { aProgresoPublico } from "@/lib/traza/progreso-publico";
import type { Posicion, ProgresoPublico } from "@/lib/types";

export const runtime = "nodejs";

const CACHE_TTL_MS = 20_000;

interface EntradaCache {
  timestamp: number;
  valor: ProgresoPublico;
}

let cache: EntradaCache | null = null;

/** Invalidable en tests: fuerza el recálculo en la siguiente petición. */
export function limpiarCacheProgreso(): void {
  cache = null;
}

export async function GET(): Promise<NextResponse> {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cache.valor);
  }

  const progresoPublico = await calcularProgresoActual();

  cache = { timestamp: Date.now(), valor: progresoPublico };

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
