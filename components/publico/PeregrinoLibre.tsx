// Peregrino animado que deambula libre por toda la pantalla, deja huellas
// que se desvanecen y se enfada 3 s al pincharlo. Cara de dibujo (sin foto
// real) — patrón fielmente copiado del mockup aprobado
// (design-sandbox/app/camino/page.tsx, PeregrinoLibre + PeregrinoAndando).

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

const C = { eucalipto: "#2F5D50", gold: "#C9A24B" };

interface Huella {
  id: number;
  x: number;
  y: number;
  ang: number;
}

export default function PeregrinoLibre() {
  const [mounted, setMounted] = useState(false);
  const [target, setTarget] = useState({ x: 0, y: 0 });
  const [facing, setFacing] = useState(1);
  const [dur, setDur] = useState(6);
  const [huellas, setHuellas] = useState<Huella[]>([]);
  const posRef = useRef({ x: 0, y: 0 });
  const elRef = useRef<HTMLDivElement>(null);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const idRef = useRef(0);
  const sideRef = useRef(1);
  const [angry, setAngryState] = useState(false);
  const angryRef = useRef(false);
  const calmRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setAngry = (v: boolean) => {
    angryRef.current = v;
    setAngryState(v);
  };

  const nuevoDestino = () => {
    const size = 44;
    const padX = 10;
    const topSafe = 64;
    const botSafe = 16;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const tx = padX + Math.random() * Math.max(20, w - size - padX * 2);
    const ty = topSafe + Math.random() * Math.max(20, h - size - topSafe - botSafe);
    const cur = posRef.current;
    const d = Math.hypot(tx - cur.x, ty - cur.y);
    setFacing(tx >= cur.x ? 1 : -1);
    if (angryRef.current) {
      setDur(Math.max(0.7, Math.min(4, d / 120)));
    } else {
      setDur(Math.max(4.5, Math.min(16, d / 38)));
    }
    posRef.current = { x: tx, y: ty };
    setTarget({ x: tx, y: ty });
  };

  const enfadar = () => {
    setAngry(true);
    nuevoDestino();
    if (calmRef.current) clearTimeout(calmRef.current);
    calmRef.current = setTimeout(() => setAngry(false), 3000);
  };

  useEffect(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    posRef.current = { x: w * 0.25, y: h * 0.55 };
    setTarget(posRef.current);
    setMounted(true);
    const id = setTimeout(nuevoDestino, 400);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const iv = setInterval(() => {
      const el = elRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height * 0.82;
      const last = lastRef.current;
      if (last) {
        const dx = cx - last.x;
        const dy = cy - last.y;
        if (Math.hypot(dx, dy) < 14) return;
        const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
        const side = sideRef.current;
        sideRef.current = -side;
        const perp = ((ang + 90) * Math.PI) / 180;
        const px = Math.cos(perp) * 4 * side;
        const py = Math.sin(perp) * 4 * side;
        const id = ++idRef.current;
        setHuellas((hs) => [...hs, { id, x: cx + px, y: cy + py, ang }]);
        setTimeout(() => setHuellas((hs) => hs.filter((h) => h.id !== id)), 3200);
      }
      lastRef.current = { x: cx, y: cy };
    }, 360);
    return () => clearInterval(iv);
  }, [mounted]);

  if (!mounted) return null;

  return (
    <>
      {huellas.map((h) => (
        <div
          key={h.id}
          className="pointer-events-none fixed z-30"
          style={{ left: h.x, top: h.y, transform: `translate(-50%,-50%) rotate(${h.ang + 90}deg)` }}
        >
          <motion.div initial={{ opacity: 0.5 }} animate={{ opacity: 0 }} transition={{ duration: 3.2, ease: "linear" }}>
            <HuellaMark />
          </motion.div>
        </div>
      ))}
      <motion.div
        ref={elRef}
        className="pointer-events-none fixed left-0 top-0 z-40"
        initial={{ x: target.x, y: target.y }}
        animate={{ x: target.x, y: target.y }}
        transition={{ duration: dur, ease: "easeInOut" }}
        onAnimationComplete={nuevoDestino}
      >
        <AnimatePresence>{angry && <Bocadillo key="b" />}</AnimatePresence>
        <motion.div
          className="pointer-events-auto cursor-pointer"
          animate={{ scaleX: facing }}
          transition={{ duration: 0.25 }}
          onClick={enfadar}
        >
          <PeregrinoAndando size={40} angry={angry} />
        </motion.div>
      </motion.div>
    </>
  );
}

