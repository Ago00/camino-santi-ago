// Sección "Intenciones": lista paginada (offset/limit de 20) con eliminar.
// Borrado real (DELETE): la tabla `intenciones` no tiene columna de
// ocultamiento, a diferencia de comentarios/posiciones (ver modelo-datos.md).

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import EliminarIntencionBoton from "@/components/admin/EliminarIntencionBoton";
import EnlacePaginacion from "@/components/admin/EnlacePaginacion";

const TAMANO_PAGINA = 20;
const C = { ink: "#1B211D", muted: "#4A5450" };

export default async function SeccionIntenciones({ offset }: { offset: number }) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("intenciones")
    .select("id, texto, nombre, created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + TAMANO_PAGINA - 1);

  const intenciones = data ?? [];
  const hayMas = intenciones.length === TAMANO_PAGINA;

  if (intenciones.length === 0 && offset === 0) {
    return (
      <p className="text-[14px]" style={{ color: C.muted }}>
        Todavía no hay intenciones.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {intenciones.map((intencion) => (
        <div
          key={intencion.id}
          className="flex items-start justify-between gap-3 rounded-xl border px-4 py-3"
          style={{ borderColor: "#00000010", background: "white" }}
        >
          <div>
            <div className="text-[12.5px] font-medium" style={{ color: C.muted }}>
              {intencion.nombre ?? "Anónima"} · {new Date(intencion.created_at).toLocaleString("es-ES")}
            </div>
            <div className="mt-0.5 text-[14px]" style={{ color: C.ink }}>
              {intencion.texto}
            </div>
          </div>
          <EliminarIntencionBoton id={intencion.id} />
        </div>
      ))}

      {hayMas && <EnlacePaginacion parametro="intOffset" siguienteOffset={offset + TAMANO_PAGINA} />}
    </div>
  );
}
