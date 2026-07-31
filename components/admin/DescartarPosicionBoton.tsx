"use client";

import { descartarPosicion } from "@/app/admin/actions";
import BotonConfirmable from "@/components/admin/BotonConfirmable";

export default function DescartarPosicionBoton({ id }: { id: number }) {
  return (
    <BotonConfirmable
      etiqueta="Descartar"
      etiquetaPendiente="Descartando…"
      accion={() => descartarPosicion(id)}
      variante="peligro"
      className="shrink-0 rounded-full px-3 py-1 text-[12px] font-medium disabled:opacity-50"
    />
  );
}
