/**
 * Subida de fotos del feed "minuto a minuto" a Supabase Storage
 * (bucket público `minuto-a-minuto`, ver supabase/migrations/0002_minuto_a_minuto.sql).
 *
 * Solo se llama desde Server Actions (app/admin/actions.ts) con el cliente
 * service role, que bypassa RLS de Storage igual que bypassa RLS de BD — no
 * hace falta ninguna política de Storage para `insert`. Validación de tipo
 * MIME y tamaño aquí, en el borde del sistema, antes de que cualquier byte
 * llegue a Storage.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";

const TIPOS_MIME_PERMITIDOS = ["image/jpeg", "image/png", "image/webp"] as const;
const TAMANO_MAXIMO_BYTES = 8 * 1024 * 1024; // 8 MB
const BUCKET = "minuto-a-minuto";

const EXTENSION_POR_MIME: Record<(typeof TIPOS_MIME_PERMITIDOS)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function esMimePermitido(tipo: string): tipo is (typeof TIPOS_MIME_PERMITIDOS)[number] {
  return (TIPOS_MIME_PERMITIDOS as readonly string[]).includes(tipo);
}

/**
 * Sube una foto al bucket público `minuto-a-minuto` y devuelve su URL
 * pública. Lanza un error con mensaje apto para mostrar al usuario si el
 * fichero no cumple el tipo MIME o el tamaño máximo permitidos — quien la
 * llama (Server Action) es responsable de convertir esa excepción en un
 * mensaje de error, nunca en un crash sin contexto.
 */
export async function subirFotoMinutoAMinuto(foto: File): Promise<string> {
  if (!esMimePermitido(foto.type)) {
    throw new Error(
      `Formato de imagen no permitido (${foto.type || "desconocido"}). Usa JPEG, PNG o WebP.`
    );
  }

  if (foto.size > TAMANO_MAXIMO_BYTES) {
    throw new Error("La foto supera el tamaño máximo permitido (8 MB).");
  }

  const extension = EXTENSION_POR_MIME[foto.type];
  const nombreUnico = `${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(BUCKET).upload(nombreUnico, foto, {
    contentType: foto.type,
  });

  if (error) {
    throw new Error("No se pudo subir la foto.");
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(nombreUnico);
  return data.publicUrl;
}
