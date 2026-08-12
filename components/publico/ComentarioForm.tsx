// Formulario de comentarios → POST /api/comentarios.
// Sigue fielmente el mockup (design-sandbox/app/camino/page.tsx, ComentarioForm).

"use client";

import { useState } from "react";
import type { Textos } from "@/lib/textos/obtener-textos";

const C = { eucalipto: "#2F5D50" };

type Estado = "idle" | "enviando" | "enviado" | "error";
type Visibilidad = "publico" | "privado";

interface ComentarioFormProps {
  textos: Textos;
  /** Se llama al enviar con éxito, para que el muro pueda refrescarse. */
  onEnviado?: () => void;
}

export default function ComentarioForm({ textos, onEnviado }: ComentarioFormProps) {
  const [tipo, setTipo] = useState<Visibilidad>("publico");
  const [nombre, setNombre] = useState("");
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<Estado>("idle");

  async function enviar() {
    if (nombre.trim().length === 0 || texto.trim().length === 0 || estado === "enviando") return;
    setEstado("enviando");
    try {
      const response = await fetch("/api/comentarios", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nombre: nombre.trim(),
          texto: texto.trim(),
          visibilidad: tipo,
        }),
      });
      if (!response.ok) throw new Error("respuesta no ok");
      setEstado("enviado");
      setTexto("");
      onEnviado?.();
    } catch {
      setEstado("error");
    }
  }

  return (
    <div className="rounded-2xl border p-5" style={{ borderColor: "#00000012", background: "#FBFAF7" }}>
      <div className="flex items-center gap-2">
        <IconEye size={15} style={{ color: C.eucalipto }} />
        <h3 className="[font-family:var(--font-fraunces)] text-[19px] font-semibold" style={{ color: "#1B211D" }}>
          {textos.comentario_form_titulo}
        </h3>
      </div>
      <input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        maxLength={80}
        placeholder={textos.comentario_form_placeholder_nombre}
        className="mt-3 w-full rounded-lg border bg-white px-3 py-2 text-[14px] outline-none placeholder:text-[#A8AEA8]"
        style={{ borderColor: "#00000015" }}
      />
      <textarea
        rows={2}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        maxLength={1000}
        placeholder={textos.comentario_form_placeholder_texto}
        className="mt-2 w-full resize-none rounded-lg border bg-white px-3 py-2 text-[14px] outline-none placeholder:text-[#A8AEA8]"
        style={{ borderColor: "#00000015" }}
      />
      <div className="mt-3 flex items-center justify-between">
        <div className="inline-flex rounded-full border p-0.5 text-[12px]" style={{ borderColor: "#00000015" }}>
          {(
            [
              { valor: "publico", etiqueta: textos.comentario_form_label_publico },
              { valor: "privado", etiqueta: textos.comentario_form_label_privado },
            ] as const
          ).map(({ valor, etiqueta }) => (
            <button
              key={valor}
              onClick={() => setTipo(valor)}
              className="rounded-full px-3 py-1 font-medium capitalize transition-colors"
              style={tipo === valor ? { background: C.eucalipto, color: "white" } : { color: "#7C857F" }}
            >
              {etiqueta}
            </button>
          ))}
        </div>
        <button
          onClick={enviar}
          disabled={nombre.trim().length === 0 || texto.trim().length === 0 || estado === "enviando"}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
          style={{ background: C.eucalipto }}
        >
          <IconSend size={14} /> {estado === "enviando" ? "Enviando…" : textos.comentario_form_boton_enviar}
        </button>
      </div>

      {estado === "enviado" && (
        <p className="mt-2 text-[12.5px]" style={{ color: C.eucalipto }}>
          {textos.comentario_form_mensaje_exito}
        </p>
      )}
      {estado === "error" && (
        <p className="mt-2 text-[12.5px]" style={{ color: "#B03A2E" }}>
          {textos.mensaje_error_generico}
        </p>
      )}
    </div>
  );
}

function IconEye(p: React.SVGProps<SVGSVGElement> & { size?: number }) {
  const { size = 16, ...rest } = p;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
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
