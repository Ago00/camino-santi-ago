// Foto opcional de la pantalla "llegada" (DT-024): tarjeta redondeada con
// object-cover, mismo tratamiento visual que FotoQuienCamina (ModoAntes.tsx)
// y FOTO_PEREGRINO (PeregrinoLibre.tsx). Compartida entre ModoLlegada.tsx y
// la preview del modal "Finalizar" del panel admin
// (components/admin/ModalFinalizar.tsx) para que ambas se vean igual.

interface FotoLlegadaProps {
  url: string;
}

export default function FotoLlegada({ url }: FotoLlegadaProps) {
  return (
    <div className="overflow-hidden rounded-2xl border shadow-sm" style={{ borderColor: "#00000012" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- foto pública de Supabase Storage, dominio externo */}
      <img src={url} alt="" className="h-48 w-full object-cover" />
    </div>
  );
}
