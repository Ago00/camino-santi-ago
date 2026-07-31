import type { Metadata, Viewport } from "next";
import { Fraunces } from "next/font/google";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });

export const metadata: Metadata = {
  title: "Camino de Santi·ago",
  description:
    "Sigue en directo el reto de Santi: ~100 km del Camino Portugués del tirón, ofrecido por intenciones.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={fraunces.variable}>
      <body>{children}</body>
    </html>
  );
}
