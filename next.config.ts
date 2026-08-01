import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Evita que Next confunda la raíz del workspace con el pnpm-lock.yaml
  // de C:\Users\santi\proyectos (no relacionado con este proyecto).
  turbopack: {
    root: path.join(__dirname),
  },
  // Next.js limita a 1 MB por defecto el body de las Server Actions
  // (protección contra DDoS/consumo excesivo de recursos). `crearMinutoAMinuto`
  // (app/admin/actions.ts) es una Server Action que recibe fotos de hasta
  // 8 MB (TAMANO_MAXIMO_BYTES en lib/supabase/storage.ts) dentro de un
  // FormData — sin subir este límite, cualquier foto de móvil normal se
  // rechaza antes de llegar a la validación de la aplicación. 10mb deja
  // margen sobre los 8 MB de la foto para el resto de campos del FormData
  // y el overhead de multipart/form-data (boundaries, cabeceras de parte).
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
