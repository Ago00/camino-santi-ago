import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "docs/**",
    // Artefacto generado por scripts/bundle-maplibre-worker.ts (esbuild),
    // no es código fuente del proyecto — se regenera en predev/prebuild.
    "public/maplibre-gl-worker.bundled.js",
  ]),
]);

export default eslintConfig;
