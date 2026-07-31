// Sección "Actividad" del panel admin: estado del intento activo (fase, hora
// de inicio, mensaje de llegada) + las acciones de transición (ver
// ActividadAcciones.tsx para el detalle de qué botón aparece según fase).

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TEXTOS_POR_DEFECTO } from "@/lib/textos/defaults";
import ActividadAcciones from "@/components/admin/ActividadAcciones";
import CrearPrimerIntentoBoton from "@/components/admin/CrearPrimerIntentoBoton";

const C = { ink: "#1B211D", muted: "#4A5450" };

const ETIQUETA_FASE: Record<"antes" | "durante" | "llegada", string> = {
  antes: "Antes de empezar",
  durante: "En marcha",
  llegada: "Llegada",
};

export default async function SeccionActividad() {
  const supabase = getSupabaseAdmin();
  const { data: intentoActivo } = await supabase
    .from("intentos")
    .select("id, fase, started_at, mensaje_llegada")
    .eq("cerrado", false)
    .maybeSingle();

  if (!intentoActivo) {
    return (
      <div className="space-y-3">
        <p className="text-[14px]" style={{ color: C.muted }}>
          No hay ningún intento activo en la base de datos.
        </p>
        <CrearPrimerIntentoBoton />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border p-4" style={{ borderColor: "#00000012", background: "white" }}>
        <div className="text-[12px] uppercase tracking-wide" style={{ color: C.muted }}>
          Estado actual
        </div>
        <div className="mt-1 text-[18px] font-semibold" style={{ color: C.ink }}>
          {ETIQUETA_FASE[intentoActivo.fase]}
        </div>
        {intentoActivo.started_at && (
          <div className="mt-1 text-[13px]" style={{ color: C.muted }}>
            Iniciado: {new Date(intentoActivo.started_at).toLocaleString("es-ES")}
          </div>
        )}
        {intentoActivo.fase === "llegada" && intentoActivo.mensaje_llegada && (
          <div className="mt-2 rounded-lg p-3 text-[13.5px]" style={{ background: "#F4F3EF", color: C.ink }}>
            {intentoActivo.mensaje_llegada}
          </div>
        )}
      </div>

      <ActividadAcciones
        fase={intentoActivo.fase}
        mensajeLlegadaDefault={intentoActivo.mensaje_llegada ?? TEXTOS_POR_DEFECTO.mensaje_llegada_default}
      />
    </div>
  );
}
