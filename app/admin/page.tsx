// Panel admin (F4). Server Component: tabs vía ?tab=, cada sección es su
// propio Server Component que pide sus propios datos (ver
// docs/tecnico/decisiones-tecnicas.md, DT-010).
//
// La primera capa de protección vive en proxy.ts (redirige a /admin/login sin
// sesión válida). Esta página verifica la sesión una segunda vez, ella misma,
// antes de renderizar ninguna sección — igual que cada Server Action de
// actions.ts hace con requerirSesion(), y por el mismo motivo: un cambio
// futuro en el matcher de proxy.ts (u otra vía de renderizado que no pase por
// el proxy) no debe dejar sin protección la lectura de datos sensibles como
// `intenciones` (cero acceso para `anon`, ver modelo-datos.md). Un único
// punto de verificación aquí basta: todas las secciones cuelgan de esta
// página, así que no hace falta duplicar la comprobación en cada una.

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  esFiltroComentarioValido,
  esGranularidadValida,
  esTabValida,
  type TabAdmin,
} from "@/lib/admin/navegacion";
import { verificarSesion, NOMBRE_COOKIE_SESION } from "@/lib/auth/admin-session";
import TabsAdmin from "@/components/admin/TabsAdmin";
import BotonCerrarSesion from "@/components/admin/BotonCerrarSesion";
import SeccionActividad from "@/components/admin/SeccionActividad";
import SeccionPosicion from "@/components/admin/SeccionPosicion";
import SeccionMapa from "@/components/admin/SeccionMapa";
import SeccionIntenciones from "@/components/admin/SeccionIntenciones";
import SeccionComentarios from "@/components/admin/SeccionComentarios";
import SeccionMinutoAMinuto from "@/components/admin/SeccionMinutoAMinuto";
import SeccionTrafico from "@/components/admin/SeccionTrafico";
import SeccionTextos from "@/components/admin/SeccionTextos";

export const dynamic = "force-dynamic";

const C = { paper: "#F4F3EF", ink: "#1B211D" };

interface AdminPageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const almacenCookies = await cookies();
  const cookieSesion = almacenCookies.get(NOMBRE_COOKIE_SESION)?.value;
  if (!verificarSesion(cookieSesion)) {
    redirect("/admin/login");
  }

  const params = await searchParams;
  const tab: TabAdmin = esTabValida(params.tab ?? null) ? (params.tab as TabAdmin) : "actividad";
  const posOffset = numeroDesdeQuery(params.posOffset);
  const intOffset = numeroDesdeQuery(params.intOffset);
  const filtroComentarios = esFiltroComentarioValido(params.filtroComentarios)
    ? params.filtroComentarios
    : "todos";
  const granularidad = esGranularidadValida(params.gran) ? params.gran : "30m";

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
          {tab === "mapa" && <SeccionMapa />}
          {tab === "intenciones" && <SeccionIntenciones offset={intOffset} />}
          {tab === "comentarios" && <SeccionComentarios filtro={filtroComentarios} />}
          {tab === "minutoaminuto" && <SeccionMinutoAMinuto />}
          {tab === "trafico" && <SeccionTrafico granularidad={granularidad} />}
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
