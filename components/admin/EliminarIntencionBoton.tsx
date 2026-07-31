"use client";

import { eliminarIntencion } from "@/app/admin/actions";
import BotonConfirmable from "@/components/admin/BotonConfirmable";

export default function EliminarIntencionBoton({ id }: { id: number }) {
  return (
    <BotonConfirmable
      etiqueta="Eliminar"
      etiquetaPendiente="Eliminando…"
      mensajeConfirmacion="¿Eliminar esta intención? Se borra de forma permanente, no se puede deshacer."
      accion={() => eliminarIntencion(id)}
      variante="peligro"
      className="shrink-0 rounded-full px-3 py-1 text-[12px] font-medium disabled:opacity-50"
    />
  );
}
