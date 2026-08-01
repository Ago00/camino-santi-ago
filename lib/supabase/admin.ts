/**
 * Cliente Supabase con service_role key — exclusivamente server-side.
 *
 * Da acceso ALL a las 5 tablas (bypassa RLS), así que nunca debe importarse
 * desde código que se ejecute en el navegador. Se usa en route handlers y
 * server actions: `/api/track`, `/admin/actions.ts`, etc.
 *
 * NO SE HA PROBADO CONTRA UN PROYECTO SUPABASE REAL CON DATOS (F2, ver
 * docs/tareas/CURRENT.md). El proyecto Supabase todavía no existe (bloqueado
 * por F0). El cliente está escrito contra la API pública de
 * @supabase/supabase-js y el esquema de supabase/migrations/0001_esquema_inicial.sql,
 * pero su comportamiento con una BD real queda pendiente de verificación en
 * cuanto F0 esté lista. Sí se ha verificado que `getSupabaseAdmin()` lee los
 * nombres correctos de env vars (ver admin.test.ts) tras un bug real donde
 * leía `SUPABASE_URL` en vez de `NEXT_PUBLIC_SUPABASE_URL` — los tests de
 * route.test.ts mockean el cliente entero y no lo detectaban.
 *
 * Construcción perezosa (lazy): `NEXT_PUBLIC_SUPABASE_URL` y
 * `SUPABASE_SERVICE_ROLE_KEY` no existen todavía como env vars (no hay
 * proyecto Supabase). Si este módulo
 * llamara a createClient() en el top-level, `pnpm build` fallaría hoy mismo
 * por falta de esas variables — y el build no puede depender de secretos que
 * aún no existen. En su lugar, el cliente solo se construye (y solo entonces
 * puede fallar) la primera vez que alguien llama a `getSupabaseAdmin()`.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Comentario, Intencion, Intento, MinutoAMinuto, Posicion, Texto } from "@/lib/types";

/**
 * Esquema de BD tipado para el cliente Supabase (espejo de lib/types.ts).
 *
 * `Relationships`, `Views` y `Functions` son obligatorios en el contrato de
 * @supabase/postgrest-js (GenericSchema): `Views`/`Functions` van vacíos
 * (`Record<string, never>`) porque no se usan.
 *
 * Cada `Row` se envuelve en `Pick<T, keyof T>` a propósito. `@supabase/
 * supabase-js` exige que `Row` sea estructuralmente asignable a
 * `Record<string, unknown>` (index signature), y los `interface` de
 * lib/types.ts (Intento, Posicion...) no tienen index signature implícito
 * — TypeScript los trata como no asignables a `Record<string, unknown>`.
 * Sin este envoltorio, el chequeo `Schema extends GenericSchema` de
 * @supabase/supabase-js falla de forma silenciosa (cae a su default `never`
 * sin avisar) y CUALQUIER `.from(tabla).insert(...)/.update(...)` resuelve
 * a `never` sin ningún error hasta que se llama con datos reales. `Pick<T,
 * keyof T>` reconstruye T como mapped type (sí tiene index signature
 * estructural) preservando exactamente los mismos campos. Reproducido y
 * documentado: ver docs/tecnico/decisiones-tecnicas.md si se añade una
 * entrada, o el propio comentario aquí como única fuente por ahora.
 */
export interface BaseDeDatos {
  public: {
    Tables: {
      intentos: {
        Row: Pick<Intento, keyof Intento>;
        Insert: Partial<Intento>;
        Update: Partial<Intento>;
        Relationships: [];
      };
      posiciones: {
        Row: Pick<Posicion, keyof Posicion>;
        Insert: Omit<Posicion, "id" | "created_at" | "descartado"> &
          Partial<Pick<Posicion, "descartado">>;
        Update: Partial<Posicion>;
        Relationships: [];
      };
      intenciones: {
        Row: Pick<Intencion, keyof Intencion>;
        Insert: Omit<Intencion, "id" | "created_at">;
        Update: Partial<Intencion>;
        Relationships: [];
      };
      comentarios: {
        Row: Pick<Comentario, keyof Comentario>;
        Insert: Omit<Comentario, "id" | "created_at" | "oculto"> &
          Partial<Pick<Comentario, "oculto">>;
        Update: Partial<Comentario>;
        Relationships: [];
      };
      textos: {
        Row: Pick<Texto, keyof Texto>;
        Insert: Omit<Texto, "updated_at">;
        Update: Partial<Texto>;
        Relationships: [];
      };
      minuto_a_minuto: {
        Row: Pick<MinutoAMinuto, keyof MinutoAMinuto>;
        Insert: Omit<MinutoAMinuto, "id" | "created_at" | "updated_at">;
        Update: Partial<MinutoAMinuto>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}

let clienteAdmin: SupabaseClient<BaseDeDatos> | null = null;

/**
 * Devuelve el cliente admin, construyéndolo la primera vez que se llama.
 * Lanza si `NEXT_PUBLIC_SUPABASE_URL` o `SUPABASE_SERVICE_ROLE_KEY` no están
 * definidas — pero solo en ese momento, nunca al importar el módulo.
 *
 * La URL usa el prefijo `NEXT_PUBLIC_` (misma variable que public.ts) porque
 * la URL de un proyecto Supabase no es secreta — no tiene sentido una
 * variable de servidor separada solo para ella. El secreto real de este
 * cliente es `SUPABASE_SERVICE_ROLE_KEY`, que sigue sin prefijo.
 */
export function getSupabaseAdmin(): SupabaseClient<BaseDeDatos> {
  if (clienteAdmin) return clienteAdmin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Faltan las env vars NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY. " +
        "Este cliente solo puede usarse server-side, con el proyecto Supabase configurado."
    );
  }

  clienteAdmin = createClient<BaseDeDatos>(url, serviceRoleKey, {
    auth: { persistSession: false },
  });

  return clienteAdmin;
}
