/**
 * GET /api/minuto-a-minuto — feed público del "minuto a minuto", en dos modos:
 *
 * - Carga paginada (offset/limit, como GET /api/comentarios): para la carga
 *   inicial y "cargar más".
 * - Poll incremental (despuesDeId): para detectar entradas nuevas desde el
 *   cliente sin repetir el histórico completo. Si se pasa `despuesDeId`,
 *   ignora offset/limit y devuelve solo las entradas con id mayor, con un
 *   límite propio (LIMITE_POLL) para no devolver el histórico entero si
 *   alguien manipula el parámetro.
 *
 * Contrato de respuesta consistente entre ambos modos: `{ entradas,
 * siguienteOffset }`. En modo poll `siguienteOffset` es siempre null (no
 * aplica paginación) — así el cliente parsea la respuesta con una sola
 * función sin importar el modo.
 *
 * Cliente anon (lib/supabase/public.ts, sujeto a RLS): la política de
 * `minuto_a_minuto` ya limita el SELECT a las entradas del intento activo
 * (ver supabase/migrations/0002_minuto_a_minuto.sql) — no hace falta filtrar
 * por intento_id explícitamente en el código.
 *
 * Rate limiting por IP (DT-011, mismo patrón que /api/comentarios): 60
 * req/min. Solo GET — no hay POST público, todas las escrituras son Server
 * Actions autenticadas (app/admin/actions.ts).
 */

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { consumir, obtenerIpCliente } from "@/lib/rate-limit";
import { getSupabasePublic } from "@/lib/supabase/public";

export const runtime = "nodejs";

const TAMANO_PAGINA_POR_DEFECTO = 20;
const LIMITE_POLL = 50;
const VENTANA_MS = 60_000;
const LIMITE_GET_POR_MINUTO = 60;

const CAMPOS_PUBLICOS = "id, texto, foto_url, lat, lon, created_at";

const queryFeed = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(TAMANO_PAGINA_POR_DEFECTO),
  despuesDeId: z.coerce.number().int().min(0).optional(),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!consumir(obtenerIpCliente(request), LIMITE_GET_POR_MINUTO, VENTANA_MS)) {
    return new NextResponse(null, { status: 429 });
  }

  const parsed = queryFeed.safeParse({
    offset: request.nextUrl.searchParams.get("offset") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    despuesDeId: request.nextUrl.searchParams.get("despuesDeId") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "parámetros inválidos" }, { status: 400 });
  }

  const { offset, limit, despuesDeId } = parsed.data;
  const supabase = getSupabasePublic();

  if (despuesDeId !== undefined) {
    const { data, error } = await supabase
      .from("minuto_a_minuto")
      .select(CAMPOS_PUBLICOS)
      .gt("id", despuesDeId)
      .order("created_at", { ascending: false })
      .limit(LIMITE_POLL);

    if (error) {
      return NextResponse.json({ error: "no se pudo consultar el feed" }, { status: 500 });
    }

    return NextResponse.json({ entradas: data ?? [], siguienteOffset: null });
  }

  const { data, error } = await supabase
    .from("minuto_a_minuto")
    .select(CAMPOS_PUBLICOS)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: "no se pudo cargar el feed" }, { status: 500 });
  }

  const entradas = data ?? [];

  return NextResponse.json({
    entradas,
    siguienteOffset: entradas.length === limit ? offset + limit : null,
  });
}
