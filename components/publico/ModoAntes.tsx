// Modo "antes": scrollytelling vertical, el Camino como hilo con hitos.
// Sigue fielmente el mockup (design-sandbox/app/camino/page.tsx, ModoAntes).
// Datos: textos con override de BD (Textos), en vez de hardcode del mockup.
// "Minuto a minuto"/Directo (v2) queda explícitamente fuera de alcance de F3.

"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import Mapa from "@/components/mapa/Mapa";
import PerfilElevacion from "@/components/publico/PerfilElevacion";
import IntencionForm from "@/components/publico/IntencionForm";
import ComentarioForm from "@/components/publico/ComentarioForm";
import type { Textos } from "@/lib/textos/obtener-textos";

const C = { ink: "#1B211D", gold: "#C9A24B", eucalipto: "#2F5D50", ember: "#D9773B" };

// Foto real de Santi (public/santi.jpg). Con undefined usaría el
// placeholder — mismo patrón que FOTO_PEREGRINO (components/publico/PeregrinoLibre.tsx).
const FOTO_SANTI: string | undefined = "/santi.jpg";

const rise = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
};

interface ModoAntesProps {
  textos: Textos;
  trazaCoords: [number, number][];
}

export default function ModoAntes({ textos, trazaCoords }: ModoAntesProps) {
  const spineRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: spineRef, offset: ["start center", "end center"] });
  const fill = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  return (
    <section className="relative">
      <div className="relative flex flex-col items-center pt-10 text-center">
        <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.12 } } }} className="flex flex-col items-center">
          <motion.div variants={rise}>
            <Logo />
          </motion.div>
          <motion.h1 variants={rise} className="[font-family:var(--font-fraunces)] mt-4 text-[42px] font-semibold leading-none tracking-tight" style={{ color: C.ink }}>
            Camino de Santi
            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1, duration: 0.7 }}
              className="italic"
              style={{ color: C.gold }}
            >
              ago
            </motion.span>
          </motion.h1>
          <motion.p variants={rise} className="mt-2 text-[13.5px] italic" style={{ color: "#7C857F" }}>
            …y este camino, ¡no lo <span style={{ color: C.eucalipto, fontWeight: 600 }}>hago</span> solo!
          </motion.p>
          <motion.span variants={rise} className="mt-5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.15em]" style={{ borderColor: "#00000018", color: "#6A726C" }}>
            O Porriño → Santiago · ~100 km
          </motion.span>
        </motion.div>
      </div>

      <div ref={spineRef} className="relative mt-12">
        <div className="pointer-events-none absolute left-[15px] top-2 bottom-2 w-[2px]" style={{ backgroundImage: "repeating-linear-gradient(#C2C7C0 0 5px, transparent 5px 11px)" }} />
        <motion.div className="pointer-events-none absolute left-[15px] top-2 w-[2px] rounded-full" style={{ height: fill, background: `linear-gradient(${C.ember}, ${C.gold})` }} />

        <Hito>
          <SeccionTexto titulo={textos.reto_titulo} kicker="La salida · km 0">
            {textos.reto_descripcion}
          </SeccionTexto>
        </Hito>

        <Hito>
          <div>
            <Kicker>El recorrido</Kicker>
            <h2 className="[font-family:var(--font-fraunces)] mt-1 text-[26px] font-semibold leading-tight" style={{ color: C.ink }}>
              De O Porriño a Santiago
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed" style={{ color: "#3C433E" }}>
              100 km por el Camino Portugués. Este es el trazado completo — cuando arranque, lo verás pintarse en directo.
            </p>
            <div className="mt-3 overflow-hidden rounded-2xl border shadow-sm" style={{ borderColor: "#00000012" }}>
              <Mapa trazaCoords={trazaCoords} hora="dia" modo="resumen" />
            </div>
            <div className="mt-4">
              <PerfilElevacion />
            </div>
          </div>
        </Hito>

        <Hito>
          <div>
            <Kicker>Quién camina</Kicker>
            <FotoQuienCamina />
            <p className="mt-3 text-[14.5px] leading-relaxed" style={{ color: "#3C433E" }}>
              {textos.quien_camina}
            </p>
          </div>
        </Hito>

        <Hito>
          <SeccionTexto titulo="Por intenciones" kicker="Por qué lo hago">
            {textos.por_intenciones}
          </SeccionTexto>
        </Hito>

        <Hito>
          <IntencionForm textos={textos} />
        </Hito>

        <Hito>
          <ComentarioForm textos={textos} />
        </Hito>

        <Hito ultimo>
          <div className="rounded-2xl border p-5 text-center" style={{ borderColor: `${C.gold}44`, background: "linear-gradient(180deg,#FBF7EC,#F4F3EF)" }}>
            <div className="[font-family:var(--font-fraunces)] text-[20px] font-semibold" style={{ color: C.ink }}>
              Santiago te espera
            </div>
            <p className="mx-auto mt-1 max-w-xs text-[13.5px]" style={{ color: "#6A726C" }}>
              {textos.cierre_antes}
            </p>
          </div>
        </Hito>
      </div>
    </section>
  );
}

