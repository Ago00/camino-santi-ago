"use client";

import { eliminarComentario, mostrarComentario, ocultarComentario } from "@/app/admin/actions";
import BotonConfirmable from "@/components/admin/BotonConfirmable";

const CLASE_BOTON = "shrink-0 rounded-full px-3 py-1 text-[12px] font-medium disabled:opacity-50";

export default function AccionesComentario({ id, oculto }: { id: number; oculto: boolean }) {
  return (
    <div className="flex shrink-0 gap-1.5">
      {oculto ? (
        <BotonConfirmable
          etiqueta="Mostrar"
          etiquetaPendiente="Mostrando…"
          accion={() => mostrarComentario(id)}
          className={CLASE_BOTON}
        />
      ) : (
        <BotonConfirmable
          etiqueta="Ocultar"
          etiquetaPendiente="Ocultando…"
          accion={() => ocultarComentario(id)}
          variante="peligro"
          className={CLASE_BOTON}
        />
      )}
      <BotonConfirmable
        etiqueta="Eliminar"
        etiquetaPendiente="Eliminando…"
        mensajeConfirmacion="¿Eliminar este comentario? Se borra de forma permanente, no se puede deshacer."
        accion={() => eliminarComentario(id)}
        variante="peligro"
        className={CLASE_BOTON}
      />
    </div>
  );
}
