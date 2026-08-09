/**
 * Prepara en el navegador la foto del "minuto a minuto" antes de enviarla a
 * la Server Action (DT-017): la recodifica a JPEG con la escalera adaptativa
 * de `escalera-compresion.ts` para que quepa en el presupuesto de subida.
 *
 * Solo se ejecuta en el cliente (usa `Image`, `canvas` y `URL.createObjectURL`).
 * Aquí vive el borde con el navegador; la lógica de decisión —qué peldaño
 * elegir y con qué dimensiones— está en `escalera-compresion.ts`, que es puro
 * y sí tiene tests.
 *
 * Dos invariantes que no son evidentes:
 *
 * - **Nunca bloquea por no poder comprimir.** Si el navegador no sabe
 *   decodificar la imagen o el canvas falla, se sigue adelante con el fichero
 *   original: publicar es más importante que publicar ligero.
 * - **El error de "demasiado grande" se da aquí, antes de subir nada.** Gastar
 *   40 s de 4G rural en una petición que el edge de Vercel va a cortar con un
 *   413 mudo es el fallo que originó DT-017.
 */

import {
  PRESUPUESTO_COMPRESION_BYTES,
  TAMANO_MAXIMO_FOTO_BYTES,
  esMimePermitido,
  formatearMegabytes,
} from "@/lib/imagen/limites-subida";
import {
  recorrerEscalera,
  type Codificador,
  type Dimensiones,
} from "@/lib/imagen/escalera-compresion";

export type FotoPreparada =
  | { readonly estado: "lista"; readonly foto: File }
  | { readonly estado: "demasiado-grande"; readonly mensaje: string };

export async function prepararFotoParaSubida(original: File): Promise<FotoPreparada> {
  const recodificada = await recodificarAJpeg(original).catch((error: unknown) => {
    // No bloquea la publicación, pero deja rastro: si esto pasa el día del
    // reto, el motivo tiene que poder leerse desde el inspector del móvil.
    console.warn("No se pudo recodificar la foto; se intentará con el original", error);
    return null;
  });

  const aEnviar = elegirFotoAEnviar(original, recodificada);

  if (aEnviar.size <= TAMANO_MAXIMO_FOTO_BYTES) {
    return { estado: "lista", foto: aEnviar };
  }

  const maximo = formatearMegabytes(TAMANO_MAXIMO_FOTO_BYTES);
  const peso = formatearMegabytes(aEnviar.size);
  return {
    estado: "demasiado-grande",
    mensaje:
      recodificada === null
        ? `Esta foto pesa ${peso} y este navegador no ha podido comprimirla (el máximo son ${maximo}). Prueba a hacerla desde el propio navegador.`
        : `Esta foto sigue pesando ${peso} después de comprimirla y el máximo son ${maximo}. Prueba con otra foto.`,
  };
}

/**
 * Elige qué fichero se envía: el recodificado o el original.
 *
 * Recodificar una foto ya ligera puede engordarla (el encoder del navegador no
 * conserva la optimización del original: una imagen de 150 KB recibida por
 * WhatsApp puede salir de 1 MB a resolución nativa). Mandar de más por 4G
 * rural es justo lo que hay que evitar, así que si el original ya es más
 * pequeño se envía tal cual — **siempre que su formato sea uno de los que el
 * servidor acepta**: un HEIC de iPhone puede ser más ligero que su JPEG y aun
 * así ser rechazado en Storage.
 *
 * Pura y exportada a propósito: es la única decisión de este módulo que se
 * puede (y debe) probar sin navegador.
 */
export function elegirFotoAEnviar(original: File, recodificada: File | null): File {
  if (recodificada === null) return original;
  if (esMimePermitido(original.type) && original.size <= recodificada.size) return original;
  return recodificada;
}

/**
 * Recodifica la foto a JPEG por la escalera adaptativa. Puede devolver un
 * fichero mayor que el presupuesto (si ni el último peldaño baja de él); quien
 * llama decide si aun así cabe en el tope duro del servidor.
 *
 * Las dimensiones del original entran sin filtrar a propósito: es la escalera
 * la que las acota (`LADO_LARGO_MAXIMO_PX`), y hacerlo también aquí duplicaría
 * la regla en dos sitios. Esa cota no es cosmética — sin ella, una foto de 24
 * o 48 MP supera el área máxima de canvas de Safari iOS y `toBlob` devuelve un
 * JPEG en blanco sin lanzar ningún error.
 */
