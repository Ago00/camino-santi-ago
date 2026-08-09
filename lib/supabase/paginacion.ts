/**
 * Fetch paginado genérico contra Supabase/PostgREST (DT-018,
 * docs/tecnico/decisiones-tecnicas.md).
 *
 * PostgREST limita a 1000 filas cualquier `select` sin `Range` explícito.
 * Los pocos puntos del proyecto que de verdad necesitan el histórico
 * COMPLETO de una tabla (no una página visible a un usuario) —
 * `calcularProgreso` en modo guiado (`app/api/progreso/route.ts`) y la
 * construcción inicial del trazado GPS del modo libre
 * (`obtenerHistoricoPosiciones`, `app/page.tsx`) — usan esta función en vez
 * de un `select` suelto.
 *
 * Sin I/O propio: recibe una función que ejecuta una página de la consulta
 * (`.range(desde, hasta)` ya aplicado por quien llama) y no sabe nada de
 * Supabase, tablas ni columnas — así se puede testear sin mockear ningún
 * cliente.
 */

const TAMANO_PAGINA_FETCH = 1000;

/**
 * Tope de seguridad: 50 páginas × 1.000 filas = 50.000 filas. Muy por
 * encima de cualquier histórico real del reto (~7.200-10.000 posiciones en
 * 30 h a cadencia de 15 s, DT-018) — margen amplio sin dejar de acotar el
 * peor caso. Ante un problema real (bug de paginación, tabla creciendo sin
 * control) es preferible devolver lo acumulado hasta ahí y avisar por log
 * que colgar la función serverless iterando sin fin.
 */
const MAX_PAGINAS = 50;

export interface ResultadoPaginaSupabase<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Ejecuta `obtenerPagina(desde, hasta)` en bucle hasta que una página
 * devuelve menos filas que TAMANO_PAGINA_FETCH (fin natural de los datos),
 * hasta MAX_PAGINAS (tope de seguridad) o hasta el primer error.
 *
 * @param obtenerPagina Ejecuta una página de la consulta ya paginada con
 *   `.range(desde, hasta)`. `desde`/`hasta` son inclusivos, como espera
 *   `.range()` de `@supabase/supabase-js`. El tipo de retorno es
 *   `PromiseLike` (no `Promise`) a propósito: el builder que devuelve
 *   `.range()` de `@supabase/postgrest-js` es "thenable" (implementa
 *   `.then()`) pero no una instancia real de `Promise`, así que pasarlo
 *   directamente (`(desde, hasta) => supabase.from(...)....range(desde,
 *   hasta)`, sin envolverlo en un `await` propio) es válido y es el patrón
 *   esperado en los call sites reales.
 */
export async function obtenerTodasLasFilas<T>(
  obtenerPagina: (desde: number, hasta: number) => PromiseLike<ResultadoPaginaSupabase<T>>
): Promise<T[]> {
  const filas: T[] = [];

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const desde = pagina * TAMANO_PAGINA_FETCH;
    const hasta = desde + TAMANO_PAGINA_FETCH - 1;
    const { data, error } = await obtenerPagina(desde, hasta);

    if (error) {
      console.warn(
        `obtenerTodasLasFilas: error en la página ${pagina} (filas ${desde}-${hasta}): ${error.message}. ` +
          `Devolviendo las ${filas.length} filas ya obtenidas.`
      );
      return filas;
    }

    if (!data || data.length === 0) return filas;

    filas.push(...data);

    if (data.length < TAMANO_PAGINA_FETCH) return filas;
  }

  console.warn(
    `obtenerTodasLasFilas: alcanzado el tope de seguridad de ${MAX_PAGINAS} páginas ` +
      `(${MAX_PAGINAS * TAMANO_PAGINA_FETCH} filas). Deteniendo la paginación; puede haber filas sin traer.`
  );
  return filas;
}
