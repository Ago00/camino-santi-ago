// Modal "Finalizar" (DT-024): sustituye el window.confirm() + <textarea>
// plano que usaba antes FinalizarYReiniciar (ActividadAcciones.tsx). Además
// del mensaje de llegada, permite adjuntar/reemplazar/quitar la foto opcional
// de la pantalla de llegada, con una preview real (RecuadroLlegada.tsx +
// FotoLlegada.tsx, los mismos componentes que pinta la web pública) — no una
// aproximación en texto plano.
//
// La foto pasa por prepararFotoParaSubida (DT-017, mismo patrón que
// ComposerMinutoAMinuto.tsx) y el envío usa ejecutarConReintentos: el panel
// se usa andando con 4G irregular, y "Finalizar" es tan sensible a un corte
// de red a mitad de subida como "Publicar" en el feed.
//
// onSubmit + preventDefault (no <form action={fn}>), mismo motivo que
// ComposerMinutoAMinuto.tsx: conservar el <input type="file"> no controlado
// si el envío falla.

"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { finalizarReto } from "@/app/admin/actions";
import { prepararFotoParaSubida } from "@/lib/imagen/preparar-foto";
import { ejecutarConReintentos } from "@/lib/envio/reintentar";
import { describirFalloDeEnvio, esControlDeFlujoDeNext } from "@/lib/envio/errores-de-envio";
import RecuadroLlegada from "@/components/publico/RecuadroLlegada";
import FotoLlegada from "@/components/publico/FotoLlegada";

const C = { ink: "#1B211D", muted: "#4A5450", verde: "#2F5D50", peligro: "#B03A2E" };

/**
 * Estado de la foto en el modal. Se traduce a los tres casos que distingue
 * `finalizarReto` (ver su comentario en app/admin/actions.ts):
 * - "existente" / "ninguna" → no se envía ni `foto` ni `quitarFoto`: la
 *   columna no se toca.
 * - "nueva" → se envía `foto` (ya comprimida).
 * - "quitada" → se envía `quitarFoto=true`.
 */
type EstadoFoto =
  | { tipo: "existente"; url: string }
  | { tipo: "nueva"; archivo: File; previewUrl: string }
  | { tipo: "quitada" }
  | { tipo: "ninguna" };

type EstadoEnvio =
  | { fase: "inactivo" }
  | { fase: "preparando-foto" }
  | { fase: "publicando" }
  | { fase: "reintentando"; intento: number }
  | { fase: "error"; mensaje: string };

interface ModalFinalizarProps {
  mensajeLlegadaDefault: string;
  fotoLlegadaUrlActual: string | null;
  kicker: string;
  titulo: string;
  onClose: () => void;
}

