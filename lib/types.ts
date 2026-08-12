/**
 * Tipos de dominio del proyecto camino-santi-ago.
 *
 * Derivados del esquema Supabase definido en docs/tecnico/plan-ejecucion-v1.md.
 * Son el contrato entre el dominio puro (lib/traza/proyeccion.ts) y las capas
 * de datos (F2) y UI (F3-F4). Solo tipos — sin cliente de BD, sin lógica.
 *
 * Invariantes críticos:
 * - Solo puede haber un `Intento` con `cerrado = false` a la vez.
 * - Las `Posicion` con `descartado = true` no participan en cálculos de progreso.
 * - La `Fase` del intento activo determina qué muestra la web pública.
 */

// ---------------------------------------------------------------------------
// Entidades de BD (espejo tipado del esquema Supabase)
// ---------------------------------------------------------------------------

/** Estado del reto. La web adapta su contenido según el valor activo. */
export type Fase = "antes" | "durante" | "llegada";

/**
 * Modo de un intento (DT-016), fijado al pulsar "Iniciar" e inmutable
 * durante toda la vida del intento (cambiarlo exige "Reiniciar"):
 * - guiado: progreso calculado sobre la traza del Camino Portugués (el
 *   comportamiento original, sin cambios).
 * - libre: sin traza fija — solo distancia restante en línea recta hasta un
 *   destino (lat/lon) fijado al iniciar.
 */
export type ModoIntento = "guiado" | "libre";

/** Un intento de completar el reto. N intentos posibles; solo uno activo. */
export interface Intento {
  id: number;
  fase: Fase;
  modo: ModoIntento;
  /** Destino del modo libre (lat/lon). Siempre null en modo guiado. */
  destino_lat: number | null;
  destino_lon: number | null;
  /** true cuando se usa "Reiniciar"; nada se borra de la BD. */
  cerrado: boolean;
  started_at: string | null; // ISO 8601
  ended_at: string | null; // ISO 8601
  mensaje_llegada: string | null;
  created_at: string; // ISO 8601
}

/** Una posición GPS recibida del móvil (OwnTracks) o registrada manualmente. */
export interface Posicion {
  id: number;
  intento_id: number;
  lat: number;
  lon: number;
  ts: string; // ISO 8601 — marca temporal del dispositivo, no de inserción
  batt: number | null; // porcentaje de batería, 0-100
  acc: number | null; // precisión GPS en metros (radio de incertidumbre)
  fuente: "app" | "manual";
  /** Soft-delete reversible. Posiciones descartadas no participan en progreso. */
  descartado: boolean;
  created_at: string; // ISO 8601
}

/** Una intención dejada por familia o amigos. Siempre privada (RLS). */
export interface Intencion {
  id: number;
  texto: string; // 1-1000 chars
  nombre: string | null; // null = anónima
  created_at: string; // ISO 8601
}

/** Un comentario público o privado de un seguidor. */
export interface Comentario {
  id: number;
  nombre: string; // 1-80 chars, nunca anónimo
  texto: string; // 1-1000 chars
  visibilidad: "publico" | "privado";
  /** El admin puede ocultar comentarios sin borrarlos. */
  oculto: boolean;
  created_at: string; // ISO 8601
}

/** Texto editable desde el panel admin con fallback al valor por defecto en código. */
export interface Texto {
  clave: string;
  valor: string;
  updated_at: string; // ISO 8601
}

/**
 * Una entrada del feed "minuto a minuto": texto corto + foto opcional,
 * publicada solo por el admin, con snapshot de la última posición conocida
 * en el momento de publicar (no recalculada nunca después).
 */
export interface MinutoAMinuto {
  id: number;
  intento_id: number;
  texto: string; // 1-500 chars
  foto_url: string | null; // URL pública de Supabase Storage; null = sin foto
  lat: number | null; // snapshot al publicar; null si aún no había posición
  lon: number | null;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}

// ---------------------------------------------------------------------------
// Tipos del dominio de progreso (proyeccion.ts)
// ---------------------------------------------------------------------------

/**
 * Estado de posición de Santi respecto a la traza.
 *
 * - en-ruta: dentro del margen GPS normal (≤ EN_RUTA_MAX_M)
 * - desvio-menor: claramente fuera del plan pero no lo suficiente para
 *   alterar el cálculo (≤ DESVIO_MENOR_MAX_M)
 * - desvio-mayor: tan lejos que podría haberse ido por otra calle o equivocado
 */
export type EstadoRuta = "en-ruta" | "desvio-menor" | "desvio-mayor";

/**
 * Resultado de calcularProgreso(). Es el contrato que consumen F3 y F4.
 *
 * Notas de diseño:
 * - `porcentaje` es monótono: nunca baja aunque Santi retroceda.
 * - `odometroKm` es la distancia real andada (haversine acumulado), sí sube al retroceder.
 * - `kmRestantes` es el tramo de ruta oficial que queda desde el punto
 *   proyectado más cercano hasta el final, sin sumar el coste de volver a
 *   la ruta si Santi está desviado (eso lo indica `separacionM`/`estado`).
 *   Puede no sumar 100 con `kmAvanzados`; es correcto — mide cosas distintas.
 * - `puntosDescartados` cuenta rechazos por velocidad imposible en esta sesión.
 * - `puntoProyectado` (DT-021): el punto de la traza OFICIAL sobre el que
 *   Turf snapea la última posición válida — el mismo que determina
 *   `kmRestantes`/`separacionM`/`estado`. Interno al servidor: nunca sale
 *   hacia el público (`lib/traza/progreso-publico.ts` no lo copia a
 *   `ProgresoPublicoGuiado`), solo lo consume el admin para pintar la línea
 *   de referencia entre la posición real y el punto de cálculo.
 */
