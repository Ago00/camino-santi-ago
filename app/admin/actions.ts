"use server";

/**
 * Server Actions del panel admin. Mutan datos protegidos por la sesión de
 * admin único (DT-010).
 *
 * CADA acción verifica la sesión ella misma con `verificarSesion()`, sin
 * confiar en que `proxy.ts` ya filtró la petición. Next.js sirve las Server
 * Actions como POST a la misma ruta donde se invocan: un cambio de matcher en
 * `proxy.ts`, o un refactor que mueva una acción a otra ruta, podría dejarla
 * sin cobertura sin que nadie lo note (ver aviso de la propia doc de Next en
 * proxy.md y DT-010). No se duplica lógica de sesión: cada acción llama a
 * `requerirSesion()`, definida abajo.
 *
 * Todas usan el cliente Supabase admin (service role, bypassa RLS) — es
 * infraestructura de admin, no de acceso público.
 */

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verificarSesion, NOMBRE_COOKIE_SESION } from "@/lib/auth/admin-session";
import type { ClaveTexto } from "@/lib/textos/defaults";
import { CLAVES_TEXTOS } from "@/lib/textos/defaults";

class SesionInvalidaError extends Error {
  constructor() {
    super("Sesión de admin inválida o expirada.");
  }
}

async function requerirSesion(): Promise<void> {
  const almacenCookies = await cookies();
  const cookieSesion = almacenCookies.get(NOMBRE_COOKIE_SESION)?.value;
  if (!verificarSesion(cookieSesion)) {
    throw new SesionInvalidaError();
  }
}

function revalidarAdmin(): void {
  revalidatePath("/admin");
}

/** Borra la cookie de sesión. No requiere sesión previa válida: cerrar sesión
 * debe funcionar incluso si la cookie ya está corrupta o expirada. */
export async function cerrarSesion(): Promise<void> {
  const almacenCookies = await cookies();
  almacenCookies.delete(NOMBRE_COOKIE_SESION);
}

// ---------------------------------------------------------------------------
// Actividad
// ---------------------------------------------------------------------------

/**
 * antes → durante, sobre el intento activo actual. Pide confirmación en el
 * cliente (no aquí: la Server Action confía en que la UI ya confirmó).
 */
export async function iniciarReto(): Promise<void> {
  await requerirSesion();
  const supabase = getSupabaseAdmin();

  const { data: intentoActivo, error: errorBusqueda } = await supabase
    .from("intentos")
    .select("id, fase")
    .eq("cerrado", false)
    .maybeSingle();

  if (errorBusqueda || !intentoActivo || intentoActivo.fase !== "antes") {
    throw new Error("No hay ningún intento en fase 'antes' que iniciar.");
  }

  const { error } = await supabase
    .from("intentos")
    .update({ fase: "durante", started_at: new Date().toISOString() })
    .eq("id", intentoActivo.id);

  if (error) throw new Error("No se pudo iniciar el reto.");
  revalidarAdmin();
}

/**
 * durante → llegada, sobre el intento activo actual, con el mensaje de
 * llegada editado (o el default, ya prellenado por el cliente).
 */
export async function finalizarReto(mensaje: string): Promise<void> {
  await requerirSesion();
  const mensajeLimpio = mensaje.trim();
  if (mensajeLimpio.length === 0) {
    throw new Error("El mensaje de llegada no puede estar vacío.");
  }

  const supabase = getSupabaseAdmin();
  const { data: intentoActivo, error: errorBusqueda } = await supabase
    .from("intentos")
    .select("id, fase")
    .eq("cerrado", false)
    .maybeSingle();

  if (errorBusqueda || !intentoActivo || intentoActivo.fase !== "durante") {
    throw new Error("No hay ningún intento en fase 'durante' que finalizar.");
  }

  const { error } = await supabase
    .from("intentos")
    .update({
      fase: "llegada",
      ended_at: new Date().toISOString(),
      mensaje_llegada: mensajeLimpio,
    })
    .eq("id", intentoActivo.id);

  if (error) throw new Error("No se pudo finalizar el reto.");
  revalidarAdmin();
}

/**
 * llegada → durante, SOBRE EL MISMO intento (mismo `id`): deshace el
 * Finalizar. `ended_at` vuelve a `null`. No crea ni cierra ningún intento —
 * el histórico de posiciones queda intacto, sin discontinuidad. Reversible
 * sin más coste que otro Finalizar, así que no pide confirmación en el
 * cliente (documentado en CURRENT.md / decisiones-tecnicas.md).
 */
