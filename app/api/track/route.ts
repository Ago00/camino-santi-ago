/**
 * Ingesta de posiciones GPS desde OwnTracks (modo HTTP).
 *
 * NO SE HA PROBADO CONTRA UNA BASE DE DATOS REAL (F2, ver docs/tareas/CURRENT.md).
 * No existe todavía proyecto Supabase (bloqueado por F0): este endpoint está
 * escrito y testeado con el cliente Supabase mockado (route.test.ts), pero
 * falta la verificación de integración real: aplicar la migración, poner las
 * env vars, y mandar una petición real (OwnTracks o curl) contra una BD viva.
 * Cuando F0 esté lista, esa verificación es obligatoria antes de confiar en
 * este endpoint en producción.
 *
 * Patrón reutilizado de la POC (docs/POC-tracking.md): token en query, buscar
 * intento activo, insertar, responder 200 con [] siempre — nunca dar pistas
 * al remitente sobre por qué se ignoró un punto (token malo, payload
 * inválido, sin intento activo, o punto fuera de rango son indistinguibles
 * desde fuera, salvo el único caso de 401 por token incorrecto).
 *
 * Añade las dos defensas de DT-006 que la POC no tenía:
 *   1. Comparación de token en tiempo constante (ver verificarToken()).
 *   2. Filtro de plausibilidad geográfica: rechaza puntos a más de
 *      SEPARACION_TRAZA_MAX_KM de la traza de cálculo.
 *
 * Rate limiting (DT-011): 40 req/min por token, antes de tocar BD. Responde
 * 429 sin cuerpo — mismo criterio de rechazo silencioso que el resto del
 * endpoint.
 */

import { createHash, timingSafeEqual } from "crypto";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { consumir } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cargarTrazaDeCalculo } from "@/lib/traza/cargar-traza";
import { separacionDeTrazaM } from "@/lib/traza/proyeccion";
import { SEPARACION_TRAZA_MAX_KM } from "@/lib/traza/umbrales";

export const runtime = "nodejs";

const LIMITE_PETICIONES_POR_MINUTO = 40;
const VENTANA_MS = 60_000;

// ---------------------------------------------------------------------------
// Validación del payload OwnTracks
// ---------------------------------------------------------------------------

const payloadOwnTracks = z.object({
  _type: z.literal("location"),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  // Un timestamp Unix no puede ser negativo. Sin cota superior: evita tener
  // que mantener una fecha mágica de "futuro máximo plausible".
  tst: z.number().positive(),
  batt: z.number().nullable().optional(),
  acc: z.number().nullable().optional(),
});

/** Respuesta vacía OwnTracks-compatible. Nunca da pistas sobre el motivo. */
function respuestaVacia(): NextResponse {
  return NextResponse.json([], { status: 200 });
}

// ---------------------------------------------------------------------------
// Comparación de token en tiempo constante
// ---------------------------------------------------------------------------

/**
 * Compara el token recibido contra TRACK_TOKEN sin filtrar información por
 * timing ni por longitud.
 *
 * `crypto.timingSafeEqual` exige que ambos buffers tengan la MISMA longitud
 * — si no, lanza síncronamente. Comparar longitudes antes (`if (a.length !==
 * b.length) return false`) reintroduce exactamente el timing leak que
 * `timingSafeEqual` existe para evitar: un atacante podría medir cuánto
 * tarda la respuesta y deducir la longitud del token por early-return.
 *
 * Solución: hashear ambos valores con SHA-256 antes de comparar. Un hash
 * tiene siempre longitud fija (32 bytes), así que `timingSafeEqual` nunca
 * lanza por longitud distinta, sin necesidad de ninguna rama condicional
 * dependiente del input. Es el patrón estándar para este problema (evita
 * tanto `===` de cadenas como el caso límite de longitudes distintas).
 */
function tokenEsValido(tokenRecibido: string, tokenEsperado: string): boolean {
  const hashRecibido = createHash("sha256").update(tokenRecibido).digest();
  const hashEsperado = createHash("sha256").update(tokenEsperado).digest();
  return timingSafeEqual(hashRecibido, hashEsperado);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Token de la query.
  const tokenRecibido = request.nextUrl.searchParams.get("t") ?? "";
  const tokenEsperado = process.env.TRACK_TOKEN;

  // Si el servidor no tiene TRACK_TOKEN configurado, no hay nada válido con
  // lo que comparar: se rechaza igual que un token incorrecto, sin distinguir
  // el caso (evita revelar que el servidor está mal configurado).
  if (!tokenEsperado || !tokenEsValido(tokenRecibido, tokenEsperado)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2. Rate limit por token (DT-011): tras validar el token, para no usar
  // el 429 como oráculo de qué tokens existen, y antes de tocar BD.
  if (!consumir(tokenRecibido, LIMITE_PETICIONES_POR_MINUTO, VENTANA_MS)) {
    return new NextResponse(null, { status: 429 });
  }

  // 3. Parsear el payload OwnTracks.
  let bodyJson: unknown;
  try {
    bodyJson = await request.json();
  } catch {
    return respuestaVacia();
  }

  const payload = payloadOwnTracks.safeParse(bodyJson);
  if (!payload.success) {
    // _type !== "location", o lat/lon no numéricos, o payload no parseable:
    // se ignora sin dar pistas.
    return respuestaVacia();
  }

  const { lat, lon, tst, batt, acc } = payload.data;

  // 4. Filtro de plausibilidad geográfica (DT-006, capa 1).
  const traza = cargarTrazaDeCalculo();
  const separacionM = separacionDeTrazaM(lat, lon, traza);
  const separacionMaximaM = SEPARACION_TRAZA_MAX_KM * 1000;
  if (separacionM > separacionMaximaM) {
    return respuestaVacia();
  }

  // 5. Buscar el intento activo (not cerrado).
  const supabase = getSupabaseAdmin();
  const { data: intentoActivo, error: errorIntento } = await supabase
    .from("intentos")
    .select("id")
    .eq("cerrado", false)
    .maybeSingle();

  if (errorIntento || !intentoActivo) {
    return respuestaVacia();
  }

  // 6. Insertar la posición.
  // No hay verificación de velocidad imposible aquí: eso lo hace
  // calcularProgreso() en el dominio, no la ingesta (no se duplica).
  await supabase.from("posiciones").insert({
    intento_id: intentoActivo.id,
    lat,
    lon,
    ts: new Date(tst * 1000).toISOString(),
    batt: batt ?? null,
    acc: acc ?? null,
    fuente: "app",
  });

  // 7. Responder 200 con [] siempre.
  return respuestaVacia();
}
