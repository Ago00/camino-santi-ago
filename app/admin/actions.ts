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
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { subirFotoMinutoAMinuto, subirFotoLlegada, ErrorDeSubidaDeFoto } from "@/lib/supabase/storage";
import { verificarSesion, NOMBRE_COOKIE_SESION } from "@/lib/auth/admin-session";
import { guardarCacheProgreso, obtenerCacheProgreso } from "@/lib/progreso-cache";
import { calcularProgresoActual } from "@/lib/traza/progreso-actual";
import type { ResultadoPublicacion } from "@/lib/types";
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
 * Siembra la primera fila de `intentos` cuando la tabla está completamente
 * vacía (arranque desde cero, sin SQL manual). Distinta de `reiniciarReto()`:
 * esa exige una fila activa previa que cerrar; esta exige que NO exista
 * ninguna. Mantenerlas separadas evita que una sola función tenga dos
 * caminos con significado distinto según el estado de la BD.
 *
 * La comprobación previa (sin fila con `cerrado = false`) es defensiva, no la
 * única garantía: el índice único `intentos_activo_unico` (migración
 * 0001) es quien de verdad impide dos filas activas ante una carrera real.
 */
export async function crearPrimerIntento(): Promise<void> {
  await requerirSesion();
  const supabase = getSupabaseAdmin();

  const { data: intentoActivo, error: errorBusqueda } = await supabase
    .from("intentos")
    .select("id")
    .eq("cerrado", false)
    .maybeSingle();

  if (errorBusqueda) throw new Error("No se pudo comprobar si ya existe un intento activo.");
  if (intentoActivo) throw new Error("Ya existe un intento activo.");

  const { error: errorCreacion } = await supabase.from("intentos").insert({ fase: "antes" });
  if (errorCreacion) throw new Error("No se pudo crear el intento.");

  revalidarAdmin();
}

/**
 * Parámetros de iniciarReto() (DT-016): el modo se elige en el momento de
 * pulsar "Iniciar" y queda fijo durante toda la vida del intento (cambiarlo
 * exige "Reiniciar", ver reiniciarReto()). En modo libre exige un destino
 * (lat/lon) dentro del mismo rango físico que ya valida el schema Zod de
 * `POST /api/track` (lat -90..90, lon -180..180).
 */
export interface IniciarRetoParams {
  modo: "guiado" | "libre";
  destinoLat?: number;
  destinoLon?: number;
}

const parametrosIniciarReto = z.discriminatedUnion("modo", [
  z.object({ modo: z.literal("guiado") }),
  z.object({
    modo: z.literal("libre"),
    destinoLat: z.number().min(-90).max(90),
    destinoLon: z.number().min(-180).max(180),
  }),
]);

/**
 * antes → durante, sobre el intento activo actual. Pide confirmación en el
 * cliente (no aquí: la Server Action confía en que la UI ya confirmó).
 *
 * En modo 'libre' guarda destino_lat/destino_lon junto con la transición de
 * fase. En modo 'guiado' esas dos columnas NO se tocan (quedan en su default
 * de BD, null) — DT-016.
 *
 * Compatibilidad temporal con la migración sin aplicar (ver DEBT.md,
 * "recordatorio: aplicar supabase/migrations/0003_modo_intento.sql"): en modo
 * 'guiado' tampoco se incluye `modo` en el UPDATE (se omite del todo, no se
 * fuerza explícitamente a 'guiado'). Así "Iniciar" en modo guiado sigue
 * funcionando aunque la columna `modo` no exista todavía — no hace falta
 * tocarla, porque su default en BD ya es 'guiado' una vez la migración esté
 * aplicada. En modo 'libre' el UPDATE sí incluye `modo`/`destino_lat`/
 * `destino_lon`: si la migración no está aplicada, la escritura falla con el
 * mensaje de error ya existente más abajo — aceptado explícitamente, modo
 * libre requiere la migración.
 */
export async function iniciarReto(params: IniciarRetoParams): Promise<void> {
  await requerirSesion();

  const datos = parametrosIniciarReto.safeParse(params);
  if (!datos.success) {
    throw new Error("El modo libre exige un destino (lat/lon) válido.");
  }

  const supabase = getSupabaseAdmin();

  const { data: intentoActivo, error: errorBusqueda } = await supabase
    .from("intentos")
    .select("id, fase")
    .eq("cerrado", false)
    .maybeSingle();

  if (errorBusqueda || !intentoActivo || intentoActivo.fase !== "antes") {
    throw new Error("No hay ningún intento en fase 'antes' que iniciar.");
  }

  const cambios: {
    fase: "durante";
    started_at: string;
    modo?: "libre";
    destino_lat?: number;
    destino_lon?: number;
  } = {
    fase: "durante",
    started_at: new Date().toISOString(),
  };
  if (datos.data.modo === "libre") {
    cambios.modo = "libre";
    cambios.destino_lat = datos.data.destinoLat;
    cambios.destino_lon = datos.data.destinoLon;
  }

  const { error } = await supabase.from("intentos").update(cambios).eq("id", intentoActivo.id);

  if (error) throw new Error("No se pudo iniciar el reto.");
  revalidarAdmin();
}

