// Sección "Actividad" del panel admin: estado del intento activo (fase, hora
// de inicio, mensaje de llegada) + las acciones de transición (ver
// ActividadAcciones.tsx para el detalle de qué botón aparece según fase).

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TEXTOS_POR_DEFECTO } from "@/lib/textos/defaults";
import { obtenerTextos } from "@/lib/textos/obtener-textos";
import ActividadAcciones from "@/components/admin/ActividadAcciones";
import CrearPrimerIntentoBoton from "@/components/admin/CrearPrimerIntentoBoton";
import type { Fase } from "@/lib/types";

const C = { ink: "#1B211D", muted: "#4A5450" };

const ETIQUETA_FASE: Record<"antes" | "durante" | "llegada", string> = {
  antes: "Antes de empezar",
  durante: "En marcha",
  llegada: "Llegada",
};

interface IntentoActividad {
  id: number;
  fase: Fase;
  started_at: string | null;
  mensaje_llegada: string | null;
  foto_llegada_url: string | null;
}

/**
 * `foto_llegada_url` (DT-024, migración 0006) en consulta separada del resto
 * de columnas, con el mismo criterio que `obtenerFotoLlegadaUrl` en
 * `app/page.tsx`: si la migración no está aplicada todavía en producción, el
 * fallo de esta columna sola no debe tumbar la lectura de fase/mensaje, que
 * no dependen de ella.
 */
export async function obtenerIntentoActividad(): Promise<IntentoActividad | null> {
  const supabase = getSupabaseAdmin();
  const { data: intentoConFoto, error } = await supabase
    .from("intentos")
    .select("id, fase, started_at, mensaje_llegada, foto_llegada_url")
    .eq("cerrado", false)
    .maybeSingle();

  if (!error) return intentoConFoto;

  const { data: intentoSinFoto } = await supabase
    .from("intentos")
    .select("id, fase, started_at, mensaje_llegada")
    .eq("cerrado", false)
    .maybeSingle();

  return intentoSinFoto ? { ...intentoSinFoto, foto_llegada_url: null } : null;
}

export default async function SeccionActividad() {
  const [intentoActivo, textos] = await Promise.all([obtenerIntentoActividad(), obtenerTextos()]);

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
        fotoLlegadaUrlActual={intentoActivo.foto_llegada_url}
        llegadaKicker={textos.llegada_kicker}
        llegadaTitulo={textos.llegada_titulo}
      />
    </div>
  );
}
