// Modo "llegada": mapa y stats congelados en el momento de llegar + mensaje
// editable, formularios de comentario (las intenciones ya no se ofrecen tras
// llegar), muro de comentarios, recopilatorio "minuto a minuto" (sin polling,
// modo ya congelado). Sigue fielmente el mockup, incluido el logo correcto
// (componente Logo, mojón + monigote rojiblanco — no VieiraMark).
//
// Client Component (a diferencia de la versión anterior a DT-013): necesita
// estado local (puntoResaltado) para la misma interacción de clic → mapa que
// ModoDurante.tsx. Las entradas del feed llegan ya cargadas server-side
// (app/page.tsx) como prop, para no hacer un fetch de cliente redundante en
// un modo que no cambia tras la carga inicial.

"use client";

import { useState } from "react";
import Mapa from "@/components/mapa/Mapa";
import Stats from "@/components/publico/Stats";
import ComentarioForm from "@/components/publico/ComentarioForm";
import MuroComentarios from "@/components/publico/MuroComentarios";
import MinutoAMinuto, { type EntradaMinutoAMinutoPublica } from "@/components/publico/MinutoAMinuto";
import type { ProgresoPublicoGuiado } from "@/lib/types";
import type { Textos } from "@/lib/textos/obtener-textos";

const C = { ink: "#1B211D", gold: "#C9A24B" };

// Este componente es exclusivo del modo guiado (DT-016): el modo libre usa
// ModoLlegadaLibre.tsx, un componente propio (sin condicionales aquí).
interface ModoLlegadaProps {
  progreso: ProgresoPublicoGuiado;
  mensajeLlegada: string;
  /** "hh:mm" ya formateado del tiempo total del intento. */
  tiempoTotal: string;
  /** Ritmo medio del intento completo, ya formateado (km/h). */
  ritmoMedio: string;
  trazaCoords: [number, number][];
  entradasMinutoAMinuto: EntradaMinutoAMinutoPublica[];
  /**
   * Histórico completo de puntos GPS del intento (DT-021, nota de cierre):
   * esta pantalla ya está "congelada" (sin polling, ver comentario de
   * cabecera), así que se carga una sola vez server-side
   * (ModoLlegadaConectado, app/page.tsx) — mismo dato que ya recibe
   * ModoLlegadaLibre.tsx para el modo libre.
   */
  puntosGps: { lat: number; lon: number }[];
  /** Solo se leen `llegada_kicker`/`llegada_titulo` — editables desde /admin. */
  textos: Textos;
}

export default function ModoLlegada({
  progreso,
  mensajeLlegada,
  tiempoTotal,
  ritmoMedio,
  trazaCoords,
  entradasMinutoAMinuto,
  puntosGps,
  textos,
}: ModoLlegadaProps) {
  const [puntoResaltado, setPuntoResaltado] = useState<{
    lat: number;
    lon: number;
    hora: string;
  } | null>(null);

  return (
    <section className="space-y-5 pt-6">
      <div className="relative overflow-hidden rounded-2xl p-6 text-center" style={{ background: "linear-gradient(180deg,#F3E6C9,#EFE8DA)", border: `1px solid ${C.gold}44` }}>
        <div className="relative">
          <div className="flex justify-center">
            <Logo />
          </div>
          <div className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em]" style={{ color: C.gold }}>
            {textos.llegada_kicker}
          </div>
          <h2 className="[font-family:var(--font-fraunces)] mt-1 text-[30px] font-semibold" style={{ color: C.ink }}>
            {textos.llegada_titulo}
          </h2>
          <p className="mx-auto mt-4 max-w-xs text-[14px] leading-relaxed" style={{ color: "#3C433E" }}>
            {mensajeLlegada}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-2xl border shadow-sm" style={{ borderColor: "#00000012" }}>
          <Mapa
            trazaCoords={trazaCoords}
            variante="ruta"
            hora="dia"
            modo="directo"
            posicionActual={progreso.ultimaPosicion}
            puntosGps={puntosGps}
            ultimaSenalTexto={null}
            puntoResaltado={puntoResaltado}
          />
        </div>
        <Stats tiempoEnMarcha={tiempoTotal} kmAndados={formatearKm(progreso.odometroKm)} ritmoMedio={ritmoMedio} textos={textos} />
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

function Logo() {
  return (
    <svg viewBox="0 0 54 96" width="48" height="85" fill="none" aria-label="Camino de Santi">
      <defs>
        <pattern id="logoStripeLlegada" patternUnits="userSpaceOnUse" width="4" height="96">
          <rect width="2" height="96" fill="#CE2029" />
          <rect x="2" width="2" height="96" fill="#ffffff" />
        </pattern>
      </defs>
      <ellipse cx="27" cy="89" rx="17" ry="2.6" fill="#00000012" />
      <path d="M35 13L39 15L45 85L39 87Z" fill="#A79D9D" stroke="#ffffff" strokeWidth="1" strokeLinejoin="round" />
      <path d="M20 13L35 13L39 87L13 87Z" fill="#C5BDBD" stroke="#ffffff" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M20 13L35 13L39 15L24 15Z" fill="#D4CDCD" stroke="#ffffff" strokeWidth="1" strokeLinejoin="round" />
      <rect x="19.5" y="17.5" width="14" height="15" rx="1.2" fill="#0A5BA6" stroke="#ffffff" strokeWidth="0.7" />
      <g stroke="#F5C518" strokeWidth="1" strokeLinecap="round">
        <path d="M23 31L20.5 21M23 31L22.5 19.8M23 31L25.5 19.4M23 31L28.5 20M23 31L31 21.5M23 31L31.8 25M23 31L31 28.5M23 31L28 30.5" />
      </g>
      <line x1="34" y1="49" x2="32" y2="73" stroke="#B98A5A" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M27 55L19.5 72L34.5 72Z" fill="url(#logoStripeLlegada)" stroke="#1B211D" strokeWidth="0.9" strokeLinejoin="round" />
      <circle cx="27" cy="49" r="5.5" fill="#E9C9A8" stroke="#1B211D" strokeWidth="0.9" />
      <circle cx="25.1" cy="49" r="0.7" fill="#1B211D" />
      <circle cx="28.9" cy="49" r="0.7" fill="#1B211D" />
      <path d="M22.4 44.2Q27 37.2 31.6 44.2Z" fill="#6B4A2E" />
      <ellipse cx="27" cy="44.4" rx="7.6" ry="1.8" fill="#6B4A2E" />
    </svg>
  );
}

function formatearKm(valor: number): string {
  return valor.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
