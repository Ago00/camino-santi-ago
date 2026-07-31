/**
 * GET /api/comentarios — muro de comentarios públicos, paginado por offset.
 * POST /api/comentarios — nuevo comentario de un seguidor.
 *
 * Cliente anon (lib/supabase/public.ts, sujeto a RLS): la política de
 * `comentarios` ya limita el SELECT a `visibilidad = 'publico' AND NOT
 * oculto`, y el INSERT no puede fijar `oculto = true` (ver
 * docs/tecnico/modelo-datos.md). Principio de mínimo privilegio (DT-007):
 * no hace falta el cliente admin para ninguna de las dos operaciones.
 */

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabasePublic } from "@/lib/supabase/public";

export const runtime = "nodejs";

const TAMANO_PAGINA_POR_DEFECTO = 20;

const queryPaginacion = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(TAMANO_PAGINA_POR_DEFECTO),
});

const nuevoComentario = z.object({
  nombre: z.string().trim().min(1).max(80),
  texto: z.string().trim().min(1).max(1000),
  visibilidad: z.enum(["publico", "privado"]),
});

export async function GET(request: NextRequest): Promise<NextResponse> {
  const paginacion = queryPaginacion.safeParse({
    offset: request.nextUrl.searchParams.get("offset") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });

  if (!paginacion.success) {
    return NextResponse.json({ error: "parámetros de paginación inválidos" }, { status: 400 });
  }

  const { offset, limit } = paginacion.data;
  const supabase = getSupabasePublic();

  const { data, error } = await supabase
    .from("comentarios")
    .select("id, nombre, texto, created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: "no se pudieron cargar los comentarios" }, { status: 500 });
  }

  const comentarios = data ?? [];

  return NextResponse.json({
    comentarios,
    siguienteOffset: comentarios.length === limit ? offset + limit : null,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let bodyJson: unknown;
  try {
    bodyJson = await request.json();
  } catch {
    return NextResponse.json({ error: "cuerpo de la petición inválido" }, { status: 400 });
  }

  const parsed = nuevoComentario.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json({ error: "datos de comentario inválidos" }, { status: 400 });
  }

  const { nombre, texto, visibilidad } = parsed.data;
  const supabase = getSupabasePublic();

  // No se envía `oculto`: la política RLS de INSERT para anon ya impide
  // fijarlo a true, y el valor por defecto en BD es false.
  const { error } = await supabase.from("comentarios").insert({
    nombre,
    texto,
    visibilidad,
  });

  if (error) {
    return NextResponse.json({ error: "no se pudo guardar el comentario" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
