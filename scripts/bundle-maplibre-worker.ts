/**
 * Pre-empaqueta el Web Worker de MapLibre GL en un único fichero autocontenido,
 * sin imports externos, y lo escribe en public/ para que Next lo sirva como
 * asset estático — fuera por completo del pipeline de bundling de Turbopack.
 *
 * Por qué existe este script (DT-008, docs/tecnico/decisiones-tecnicas.md):
 * maplibre-gl calcula la URL de su Worker en tiempo de ejecución
 * (`config.WORKER_URL`). Turbopack solo bundlea un Worker cuando el propio
 * código de la app contiene literalmente `new Worker(new URL(...))` — como
 * ese análisis estático nunca puede aplicarse aquí (la URL le llega a
 * maplibre-gl ya resuelta, no como literal en la app), Turbopack trata
 * cualquier referencia al worker como un asset estático copiado en crudo, sin
 * bundlear su import interno a `./maplibre-gl-shared.mjs` (ruta sin hash que
 * nunca existe en el output real → 404 silencioso dentro del contexto del
 * worker). Pre-empaquetar con esbuild e inlinear esa dependencia elimina el
 * problema de raíz: el fichero resultante no tiene ningún import que resolver.
 *
 * Fuente: node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs (variante no-dev).
 * Se usa un único bundle para dev y producción: se comparó el contenido de
 * maplibre-gl-worker.mjs y maplibre-gl-worker-dev.mjs (registro del Debugger,
 * docs/tareas/CURRENT.md, 2ª ronda) y son funcionalmente equivalentes — mismo
 * Actor, mismos message handlers, el -dev solo añade warnings de desarrollo.
 * No vale la pena mantener dos artefactos para esa diferencia cosmética.
 *
 * Salida: public/maplibre-gl-worker.bundled.js
 *
 * Ejecutar con: pnpm bundle-maplibre-worker
 * Se ejecuta automáticamente antes de `pnpm dev`/`pnpm build` (hooks
 * predev/prebuild) porque el resultado depende de la versión de maplibre-gl
 * instalada en node_modules — regenerarlo siempre evita que quede
 * desincronizado tras un `pnpm update`.
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import * as esbuild from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

const ENTRADA = join(
  ROOT,
  "node_modules",
  "maplibre-gl",
  "dist",
  "maplibre-gl-worker.mjs"
);
const SALIDA = join(ROOT, "public", "maplibre-gl-worker.bundled.js");

async function main() {
  await esbuild.build({
    entryPoints: [ENTRADA],
    outfile: SALIDA,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2020",
    minify: false,
    logLevel: "info",
  });

  // Guardia: el fichero resultante no debe tener ningún import/export de una
  // ruta relativa sin resolver. Si esbuild dejara algo así (por ejemplo, un
  // import dinámico que no puede inlinear), es preferible fallar el build ya
  // que ese es exactamente el bug que este script existe para eliminar.
  const contenido = readFileSync(SALIDA, "utf-8");
  const importRelativoSinResolver = /\bimport\b[^;]*['"]\.\.?\//;
  if (importRelativoSinResolver.test(contenido)) {
    throw new Error(
      `${SALIDA} contiene un import de ruta relativa sin resolver. ` +
        "El bundle de esbuild debía inlinear todas las dependencias locales " +
        "(maplibre-gl-shared.mjs incluida) — revisar la configuración de " +
        "esbuild antes de continuar."
    );
  }

  console.log(
    `OK: ${SALIDA} generado sin imports externos (${(contenido.length / 1024).toFixed(1)} KB)`
  );
}

main().catch((err) => {
  console.error("Error al empaquetar el worker de MapLibre GL:", err);
  process.exit(1);
});
