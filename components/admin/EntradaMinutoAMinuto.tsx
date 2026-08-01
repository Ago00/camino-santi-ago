// Fila de una entrada del feed "minuto a minuto": texto + foto (si tiene) +
// Editar (textarea inline con Guardar/Cancelar, decisión menor de UI no
// especificada al pixel en el mockup) + Eliminar (BotonConfirmable, mismo
// patrón que AccionesComentario.tsx).

"use client";

import { useState, useTransition } from "react";
import { editarMinutoAMinuto, eliminarMinutoAMinuto } from "@/app/admin/actions";
import BotonConfirmable from "@/components/admin/BotonConfirmable";

const C = { ink: "#1B211D", muted: "#4A5450" };

interface EntradaMinutoAMinutoProps {
  id: number;
  texto: string;
  fotoUrl: string | null;
  createdAt: string;
}

export default function EntradaMinutoAMinuto({ id, texto, fotoUrl, createdAt }: EntradaMinutoAMinutoProps) {
  const [editando, setEditando] = useState(false);
  const [textoEditado, setTextoEditado] = useState(texto);
  const [pendiente, startTransition] = useTransition();

  function guardar() {
    startTransition(async () => {
      await editarMinutoAMinuto(id, textoEditado);
      setEditando(false);
    });
  }

  function cancelar() {
    setTextoEditado(texto);
    setEditando(false);
  }

  return (
    <div
      className="flex items-start gap-3 rounded-xl border px-4 py-3"
      style={{ borderColor: "#00000010", background: "white" }}
    >
      {fotoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- URL pública de Supabase Storage, no un asset local optimizable
        <img src={fotoUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-mono font-medium" style={{ color: C.muted }}>
          {new Date(createdAt).toLocaleString("es-ES")}
        </div>

        {editando ? (
          <div className="mt-1 space-y-2">
            <textarea
              value={textoEditado}
              onChange={(e) => setTextoEditado(e.target.value)}
              rows={2}
              maxLength={500}
              className="w-full resize-none rounded-lg border p-2 text-[14px] outline-none"
              style={{ borderColor: "#00000015", color: C.ink }}
            />
            <div className="flex gap-1.5">
              <button
                onClick={guardar}
                disabled={!textoEditado.trim() || pendiente}
                className="rounded-full px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
                style={{ background: "#2F5D50" }}
              >
                {pendiente ? "Guardando…" : "Guardar"}
              </button>
              <button
                onClick={cancelar}
                disabled={pendiente}
                className="rounded-full border px-3 py-1.5 text-[12px] font-medium"
                style={{ borderColor: "#00000015", color: C.muted, background: "#FBFAF7" }}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-0.5 text-[14px]" style={{ color: C.ink }}>
            {texto}
          </div>
        )}
      </div>

      {!editando && (
        <div className="flex shrink-0 gap-1.5">
          <button
            onClick={() => setEditando(true)}
            className="rounded-full border px-3 py-1.5 text-[12px] font-medium"
            style={{ borderColor: "#00000015", color: C.muted, background: "#FBFAF7" }}
          >
            Editar
          </button>
          <BotonConfirmable
            etiqueta="Eliminar"
            etiquetaPendiente="Eliminando…"
            mensajeConfirmacion="¿Eliminar esta entrada? Se borra de forma permanente, no se puede deshacer."
            accion={() => eliminarMinutoAMinuto(id)}
            variante="peligro"
            className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium disabled:opacity-50"
          />
        </div>
      )}
    </div>
  );
}
