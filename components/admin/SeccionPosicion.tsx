// Sección "Posición": última posición del intento activo + histórico
// paginado (offset/limit de 20, mismo patrón que app/api/comentarios/route.ts)
// con acción "descartar" en cualquier fila (DT-006 capa 2). Server Component:
// pagina por querystring ?posOffset= propia (no colisiona con ?tab=).

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Posicion } from "@/lib/types";
import DescartarPosicionBoton from "@/components/admin/DescartarPosicionBoton";
import EnlacePaginacion from "@/components/admin/EnlacePaginacion";

const TAMANO_PAGINA = 20;
const C = { ink: "#1B211D", muted: "#4A5450" };

export default async function SeccionPosicion({ offset }: { offset: number }) {
  const supabase = getSupabaseAdmin();

  const { data: intentoActivo } = await supabase
    .from("intentos")
    .select("id")
    .eq("cerrado", false)
    .maybeSingle();

  if (!intentoActivo) {
    return (
      <p className="text-[14px]" style={{ color: C.muted }}>
        No hay ningún intento activo.
      </p>
    );
  }

  const { data: ultimaPosicionData } = await supabase
    .from("posiciones")
    .select("*")
    .eq("intento_id", intentoActivo.id)
    .eq("descartado", false)
    .order("ts", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: historicoData } = await supabase
    .from("posiciones")
    .select("*")
    .eq("intento_id", intentoActivo.id)
    .order("ts", { ascending: false })
    .range(offset, offset + TAMANO_PAGINA - 1);

  const ultimaPosicion: Posicion | null = ultimaPosicionData ?? null;
  const historico: Posicion[] = historicoData ?? [];
  const hayMas = historico.length === TAMANO_PAGINA;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border p-4" style={{ borderColor: "#00000012", background: "white" }}>
        <div className="text-[12px] uppercase tracking-wide" style={{ color: C.muted }}>
          Última posición válida
        </div>
        {ultimaPosicion ? (
          <div className="mt-1 text-[14px]" style={{ color: C.ink }}>
            {ultimaPosicion.lat.toFixed(5)}, {ultimaPosicion.lon.toFixed(5)} —{" "}
            {new Date(ultimaPosicion.ts).toLocaleString("es-ES")}
            {ultimaPosicion.batt !== null && ` · batería ${ultimaPosicion.batt}%`}
            {ultimaPosicion.acc !== null && ` · precisión ${ultimaPosicion.acc.toFixed(0)} m`}
          </div>
        ) : (
          <div className="mt-1 text-[14px]" style={{ color: C.muted }}>
            Sin posiciones registradas todavía.
          </div>
        )}
      </div>

      <div className="space-y-2">
        {historico.map((posicion) => (
          <FilaPosicion key={posicion.id} posicion={posicion} />
        ))}
        {historico.length === 0 && (
          <p className="text-[13.5px]" style={{ color: C.muted }}>
            Sin histórico todavía.
          </p>
        )}
      </div>

      {hayMas && <EnlacePaginacion parametro="posOffset" siguienteOffset={offset + TAMANO_PAGINA} />}
    </div>
  );
}

function FilaPosicion({ posicion }: { posicion: Posicion }) {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5"
      style={{ borderColor: "#00000010", background: posicion.descartado ? "#00000006" : "white" }}
    >
      <div className="text-[13px]" style={{ color: posicion.descartado ? "#9AA29C" : "#1B211D" }}>
        <span className="font-medium">{new Date(posicion.ts).toLocaleString("es-ES")}</span>
        {" — "}
        {posicion.lat.toFixed(5)}, {posicion.lon.toFixed(5)}
        {posicion.descartado && " (descartada)"}
      </div>
      {!posicion.descartado && <DescartarPosicionBoton id={posicion.id} />}
    </div>
  );
}
