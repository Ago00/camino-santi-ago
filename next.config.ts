import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Evita que Next confunda la raíz del workspace con el pnpm-lock.yaml
  // de C:\Users\santi\proyectos (no relacionado con este proyecto).
  turbopack: {
    root: path.join(__dirname),
  },
  // Next.js limita a 1 MB por defecto el body de las Server Actions
  // (protección contra DDoS/consumo excesivo de recursos), y
  // `crearMinutoAMinuto` (app/admin/actions.ts) recibe la foto dentro del
  // FormData: sin subirlo, este límite cortaría casi cualquier foto.
  //
  // Ojo, y esto es lo que este comentario decía al revés hasta DT-017: subir
  // `bodySizeLimit` NO amplía el tamaño real que se puede enviar. El límite
  // que manda es de plataforma — Vercel devuelve 413
  // (FUNCTION_PAYLOAD_TOO_LARGE) en el edge por encima de ~4,5 MB, antes de
  // invocar la función, y Next no puede elevarlo. Medido contra producción el
  // 2026-08-08: 4,3 MB llegan, 4,5 MB no.
  //
  // Por eso el valor es 4.5mb y no más: el tope efectivo de la foto lo fija
  // TAMANO_MAXIMO_FOTO_BYTES (lib/imagen/limites-subida.ts, 4 MiB), que se
  // aplica en el navegador antes de enviar y de nuevo en el servidor. Este
  // número solo tiene que quedar por encima de esa foto más el overhead de
  // multipart/form-data, para que quien rechace sea nuestra validación —con
  // su mensaje— y no el parser de Next.
  experimental: {
    serverActions: {
      bodySizeLimit: "4.5mb",
    },
  },
};

export default nextConfig;
