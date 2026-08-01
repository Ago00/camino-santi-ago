/**
 * Rate limiting en memoria de proceso, sin infraestructura nueva (DT-011).
 *
 * Mismo patrón que la caché TTL de app/api/progreso/route.ts (DT-007): un
 * `Map` en scope de módulo, vivo mientras dure la instancia de la función
 * serverless. No hay Redis ni ninguna cuenta externa — ver DT-011 para las
 * alternativas descartadas y la limitación conocida (el contador no se
 * comparte entre instancias/regiones ni sobrevive a un cold start).
 *
 * Cada ruta llama a `consumir(clave, limite, ventanaMs)` con su propia clave
 * (IP o token) y su propio límite. `clave` agrupa quién consume el cupo;
 * `limite` cuántas peticiones caben en `ventanaMs`.
 */

import type { NextRequest } from "next/server";

interface ContadorVentana {
  count: number;
  resetAt: number;
}

const contadores = new Map<string, ContadorVentana>();

/**
 * Registra un consumo de la clave dada y devuelve si sigue dentro del
 * límite. La ventana es fija (no deslizante): al expirar, el contador se
 * reinicia a 1 en vez de descontar peticiones antiguas una a una — más
 * barato y suficiente para el riesgo real que DT-011 busca mitigar (spam o
 * fuerza bruta desde un mismo origen, no precisión de ventana al milisegundo).
 */
export function consumir(clave: string, limite: number, ventanaMs: number): boolean {
  const ahora = Date.now();
  const contador = contadores.get(clave);

  if (!contador || ahora >= contador.resetAt) {
    contadores.set(clave, { count: 1, resetAt: ahora + ventanaMs });
    return true;
  }

  if (contador.count >= limite) {
    return false;
  }

  contador.count += 1;
  return true;
}

/** Solo para tests: vacía todo el estado acumulado entre casos. */
export function reiniciarRateLimit(): void {
  contadores.clear();
}

/**
 * IP del cliente a partir de `x-forwarded-for` (primer valor de la lista,
 * el más cercano al cliente original — ver documentación de Vercel/Next
 * sobre cabeceras de proxy). Sin esa cabecera (por ejemplo en local sin
 * proxy delante), se agrupan todas las peticiones bajo una única clave de
 * origen desconocido: es un fallback deliberadamente conservador, nunca deja
 * el endpoint sin límite alguno.
 */
export function obtenerIpCliente(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const primeraIp = forwardedFor?.split(",")[0]?.trim();
  return primeraIp || "ip-desconocida";
}
