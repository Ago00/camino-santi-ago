// Formulario de intenciones → POST /api/intenciones.
// Sigue fielmente el mockup (design-sandbox/app/camino/page.tsx, IntencionForm).

"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

const C = { violet: "#3B357A" };

type Estado = "idle" | "enviando" | "enviado" | "error";

export default function IntencionForm() {
  const [anon, setAnon] = useState(false);
  const [texto, setTexto] = useState("");
  const [nombre, setNombre] = useState("");
  const [estado, setEstado] = useState<Estado>("idle");

  async function enviar() {
    if (texto.trim().length === 0 || estado === "enviando") return;
    setEstado("enviando");
    try {
      const response = await fetch("/api/intenciones", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          texto: texto.trim(),
          nombre: anon ? undefined : nombre.trim() || undefined,
        }),
      });
      if (!response.ok) throw new Error("respuesta no ok");
      setEstado("enviado");
      setTexto("");
      setNombre("");
    } catch {
      setEstado("error");
    }
  }

  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: "#00000012", background: "#FBFAF7" }}>
      <div className="flex items-center gap-2">
        <IconLock size={15} style={{ color: C.violet }} />
        <h3 className="[font-family:var(--font-fraunces)] text-[19px] font-semibold" style={{ color: "#1B211D" }}>
          Deja una intención
        </h3>
      </div>
      <p className="mt-1 text-[13px]" style={{ color: "#7C857F" }}>
        Solo la leeré yo. Camino por ella.
      </p>
      <textarea
        rows={2}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        maxLength={1000}
        placeholder="Por quién o por qué quieres que camine…"
        className="mt-3 w-full resize-none rounded-lg border bg-white px-3 py-2 text-[14px] outline-none placeholder:text-[#A8AEA8]"
        style={{ borderColor: "#00000015" }}
      />

      <AnimatePresence initial={false}>
        {!anon && (
          <motion.input
            key="nombre"
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 8 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={80}
            placeholder="Tu nombre"
            className="w-full rounded-lg border bg-white px-3 py-2 text-[14px] outline-none placeholder:text-[#A8AEA8]"
            style={{ borderColor: "#00000015" }}
          />
        )}
      </AnimatePresence>

      <div className="mt-3 flex items-center justify-between">
        <label className="flex items-center gap-2 text-[13px]" style={{ color: "#5B6560" }}>
          <input type="checkbox" className="accent-[#3B357A]" checked={anon} onChange={(e) => setAnon(e.target.checked)} />
          Enviarla de forma anónima
        </label>
        <button
          onClick={enviar}
          disabled={texto.trim().length === 0 || estado === "enviando"}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
          style={{ background: C.violet }}
        >
          <IconSend size={14} /> {estado === "enviando" ? "Enviando…" : "Ofrecer"}
        </button>
      </div>

      {estado === "enviado" && (
        <p className="mt-2 text-[12.5px]" style={{ color: "#2F5D50" }}>
          Gracias, tu intención ha quedado guardada.
        </p>
      )}
      {estado === "error" && (
        <p className="mt-2 text-[12.5px]" style={{ color: "#B03A2E" }}>
          No se ha podido enviar. Inténtalo de nuevo.
        </p>
      )}
    </div>
  );
}

function IconLock(p: React.SVGProps<SVGSVGElement> & { size?: number }) {
  const { size = 16, ...rest } = p;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
function IconSend(p: React.SVGProps<SVGSVGElement> & { size?: number }) {
  const { size = 16, ...rest } = p;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
    </svg>
  );
}
