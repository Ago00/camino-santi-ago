// Login del panel admin: un solo campo de contraseña (admin único, sin
// usuario). Sin mockup (F4 saltó la fase de diseño, ver docs/tareas/CURRENT.md):
// estilo funcional coherente con la paleta de la web pública.

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const C = { paper: "#F4F3EF", ink: "#1B211D", eucalipto: "#2F5D50", error: "#B03A2E" };

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (password.length === 0 || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        setError("Contraseña incorrecta.");
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("No se pudo conectar. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center" style={{ background: C.paper, color: C.ink }}>
      <form
        onSubmit={enviar}
        className="w-full max-w-sm space-y-4 rounded-2xl border p-6"
        style={{ borderColor: "#00000012", background: "white" }}
      >
        <h1 className="[font-family:var(--font-fraunces)] text-[22px] font-semibold">Panel admin</h1>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          className="w-full rounded-lg border px-3 py-2 text-[14px] outline-none"
          style={{ borderColor: "#00000015" }}
        />
        {error && (
          <p className="text-[13px]" style={{ color: C.error }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={password.length === 0 || enviando}
          className="w-full rounded-full px-4 py-2.5 text-[14px] font-medium text-white disabled:opacity-50"
          style={{ background: C.eucalipto }}
        >
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
