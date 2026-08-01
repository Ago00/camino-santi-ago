/**
 * GET /api/fase — fase actual del intento activo, para detectar cambios
 * desde el cliente (DT-012, docs/tecnico/decisiones-tecnicas.md).
 *
 * Cliente anon (lib/supabase/public.ts, sujeto a RLS): ya tiene acceso
 * legítimo al intento activo (ver DT-007, principio de mínimo privilegio).
 *
 * Consulta mínima, sin cálculo de progreso y sin caché (la consulta ya es
 * mínima) — deliberadamente distinto de GET /api/progreso, que sí ejecuta
 * calcularProgreso() y cachea el resultado (ver DT-012 para la comparación).
 *
 * Sin intento activo, responde fase "antes" (mismo criterio que app/page.tsx,
 * `const fase = intentoActivo?.fase ?? "antes"`).
 *
 * Rate limiting por IP (DT-011): 60 req/min. Responde 429 sin cuerpo al
 * exceder el límite, mismo criterio de rechazo silencioso que el resto del
 * proyecto.
 */

import { type NextRequest, NextResponse } from "next/server";
import { consumir, obtenerIpCliente } from "@/lib/rate-limit";
import { getSupabasePublic } from "@/lib/supabase/public";
import type { Fase } from "@/lib/types";

export const runtime = "nodejs";

const LIMITE_POR_MINUTO = 60;
const VENTANA_MS = 60_000;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!consumir(obtenerIpCliente(request), LIMITE_POR_MINUTO, VENTANA_MS)) {
    return new NextResponse(null, { status: 429 });
  }

  const fase = await obtenerFaseActual();

  return NextResponse.json({ fase });
}

async function obtenerFaseActual(): Promise<Fase> {
  const supabase = getSupabasePublic();
  const { data: intentoActivo } = await supabase
    .from("intentos")
    .select("fase")
    .eq("cerrado", false)
    .maybeSingle();

  return intentoActivo?.fase ?? "antes";
}
