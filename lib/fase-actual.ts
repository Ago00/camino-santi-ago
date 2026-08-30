/**
 * Consulta mínima (solo columna `fase`) del intento activo — sin cálculo de
 * progreso, sin caché propia. Compartida entre `GET /api/fase` (DT-012) y
 * `GET /api/progreso`, que la usa para decidir cuánto confiar en su propia
 * caché (`lib/progreso-cache.ts`): en fase "llegada" el histórico ya no
 * cambia nunca (nadie sigue mandando GPS), así que no tiene sentido
 * recalcular sobre el histórico completo en cada expiración de esa caché.
 *
 * Sin intento activo, "antes" (mismo criterio que app/page.tsx,
 * `const fase = intentoActivo?.fase ?? "antes"`).
 */

import { getSupabasePublic } from "@/lib/supabase/public";
import type { Fase } from "@/lib/types";

export async function obtenerFaseActual(): Promise<Fase> {
  const supabase = getSupabasePublic();
  const { data: intentoActivo } = await supabase
    .from("intentos")
    .select("fase")
    .eq("cerrado", false)
    .maybeSingle();

  return intentoActivo?.fase ?? "antes";
}
