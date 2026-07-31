// Navegación por pestañas del panel admin (?tab=). Client Component mínimo:
// solo cambia la query string, cada sección sigue siendo un Server Component
// que pide sus propios datos (ver docs/tareas/CURRENT.md).

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { TABS_ADMIN, type TabAdmin } from "@/lib/admin/navegacion";

const C = { ink: "#1B211D", eucalipto: "#2F5D50" };

export default function TabsAdmin({ activa }: { activa: TabAdmin }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function irA(tab: TabAdmin) {
    const params = new URLSearchParams(searchParams);
    params.set("tab", tab);
    router.push(`/admin?${params.toString()}`);
  }

  return (
    <nav className="flex flex-wrap gap-2 border-b pb-3" style={{ borderColor: "#00000012" }}>
      {TABS_ADMIN.map((tab) => (
        <button
          key={tab.valor}
          onClick={() => irA(tab.valor)}
          className="rounded-full px-4 py-1.5 text-[13.5px] font-medium transition-colors"
          style={
            activa === tab.valor
              ? { background: C.eucalipto, color: "white" }
              : { color: C.ink, background: "#00000008" }
          }
        >
          {tab.etiqueta}
        </button>
      ))}
    </nav>
  );
}
