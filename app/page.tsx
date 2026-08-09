// Web pública del reto (F3). Server Component: lee el intento activo (fase
// antes/durante/llegada), el progreso inicial y los textos, y renderiza el
// modo correspondiente. Sin intento activo en BD, se trata como fase "antes"
// (ver docs/tareas/CURRENT.md, comportamiento en casos límite).

import { getSupabasePublic } from "@/lib/supabase/public";
import { obtenerTodasLasFilas } from "@/lib/supabase/paginacion";
import { CACHE_TTL_MS, guardarCacheProgreso, obtenerCacheProgreso } from "@/lib/progreso-cache";
import { cargarTrazaDeCalculo } from "@/lib/traza/cargar-traza";
import { cargarTrazaDeMapa } from "@/lib/traza/cargar-traza-mapa";
import { calcularProgreso } from "@/lib/traza/proyeccion";
import { aProgresoPublico } from "@/lib/traza/progreso-publico";
import { calcularProgresoLibre } from "@/lib/traza/progreso-libre";
import { obtenerTextos } from "@/lib/textos/obtener-textos";
import { TEXTOS_POR_DEFECTO } from "@/lib/textos/defaults";
import { calcularRitmoMedioIntento } from "@/lib/ritmo";
import type { Fase, ModoIntento, Posicion, ProgresoPublicoGuiado, ProgresoPublicoLibre } from "@/lib/types";
import PeregrinoLibre from "@/components/publico/PeregrinoLibre";
import ModoAntes from "@/components/publico/ModoAntes";
import ModoDurante from "@/components/publico/ModoDurante";
import ModoDuranteLibre from "@/components/publico/ModoDuranteLibre";
import ModoLlegada from "@/components/publico/ModoLlegada";
import ModoLlegadaLibre from "@/components/publico/ModoLlegadaLibre";
import type { EntradaMinutoAMinutoPublica } from "@/components/publico/MinutoAMinuto";
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
          intentoActivo.modo === "libre" ? (
            <ModoDuranteLibreConectado
              intentoId={intentoActivo.id}
              destino={destinoDelIntento(intentoActivo)}
              startedAt={intentoActivo.started_at}
            />
          ) : (
            <ModoDuranteConectado
              intentoId={intentoActivo.id}
              startedAt={intentoActivo.started_at}
              trazaCoords={trazaCoords}
            />
          )
        )}
        {fase === "llegada" && intentoActivo && (
          intentoActivo.modo === "libre" ? (
            <ModoLlegadaLibreConectado
              intentoId={intentoActivo.id}
              destino={destinoDelIntento(intentoActivo)}
              mensajeLlegada={intentoActivo.mensaje_llegada}
              startedAt={intentoActivo.started_at}
              endedAt={intentoActivo.ended_at}
            />
          ) : (
            <ModoLlegadaConectado
              intentoId={intentoActivo.id}
              startedAt={intentoActivo.started_at}
              endedAt={intentoActivo.ended_at}
              mensajeLlegada={intentoActivo.mensaje_llegada}
              trazaCoords={trazaCoords}
            />
          )
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
  const [progreso, entradasMinutoAMinuto] = await Promise.all([
    calcularProgresoDelIntento(intentoId),
    cargarEntradasMinutoAMinuto(intentoId),
  ]);
  const tiempoTotal = formatearTiempoTotal(startedAt, endedAt);
  const ritmoMedio = calcularRitmoMedioIntento(progreso.odometroKm, startedAt, endedAt);

  return (
    <ModoLlegada
      progreso={progreso}
      mensajeLlegada={mensajeLlegada ?? TEXTOS_POR_DEFECTO.mensaje_llegada_default}
      tiempoTotal={tiempoTotal}
      ritmoMedio={ritmoMedio}
      trazaCoords={trazaCoords}
      entradasMinutoAMinuto={entradasMinutoAMinuto}
    />
  );
}

async function ModoDuranteLibreConectado({
  intentoId,
  destino,
  startedAt,
}: {
  intentoId: number;
  destino: { lat: number; lon: number } | null;
  startedAt: string | null;
}) {
  const { progreso, puntosGps } = await calcularProgresoLibreDelIntento(intentoId, destino);
  return (
    <ModoDuranteLibre progresoInicial={progreso} puntosGpsIniciales={puntosGps} startedAt={startedAt} />
  );
}

async function ModoLlegadaLibreConectado({
  intentoId,
  destino,
  mensajeLlegada,
  startedAt,
  endedAt,
}: {
  intentoId: number;
  destino: { lat: number; lon: number } | null;
  mensajeLlegada: string | null;
  startedAt: string | null;
  endedAt: string | null;
}) {
  const [{ progreso, puntosGps }, entradasMinutoAMinuto] = await Promise.all([
    calcularProgresoLibreDelIntento(intentoId, destino),
    cargarEntradasMinutoAMinuto(intentoId),
  ]);

  return (
    <ModoLlegadaLibre
      progreso={progreso}
      mensajeLlegada={mensajeLlegada ?? TEXTOS_POR_DEFECTO.mensaje_llegada_default}
      puntosGps={puntosGps}
      entradasMinutoAMinuto={entradasMinutoAMinuto}
      startedAt={startedAt}
      endedAt={endedAt}
    />
  );
}

async function cargarEntradasMinutoAMinuto(
  intentoId: number
): Promise<EntradaMinutoAMinutoPublica[]> {
  const supabase = getSupabasePublic();
  const { data } = await supabase
    .from("minuto_a_minuto")
    .select("id, texto, foto_url, lat, lon, created_at")
    .eq("intento_id", intentoId)
    .order("created_at", { ascending: false });

  return data ?? [];
}

export interface IntentoActivo {
  id: number;
  fase: Fase;
  modo: ModoIntento;
  destino_lat: number | null;
  destino_lon: number | null;
  started_at: string | null;
  ended_at: string | null;
  mensaje_llegada: string | null;
}

/**
 * Compatibilidad temporal con la migración `supabase/migrations/0003_modo_intento.sql`
 * sin aplicar todavía en el entorno real (ver DEBT.md, "recordatorio: aplicar
 * 0003_modo_intento.sql"). Si la consulta con `modo`/`destino_lat`/`destino_lon`
 * falla (columnas inexistentes), reintenta con el select mínimo previo a
 * DT-016 y trata el intento como modo guiado — el comportamiento exacto que
 * esta función ya tenía antes de esa tarea. Sin este fallback, un error de
 * columna se leía como "sin intento activo" y ocultaba la fase real
 * (durante/llegada) de un intento realmente en curso.
 */
export async function obtenerIntentoActivo(): Promise<IntentoActivo | null> {
  try {
    const supabase = getSupabasePublic();
    const { data, error } = await supabase
      .from("intentos")
      .select("id, fase, modo, destino_lat, destino_lon, started_at, ended_at, mensaje_llegada")
      .eq("cerrado", false)
      .maybeSingle();

    if (!error) return data;

    const { data: dataMinima } = await supabase
      .from("intentos")
      .select("id, fase, started_at, ended_at, mensaje_llegada")
      .eq("cerrado", false)
      .maybeSingle();

    return dataMinima ? { ...dataMinima, modo: "guiado", destino_lat: null, destino_lon: null } : null;
  } catch {
    // Sin proyecto Supabase configurado (entorno local sin .env, build, etc.):
    // se trata igual que "sin intento activo" — cae a fase "antes".
    return null;
  }
}

/** Destino del modo libre (DT-016), o null si el intento no tiene ninguno fijado. */
function destinoDelIntento(intento: IntentoActivo): { lat: number; lon: number } | null {
  return intento.destino_lat !== null && intento.destino_lon !== null
    ? { lat: intento.destino_lat, lon: intento.destino_lon }
    : null;
}

/**
 * Histórico completo del intento (DT-018, docs/tecnico/decisiones-tecnicas.md):
 * sin paginar, PostgREST corta cualquier `select` a 1000 filas — a partir de
 * las ~4 h de un intento guiado real (cadencia de 15 s) el mapa, la barra de
 * progreso y los km quedaban congelados el resto del reto. Usada por ambos
 * modos en la carga de página: guiado siempre (calcularProgreso necesita el
 * histórico completo) y libre para construir el trazado GPS inicial del
 * mapa (calcularProgresoLibreDelIntento).
 */
async function obtenerHistoricoPosiciones(intentoId: number): Promise<Posicion[]> {
  const supabase = getSupabasePublic();
  return obtenerTodasLasFilas<Posicion>((desde, hasta) =>
    supabase
      .from("posiciones")
      .select("*")
      .eq("intento_id", intentoId)
      .eq("descartado", false)
      .order("ts", { ascending: true })
      .range(desde, hasta)
  );
}

/**
 * S2 (endurecimiento post-revisión de Seguridad de DT-018, ver nota de
 * cierre en docs/tecnico/decisiones-tecnicas.md): reutiliza la misma caché
 * compartida que ya usa `GET /api/progreso` (`lib/progreso-cache.ts`, TTL
 * 15-20 s, DT-007/DT-014) en vez de recalcular en cada visita. A diferencia
 * de `/api/progreso`, esta carga de página (`export const dynamic =
 * "force-dynamic"` arriba) no tenía ninguna protección de frecuencia: cada
 * visitante disparaba `calcularProgreso` desde cero, amplificando el coste
 * del fallback de la ventana deslizante (S1, lib/traza/proyeccion.ts) ante
 * un histórico adversarial. El invariante de que solo hay un intento activo
 * a la vez (docs/tecnico/arquitectura.md) hace seguro compartir esta caché
 * entre `/api/progreso` y esta función: ambas calculan el progreso del
 * mismo (único) intento en curso.
 */
export async function calcularProgresoDelIntento(intentoId: number): Promise<ProgresoPublicoGuiado> {
  const cache = obtenerCacheProgreso();
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS && cache.valor.modo === "guiado") {
    return cache.valor;
  }

  const historico = await obtenerHistoricoPosiciones(intentoId);
  const traza = cargarTrazaDeCalculo();
  const progreso = aProgresoPublico(calcularProgreso(historico, traza));

  guardarCacheProgreso(progreso);

  return progreso;
}

/**
 * Progreso + puntos GPS del modo libre (DT-016). El histórico completo se
 * fetch una sola vez (Server Component) y sirve para ambos: el cálculo de
 * `distanciaRestanteKm` (misma lógica que /api/progreso) y el trazado
 * inicial del mapa — que luego crece en el cliente con cada poll nuevo
 * (ver ModoDuranteLibre.tsx), sin exponer el histórico completo en el
 * contrato de ProgresoPublico.
 */
async function calcularProgresoLibreDelIntento(
  intentoId: number,
  destino: { lat: number; lon: number } | null
): Promise<{ progreso: ProgresoPublicoLibre; puntosGps: { lat: number; lon: number }[] }> {
  const historico = await obtenerHistoricoPosiciones(intentoId);
  const progreso = calcularProgresoLibre(historico, destino);
  const puntosGps = historico.map((p) => ({ lat: p.lat, lon: p.lon }));
  return { progreso, puntosGps };
}

function formatearTiempoTotal(startedAt: string | null, endedAt: string | null): string {
  if (!startedAt || !endedAt) return "—";
  const minutos = Math.max(0, Math.floor((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60_000));
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return `${horas}:${String(resto).padStart(2, "0")}`;
}
