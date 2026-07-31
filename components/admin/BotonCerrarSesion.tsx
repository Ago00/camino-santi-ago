"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cerrarSesion } from "@/app/admin/actions";

export default function BotonCerrarSesion() {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      await cerrarSesion();
      router.push("/admin/login");
      router.refresh();
    });
  }

  return (
    <button
      onClick={onClick}
      disabled={pendiente}
      className="rounded-full border px-3 py-1.5 text-[13px] font-medium disabled:opacity-60"
      style={{ borderColor: "#00000015", color: "#4A5450" }}
    >
      {pendiente ? "Saliendo…" : "Cerrar sesión"}
    </button>
  );
}
