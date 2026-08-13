// Enlace a Instagram reutilizable en varias pantallas públicas (cierre de
// "Antes", cinta "En directo" de "Durante"). Una sola clave editable
// (`textos.cierre_antes_instagram_url`) alimenta todas las apariciones — es
// la misma cuenta en cualquier pantalla, así que un solo campo en el admin
// basta. No se pinta nada si la URL está vacía.

const C = { ink: "#1B211D", gold: "#C9A24B" };

interface EnlaceInstagramProps {
  url: string;
  /** "claro": fondo claro (Antes, Durante libre). "oscuro": sobre la cinta oscura de Durante guiado. */
  tono?: "claro" | "oscuro";
  className?: string;
}

export default function EnlaceInstagram({ url, tono = "claro", className = "" }: EnlaceInstagramProps) {
  if (url.trim() === "") return null;

  const estilos = tono === "oscuro" ? { borderColor: "#ffffff33", color: "#ffffff" } : { borderColor: `${C.gold}66`, color: C.ink };

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
        tono === "oscuro" ? "hover:bg-white/10" : "hover:bg-black/5"
      } ${className}`}
      style={estilos}
    >
      <IconoInstagram />
      Instagram
    </a>
  );
}

function IconoInstagram() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
