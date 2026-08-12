// Sección "Mapa" (DT-021, docs/tecnico/decisiones-tecnicas.md): traza
// oficial completa + recorrido GPS real + el punto de la traza que usa
// realmente el cálculo de distancia restante (`puntoReferencia`), con línea
// discontinua entre ambos. Server Component sin polling, mismo patrón que
// SeccionPosicion.tsx: el admin recarga la página si quiere datos frescos.

import Mapa from "@/components/mapa/Mapa";
import { obtenerDatosMapaAdmin } from "@/lib/traza/datos-mapa-admin";

const C = { muted: "#4A5450" };

export default async function SeccionMapa() {
  const datos = await obtenerDatosMapaAdmin();

  if (datos.modo === "sin-intento") {
    return (
      <p className="text-[14px]" style={{ color: C.muted }}>
        No hay ningún intento activo.
      </p>
    );
  }

  if (datos.modo === "libre") {
    return (
      <div className="space-y-3">
        <p
          className="rounded-xl border px-4 py-3 text-[13.5px]"
          style={{ borderColor: "#00000012", background: "white", color: C.muted }}
        >
          Este intento es modo libre, sin traza oficial de referencia.
        </p>
        <div className="relative overflow-hidden rounded-2xl border shadow-sm" style={{ borderColor: "#00000012" }}>
          <Mapa
            trazaCoords={[]}
            variante="libre"
            hora="dia"
            modo="directo"
            posicionActual={datos.posicionActual}
            puntosGps={datos.trazaReal}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border shadow-sm" style={{ borderColor: "#00000012" }}>
      <Mapa
        trazaCoords={datos.trazaOficial}
        variante="ruta"
        hora="dia"
        modo="directo"
        posicionActual={datos.posicionActual}
        puntosGps={datos.trazaReal}
        trazaOficialComparacion={datos.trazaOficial}
        puntoReferencia={datos.puntoReferencia}
      />
    </div>
  );
}