/**
 * durante → llegada, sobre el intento activo actual, con el mensaje de
 * llegada editado (o el default, ya prellenado por el cliente) y, opcional,
 * la foto de llegada (DT-024, `components/admin/ModalFinalizar.tsx`).
 *
 * El `FormData` distingue TRES casos para `foto_llegada_url`, según lo que
 * envía el modal:
 * - Ni `foto` ni `quitarFoto`: NO se toca la columna (se omite del `UPDATE`).
 *   Necesario para que Retomar → Finalizar de nuevo sin adjuntar nada no
 *   borre una foto ya subida en una finalización anterior.
 * - `foto` presente (fichero no vacío): se sube a Storage y su URL
 *   reemplaza la anterior. El objeto viejo en Storage queda huérfano —
 *   aceptado, mismo criterio que `eliminarMinutoAMinuto` (DT-013).
 * - `quitarFoto === "true"` (y sin `foto`): la columna pasa a `null`.
 *
 * **Devuelve el fallo en vez de lanzarlo** (mismo motivo y patrón que
 * `crearMinutoAMinuto`, DT-017): la subida de la foto puede fallar de forma
 * esperada (formato o tamaño), y Next redacta en producción el mensaje de
 * cualquier error lanzado desde el servidor — un `throw` no dejaría ver el
 * motivo real en el modal.
 */
