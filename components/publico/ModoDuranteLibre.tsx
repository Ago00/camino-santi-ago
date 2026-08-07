// Modo "durante" — intento en modo libre (DT-016): mapa sin traza oficial de
// fondo (solo la polilínea de puntos GPS recibidos) + distancia restante en
// línea recta al destino. Sin ETA, sin ritmo, sin % de progreso, sin
// odómetro (fuera de alcance explícito de DT-016) — de ahí que este
// componente no reutilice Mojon.tsx ni Stats.tsx (pensados para el dominio
// guiado). Intenciones, comentarios y minuto a minuto se mantienen igual que
// en ModoDurante.tsx (mismos componentes, sin tocarlos).
//
// Polling client-side cada 30 s a GET /api/progreso (mismo patrón que
// ModoDurante.tsx, DT-007), que en este modo devuelve la rama "libre" de
// ProgresoPublico. Los puntos GPS del mapa se cargan una vez server-side
// (histórico completo, ver app/page.tsx) y se amplían en el cliente cuando
// el poll trae una `ultimaPosicion` con `ts` distinto de la última conocida
// — así el trazado crece según van llegando posiciones nuevas sin necesitar
// un endpoint nuevo ni ampliar el contrato de ProgresoPublico.

"use client";

import { useEffect, useState } from "react";
import Mapa from "@/components/mapa/Mapa";
import DistanciaRestante from "@/components/publico/DistanciaRestante";
import IntencionForm from "@/components/publico/IntencionForm";
import ComentarioForm from "@/components/publico/ComentarioForm";
import MuroComentarios from "@/components/publico/MuroComentarios";
import MinutoAMinuto from "@/components/publico/MinutoAMinuto";
import { bandaHoraria } from "@/lib/cielo";
import type { ProgresoPublicoLibre } from "@/lib/types";

const POLLING_MS = 30_000;

interface PuntoGps {
  lat: number;
  lon: number;
}

interface ModoDuranteLibreProps {
  progresoInicial: ProgresoPublicoLibre;
  /** Histórico completo de puntos GPS del intento, cargado server-side. */
  puntosGpsIniciales: PuntoGps[];
}

export default function ModoDuranteLibre({ progresoInicial, puntosGpsIniciales }: ModoDuranteLibreProps) {
  const [progreso, setProgreso] = useState(progresoInicial);
  const [puntosGps, setPuntosGps] = useState<PuntoGps[]>(puntosGpsIniciales);
  const [ultimoTs, setUltimoTs] = useState<string | null>(progresoInicial.ultimaPosicion?.ts ?? null);
  const [hora, setHora] = useState(() => bandaHoraria(new Date()));
  const [puntoResaltado, setPuntoResaltado] = useState<{ lat: number; lon: number; hora: string } | null>(null);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const response = await fetch("/api/progreso");
        if (!response.ok) return;
        const data: ProgresoPublicoLibre = await response.json();
        setProgreso(data);
        if (data.ultimaPosicion && data.ultimaPosicion.ts !== ultimoTs) {
          const nuevaPosicion = data.ultimaPosicion;
          setUltimoTs(nuevaPosicion.ts);
          setPuntosGps((previos) => [...previos, { lat: nuevaPosicion.lat, lon: nuevaPosicion.lon }]);
        }
      } catch {
        // Fallo puntual de red: se mantiene el último estado conocido, el
        // próximo intervalo de polling reintenta.
      }
    }, POLLING_MS);
    return () => clearInterval(id);
  }, [ultimoTs]);

  useEffect(() => {
    const id = setInterval(() => setHora(bandaHoraria(new Date())), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="space-y-5 pt-5">
      <div className="space-y-3">
        <div className="relative overflow-hidden rounded-2xl border shadow-sm" style={{ borderColor: "#00000012" }}>
          <Mapa
            trazaCoords={[]}
            variante="libre"
            hora={hora}
            posicionActual={progreso.ultimaPosicion}
            puntosGps={puntosGps}
            puntoResaltado={puntoResaltado}
          />
        </div>
        <DistanciaRestante km={progreso.distanciaRestanteKm} />
        <MinutoAMinuto polling onSeleccionarPunto={setPuntoResaltado} />
      </div>

      <IntencionForm />
      <ComentarioForm />
      <MuroComentarios />
    </section>
  );
}
