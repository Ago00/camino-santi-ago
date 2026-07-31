// Arranque desde una base de datos vacía: siembra la primera fila de
// `intentos` sin tocar SQL. Ver crearPrimerIntento() en app/admin/actions.ts.

"use client";

import { crearPrimerIntento } from "@/app/admin/actions";
import BotonConfirmable from "@/components/admin/BotonConfirmable";

export default function CrearPrimerIntentoBoton() {
  return (
    <BotonConfirmable
      etiqueta="Iniciar primer intento"
      etiquetaPendiente="Creando…"
      mensajeConfirmacion="¿Crear el primer intento? Se creará en fase 'antes'."
      accion={crearPrimerIntento}
    />
  );
}
