// Modo "llegada" — intento en modo libre (DT-016): mapa, distancia restante,
// tiempo en marcha/km caminados/ritmo medio (CURRENT.md — ampliación de
// DT-016) congelados en el momento de llegar + mensaje editable,
// comentarios, recopilatorio "minuto a minuto" (sin polling, modo ya
// congelado). Las intenciones no se ofrecen tras llegar, igual que en
// ModoLlegada.tsx.
//
// No reutiliza el logo/título de ModoLlegada.tsx ("¡Ha llegado a Santiago!"):
// el modo libre está pensado para cualquier destino, no necesariamente
// Santiago (ver docs/tareas/CURRENT.md) — el título aquí es genérico.
//
// Client Component por el mismo motivo que ModoLlegada.tsx: estado local
// (puntoResaltado) para la interacción de clic → mapa. Los puntos GPS y las
// entradas del feed llegan ya cargados server-side (app/page.tsx) como prop.

"use client";

import { useState } from "react";
import Mapa from "@/components/mapa/Mapa";
import DistanciaRestante from "@/components/publico/DistanciaRestante";
import Stats from "@/components/publico/Stats";
import ComentarioForm from "@/components/publico/ComentarioForm";
import MuroComentarios from "@/components/publico/MuroComentarios";
import MinutoAMinuto, { type EntradaMinutoAMinutoPublica } from "@/components/publico/MinutoAMinuto";
import { calcularRitmoMedioIntento, calcularTiempoEnMarchaIntento } from "@/lib/ritmo";
import type { ProgresoPublicoLibre } from "@/lib/types";
import type { Textos } from "@/lib/textos/obtener-textos";

const C = { ink: "#1B211D", gold: "#C9A24B" };

interface PuntoGps {
  lat: number;
  lon: number;
}

interface ModoLlegadaLibreProps {
  progreso: ProgresoPublicoLibre;
  mensajeLlegada: string;
  puntosGps: PuntoGps[];
  entradasMinutoAMinuto: EntradaMinutoAMinutoPublica[];
  /** Momento en que arrancó el intento (started_at), para "tiempo en marcha". */
  startedAt: string | null;
  /** Momento en que se cerró el intento (ended_at) — referencia final del
   * tiempo en marcha y del ritmo medio, congelados desde la llegada. */
  endedAt: string | null;
  /** Solo se leen `llegada_libre_kicker`/`llegada_libre_titulo` — editables desde /admin. */
  textos: Textos;
}

export default function ModoLlegadaLibre({
  progreso,
  mensajeLlegada,
  puntosGps,
  entradasMinutoAMinuto,
  startedAt,
  endedAt,
  textos,
}: ModoLlegadaLibreProps) {
  const [puntoResaltado, setPuntoResaltado] = useState<{ lat: number; lon: number; hora: string } | null>(null);

  // "Llegada" ya usa timestamps reales de BD (started_at/ended_at), nunca la
  // hora del navegador — no tiene el problema de DT-020, mismo criterio que
  // ModoLlegada.tsx (modo guiado).
  const tiempoEnMarcha = calcularTiempoEnMarchaIntento(startedAt, endedAt);
  const ritmoMedio = calcularRitmoMedioIntento(progreso.odometroKm, startedAt, endedAt);

  return (
    <section className="space-y-5 pt-6">
      <div
        className="relative overflow-hidden rounded-2xl p-6 text-center"
        style={{ background: "linear-gradient(180deg,#F3E6C9,#EFE8DA)", border: `1px solid ${C.gold}44` }}
      >
        <div className="font-mono text-[11px] uppercase tracking-[0.2em]" style={{ color: C.gold }}>
          {textos.llegada_libre_kicker}
        </div>
        <h2 className="[font-family:var(--font-fraunces)] mt-1 text-[30px] font-semibold" style={{ color: C.ink }}>
          {textos.llegada_libre_titulo}
        </h2>
        <p className="mx-auto mt-4 max-w-xs text-[14px] leading-relaxed" style={{ color: "#3C433E" }}>
          {mensajeLlegada}
        </p>
      </div>

      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-2xl border shadow-sm" style={{ borderColor: "#00000012" }}>
          <Mapa
            trazaCoords={[]}
            variante="libre"
            hora="dia"
            posicionActual={progreso.ultimaPosicion}
            puntosGps={puntosGps}
            puntoResaltado={puntoResaltado}
          />
        </div>
        <DistanciaRestante km={progreso.distanciaRestanteKm} />
        <Stats
          tiempoEnMarcha={tiempoEnMarcha}
          kmAndados={formatearKm(progreso.odometroKm)}
          ritmoMedio={ritmoMedio}
        />
        <MinutoAMinuto
          polling={false}
          entradasIniciales={entradasMinutoAMinuto}
          onSeleccionarPunto={setPuntoResaltado}
        />
      </div>

      {/* tras llegar ya no se ofrecen intenciones; solo mensajes / felicitaciones */}
      <ComentarioForm />
      <MuroComentarios />
    </section>
  );
}

function formatearKm(valor: number): string {
  return valor.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
