// Modo "durante" — intento en modo libre (DT-016): mapa sin traza oficial de
// fondo (solo la polilínea de puntos GPS recibidos) + distancia restante en
// línea recta al destino + tiempo en marcha/km caminados/ritmo medio
// (CURRENT.md — ampliación de DT-016). Sin ETA ni % de progreso (siguen sin
// sentido sin una ruta fija), de ahí que este componente no reutilice
// Mojon.tsx — pero sí reutiliza Stats.tsx tal cual, igual que ModoDurante.tsx.
// Intenciones, comentarios y minuto a minuto se mantienen igual que en
// ModoDurante.tsx (mismos componentes, sin tocarlos).
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
import Stats from "@/components/publico/Stats";
import IntencionForm from "@/components/publico/IntencionForm";
import ComentarioForm from "@/components/publico/ComentarioForm";
import MuroComentarios from "@/components/publico/MuroComentarios";
import MinutoAMinuto from "@/components/publico/MinutoAMinuto";
import { bandaHoraria } from "@/lib/cielo";
import { calcularRitmoMedioIntento, calcularTiempoEnMarchaIntento } from "@/lib/ritmo";
import type { ProgresoPublicoLibre } from "@/lib/types";
import type { Textos } from "@/lib/textos/obtener-textos";

const POLLING_MS = 30_000;

interface PuntoGps {
  lat: number;
  lon: number;
}

interface ModoDuranteLibreProps {
  progresoInicial: ProgresoPublicoLibre;
  /** Histórico completo de puntos GPS del intento, cargado server-side. */
  puntosGpsIniciales: PuntoGps[];
  /** Momento en que arrancó el intento (started_at), para "tiempo en marcha". */
  startedAt: string | null;
  /**
   * Textos editables desde /admin (fontanería previa a repartir su uso real
   * entre DistanciaRestante/Stats/formularios/MinutoAMinuto).
   */
  textos: Textos;
}

export default function ModoDuranteLibre({
  progresoInicial,
  puntosGpsIniciales,
  startedAt,
  textos,
}: ModoDuranteLibreProps) {
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

  // DT-020: tiempo en marcha y ritmo medio se anclan siempre al último punto
  // GPS real (`ultimaPosicion?.ts`), nunca a la hora del navegador de quien
  // mira — mismo criterio que ModoDurante.tsx (modo guiado). Este componente
  // no mantiene ningún estado "ahora" para estas dos cifras, así que no hay
  // forma de que un cambio futuro las vuelva a alimentar con el reloj del
  // cliente sin tocar explícitamente esta línea.
  const referenciaFinal = progreso.ultimaPosicion?.ts ?? null;
  const tiempoEnMarcha = calcularTiempoEnMarchaIntento(startedAt, referenciaFinal);
  const ritmoMedio = calcularRitmoMedioIntento(progreso.odometroKm, startedAt, referenciaFinal);

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

function formatearKm(valor: number): string {
  return valor.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
