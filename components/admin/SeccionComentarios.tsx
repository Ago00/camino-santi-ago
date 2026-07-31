// Sección "Comentarios": filtro todos/públicos/ocultos + ocultar, mostrar
// (revertir) y eliminar (hard delete, con confirmación).

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { FiltroComentario } from "@/lib/admin/navegacion";
import FiltroComentarios from "@/components/admin/FiltroComentarios";
import AccionesComentario from "@/components/admin/AccionesComentario";

const C = { ink: "#1B211D", muted: "#4A5450" };

export default async function SeccionComentarios({ filtro }: { filtro: FiltroComentario }) {
  const supabase = getSupabaseAdmin();
  let query = supabase.from("comentarios").select("*").order("created_at", { ascending: false });

  if (filtro === "publicos") query = query.eq("oculto", false);
  if (filtro === "ocultos") query = query.eq("oculto", true);

  const { data } = await query;
  const comentarios = data ?? [];

  return (
    <div className="space-y-4">
      <FiltroComentarios activo={filtro} />

      {comentarios.length === 0 ? (
        <p className="text-[14px]" style={{ color: C.muted }}>
          No hay comentarios que mostrar.
        </p>
      ) : (
        <div className="space-y-3">
          {comentarios.map((comentario) => (
            <div
              key={comentario.id}
              className="flex items-start justify-between gap-3 rounded-xl border px-4 py-3"
              style={{ borderColor: "#00000010", background: comentario.oculto ? "#00000006" : "white" }}
            >
              <div>
                <div className="text-[12.5px] font-medium" style={{ color: C.muted }}>
                  {comentario.nombre} · {comentario.visibilidad}
                  {comentario.oculto && " · oculto"} ·{" "}
                  {new Date(comentario.created_at).toLocaleString("es-ES")}
                </div>
                <div className="mt-0.5 text-[14px]" style={{ color: C.ink }}>
                  {comentario.texto}
                </div>
              </div>
              <AccionesComentario id={comentario.id} oculto={comentario.oculto} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
