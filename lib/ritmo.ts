// Dominio puro: tiempo en marcha y ritmo medio (km/h) de un intento, guiado o
// libre. Ambas funciones están parametrizadas por un instante final
// arbitrario, nunca por "ahora" — DT-020 (docs/tecnico/decisiones-tecnicas.md)
// encontró que anclar estas dos cifras a la hora del navegador de quien mira
// la web (en vez de al último dato real) las hace subir/desplomarse solas si
// el móvil deja de enviar señal, sin que haya pasado nada nuevo en el reto.
// Quien llama decide el instante final según el momento del intento:
// - "durante" (ModoDurante.tsx, ModoDuranteLibre.tsx): `progreso.ultimaPosicion?.ts`.
// - "llegada" (ModoLlegada.tsx, ModoLlegadaLibre.tsx): `ended_at` (ya es un
//   timestamp real de BD, no la hora actual — no tenía el problema de DT-020).
// Ninguna de las dos funciones lee `Date.now()`/`new Date()` internamente:
// si un cambio futuro reintroduce el bug, tendrá que ser pasando `ahora`
// explícitamente como argumento, no colándolo por dentro.

// Milisegundos transcurridos, no horas: cada función deriva de aquí solo la
// unidad que necesita (calcularRitmoMedioIntento divide por 3.600.000 una
// vez; calcularTiempoEnMarchaIntento divide por 60.000 una vez). Encadenar
// una conversión a horas y luego multiplicar por 60 para sacar minutos
// introduce redondeos de punto flotante que pueden hacer que un intervalo
// exacto (p. ej. 5 min = 300.000 ms) truncase a 4 en vez de 5 — mismo riesgo
// que ya evitaba el código original de ModoDurante.tsx, que operaba sobre ms.
function msTranscurridosEntre(
  iniciadoEn: string | null,
  finalizadoEn: Date | string | null
): number | null {
  if (!iniciadoEn || !finalizadoEn) return null;
  const inicio = new Date(iniciadoEn).getTime();
  const final = typeof finalizadoEn === "string" ? new Date(finalizadoEn).getTime() : finalizadoEn.getTime();
  const ms = final - inicio;
  return ms > 0 ? ms : null;
}

export function calcularRitmoMedioIntento(
  odometroKm: number,
  iniciadoEn: string | null,
  finalizadoEn: Date | string | null
): string {
  const ms = msTranscurridosEntre(iniciadoEn, finalizadoEn);
  if (ms === null) return "—";
  const horasTranscurridas = ms / 3_600_000;
  return (odometroKm / horasTranscurridas).toLocaleString("es-ES", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/**
 * Formatea el tiempo transcurrido entre `iniciadoEn` y `finalizadoEn` como
 * "H:MM" (sin cero a la izquierda en las horas). Hermana de
 * `calcularRitmoMedioIntento`, misma forma de parámetros y mismo criterio de
 * casos límite (sin alguna de las dos fechas, o `finalizadoEn` anterior o
 * igual a `iniciadoEn`: "—").
 */
export function calcularTiempoEnMarchaIntento(
  iniciadoEn: string | null,
  finalizadoEn: Date | string | null
): string {
  const ms = msTranscurridosEntre(iniciadoEn, finalizadoEn);
  if (ms === null) return "—";
  const minutosTotales = Math.floor(ms / 60_000);
  const horas = Math.floor(minutosTotales / 60);
  const minutos = minutosTotales % 60;
  return `${horas}:${String(minutos).padStart(2, "0")}`;
}
