// Composer del feed "minuto a minuto": texto + foto opcional, publicado con
// un <form action={crearMinutoAMinuto}> (Server Action). Next.js 16 soporta
// File en FormData de Server Actions de forma nativa, sin fetch manual.
// Sigue el mockup (design-sandbox/app/camino/admin-minuto-a-minuto/page.tsx).

"use client";

import { useRef, useState, useTransition } from "react";
import { crearMinutoAMinuto } from "@/app/admin/actions";

const C = { ink: "#1B211D", muted: "#4A5450", verde: "#2F5D50", peligro: "#B03A2E" };

export default function ComposerMinutoAMinuto() {
  const formRef = useRef<HTMLFormElement>(null);
  const inputFotoRef = useRef<HTMLInputElement>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [pendiente, startTransition] = useTransition();

  function quitarFoto() {
    setFotoPreview(null);
    if (inputFotoRef.current) inputFotoRef.current.value = "";
  }

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      await crearMinutoAMinuto(formData);
      formRef.current?.reset();
      setTexto("");
      setFotoPreview(null);
    });
  }

  return (
    <form
      ref={formRef}
      action={onSubmit}
      className="rounded-2xl border p-4"
      style={{ borderColor: "#00000012", background: "white" }}
    >
      <textarea
        name="texto"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="¿Qué está pasando ahora mismo?"
        rows={3}
        maxLength={500}
        required
        className="w-full resize-none rounded-lg border p-3 text-[14px] outline-none"
        style={{ borderColor: "#00000015", color: C.ink }}
      />

      <input
        ref={inputFotoRef}
        type="file"
        name="foto"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          setFotoPreview(archivo ? URL.createObjectURL(archivo) : null);
        }}
      />

      {fotoPreview && (
        <div className="relative mt-2 inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element -- preview local de blob URL, no una imagen de red */}
          <img src={fotoPreview} alt="" className="h-20 w-20 rounded-lg object-cover" />
          <button
            type="button"
            onClick={quitarFoto}
            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold text-white shadow"
            style={{ background: C.peligro }}
            aria-label="Quitar foto"
          >
            ×
          </button>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => inputFotoRef.current?.click()}
          className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium"
          style={{ borderColor: "#00000015", color: C.muted, background: "#FBFAF7" }}
        >
          <IconCamera size={14} /> Adjuntar foto
        </button>

        <button
          type="submit"
          disabled={!texto.trim() || pendiente}
          className="rounded-full px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
          style={{ background: C.verde }}
        >
          {pendiente ? "Publicando…" : "Publicar"}
        </button>
      </div>
    </form>
  );
}

function IconCamera({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
