/**
 * Cliente Supabase con anon key — para peticiones públicas (sujetas a RLS).
 *
 * A diferencia de admin.ts, este cliente respeta las políticas RLS de
 * supabase/migrations/0001_esquema_inicial.sql: solo ve el intento activo,
 * posiciones no descartadas, comentarios públicos no ocultos y textos. Nunca
 * ve `intenciones` (sin política pública).
 *
 * NO SE HA PROBADO CONTRA UN PROYECTO SUPABASE REAL (F2, ver docs/tareas/CURRENT.md).
 *
 * Construcción perezosa (lazy) por el mismo motivo que admin.ts: las env vars
 * `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` no existen
 * todavía (no hay proyecto Supabase), y el build no puede depender de
 * secretos/config que aún no existen.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BaseDeDatos } from "@/lib/supabase/admin";

let clientePublico: SupabaseClient<BaseDeDatos> | null = null;

/**
 * Devuelve el cliente público, construyéndolo la primera vez que se llama.
 * Lanza si `NEXT_PUBLIC_SUPABASE_URL` o `NEXT_PUBLIC_SUPABASE_ANON_KEY` no
 * están definidas — pero solo en ese momento, nunca al importar el módulo.
 */
export function getSupabasePublic(): SupabaseClient<BaseDeDatos> {
  if (clientePublico) return clientePublico;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Faltan las env vars NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Este cliente necesita el proyecto Supabase configurado."
    );
  }

  clientePublico = createClient<BaseDeDatos>(url, anonKey, {
    auth: { persistSession: false },
  });

  return clientePublico;
}
