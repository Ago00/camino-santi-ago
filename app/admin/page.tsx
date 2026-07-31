// Panel admin (F4). Server Component: tabs vía ?tab=, cada sección es su
// propio Server Component que pide sus propios datos (ver
// docs/tecnico/decisiones-tecnicas.md, DT-010).
//
// La protección de acceso vive en proxy.ts (redirige a /admin/login sin
// sesión válida) — esta página no vuelve a comprobarlo porque no muta nada;
// las mutaciones (Server Actions en actions.ts) sí verifican sesión cada una.

import { esFiltroComentarioValido, esTabValida, type TabAdmin } from "@/lib/admin/navegacion";
import TabsAdmin from "@/components/admin/TabsAdmin";
import BotonCerrarSesion from "@/components/admin/BotonCerrarSesion";
import SeccionActividad from "@/components/admin/SeccionActividad";
import SeccionPosicion from "@/components/admin/SeccionPosicion";
import SeccionIntenciones from "@/components/admin/SeccionIntenciones";
import SeccionComentarios from "@/components/admin/SeccionComentarios";
import SeccionTextos from "@/components/admin/SeccionTextos";

export const dynamic = "force-dynamic";

const C = { paper: "#F4F3EF", ink: "#1B211D" };

interface AdminPageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = await searchParams;
  const tab: TabAdmin = esTabValida(params.tab ?? null) ? (params.tab as TabAdmin) : "actividad";
  const posOffset = numeroDesdeQuery(params.posOffset);
  const intOffset = numeroDesdeQuery(params.intOffset);
  const filtroComentarios = esFiltroComentarioValido(params.filtroComentarios)
    ? params.filtroComentarios
    : "todos";

  return (
    <div className="min-h-dvh w-full" style={{ background: C.paper, color: C.ink }}>
      <div className="mx-auto w-full max-w-[720px] px-5 py-6">
        <header className="mb-5 flex items-center justify-between">
          <h1 className="[font-family:var(--font-fraunces)] text-[24px] font-semibold">Panel admin</h1>
          <BotonCerrarSesion />
        </header>

        <TabsAdmin activa={tab} />

        <main className="mt-5">
          {tab === "actividad" && <SeccionActividad />}
          {tab === "posicion" && <SeccionPosicion offset={posOffset} />}
          {tab === "intenciones" && <SeccionIntenciones offset={intOffset} />}
          {tab === "comentarios" && <SeccionComentarios filtro={filtroComentarios} />}
          {tab === "textos" && <SeccionTextos />}
        </main>
      </div>
    </div>
  );
}

function numeroDesdeQuery(valor: string | undefined): number {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
