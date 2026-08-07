// Modo "durante": mapa en directo, mojón, stats, formularios, muro.
// Sigue fielmente el mockup (design-sandbox/app/camino/page.tsx, ModoDurante).
// Polling client-side cada 30 s a GET /api/progreso (DT-007) para reflejar
// la posición y el progreso más recientes sin depender de Realtime.

"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import Mapa from "@/components/mapa/Mapa";
import Mojon from "@/components/publico/Mojon";
import Stats from "@/components/publico/Stats";
import IntencionForm from "@/components/publico/IntencionForm";
import ComentarioForm from "@/components/publico/ComentarioForm";
import MuroComentarios from "@/components/publico/MuroComentarios";
import MinutoAMinuto from "@/components/publico/MinutoAMinuto";
import { bandaHoraria } from "@/lib/cielo";
import type { ProgresoPublicoGuiado } from "@/lib/types";

const C = { ink: "#1B211D", ember: "#D9773B" };
const POLLING_MS = 30_000;

// Este componente es exclusivo del modo guiado (DT-016): el modo libre usa
// ModoDuranteLibre.tsx, un componente propio (sin condicionales aquí).
interface ModoDuranteProps {
  progresoInicial: ProgresoPublicoGuiado;
  /** Momento en que arrancó el intento (started_at), para "tiempo en marcha". */
  iniciadoEn: string | null;
  trazaCoords: [number, number][];
}

export default function ModoDurante({ progresoInicial, iniciadoEn, trazaCoords }: ModoDuranteProps) {
  const [progreso, setProgreso] = useState(progresoInicial);
  const [hora, setHora] = useState(() => bandaHoraria(new Date()));
  const [ahora, setAhora] = useState(() => new Date());
  const [puntoResaltado, setPuntoResaltado] = useState<{
    lat: number;
    lon: number;
    hora: string;
  } | null>(null);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const response = await fetch("/api/progreso");
        if (response.ok) {
          setProgreso(await response.json());
        }
      } catch {
        // Fallo puntual de red: se mantiene el último progreso conocido,
        // el próximo intervalo de polling reintenta.
      }
    }, POLLING_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setHora(bandaHoraria(new Date()));
      setAhora(new Date());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const tiempoEnMarcha = formatearTiempoEnMarcha(iniciadoEn, ahora);
  const ritmoMedio = calcularRitmoMedio(progreso.odometroKm, iniciadoEn, ahora);
  const ultimaSenalTexto = formatearUltimaSenal(progreso.ultimaPosicion?.ts ?? null, ahora);

  return (
    <section className="space-y-5 pt-5">
      <CintaEnDirecto />

      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-2xl border shadow-sm" style={{ borderColor: "#00000012" }}>
          <Mapa
            trazaCoords={trazaCoords}
            hora={hora}
            modo="directo"
            posicionActual={progreso.ultimaPosicion}
            ultimaSenalTexto={ultimaSenalTexto}
            puntoResaltado={puntoResaltado}
          />
        </div>
        <Mojon kmRestantes={formatearKm(progreso.kmRestantes)} pct={progreso.porcentaje} />
        <Stats
          tiempoEnMarcha={tiempoEnMarcha}
          kmAndados={formatearKm(progreso.odometroKm)}
          ritmoMedio={ritmoMedio}
        />
        <MinutoAMinuto polling onSeleccionarPunto={setPuntoResaltado} />
      </div>

      <IntencionForm />
      <ComentarioForm />
      <MuroComentarios />
    </section>
  );
}

function CintaEnDirecto() {
  return (
    <div className="relative w-full overflow-hidden rounded-2xl p-4 shadow-md" style={{ background: "linear-gradient(120deg,#1B211D 0%,#2B2018 100%)" }}>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3"
        style={{ background: "linear-gradient(90deg,transparent,#ffffff22,transparent)" }}
        animate={{ x: ["0%", "500%"] }}
        transition={{ repeat: Infinity, duration: 2.6, ease: "easeInOut" }}
      />
      <div className="relative flex items-center gap-3">
        <span className="relative grid h-3 w-3 place-items-center">
          <motion.span className="absolute h-3 w-3 rounded-full" style={{ background: C.ember }} animate={{ scale: [1, 2.2], opacity: [0.6, 0] }} transition={{ repeat: Infinity, duration: 1.6 }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: C.ember }} />
        </span>
        <div className="flex-1">
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/70">En directo · ahora mismo</div>
          <div className="[font-family:var(--font-fraunces)] text-[19px] font-semibold text-white">Estoy caminando</div>
        </div>
      </div>
    </div>
  );
}

function formatearKm(valor: number): string {
  return valor.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatearTiempoEnMarcha(iniciadoEn: string | null, ahora: Date): string {
  if (!iniciadoEn) return "—";
  const inicio = new Date(iniciadoEn).getTime();
  const transcurridoMin = Math.max(0, Math.floor((ahora.getTime() - inicio) / 60_000));
  const horas = Math.floor(transcurridoMin / 60);
  const minutos = transcurridoMin % 60;
  return `${horas}:${String(minutos).padStart(2, "0")}`;
}

function calcularRitmoMedio(odometroKm: number, iniciadoEn: string | null, ahora: Date): string {
  if (!iniciadoEn) return "—";
  const inicio = new Date(iniciadoEn).getTime();
  const horasTranscurridas = (ahora.getTime() - inicio) / 3_600_000;
  if (horasTranscurridas <= 0) return "—";
  return (odometroKm / horasTranscurridas).toLocaleString("es-ES", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function formatearUltimaSenal(ts: string | null, ahora: Date): string | null {
  if (!ts) return null;
  const minutos = Math.max(0, Math.round((ahora.getTime() - new Date(ts).getTime()) / 60_000));
  if (minutos < 1) return "última señal hace instantes";
  if (minutos === 1) return "última señal hace 1 min";
  return `última señal hace ${minutos} min`;
}
