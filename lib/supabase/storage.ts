/**
 * Subida de fotos a Supabase Storage: las del feed "minuto a minuto"
 * (`subirFotoMinutoAMinuto`) y la foto opcional de la pantalla de llegada
 * (`subirFotoLlegada`, DT-024) — ambas al mismo bucket público
 * `minuto-a-minuto` (ver supabase/migrations/0002_minuto_a_minuto.sql), con
 * un prefijo distinto en el nombre del objeto para no colisionar.
 *
 * Solo se llama desde Server Actions (app/admin/actions.ts) con el cliente
 * service role, que bypassa RLS de Storage igual que bypassa RLS de BD — no
 * hace falta ninguna política de Storage para `insert`. Validación de tipo
 * MIME y tamaño aquí, en el borde del sistema, antes de que cualquier byte
 * llegue a Storage.
 *
 * Los límites (formatos y tamaño máximo) viven en `lib/imagen/limites-subida.ts`
 * porque el navegador aplica exactamente los mismos antes de enviar (DT-017):
 * si cada lado tuviera su propia constante, el cliente podría acabar mandando
 * fotos que este módulo rechaza.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  TAMANO_MAXIMO_FOTO_BYTES,
  esMimePermitido,
  formatearMegabytes,
  type TipoMimePermitido,
} from "@/lib/imagen/limites-subida";

const BUCKET = "minuto-a-minuto";

const EXTENSION_POR_MIME: Record<TipoMimePermitido, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Fallo cuyo mensaje está redactado para enseñárselo al usuario tal cual.
 * Lo que no sea de este tipo no se muestra: podría filtrar detalles internos
 * (nombres de variables de entorno, rutas, respuestas de Supabase).
 */
export class ErrorDeSubidaDeFoto extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorDeSubidaDeFoto";
  }
}

/**
 * Sube una foto al bucket público `minuto-a-minuto` y devuelve su URL pública.
 * Lanza `ErrorDeSubidaDeFoto` si el fichero no cumple el tipo MIME o el tamaño
 * máximo permitidos — quien la llama (Server Action) es responsable de
 * convertir esa excepción en un mensaje de error visible, nunca en un crash
 * sin contexto.
 */
export async function subirFotoMinutoAMinuto(foto: File): Promise<string> {
  return subirFotoAlBucket(foto, "");
}

/**
 * Sube la foto opcional de la pantalla de llegada (DT-024) al MISMO bucket
 * público `minuto-a-minuto` — no se crea un bucket nuevo, eso exige
 * configuración manual en el dashboard de Supabase — con el prefijo
 * `llegada-` en el nombre del objeto para no colisionar con las fotos del
 * feed. Mismas reglas de validación (tipo MIME, tamaño) y mismo tipo de
 * error que `subirFotoMinutoAMinuto`.
 */
export async function subirFotoLlegada(foto: File): Promise<string> {
  return subirFotoAlBucket(foto, "llegada-");
}

/**
 * Lógica compartida entre `subirFotoMinutoAMinuto` y `subirFotoLlegada`: solo
 * cambia el prefijo del nombre del objeto en Storage — ambas suben al mismo
 * bucket, con las mismas reglas de validación.
 */
async function subirFotoAlBucket(foto: File, prefijoNombre: string): Promise<string> {
  if (!esMimePermitido(foto.type)) {
    throw new ErrorDeSubidaDeFoto(
      `Formato de imagen no permitido (${foto.type || "desconocido"}). Usa JPEG, PNG o WebP.`
    );
  }

  if (foto.size > TAMANO_MAXIMO_FOTO_BYTES) {
    throw new ErrorDeSubidaDeFoto(
      `La foto pesa ${formatearMegabytes(foto.size)} y el máximo son ${formatearMegabytes(
        TAMANO_MAXIMO_FOTO_BYTES
      )}.`
    );
  }

  const extension = EXTENSION_POR_MIME[foto.type];
  const nombreUnico = `${prefijoNombre}${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(BUCKET).upload(nombreUnico, foto, {
    contentType: foto.type,
  });

  if (error) {
    throw new ErrorDeSubidaDeFoto("No se pudo subir la foto a Storage.");
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(nombreUnico);
  return data.publicUrl;
}
