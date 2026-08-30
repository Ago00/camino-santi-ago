/**
 * GET /api/progreso — progreso público del intento activo.
 *
 * Cliente anon (lib/supabase/public.ts, sujeto a RLS): ya tiene acceso
 * legítimo al intento activo y a sus posiciones no descartadas (ver DT-007,
 * principio de mínimo privilegio).
 *
 * El cálculo en sí (bifurcación por modo DT-016, histórico paginado DT-018,
 * compatibilidad con la migración 0003 sin aplicar) vive en
 * `lib/traza/progreso-actual.ts` (`calcularProgresoActual`, extraída aquí
 * por DT-019 para que `crearMinutoAMinuto`, `app/admin/actions.ts`, la
 * reutilice sin duplicar lógica). Este fichero solo añade la caché y el
 * rate limiting de la ruta pública — su comportamiento externo no cambia
 * respecto a antes de la extracción.
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
 * En fase "llegada" el TTL sube a `CACHE_TTL_LLEGADA_MS` (varias horas): el
 * histórico ya no cambia, así que recalcular sobre el histórico completo de
 * `posiciones` (`obtenerTodasLasFilas`, sin límite de PostgREST) en cada
 * expiración de 20 s solo generaba egress sin ningún cambio real que
 * mostrar. La fase se resuelve con una consulta mínima aparte
 * (`obtenerFaseActual`, `lib/fase-actual.ts`) antes de decidir el TTL, para
 * no tener que pagar el histórico completo solo para saber qué TTL aplicar.
 *
 * Rate limiting por IP (DT-011): 60 req/min. Responde 429 sin cuerpo al
 * exceder el límite, antes de consultar la caché o recalcular.
 */

import { type NextRequest, NextResponse } from "next/server";
import { obtenerFaseActual } from "@/lib/fase-actual";
import {
  CACHE_TTL_LLEGADA_MS,
  CACHE_TTL_MS,
  guardarCacheProgreso,
  limpiarCacheProgreso,
  obtenerCacheProgreso,
} from "@/lib/progreso-cache";
import { consumir, obtenerIpCliente } from "@/lib/rate-limit";
import { calcularProgresoActual } from "@/lib/traza/progreso-actual";

export const runtime = "nodejs";

const LIMITE_POR_MINUTO = 60;
const VENTANA_MS = 60_000;

export { limpiarCacheProgreso };

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!consumir(obtenerIpCliente(request), LIMITE_POR_MINUTO, VENTANA_MS)) {
    return new NextResponse(null, { status: 429 });
  }

  const fase = await obtenerFaseActual();
  const ttl = fase === "llegada" ? CACHE_TTL_LLEGADA_MS : CACHE_TTL_MS;

  const cache = obtenerCacheProgreso();
  if (cache && Date.now() - cache.timestamp < ttl) {
    return NextResponse.json(cache.valor);
  }

  const progresoPublico = await calcularProgresoActual();

  guardarCacheProgreso(progresoPublico);

  return NextResponse.json(progresoPublico);
}
