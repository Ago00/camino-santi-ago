"use client";

import { useState, useTransition } from "react";
import { guardarTexto } from "@/app/admin/actions";
import type { ClaveTexto } from "@/lib/textos/defaults";

const C = { ink: "#1B211D", muted: "#4A5450", eucalipto: "#2F5D50" };

export default function CampoTexto({ clave, valorInicial }: { clave: ClaveTexto; valorInicial: string }) {
  const [valor, setValor] = useState(valorInicial);
  const [pendiente, startTransition] = useTransition();
  const [guardado, setGuardado] = useState(false);

  const sinCambios = valor === valorInicial;

  function guardar() {
    startTransition(async () => {
      await guardarTexto(clave, valor);
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2000);
    });
  }

  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: "#00000012", background: "white" }}>
      <label className="text-[12px] font-mono uppercase tracking-wide" style={{ color: C.muted }}>
        {clave}
      </label>
      <textarea
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        rows={3}
        className="mt-1.5 w-full resize-y rounded-lg border bg-white px-3 py-2 text-[14px] outline-none"
        style={{ borderColor: "#00000015", color: C.ink }}
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={guardar}
          disabled={sinCambios || pendiente}
          className="rounded-full px-4 py-1.5 text-[13px] font-medium text-white disabled:opacity-50"
          style={{ background: C.eucalipto }}
        >
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
        {guardado && (
          <span className="text-[12.5px]" style={{ color: C.eucalipto }}>
            Guardado
          </span>
        )}
      </div>
    </div>
  );
}