function Hito({ children, ultimo = false }: { children: React.ReactNode; ultimo?: boolean }) {
  return (
    <div className={`relative flex gap-4 ${ultimo ? "pb-4" : "pb-16"}`}>
      <div className="relative z-10 w-[30px] shrink-0">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true, margin: "-25% 0px" }}
          transition={{ type: "spring", stiffness: 220, damping: 15 }}
          className="grid h-[30px] w-[30px] place-items-center rounded-full bg-white shadow-md"
          style={{ border: `2px solid ${C.ember}`, color: C.ember }}
        >
          <DoodleMojon />
        </motion.div>
      </div>
      <motion.div
        initial={{ opacity: 0, x: 28 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: "-15% 0px" }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="min-w-0 flex-1"
      >
        {children}
      </motion.div>
    </div>
  );
}

function SeccionTexto({ titulo, kicker, children }: { titulo: string; kicker: string; children: React.ReactNode }) {
  return (
    <div>
      <Kicker>{kicker}</Kicker>
      <h2 className="[font-family:var(--font-fraunces)] mt-1 text-[26px] font-semibold leading-tight" style={{ color: C.ink }}>
        {titulo}
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed" style={{ color: "#3C433E" }}>
        {children}
      </p>
    </div>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: C.ember }}>
      {children}
    </span>
  );
}

// Tarjeta de foto de Santi en "Quién camina". Recupera el tratamiento del
// mockup original de F3 (design-sandbox/app/camino-perfil/page.tsx,
// FotoQuienCamina), perdido al simplificar en la implementación inicial.
// Con FOTO_SANTI sin definir muestra un placeholder de silueta genérica;
// cuando se defina con una ruta de /public, muestra la foto real con
// object-cover — mismo patrón que FOTO_PEREGRINO en PeregrinoLibre.tsx.
function FotoQuienCamina() {
  return (
    <div
      className="mt-2 overflow-hidden rounded-2xl shadow-lg"
      style={{ aspectRatio: "4/3", background: "linear-gradient(150deg,#3C4C46,#182721 80%)" }}
    >
      <div className="relative h-full w-full">
        <GranitoTextura opacity={0.16} />
        {FOTO_SANTI ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={FOTO_SANTI} alt="Santi" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <PlaceholderSilueta />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
        <div className="absolute bottom-0 p-4" style={{ textShadow: "0 1px 6px #0009" }}>
          <div className="[font-family:var(--font-fraunces)] text-[20px] font-semibold text-white">Santi</div>
          <div className="text-[12px] text-white/80">Peregrino de una noche</div>
        </div>
      </div>
    </div>
  );
}

function PlaceholderSilueta() {
  return (
    <div className="absolute inset-0 flex items-center justify-center opacity-40">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
      </svg>
    </div>
  );
}

function GranitoTextura({ opacity = 0.12 }: { opacity?: number }) {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ opacity }}>
      <filter id="grano">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grano)" />
    </svg>
  );
}

function DoodleMojon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="4" width="10" height="16" rx="2" />
      <path d="M7 10h10" />
    </svg>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 54 96" width="48" height="85" fill="none" aria-label="Camino de Santi">
      <defs>
        <pattern id="logoStripe" patternUnits="userSpaceOnUse" width="4" height="96">
          <rect width="2" height="96" fill="#CE2029" />
          <rect x="2" width="2" height="96" fill="#ffffff" />
        </pattern>
      </defs>
      <ellipse cx="27" cy="89" rx="17" ry="2.6" fill="#00000012" />
      <path d="M35 13L39 15L45 85L39 87Z" fill="#A79D9D" stroke="#ffffff" strokeWidth="1" strokeLinejoin="round" />
      <path d="M20 13L35 13L39 87L13 87Z" fill="#C5BDBD" stroke="#ffffff" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M20 13L35 13L39 15L24 15Z" fill="#D4CDCD" stroke="#ffffff" strokeWidth="1" strokeLinejoin="round" />
      <rect x="19.5" y="17.5" width="14" height="15" rx="1.2" fill="#0A5BA6" stroke="#ffffff" strokeWidth="0.7" />
      <g stroke="#F5C518" strokeWidth="1" strokeLinecap="round">
        <path d="M23 31L20.5 21M23 31L22.5 19.8M23 31L25.5 19.4M23 31L28.5 20M23 31L31 21.5M23 31L31.8 25M23 31L31 28.5M23 31L28 30.5" />
      </g>
      <line x1="34" y1="49" x2="32" y2="73" stroke="#B98A5A" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M27 55L19.5 72L34.5 72Z" fill="url(#logoStripe)" stroke="#1B211D" strokeWidth="0.9" strokeLinejoin="round" />
      <circle cx="27" cy="49" r="5.5" fill="#E9C9A8" stroke="#1B211D" strokeWidth="0.9" />
      <circle cx="25.1" cy="49" r="0.7" fill="#1B211D" />
      <circle cx="28.9" cy="49" r="0.7" fill="#1B211D" />
      <path d="M22.4 44.2Q27 37.2 31.6 44.2Z" fill="#6B4A2E" />
      <ellipse cx="27" cy="44.4" rx="7.6" ry="1.8" fill="#6B4A2E" />
    </svg>
  );
}