export async function finalizarReto(formData: FormData): Promise<ResultadoPublicacion> {
  try {
    await requerirSesion();
  } catch (error) {
    if (error instanceof SesionInvalidaError) {
      return { ok: false, mensaje: "Tu sesión de admin ha caducado. Vuelve a entrar y reintenta." };
    }
    throw error;
  }

  const mensajeLimpio = String(formData.get("mensaje") ?? "").trim();
  if (mensajeLimpio.length === 0) {
    return { ok: false, mensaje: "El mensaje de llegada no puede estar vacío." };
  }
  if (mensajeLimpio.length > 1000) {
    return { ok: false, mensaje: "El mensaje de llegada no puede superar 1000 caracteres." };
  }

  const cambios: {
    fase: "llegada";
    ended_at: string;
    mensaje_llegada: string;
    foto_llegada_url?: string | null;
  } = {
    fase: "llegada",
    ended_at: new Date().toISOString(),
    mensaje_llegada: mensajeLimpio,
  };

  const foto = formData.get("foto");
  const quitarFoto = formData.get("quitarFoto") === "true";

  if (foto instanceof File && foto.size > 0) {
    try {
      cambios.foto_llegada_url = await subirFotoLlegada(foto);
    } catch (error) {
      if (error instanceof ErrorDeSubidaDeFoto) {
        return { ok: false, mensaje: error.message };
      }
      console.error("Fallo inesperado al subir la foto de llegada", error);
      return { ok: false, mensaje: "No se pudo subir la foto. Vuelve a intentarlo." };
    }
  } else if (quitarFoto) {
    cambios.foto_llegada_url = null;
  }

  const supabase = getSupabaseAdmin();
  const { data: intentoActivo, error: errorBusqueda } = await supabase
    .from("intentos")
    .select("id, fase")
    .eq("cerrado", false)
    .maybeSingle();

  if (errorBusqueda || !intentoActivo || intentoActivo.fase !== "durante") {
    return { ok: false, mensaje: "No hay ningún intento en fase 'durante' que finalizar." };
  }

  const { error } = await supabase.from("intentos").update(cambios).eq("id", intentoActivo.id);

  if (error) return { ok: false, mensaje: "No se pudo finalizar el reto." };
  revalidarAdmin();
  return { ok: true };
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

// ---------------------------------------------------------------------------
// Minuto a minuto (DT-013)
// ---------------------------------------------------------------------------

/**
 * Crea una entrada del feed "minuto a minuto" sobre el intento activo, con
 * snapshot de la última posición conocida (puede quedar lat/lon a null si
 * todavía no hay ninguna posición registrada). La foto es opcional: si se
 * adjunta, se sube primero a Storage y solo si eso tiene éxito se inserta la
 * fila — así nunca queda una entrada con una subida a medias.
 *
 * El snapshot de posición sale, con preferencia, de la caché compartida de
 * `/api/progreso` (`lib/progreso-cache.ts`, DT-014): así la coordenada
 * guardada coincide con lo que el mapa público está mostrando en ese
 * momento, en vez de ir "por delante" de la caché de 20 s + polling de 30 s
 * del cliente. Si esa caché está vacía en esta instancia serverless
 * concreta (riesgo aceptado en DT-014: no se comparte entre instancias, y en
 * la prueba real del 2026-08-07 se observó en el 100 % de las entradas
 * publicadas, no como caso raro) **no se guarda `lat`/`lon` a null
 * directamente**: se recalcula el progreso en el momento con
 * `calcularProgresoActual` (`lib/traza/progreso-actual.ts`, la misma función
 * que usa `GET /api/progreso`), se usa su `ultimaPosicion` y el resultado se
 * deja también en la caché compartida (`guardarCacheProgreso`) para que el
 * próximo lector no tenga que recalcular (DT-019,
 * docs/tecnico/decisiones-tecnicas.md). Solo si ese recálculo también da
 * `ultimaPosicion: null` (de verdad no hay ninguna posición registrada
 * todavía para el intento) la entrada se guarda sin posición — correcto, no
 * es el bug.
 *
 * **Devuelve el fallo en vez de lanzarlo** (DT-017, única acción del panel que
 * lo hace): Next redacta en producción el mensaje de cualquier error lanzado
 * desde el servidor, así que un `throw` llegaba al composer como un texto
 * genérico con digest y Santi no veía nunca el motivo real. Es la forma que la
 * propia guía de Next recomienda para los errores esperados de un formulario.
 */
export async function crearMinutoAMinuto(formData: FormData): Promise<ResultadoPublicacion> {
  try {
    await requerirSesion();
  } catch (error) {
    if (error instanceof SesionInvalidaError) {
      return { ok: false, mensaje: "Tu sesión de admin ha caducado. Vuelve a entrar y reintenta." };
    }
    throw error;
  }

  const texto = String(formData.get("texto") ?? "").trim();
  if (texto.length === 0) {
    return { ok: false, mensaje: "El texto no puede estar vacío." };
  }
  if (texto.length > 500) {
    return { ok: false, mensaje: "El texto no puede superar 500 caracteres." };
  }

  const foto = formData.get("foto");
  let fotoUrl: string | null = null;
  if (foto instanceof File && foto.size > 0) {
    try {
      fotoUrl = await subirFotoMinutoAMinuto(foto);
    } catch (error) {
      if (error instanceof ErrorDeSubidaDeFoto) {
        return { ok: false, mensaje: error.message };
      }
      // Un fallo inesperado (env var ausente, Storage caído de forma no
      // controlada) no se enseña: podría filtrar detalles internos. Queda en
      // los logs de Vercel para poder investigarlo.
      console.error("Fallo inesperado al subir la foto del minuto a minuto", error);
      return { ok: false, mensaje: "No se pudo subir la foto. Vuelve a intentarlo." };
    }
  }

  const supabase = getSupabaseAdmin();

  const { data: intentoActivo, error: errorBusquedaIntento } = await supabase
    .from("intentos")
    .select("id")
    .eq("cerrado", false)
    .maybeSingle();

  if (errorBusquedaIntento || !intentoActivo) {
    return { ok: false, mensaje: "No hay ningún intento activo sobre el que publicar." };
  }

  // DT-019: solo se recalcula si NO hay ninguna entrada en caché — un valor
  // presente se usa tal cual aunque su `ultimaPosicion` sea null (esa null
  // ya es la respuesta correcta calculada, no "todavía no se sabe"; ver
  // DT-014, no se comprueba el TTL al leer esta caché).
  const cacheProgreso = obtenerCacheProgreso();
  let ultimaPosicion = cacheProgreso?.valor.ultimaPosicion ?? null;
  if (!cacheProgreso) {
    const progresoRecalculado = await calcularProgresoActual();
    guardarCacheProgreso(progresoRecalculado);
    ultimaPosicion = progresoRecalculado.ultimaPosicion;
  }

  const { error: errorInsercion } = await supabase.from("minuto_a_minuto").insert({
    intento_id: intentoActivo.id,
    texto,
    foto_url: fotoUrl,
    lat: ultimaPosicion?.lat ?? null,
    lon: ultimaPosicion?.lon ?? null,
  });

  if (errorInsercion) {
    return { ok: false, mensaje: "No se pudo publicar la entrada. Vuelve a intentarlo." };
  }
  revalidarAdmin();
  return { ok: true };
}

/**
 * Corrige solo el texto de una entrada existente. La foto no se puede editar
 * (DT-013): si está mal, la solución es borrar la entrada y publicarla de
 * nuevo — evita gestionar borrado/reemplazo de objetos huérfanos en Storage.
 */
export async function editarMinutoAMinuto(id: number, texto: string): Promise<void> {
  await requerirSesion();

  const textoLimpio = texto.trim();
  if (textoLimpio.length === 0) {
    throw new Error("El texto no puede estar vacío.");
  }
  if (textoLimpio.length > 500) {
    throw new Error("El texto no puede superar 500 caracteres.");
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("minuto_a_minuto")
    .update({ texto: textoLimpio, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error("No se pudo editar la entrada.");
  revalidarAdmin();
}

/**
 * Hard delete, igual que `intenciones` — sin soft-delete. No borra el objeto
 * de Storage asociado (deuda aceptada explícitamente en DT-013).
 */
export async function eliminarMinutoAMinuto(id: number): Promise<void> {
  await requerirSesion();
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("minuto_a_minuto").delete().eq("id", id);
  if (error) throw new Error("No se pudo eliminar la entrada.");
  revalidarAdmin();
}
