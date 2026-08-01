/**
 * POST /api/intenciones — nueva intención dejada por familia o amigos.
 *
 * Cliente ADMIN (service role): `intenciones` no tiene ninguna política RLS
 * para `anon` (ver docs/tecnico/modelo-datos.md — invariante de privacidad,
 * las intenciones son siempre privadas). El route handler es el único camino
 * de escritura posible desde el cliente público, con validación Zod en la
 * frontera.
 *
 * Rate limiting por IP (DT-011): 10 req/min. Responde 429 sin cuerpo al
 * exceder el límite.
 */

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { consumir, obtenerIpCliente } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const LIMITE_POR_MINUTO = 10;
const VENTANA_MS = 60_000;

const nuevaIntencion = z.object({
  texto: z.string().trim().min(1).max(1000),
  nombre: z.string().trim().min(1).max(80).optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!consumir(obtenerIpCliente(request), LIMITE_POR_MINUTO, VENTANA_MS)) {
    return new NextResponse(null, { status: 429 });
  }

  let bodyJson: unknown;
  try {
    bodyJson = await request.json();
  } catch {
    return NextResponse.json({ error: "cuerpo de la petición inválido" }, { status: 400 });
  }

  const parsed = nuevaIntencion.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json({ error: "datos de intención inválidos" }, { status: 400 });
  }

  const { texto, nombre } = parsed.data;
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("intenciones").insert({
    texto,
    nombre: nombre ?? null,
  });

  if (error) {
    return NextResponse.json({ error: "no se pudo guardar la intención" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