function Bocadillo() {
  return (
    <motion.div
      className="absolute z-10"
      style={{ left: 30, top: -12 }}
      initial={{ scale: 0, opacity: 0, y: 4 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 18 }}
    >
      <div
        className="[font-family:var(--font-fraunces)] relative rounded-full bg-white px-2 py-0.5 text-[14px] font-bold leading-none"
        style={{ border: "1.6px solid #1B211D", color: "#D23B3B" }}
      >
        !
        <span
          className="absolute -bottom-[5px] left-[6px] h-2.5 w-2.5 rotate-45 bg-white"
          style={{ borderRight: "1.6px solid #1B211D", borderBottom: "1.6px solid #1B211D" }}
        />
      </div>
    </motion.div>
  );
}

function HuellaMark() {
  return (
    <svg width="9" height="13" viewBox="0 0 9 13" fill="none">
      <ellipse cx="4.5" cy="5" rx="3" ry="4.5" fill="#7A5A3C" />
      <ellipse cx="4.5" cy="11" rx="1.8" ry="1.5" fill="#7A5A3C" />
    </svg>
  );
}

function PeregrinoAndando({ size = 48, angry = false }: { size?: number; angry?: boolean }) {
  const paso = angry ? 0.2 : 0.5;
  const leg = { repeat: Infinity, duration: paso, ease: "easeInOut" as const };
  const clipId = useId();
  const stripeId = `${clipId}-stripe`;
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 40 48"
      fill="none"
      animate={{ y: [0, -1.5, 0] }}
      transition={{ repeat: Infinity, duration: paso, ease: "easeInOut" }}
      aria-label="Peregrino caminando"
    >
      <line x1="30" y1="9" x2="27" y2="45" stroke="#B98A5A" strokeWidth="2" strokeLinecap="round" />
      <circle cx="30" cy="10" r="2" fill={C.gold} />
      <rect x="8" y="20" width="7" height="12" rx="3" fill={C.eucalipto} />
      <motion.line
        x1="19" y1="32" x2="16" y2="43" stroke="#2A2A2A" strokeWidth="3" strokeLinecap="round"
        style={{ transformBox: "fill-box", transformOrigin: "50% 0%" }}
        animate={{ rotate: [16, -16, 16] }} transition={leg}
      />
      <motion.line
        x1="21" y1="32" x2="24" y2="43" stroke="#2A2A2A" strokeWidth="3" strokeLinecap="round"
        style={{ transformBox: "fill-box", transformOrigin: "50% 0%" }}
        animate={{ rotate: [-16, 16, -16] }} transition={leg}
      />
      <defs>
        <pattern id={stripeId} patternUnits="userSpaceOnUse" width="4.4" height="48">
          <rect x="0" width="2.2" height="48" fill="#CE2029" />
          <rect x="2.2" width="2.2" height="48" fill="#FFFFFF" />
        </pattern>
      </defs>
      <path
        d="M13 19h11a3 3 0 0 1 3 3v8a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4v-8a3 3 0 0 1 3-3z"
        fill={`url(#${stripeId})`}
        stroke="#1B211D"
        strokeWidth="0.6"
      />
      <line x1="24" y1="23" x2="29" y2="13" stroke="#CE2029" strokeWidth="3" strokeLinecap="round" />
      {angry && (
        <>
          <motion.circle cx="11" cy="9" r="1.6" fill="#AEB6BE" animate={{ cy: [9, 2], opacity: [0.7, 0], r: [1.4, 2.8] }} transition={{ repeat: Infinity, duration: 0.9 }} />
          <motion.circle cx="26" cy="9" r="1.6" fill="#AEB6BE" animate={{ cy: [9, 1.5], opacity: [0.7, 0], r: [1.2, 2.6] }} transition={{ repeat: Infinity, duration: 0.9, delay: 0.45 }} />
        </>
      )}
      <motion.circle
        cx="18.5"
        cy="12"
        fill={angry ? "#E0483C" : "#E9C9A8"}
        stroke="#00000022"
        animate={angry ? { r: [6.5, 7.6, 6.5] } : { r: 6.5 }}
        transition={angry ? { repeat: Infinity, duration: 0.45 } : { duration: 0.2 }}
      />
      <circle cx="16.5" cy="12" r="0.9" fill="#333" />
      <circle cx="20.5" cy="12" r="0.9" fill="#333" />
      {angry ? (
        <>
          <path d="M14.8 10.2l2.4 1.1M22.2 10.2l-2.4 1.1" stroke="#333" strokeWidth="0.9" strokeLinecap="round" />
          <path d="M16.5 15q2-1.3 4 0" stroke="#333" strokeWidth="0.9" fill="none" strokeLinecap="round" />
          <path d="M23.4 6.3l1.8 1.8M25.2 6.3l-1.8 1.8" stroke="#D23B3B" strokeWidth="1" strokeLinecap="round" />
        </>
      ) : (
        <path d="M16.5 14.4q2 1.4 4 0" stroke="#333" strokeWidth="0.8" fill="none" strokeLinecap="round" />
      )}
      <path d="M10 9q8.5-5.5 17 0" stroke="#6B4A2E" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M14 9q4.5-4 9 0z" fill="#8A5A34" />
    </motion.svg>
  );
}
