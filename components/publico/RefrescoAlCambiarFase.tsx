// Detecta cambios de fase del intento activo y recarga la página entera
// cuando ocurren (DT-012, docs/tecnico/decisiones-tecnicas.md). Se renderiza
// una única vez en app/page.tsx, junto al modo activo — cubre los 3 modos
// (antes/durante/llegada) sin tocar ModoAntes, ModoDurante ni ModoLlegada.
// No renderiza nada visible.

"use client";

import { useEffect } from "react";
import type { Fase } from "@/lib/types";

const POLLING_MS = 30_000;

interface RefrescoAlCambiarFaseProps {
  faseActual: Fase;
}

export default function RefrescoAlCambiarFase({ faseActual }: RefrescoAlCambiarFaseProps) {
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const response = await fetch("/api/fase");
        if (!response.ok) return;
        const { fase }: { fase: Fase } = await response.json();
        if (fase !== faseActual) {
          window.location.reload();
        }
      } catch {
        // Fallo puntual de red (o 429, etc.): no se hace nada, el siguiente
        // intervalo de polling reintenta (mismo criterio de tolerancia a
        // fallos que ModoDurante).
      }
    }, POLLING_MS);
    return () => clearInterval(id);
  }, [faseActual]);

  return null;
}