export async function retomarReto(): Promise<void> {
  await requerirSesion();
  const supabase = getSupabaseAdmin();

  const { data: intentoActivo, error: errorBusqueda } = await supabase
    .from("intentos")
    .select("id, fase")
    .eq("cerrado", false)
    .maybeSingle();

  if (errorBusqueda || !intentoActivo || intentoActivo.fase !== "llegada") {
    throw new Error("No hay ningún intento en fase 'llegada' que retomar.");
  }

  const { error } = await supabase
    .from("intentos")
    .update({ fase: "durante", ended_at: null })
    .eq("id", intentoActivo.id);

  if (error) throw new Error("No se pudo retomar el reto.");
  revalidarAdmin();
}

/**
 * Cierra el intento actual (`cerrado = true`, congelado para siempre, nunca
 * se borra) y abre uno nuevo en blanco, en `antes`. Disponible desde
 * `durante` (abortar en marcha) y desde `llegada` (empezar de cero). Pide
 * confirmación en el cliente — es la acción que de verdad cierra una etapa.
 */
export async function reiniciarReto(): Promise<void> {
  await requerirSesion();
  const supabase = getSupabaseAdmin();

  const { data: intentoActivo, error: errorBusqueda } = await supabase
    .from("intentos")
    .select("id")
    .eq("cerrado", false)
    .maybeSingle();

  if (errorBusqueda || !intentoActivo) {
    throw new Error("No hay ningún intento activo que reiniciar.");
  }

  const { error: errorCierre } = await supabase
    .from("intentos")
    .update({ cerrado: true })
    .eq("id", intentoActivo.id);

  if (errorCierre) throw new Error("No se pudo cerrar el intento actual.");

  const { error: errorCreacion } = await supabase.from("intentos").insert({ fase: "antes" });
  if (errorCreacion) throw new Error("No se pudo abrir un nuevo intento.");

  revalidarAdmin();
}

// ---------------------------------------------------------------------------
// Posición (DT-006 capa 2: descartar cualquier punto del histórico)
// ---------------------------------------------------------------------------

export async function descartarPosicion(id: number): Promise<void> {
  await requerirSesion();
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("posiciones").update({ descartado: true }).eq("id", id);
  if (error) throw new Error("No se pudo descartar la posición.");
  revalidarAdmin();
}

// ---------------------------------------------------------------------------
// Intenciones (hard delete: la tabla no tiene columna de soft-delete)
// ---------------------------------------------------------------------------

export async function eliminarIntencion(id: number): Promise<void> {
  await requerirSesion();
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("intenciones").delete().eq("id", id);
  if (error) throw new Error("No se pudo eliminar la intención.");
  revalidarAdmin();
}

// ---------------------------------------------------------------------------
// Comentarios
// ---------------------------------------------------------------------------

export async function ocultarComentario(id: number): Promise<void> {
  await requerirSesion();
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("comentarios").update({ oculto: true }).eq("id", id);
  if (error) throw new Error("No se pudo ocultar el comentario.");
  revalidarAdmin();
}

export async function mostrarComentario(id: number): Promise<void> {
  await requerirSesion();
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("comentarios").update({ oculto: false }).eq("id", id);
  if (error) throw new Error("No se pudo mostrar el comentario.");
  revalidarAdmin();
}

export async function eliminarComentario(id: number): Promise<void> {
  await requerirSesion();
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("comentarios").delete().eq("id", id);
  if (error) throw new Error("No se pudo eliminar el comentario.");
  revalidarAdmin();
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

function esClaveDeTexto(clave: string): clave is ClaveTexto {
  return (CLAVES_TEXTOS as readonly string[]).includes(clave);
}

export async function guardarTexto(clave: string, valor: string): Promise<void> {
  await requerirSesion();
  if (!esClaveDeTexto(clave)) {
    throw new Error(`Clave de texto desconocida: ${clave}`);
  }

  // No se envía `updated_at`: el tipo Insert de `textos` (lib/supabase/admin.ts)
  // lo omite a propósito porque la columna tiene default `now()` en BD.
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("textos").upsert({ clave, valor });

  if (error) throw new Error("No se pudo guardar el texto.");
  revalidarAdmin();
}