async function recodificarAJpeg(original: File): Promise<File> {
  const { imagen, liberar: liberarImagen } = await cargarImagen(original);
  const { codificar, liberar: liberarLienzo } = crearCodificadorDeLienzo(imagen);

  try {
    const dimensionesOriginales: Dimensiones = {
      ancho: imagen.naturalWidth,
      alto: imagen.naturalHeight,
    };
    if (dimensionesOriginales.ancho === 0 || dimensionesOriginales.alto === 0) {
      throw new Error("El navegador no pudo determinar el tamaño de la imagen.");
    }

    const resultado = await recorrerEscalera(
      dimensionesOriginales,
      PRESUPUESTO_COMPRESION_BYTES,
      codificar
    );

    return new File([resultado.datos], nombreComoJpeg(original.name), {
      type: "image/jpeg",
      lastModified: original.lastModified,
    });
  } finally {
    liberarLienzo();
    liberarImagen();
  }
}

/**
 * Decodifica el fichero en un `<img>` y espera a que esté listo.
 *
 * Se usa un `<img>` y no `createImageBitmap` **por la orientación EXIF**: al
 * decodificar una imagen en un elemento `<img>`, los navegadores actuales
 * aplican la orientación EXIF por defecto (`image-orientation: from-image`),
 * de modo que `naturalWidth`/`naturalHeight` y lo que dibuja `drawImage` ya
 * vienen derechos. Sin eso, una foto vertical de iPhone acabaría publicada
 * tumbada, porque el canvas descarta los metadatos EXIF del original.
 */
function cargarImagen(archivo: File): Promise<{ imagen: HTMLImageElement; liberar: () => void }> {
  return new Promise((resolver, rechazar) => {
    const url = URL.createObjectURL(archivo);
    const imagen = new Image();
    const liberar = () => URL.revokeObjectURL(url);

    imagen.onload = () => resolver({ imagen, liberar });
    imagen.onerror = () => {
      liberar();
      rechazar(new Error("El navegador no pudo decodificar la imagen."));
    };
    imagen.src = url;
  });
}

/**
 * Codificador sobre un único `<canvas>` reutilizado.
 *
 * Solo se redibuja cuando cambian las dimensiones: los dos primeros peldaños
 * de la escalera comparten la resolución nativa y únicamente cambian de
 * calidad, y redibujar 12 megapíxeles en el móvil de alguien que lleva 20 h
 * andando no es gratis. `liberar()` deja el canvas a 0×0 porque iOS Safari
 * limita la memoria total de canvas del documento.
 */
function crearCodificadorDeLienzo(imagen: HTMLImageElement): {
  codificar: Codificador;
  liberar: () => void;
} {
  const lienzo = document.createElement("canvas");
  let dibujadas: Dimensiones | null = null;

  const codificar: Codificador = async (dimensiones, calidadJpeg) => {
    if (dibujadas === null || dibujadas.ancho !== dimensiones.ancho || dibujadas.alto !== dimensiones.alto) {
      lienzo.width = dimensiones.ancho;
      lienzo.height = dimensiones.alto;
      const contexto = lienzo.getContext("2d");
      if (contexto === null) {
        throw new Error("El navegador no pudo abrir un contexto 2D para comprimir la foto.");
      }
      contexto.drawImage(imagen, 0, 0, dimensiones.ancho, dimensiones.alto);
      dibujadas = dimensiones;
    }
    return await aBlobJpeg(lienzo, calidadJpeg);
  };

  return {
    codificar,
    liberar: () => {
      lienzo.width = 0;
      lienzo.height = 0;
    },
  };
}

function aBlobJpeg(lienzo: HTMLCanvasElement, calidadJpeg: number): Promise<Blob> {
  return new Promise((resolver, rechazar) => {
    lienzo.toBlob(
      (blob) => {
        if (blob === null) {
          rechazar(new Error("El navegador no pudo codificar la imagen a JPEG."));
          return;
        }
        resolver(blob);
      },
      "image/jpeg",
      calidadJpeg
    );
  });
}

/** El nombre solo se ve en la cabecera de la parte multipart: en Storage la
 * Server Action genera uno propio. Basta con que la extensión no mienta. */
function nombreComoJpeg(nombreOriginal: string): string {
  const sinExtension = nombreOriginal.replace(/\.[^./\\]+$/, "").trim();
  return `${sinExtension === "" ? "foto" : sinExtension}.jpg`;
}