export default function ModalFinalizar({
  mensajeLlegadaDefault,
  fotoLlegadaUrlActual,
  kicker,
  titulo,
  onClose,
}: ModalFinalizarProps) {
  const inputFotoRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [mensaje, setMensaje] = useState(mensajeLlegadaDefault);
  const [foto, setFoto] = useState<EstadoFoto>(
    fotoLlegadaUrlActual ? { tipo: "existente", url: fotoLlegadaUrlActual } : { tipo: "ninguna" }
  );
  const [estado, setEstado] = useState<EstadoEnvio>({ fase: "inactivo" });
  const [pendiente, startTransition] = useTransition();

  function liberarPreviewAnterior() {
    if (previewUrlRef.current !== null) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }

  function onSeleccionarFoto(archivo: File | null) {
    liberarPreviewAnterior();
    if (!archivo) return;
    const previewUrl = URL.createObjectURL(archivo);
    previewUrlRef.current = previewUrl;
    setFoto({ tipo: "nueva", archivo, previewUrl });
  }

  function quitarFoto() {
    liberarPreviewAnterior();
    if (inputFotoRef.current) inputFotoRef.current.value = "";
    setFoto({ tipo: "quitada" });
  }

  function onSubmit(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("mensaje", mensaje);

        if (foto.tipo === "nueva") {
          setEstado({ fase: "preparando-foto" });
          const preparada = await prepararFotoParaSubida(foto.archivo);
          if (preparada.estado === "demasiado-grande") {
            setEstado({ fase: "error", mensaje: preparada.mensaje });
            return;
          }
          formData.set("foto", preparada.foto);
        } else if (foto.tipo === "quitada") {
          formData.set("quitarFoto", "true");
        }

        setEstado({ fase: "publicando" });
        const resultado = await ejecutarConReintentos(() => finalizarReto(formData), {
          alReintentar: (intento) => setEstado({ fase: "reintentando", intento }),
        });

        if (!resultado.ok) {
          setEstado({ fase: "error", mensaje: resultado.mensaje });
          return;
        }
        onClose();
      } catch (error) {
        if (esControlDeFlujoDeNext(error)) throw error;
        setEstado({ fase: "error", mensaje: describirFalloDeEnvio(error) });
      }
    });
  }

  const previewUrlFoto =
    foto.tipo === "existente" ? foto.url : foto.tipo === "nueva" ? foto.previewUrl : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Finalizar el reto"
    >
      <div
        className="max-h-[92dvh] w-full max-w-[460px] overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl"
        style={{ color: C.ink }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold">Finalizar el reto</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={pendiente}
            aria-label="Cerrar sin finalizar"
            className="text-[20px] leading-none disabled:opacity-40"
            style={{ color: C.muted }}
          >
            ×
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-[12.5px] font-medium" style={{ color: C.muted }}>
              Mensaje de llegada
            </label>
            <textarea
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              rows={3}
              maxLength={1000}
              required
              className="mt-1 w-full resize-none rounded-lg border bg-white px-3 py-2 text-[14px] outline-none"
              style={{ borderColor: "#00000015" }}
            />
          </div>

          <div>
            <label className="text-[12.5px] font-medium" style={{ color: C.muted }}>
              Foto de llegada (opcional)
            </label>
            <input
              ref={inputFotoRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => onSeleccionarFoto(e.target.files?.[0] ?? null)}
            />
            <div className="mt-2">
              {previewUrlFoto ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- preview local (blob) o foto ya subida a Storage */}
                  <img src={previewUrlFoto} alt="" className="h-32 w-full rounded-lg object-cover" />
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
              ) : (
                <button
                  type="button"
                  onClick={() => inputFotoRef.current?.click()}
                  className="rounded-full border px-3 py-1.5 text-[12.5px] font-medium"
                  style={{ borderColor: "#00000015", color: C.muted, background: "#FBFAF7" }}
                >
                  Adjuntar foto
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[12.5px] font-medium" style={{ color: C.muted }}>
              Así se verá en la web pública
            </div>
            <div className="space-y-3">
              <RecuadroLlegada kicker={kicker} titulo={titulo} mensaje={mensaje} />
              {previewUrlFoto && <FotoLlegada url={previewUrlFoto} />}
            </div>
          </div>

          {estado.fase === "error" && (
            <p
              role="alert"
              className="rounded-lg px-3 py-2 text-[12.5px] leading-snug"
              style={{ background: "#B03A2E12", color: C.peligro }}
            >
              {estado.mensaje}
            </p>
          )}

          {estado.fase === "reintentando" && (
            <p aria-live="polite" className="text-[12.5px]" style={{ color: C.muted }}>
              No salió a la primera. Reintentando… (intento {estado.intento})
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={pendiente}
              className="rounded-full px-4 py-2 text-[13px] font-medium disabled:opacity-50"
              style={{ color: C.muted, border: "1px solid #00000015" }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!mensaje.trim() || pendiente}
              className="rounded-full px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
              style={{ background: C.verde }}
            >
              {etiquetaDelBoton(estado, pendiente)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function etiquetaDelBoton(estado: EstadoEnvio, pendiente: boolean): string {
  if (!pendiente) return "Finalizar";
  if (estado.fase === "preparando-foto") return "Preparando foto…";
  if (estado.fase === "reintentando") return "Reintentando…";
  return "Finalizando…";
}
