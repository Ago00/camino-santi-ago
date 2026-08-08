// Composer del feed "minuto a minuto": texto + foto opcional, enviado a la
// Server Action `crearMinutoAMinuto` desde un `onSubmit` propio (ver el
// porqué en el comentario de la función).
// Sigue el mockup (design-sandbox/app/camino/admin-minuto-a-minuto/page.tsx).
//
// Antes de enviarla, la foto pasa por `prepararFotoParaSubida` (DT-017): las
// de más de ~4,4 MB nunca llegaban al servidor porque Vercel las corta en el
// edge con un 413 mudo, que es lo que dejó a Santi 2 h 30 min sin poder
// publicar fotos el 2026-08-07. Si el envío falla, se muestra el motivo y
// **no se limpia el formulario**: el texto y la foto siguen ahí para reintentar.

"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { crearMinutoAMinuto } from "@/app/admin/actions";
import { prepararFotoParaSubida } from "@/lib/imagen/preparar-foto";
import { ejecutarConReintentos } from "@/lib/envio/reintentar";
import { describirFalloDeEnvio, esControlDeFlujoDeNext } from "@/lib/envio/errores-de-envio";

const C = { ink: "#1B211D", muted: "#4A5450", verde: "#2F5D50", peligro: "#B03A2E" };

type EstadoEnvio =
  | { fase: "inactivo" }
  | { fase: "preparando-foto" }
  | { fase: "publicando" }
  | { fase: "reintentando"; intento: number }
  | { fase: "error"; mensaje: string };

/**
 * Las fases "inactivo" y "error" no tienen etiqueta propia: mientras el envío
 * está en curso nunca se está en ellas, salvo en el instante entre el submit y
 * el primer cambio de estado — de ahí que ese caso caiga en "Publicando…".
 */
function etiquetaDelBoton(estado: EstadoEnvio, pendiente: boolean): string {
  if (!pendiente) return "Publicar";
  if (estado.fase === "preparando-foto") return "Preparando foto…";
  if (estado.fase === "reintentando") return "Reintentando…";
  return "Publicando…";
}

export default function ComposerMinutoAMinuto() {
  const formRef = useRef<HTMLFormElement>(null);
  const inputFotoRef = useRef<HTMLInputElement>(null);
  const urlPreviewRef = useRef<string | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<EstadoEnvio>({ fase: "inactivo" });
  const [pendiente, startTransition] = useTransition();

  /**
   * Cambia la miniatura liberando siempre la URL de blob anterior: cada una
   * mantiene viva en memoria la foto entera (4-12 MB), y esto se usa durante
   * 30 h seguidas desde un móvil. Sin revocarlas, iOS acaba descargando la
   * pestaña por presión de memoria — con lo que estuviera escrito dentro.
   */
  function mostrarPreviewDe(archivo: File | null) {
    if (urlPreviewRef.current !== null) URL.revokeObjectURL(urlPreviewRef.current);
    urlPreviewRef.current = archivo ? URL.createObjectURL(archivo) : null;
    setFotoPreview(urlPreviewRef.current);
  }

  function quitarFoto() {
    mostrarPreviewDe(null);
    if (inputFotoRef.current) inputFotoRef.current.value = "";
  }

  function limpiarTrasPublicar() {
    formRef.current?.reset();
    setTexto("");
    mostrarPreviewDe(null);
    setEstado({ fase: "inactivo" });
  }

  /**
   * El envío va por `onSubmit` + `preventDefault`, no por `<form action={fn}>`.
   *
   * React 19 pide un reset del formulario **antes** de ejecutar una `action`
   * de tipo función (`startHostTransition` → `requestFormReset` en
   * react-dom), y ese reset se aplica al terminar la transición, haya ido
   * bien o mal. Con `action` no habría forma de conservar la foto adjunta
   * cuando falla el envío: el `<input type="file">` es no controlado y se
   * vaciaría, dejando una miniatura en pantalla sin fichero detrás. Y no
   * perder texto ni foto al fallar es un requisito explícito de esta tarea.
   */
  function onSubmit(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formData = new FormData(evento.currentTarget);

    startTransition(async () => {
      try {
        const foto = formData.get("foto");
        if (foto instanceof File && foto.size > 0) {
          setEstado({ fase: "preparando-foto" });
          const preparada = await prepararFotoParaSubida(foto);
          if (preparada.estado === "demasiado-grande") {
            // Se corta aquí a propósito: enviarla gastaría 40 s de 4G rural en
            // una petición que el edge de Vercel va a rechazar igualmente.
            setEstado({ fase: "error", mensaje: preparada.mensaje });
            return;
          }
          formData.set("foto", preparada.foto);
        }

        setEstado({ fase: "publicando" });
        const resultado = await ejecutarConReintentos(() => crearMinutoAMinuto(formData), {
          alReintentar: (intento) => setEstado({ fase: "reintentando", intento }),
        });

        if (!resultado.ok) {
          setEstado({ fase: "error", mensaje: resultado.mensaje });
          return;
        }
        limpiarTrasPublicar();
      } catch (error) {
        if (esControlDeFlujoDeNext(error)) throw error;
        setEstado({ fase: "error", mensaje: describirFalloDeEnvio(error) });
      }
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
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
        onChange={(e) => mostrarPreviewDe(e.target.files?.[0] ?? null)}
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

      {estado.fase === "error" && (
        <p
          role="alert"
          className="mt-3 rounded-lg px-3 py-2 text-[12.5px] leading-snug"
          style={{ background: "#B03A2E12", color: C.peligro }}
        >
          {estado.mensaje} Nada de lo que has escrito se ha perdido.
        </p>
      )}

      {estado.fase === "reintentando" && (
        <p
          aria-live="polite"
          className="mt-3 text-[12.5px]"
          style={{ color: C.muted }}
        >
          No salió a la primera. Reintentando… (intento {estado.intento})
        </p>
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
          {etiquetaDelBoton(estado, pendiente)}
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
