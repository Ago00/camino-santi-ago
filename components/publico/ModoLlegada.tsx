// Modo "llegada": mapa y stats congelados en el momento de llegar + mensaje
// editable, formularios de comentario (las intenciones ya no se ofrecen tras
// llegar), muro de comentarios, recopilatorio "minuto a minuto" (sin polling,
// modo ya congelado). Sigue fielmente el mockup, incluido el logo correcto
// (mojón + monigote rojiblanco — no VieiraMark), ahora dentro de
// RecuadroLlegada.tsx (DT-024, extraído para compartirlo con la preview del
// modal "Finalizar" del panel admin). Foto de llegada opcional (DT-024,
// FotoLlegada.tsx) entre el recuadro y el mapa.
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
import RecuadroLlegada from "@/components/publico/RecuadroLlegada";
import FotoLlegada from "@/components/publico/FotoLlegada";
import type { ProgresoPublicoGuiado } from "@/lib/types";
import type { Textos } from "@/lib/textos/obtener-textos";

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
  /** Foto opcional de llegada (DT-024), subida desde el modal "Finalizar"
   * del panel admin. null = sin foto, no se renderiza ningún hueco. */
  fotoLlegadaUrl: string | null;
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
  fotoLlegadaUrl,
}: ModoLlegadaProps) {
  const [puntoResaltado, setPuntoResaltado] = useState<{
    lat: number;
    lon: number;
    hora: string;
  } | null>(null);

  return (
    <section className="space-y-5 pt-6">
      <RecuadroLlegada kicker={textos.llegada_kicker} titulo={textos.llegada_titulo} mensaje={mensajeLlegada} />

      {fotoLlegadaUrl && <FotoLlegada url={fotoLlegadaUrl} />}

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
          textos={textos}
        />
      </div>

      {/* tras llegar ya no se ofrecen intenciones; solo mensajes / felicitaciones */}
      <ComentarioForm textos={textos} />
      <MuroComentarios textos={textos} />
    </section>
  );
}

function formatearKm(valor: number): string {
  return valor.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
