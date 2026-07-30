import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Evita que Next confunda la raíz del workspace con el pnpm-lock.yaml
  // de C:\Users\santi\proyectos (no relacionado con este proyecto).
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
