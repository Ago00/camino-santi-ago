// Botones de transición de fase de Actividad. Client Component: cada botón
// pide o no confirmación según el diseño acordado en docs/tareas/CURRENT.md:
//
// - antes  → elegir modo (guiado/libre, DT-016) + Iniciar (confirmación, por
//             simetría con las demás transiciones)
// - durante → Finalizar (confirmación; edita el mensaje de llegada antes de
//             enviar) + Reiniciar (confirmación; aborta el intento en marcha)
// - llegada → Retomar (SIN confirmación: reversible con otro Finalizar,
//             mismo intento) + Reiniciar (confirmación: cierra de verdad)

"use client";

import { useState, useTransition } from "react";
import { finalizarReto, iniciarReto, reiniciarReto, retomarReto } from "@/app/admin/actions";
import BotonConfirmable from "@/components/admin/BotonConfirmable";
import type { ModoIntento } from "@/lib/types";

const C = { eucalipto: "#2F5D50", peligro: "#B03A2E" };

interface ActividadAccionesProps {
  fase: "antes" | "durante" | "llegada";
  mensajeLlegadaDefault: string;
}

export default function ActividadAcciones({ fase, mensajeLlegadaDefault }: ActividadAccionesProps) {
  if (fase === "antes") {
    return <IniciarConModo />;
  }

  if (fase === "durante") {
    return <FinalizarYReiniciar mensajeLlegadaDefault={mensajeLlegadaDefault} />;
  }

  return <RetomarYReiniciar />;
}

/**
 * Selector de modo (guiado/libre, DT-016) + destino (solo modo libre) antes
 * de Iniciar. El modo queda fijo durante toda la vida del intento — para
 * cambiarlo hace falta Reiniciar y elegir de nuevo.
 */
function IniciarConModo() {
  const [modo, setModo] = useState<ModoIntento>("guiado");
  const [destinoLat, setDestinoLat] = useState("");
  const [destinoLon, setDestinoLon] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const latNum = Number(destinoLat);
  const lonNum = Number(destinoLon);
  const destinoValido =
    destinoLat.trim() !== "" &&
    destinoLon.trim() !== "" &&
    Number.isFinite(latNum) &&
    Number.isFinite(lonNum) &&
    latNum >= -90 &&
    latNum <= 90 &&
    lonNum >= -180 &&
    lonNum <= 180;

  const puedeIniciar = modo === "guiado" || destinoValido;

  function iniciar() {
    if (!window.confirm("¿Iniciar el reto? La web pública pasará a mostrar el mapa en directo.")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await iniciarReto(
          modo === "libre" ? { modo, destinoLat: latNum, destinoLon: lonNum } : { modo }
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo iniciar el reto.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[12.5px] font-medium" style={{ color: "#4A5450" }}>
          Modo del intento
        </label>
        <div className="mt-1 flex gap-2">
          <SelectorModoBoton etiqueta="Guiado" activo={modo === "guiado"} onClick={() => setModo("guiado")} />
          <SelectorModoBoton etiqueta="Libre" activo={modo === "libre"} onClick={() => setModo("libre")} />
        </div>
      </div>

      {modo === "libre" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[12.5px] font-medium" style={{ color: "#4A5450" }}>
              Latitud del destino
            </label>
            <input
              type="number"
              step="any"
              value={destinoLat}
              onChange={(e) => setDestinoLat(e.target.value)}
              placeholder="42.8805"
              className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-[14px] outline-none"
              style={{ borderColor: "#00000015" }}
            />
          </div>
          <div>
            <label className="text-[12.5px] font-medium" style={{ color: "#4A5450" }}>
              Longitud del destino
            </label>
            <input
              type="number"
              step="any"
              value={destinoLon}
              onChange={(e) => setDestinoLon(e.target.value)}
              placeholder="-8.5464"
              className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-[14px] outline-none"
              style={{ borderColor: "#00000015" }}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="text-[13px]" style={{ color: C.peligro }}>
          {error}
        </p>
      )}

      <button
        onClick={iniciar}
        disabled={!puedeIniciar || pendiente}
        className="rounded-full px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
        style={{ background: C.eucalipto }}
      >
        {pendiente ? "Iniciando…" : "Iniciar"}
      </button>
    </div>
  );
}

function SelectorModoBoton({
  etiqueta,
  activo,
  onClick,
}: {
  etiqueta: string;
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className="rounded-full px-3 py-1.5 text-[12.5px] font-medium"
      style={
        activo
          ? { background: C.eucalipto, color: "white" }
          : { background: "white", color: "#4A5450", border: "1px solid #00000015" }
      }
    >
      {etiqueta}
    </button>
  );
}

function FinalizarYReiniciar({ mensajeLlegadaDefault }: { mensajeLlegadaDefault: string }) {
  const [mensaje, setMensaje] = useState(mensajeLlegadaDefault);
  const [pendiente, startTransition] = useTransition();

  function finalizar() {
    if (!window.confirm("¿Finalizar el reto? La web pública pasará a mostrar el mensaje de llegada.")) {
      return;
    }
    startTransition(async () => {
      await finalizarReto(mensaje);
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[12.5px] font-medium" style={{ color: "#4A5450" }}>
          Mensaje de llegada
        </label>
        <textarea
          value={mensaje}
          onChange={(e) => setMensaje(e.target.value)}
          rows={3}
          maxLength={1000}
          className="mt-1 w-full resize-none rounded-lg border bg-white px-3 py-2 text-[14px] outline-none"
          style={{ borderColor: "#00000015" }}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={finalizar}
          disabled={mensaje.trim().length === 0 || pendiente}
          className="rounded-full px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
          style={{ background: C.eucalipto }}
        >
          {pendiente ? "Finalizando…" : "Finalizar"}
        </button>
        <BotonConfirmable
          etiqueta="Reiniciar"
          etiquetaPendiente="Reiniciando…"
          mensajeConfirmacion="¿Reiniciar? Se cerrará este intento (queda guardado para siempre) y se abrirá uno nuevo desde cero."
          accion={reiniciarReto}
          variante="peligro"
        />
      </div>
    </div>
  );
}

function RetomarYReiniciar() {
  return (
    <div className="flex flex-wrap gap-2">
      {/* Retomar: reversible con otro Finalizar, sin confirmación (ver CURRENT.md). */}
      <BotonConfirmable etiqueta="Retomar" etiquetaPendiente="Retomando…" accion={retomarReto} />
      <BotonConfirmable
        etiqueta="Reiniciar"
        etiquetaPendiente="Reiniciando…"
        mensajeConfirmacion="¿Reiniciar? Se cerrará este intento (queda guardado para siempre) y se abrirá uno nuevo desde cero."
        accion={reiniciarReto}
        variante="peligro"
      />
    </div>
  );
}
