// Web pública del reto (F3). Server Component: lee el intento activo (fase
// antes/durante/llegada), el progreso inicial y los textos, y renderiza el
// modo correspondiente. Sin intento activo en BD, se trata como fase "antes"
// (ver docs/tareas/CURRENT.md, comportamiento en casos límite).

import { getSupabasePublic } from "@/lib/supabase/public";
import { cargarTrazaDeCalculo } from "@/lib/traza/cargar-traza";
import { cargarTrazaDeMapa } from "@/lib/traza/cargar-traza-mapa";
import { calcularProgreso } from "@/lib/traza/proyeccion";
import { aProgresoPublico } from "@/lib/traza/progreso-publico";
import { obtenerTextos } from "@/lib/textos/obtener-textos";
import { TEXTOS_POR_DEFECTO } from "@/lib/textos/defaults";
import type { Posicion } from "@/lib/types";
import PeregrinoLibre from "@/components/publico/PeregrinoLibre";
import ModoAntes from "@/components/publico/ModoAntes";
import ModoDurante from "@/components/publico/ModoDurante";
import ModoLlegada from "@/components/publico/ModoLlegada";
import RefrescoAlCambiarFase from "@/components/publico/RefrescoAlCambiarFase";

// La fase y el progreso se leen de Supabase en cada petición: sin esto,
// Next.js prerenderiza "/" una vez en build y el HTML queda congelado con
// esos datos para siempre en producción (rompe el propósito de F3, una web
// de seguimiento en directo). Ver docs/tareas/CURRENT.md.
export const dynamic = "force-dynamic";

const C = { paper: "#F4F3EF", ink: "#1B211D" };

export default async function Home() {
  const [intentoActivo, textos] = await Promise.all([obtenerIntentoActivo(), obtenerTextos()]);
  const trazaCoords = cargarTrazaDeMapa();

  const fase = intentoActivo?.fase ?? "antes";

  return (
    <div className="min-h-dvh w-full" style={{ background: C.paper, color: C.ink }}>
      <RefrescoAlCambiarFase faseActual={fase} />
      <PeregrinoLibre />
      <div className="mx-auto w-full max-w-[480px] px-5 pb-28">
        {fase === "antes" && <ModoAntes textos={textos} trazaCoords={trazaCoords} />}
        {fase === "durante" && intentoActivo && (
          <ModoDuranteConectado
            intentoId={intentoActivo.id}
            startedAt={intentoActivo.started_at}
            trazaCoords={trazaCoords}
          />
        )}
        {fase === "llegada" && intentoActivo && (
          <ModoLlegadaConectado
            intentoId={intentoActivo.id}
            startedAt={intentoActivo.started_at}
            endedAt={intentoActivo.ended_at}
            mensajeLlegada={intentoActivo.mensaje_llegada}
            trazaCoords={trazaCoords}
          />
        )}
      </div>
    </div>
  );
}

async function ModoDuranteConectado({
  intentoId,
  startedAt,
  trazaCoords,
}: {
  intentoId: number;
  startedAt: string | null;
  trazaCoords: [number, number][];
}) {
  const progresoInicial = await calcularProgresoDelIntento(intentoId);
  return <ModoDurante progresoInicial={progresoInicial} iniciadoEn={startedAt} trazaCoords={trazaCoords} />;
}

async function ModoLlegadaConectado({
  intentoId,
  startedAt,
  endedAt,
  mensajeLlegada,
  trazaCoords,
}: {
  intentoId: number;
  startedAt: string | null;
  endedAt: string | null;
  mensajeLlegada: string | null;
  trazaCoords: [number, number][];
}) {
  const progreso = await calcularProgresoDelIntento(intentoId);
  const tiempoTotal = formatearTiempoTotal(startedAt, endedAt);

  return (
    <ModoLlegada
      progreso={progreso}
      mensajeLlegada={mensajeLlegada ?? TEXTOS_POR_DEFECTO.mensaje_llegada_default}
      tiempoTotal={tiempoTotal}
      trazaCoords={trazaCoords}
    />
  );
}

interface IntentoActivo {
  id: number;
  fase: "antes" | "durante" | "llegada";
  started_at: string | null;
  ended_at: string | null;
  mensaje_llegada: string | null;
}

async function obtenerIntentoActivo(): Promise<IntentoActivo | null> {
  try {
    const supabase = getSupabasePublic();
    const { data } = await supabase
      .from("intentos")
      .select("id, fase, started_at, ended_at, mensaje_llegada")
      .eq("cerrado", false)
      .maybeSingle();
    return data;
  } catch {
    // Sin proyecto Supabase configurado (entorno local sin .env, build, etc.):
    // se trata igual que "sin intento activo" — cae a fase "antes".
    return null;
  }
}

async function calcularProgresoDelIntento(intentoId: number) {
  const supabase = getSupabasePublic();
  const { data } = await supabase
    .from("posiciones")
    .select("*")
    .eq("intento_id", intentoId)
    .eq("descartado", false)
    .order("ts", { ascending: true });

  const historico: Posicion[] = data ?? [];
  const traza = cargarTrazaDeCalculo();
  return aProgresoPublico(calcularProgreso(historico, traza));
}

function formatearTiempoTotal(startedAt: string | null, endedAt: string | null): string {
  if (!startedAt || !endedAt) return "—";
  const minutos = Math.max(0, Math.floor((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60_000));
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return `${horas}:${String(resto).padStart(2, "0")}`;
}
