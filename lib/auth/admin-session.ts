/**
 * Sesión de admin único: cookie HttpOnly con payload `{ exp }` firmado
 * HMAC-SHA256, verificado con `timingSafeEqual` (DT-010).
 *
 * Mismo patrón que ya usa `/api/track` para `TRACK_TOKEN` (comparación en
 * tiempo constante hasheando ambos valores a longitud fija) — aquí se firma
 * un payload en vez de comparar un secreto recibido, pero la defensa contra
 * timing attacks es la misma idea.
 *
 * Sin dependencia nueva (`jose` descartado en DT-010: un solo admin, sin
 * roles ni claims adicionales no justifica un JWT completo).
 *
 * Cada consumidor (`proxy.ts`, cada Server Action de `app/admin/actions.ts`)
 * debe llamar a `verificarSesion()` por sí mismo — nunca asumir que otra capa
 * ya lo hizo (ver DT-010: las Server Actions se sirven como POST a su propia
 * ruta, y un cambio de matcher en `proxy.ts` puede dejarlas sin cobertura sin
 * que se note).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const NOMBRE_COOKIE_SESION = "admin_session";

/** 7 días — TTL largo para no molestar a Santi en pleno reto (24-30 h). */
const TTL_SESION_MS = 7 * 24 * 60 * 60 * 1000;

interface PayloadSesion {
  exp: number; // epoch ms
}

function obtenerSecreto(): string {
  const secreto = process.env.ADMIN_SESSION_SECRET;
  if (!secreto) {
    throw new Error("Falta la env var ADMIN_SESSION_SECRET.");
  }
  return secreto;
}

function firmar(payloadBase64Url: string, secreto: string): string {
  return createHmac("sha256", secreto).update(payloadBase64Url).digest("base64url");
}

/**
 * Compara dos firmas en tiempo constante. Igual que en `/api/track`: se
 * hashea implícitamente al ser ambas firmas HMAC-SHA256 de longitud fija
 * (32 bytes en base64url = 43 chars), así que `timingSafeEqual` no lanza por
 * longitud distinta salvo que una firma esté corrupta — en ese caso, tratarla
 * como inválida es el comportamiento correcto.
 */
function firmasCoinciden(firmaRecibida: string, firmaEsperada: string): boolean {
  const bufferRecibido = Buffer.from(firmaRecibida);
  const bufferEsperado = Buffer.from(firmaEsperada);
  if (bufferRecibido.length !== bufferEsperado.length) return false;
  return timingSafeEqual(bufferRecibido, bufferEsperado);
}

/**
 * Crea el valor de la cookie de sesión: `{payload}.{firma}`, ambos en
 * base64url. TTL fijo de `TTL_SESION_MS` desde el momento de la llamada.
 */
export function crearSesion(ahora: Date = new Date()): string {
  const secreto = obtenerSecreto();
  const payload: PayloadSesion = { exp: ahora.getTime() + TTL_SESION_MS };
  const payloadBase64Url = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const firma = firmar(payloadBase64Url, secreto);
  return `${payloadBase64Url}.${firma}`;
}

/**
 * Verifica el valor de la cookie de sesión: firma válida y no expirada.
 * Nunca lanza — cualquier fallo (formato, firma, expiración, secreto
 * ausente) se trata como "sesión inválida", sin distinguir el motivo.
 */
export function verificarSesion(valorCookie: string | undefined | null, ahora: Date = new Date()): boolean {
  if (!valorCookie) return false;

  const partes = valorCookie.split(".");
  if (partes.length !== 2) return false;
  const [payloadBase64Url, firmaRecibida] = partes;

  let secreto: string;
  try {
    secreto = obtenerSecreto();
  } catch {
    return false;
  }

  const firmaEsperada = firmar(payloadBase64Url, secreto);
  if (!firmasCoinciden(firmaRecibida, firmaEsperada)) return false;

  let payload: PayloadSesion;
  try {
    payload = JSON.parse(Buffer.from(payloadBase64Url, "base64url").toString("utf8"));
  } catch {
    return false;
  }

  if (typeof payload.exp !== "number") return false;
  return ahora.getTime() < payload.exp;
}
