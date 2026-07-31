// Wrapper cliente mínimo para acciones destructivas: pide confirmación con
// window.confirm() antes de ejecutar la server action. Sin modal a medida —
// no hubo fase de diseño para F4 (ver docs/tareas/CURRENT.md).

"use client";

import { useTransition } from "react";

interface BotonConfirmableProps {
  etiqueta: string;
  etiquetaPendiente?: string;
  mensajeConfirmacion?: string;
  accion: () => Promise<void>;
  variante?: "normal" | "peligro";
  className?: string;
  disabled?: boolean;
}

const ESTILOS = {
  normal: { background: "#2F5D50", color: "white" },
  peligro: { background: "#B03A2E", color: "white" },
};

export default function BotonConfirmable({
  etiqueta,
  etiquetaPendiente,
  mensajeConfirmacion,
  accion,
  variante = "normal",
  className,
  disabled,
}: BotonConfirmableProps) {
  const [pendiente, startTransition] = useTransition();

  function onClick() {
    if (mensajeConfirmacion && !window.confirm(mensajeConfirmacion)) return;
    startTransition(async () => {
      await accion();
    });
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled || pendiente}
      className={className ?? "rounded-full px-4 py-2 text-[13px] font-medium disabled:opacity-50"}
      style={ESTILOS[variante]}
    >
      {pendiente ? (etiquetaPendiente ?? "Procesando…") : etiqueta}
    </button>
  );
}
