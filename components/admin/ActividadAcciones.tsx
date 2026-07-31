// Botones de transición de fase de Actividad. Client Component: cada botón
// pide o no confirmación según el diseño acordado en docs/tareas/CURRENT.md:
//
// - antes  → Iniciar (confirmación, por simetría con las demás transiciones)
// - durante → Finalizar (confirmación; edita el mensaje de llegada antes de
//             enviar) + Reiniciar (confirmación; aborta el intento en marcha)
// - llegada → Retomar (SIN confirmación: reversible con otro Finalizar,
//             mismo intento) + Reiniciar (confirmación: cierra de verdad)

"use client";

import { useState } from "react";
import { useTransition } from "react";
import { finalizarReto, iniciarReto, reiniciarReto, retomarReto } from "@/app/admin/actions";
import BotonConfirmable from "@/components/admin/BotonConfirmable";

const C = { eucalipto: "#2F5D50" };

interface ActividadAccionesProps {
  fase: "antes" | "durante" | "llegada";
  mensajeLlegadaDefault: string;
}

export default function ActividadAcciones({ fase, mensajeLlegadaDefault }: ActividadAccionesProps) {
  if (fase === "antes") {
    return (
      <BotonConfirmable
        etiqueta="Iniciar"
        etiquetaPendiente="Iniciando…"
        mensajeConfirmacion="¿Iniciar el reto? La web pública pasará a mostrar el mapa en directo."
        accion={iniciarReto}
      />
    );
  }

  if (fase === "durante") {
    return <FinalizarYReiniciar mensajeLlegadaDefault={mensajeLlegadaDefault} />;
  }

  return <RetomarYReiniciar />;
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
