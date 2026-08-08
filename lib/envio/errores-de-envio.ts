/**
 * Qué significa cada fallo al enviar un formulario del panel admin a su
 * Server Action (DT-017): si tiene sentido reintentarlo y qué se le dice a
 * Santi en pantalla.
 *
 * Contexto: el panel se usa andando, 30 h, con 4G irregular. Aquí solo llegan
 * los fallos **lanzados** (transporte, despliegue, imprevistos). Los fallos
 * esperados del servidor —texto vacío, formato no permitido, foto demasiado
 * grande— no viajan como excepción sino como valor de retorno de la propia
 * Server Action: Next redacta en producción el mensaje de cualquier error
 * lanzado desde el servidor y lo sustituye por un texto genérico con un
 * digest, así que un `throw` nunca podría enseñar el motivo real
 * (`node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md`:
 * "avoid using try/catch blocks and throw errors. Instead, model expected
 * errors as return values").
 *
 * Dominio puro: sin I/O, sin dependencias de React ni de Next.
 */

/**
 * Fallo del que se sabe que reintentar no va a cambiar nada, con un mensaje ya
 * redactado para el usuario.
 */
export class ErrorNoReintentable extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorNoReintentable";
  }
}

/**
 * Fallo de transporte: la petición no llegó a completarse. Es el caso normal
 * bajo cobertura mala y el único que de verdad merece reintento automático.
 *
 * Los navegadores no comparten un tipo de error para esto: Chrome lanza
 * `TypeError: Failed to fetch`, Safari (el navegador del reto) `TypeError:
 * Load failed`, y Firefox `NetworkError when attempting to fetch resource`.
 */
export function esFalloDeRed(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /failed to fetch|load failed|networkerror|network request failed/i.test(error.message);
}

/**
 * La Server Action invocada ya no existe en el servidor: pasa cuando se
 * despliega una versión nueva mientras la página lleva abierta un rato, porque
 * cada despliegue rota los identificadores de acción (ver "Deployment
 * considerations" en la guía de Server Actions de Next). Reintentar con el
 * mismo identificador falla siempre: lo que arregla esto es recargar.
 */
export function esAccionDesaparecida(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /failed to find server action/i.test(error.message);
}

/**
 * Errores de control de flujo de Next (`redirect()`, `notFound()`): no son
 * fallos, son navegación. Se reconocen por su `digest` `NEXT_...` y hay que
 * dejarlos pasar sin reintentar ni convertir en mensaje de error.
 */
export function esControlDeFlujoDeNext(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("digest" in error)) return false;
  return typeof error.digest === "string" && error.digest.startsWith("NEXT_");
}

/**
 * Política de reintento: se reintenta todo lo que no se sepa condenado a
 * fallar igual. Un fallo desconocido bajo cobertura irregular es más probable
 * que sea transitorio que definitivo, y el coste de una petición de más es
 * mucho menor que el de perder una entrada del feed.
 */
export function esErrorReintentable(error: unknown): boolean {
  if (error instanceof ErrorNoReintentable) return false;
  if (esControlDeFlujoDeNext(error)) return false;
  if (esAccionDesaparecida(error)) return false;
  return true;
}

/**
 * Traduce un fallo a algo que Santi pueda leer en el móvil y saber qué hacer.
 * Nunca devuelve el mensaje crudo de un error inesperado: en producción sería
 * el texto genérico con digest de Next, que no informa de nada.
 */
export function describirFalloDeEnvio(error: unknown): string {
  if (error instanceof ErrorNoReintentable) return error.message;
  if (esFalloDeRed(error)) {
    return "Se cortó la conexión al enviar. Comprueba la cobertura y vuelve a darle a Publicar.";
  }
  if (esAccionDesaparecida(error)) {
    return "La web se ha actualizado mientras escribías. Recarga la página y vuelve a publicar.";
  }
  return "No se pudo publicar. Vuelve a darle a Publicar en unos segundos.";
}