export interface Progreso {
  porcentaje: number; // 0-100, monótono
  kmAvanzados: number; // proyectado sobre el plan (no el andado real)
  kmRestantes: number; // plan restante desde el punto proyectado más cercano
  odometroKm: number; // haversine real, rodeos incluidos
  estado: EstadoRuta;
  separacionM: number; // distancia perpendicular a la traza en metros
  ultimaPosicion: Posicion | null;
  puntosDescartados: number; // rechazados por velocidad implícita imposible
  puntoProyectado: { lat: number; lon: number } | null;
}

/**
 * Traza preparada para cálculos de progreso eficientes.
 * Se construye una vez con prepararTraza() y se reutiliza en cada llamada
 * a calcularProgreso() para no recalcular distancias acumuladas por petición.
 */
export interface TrazaPreparada {
  /** Coordenadas [lon, lat] de cada vértice de la traza de cálculo. */
  coordenadas: [number, number][];
  /**
   * Distancia acumulada en km desde el inicio hasta cada vértice (índice i).
   * kmAcumulados[0] === 0, kmAcumulados[n-1] === longitud total.
   */
  kmAcumulados: number[];
  /** Longitud total de la traza en km. */
  longitudTotalKm: number;
}

// ---------------------------------------------------------------------------
// Proyección pública del progreso (F3 — cierra la deuda de exposición de
// campos internos de Posicion registrada en DEBT.md)
// ---------------------------------------------------------------------------

/**
 * Última posición proyectada para consumo público: solo lo estrictamente
 * necesario para pintar el mapa y la hora de la última señal. Nunca incluye
 * `batt`, `acc`, `intento_id`, `fuente` ni `descartado` — esos campos son
 * metadatos internos del tracker GPS y del modelo de datos, no información
 * que la web pública deba exponer sobre una persona real en movimiento.
 */
export interface UltimaPosicionPublica {
  lat: number;
  lon: number;
  ts: string; // ISO 8601
}

/**
 * Proyección pública del progreso en modo guiado (ver
 * `lib/traza/progreso-publico.ts`). Campos idénticos a los de antes de
 * DT-016 — el modo guiado no cambia de comportamiento.
 */
export interface ProgresoPublicoGuiado {
  modo: "guiado";
  porcentaje: number;
  kmAvanzados: number;
  kmRestantes: number;
  odometroKm: number;
  estado: EstadoRuta;
  ultimaPosicion: UltimaPosicionPublica | null;
}

/**
 * Proyección pública del progreso en modo libre (DT-016, ver
 * `lib/traza/progreso-libre.ts`): sin ETA ni % de progreso — no hay ruta
 * fija sobre la que medirlos. Sí incluye `odometroKm` (DT-020/CURRENT.md,
 * ver `docs/tareas/CURRENT.md` — antes de esa tarea el modo libre no lo
 * calculaba en absoluto). El tiempo en marcha y el ritmo medio no son campos
 * de este tipo: se derivan en la UI a partir de `odometroKm`, `started_at`/
 * `ended_at` del intento y `ultimaPosicion.ts` (`lib/ritmo.ts`).
 */
export interface ProgresoPublicoLibre {
  modo: "libre";
  /** null si aún no hay ninguna posición registrada o el intento no tiene destino. */
  distanciaRestanteKm: number | null;
  /**
   * Distancia real recorrida: haversine acumulado entre posiciones
   * consecutivas no descartadas, SIN filtro de velocidad ni de precisión GPS
   * (a diferencia de `odometroKm` en modo guiado) — ver
   * `calcularProgresoLibre` en `lib/traza/progreso-libre.ts`.
   */
  odometroKm: number;
  ultimaPosicion: UltimaPosicionPublica | null;
}

/**
 * Proyección pública del progreso (F3). Es el único tipo de progreso que
 * debe viajar del servidor al cliente. Unión discriminada por `modo`
 * (DT-016): cada consumidor sabe en tiempo de compilación qué campos tiene
 * disponibles según el modo del intento — sin opcionales sueltos.
 */
export type ProgresoPublico = ProgresoPublicoGuiado | ProgresoPublicoLibre;

/**
 * Resultado de publicar una entrada del "minuto a minuto" (DT-017).
 *
 * Los fallos esperados (texto inválido, foto no permitida, foto demasiado
 * grande, sesión caducada) viajan como valor de retorno y no como excepción:
 * Next redacta en producción el mensaje de cualquier error lanzado en el
 * servidor y lo sustituye por un texto genérico con un digest, así que un
 * `throw` nunca llegaría a enseñar el motivo real en el móvil de Santi.
 */
export type ResultadoPublicacion = { ok: true } | { ok: false; mensaje: string };
