# Knowledge base de bugs

Cada entrada incluye: síntomas, causa raíz, solución y tags para facilitar
la búsqueda cuando aparezca un bug similar.

---

<!-- Formato de entrada:
## [Título descriptivo]
**Fecha:** YYYY-MM-DD
**Tags:** tag1, tag2
**Síntomas:** Qué se observaba.
**Causa raíz:** Por qué ocurría.
**Solución:** Qué se cambió.
-->

## `/api/track` daba 500 con Supabase real: variable de entorno inexistente

**Fecha:** 2026-07-30
**Tags:** supabase, env-vars, testing-con-mocks, integracion

**Síntomas:** Con `.env.local` configurado según el plan y un intento activo
real en la BD, una petición válida a `/api/track` (token correcto, payload
válido, punto dentro de la traza) devolvía `500` en vez de guardar la posición.
Los 32 tests de `route.test.ts` pasaban en verde sin ningún problema.

**Causa raíz:** `lib/supabase/admin.ts` leía `process.env.SUPABASE_URL`, una
variable que **nunca existió** en el proyecto — el plan
(`docs/tecnico/plan-ejecucion-v1.md`) solo define `NEXT_PUBLIC_SUPABASE_URL`.
`lib/supabase/public.ts` sí usaba el nombre correcto. Los tests con el cliente
Supabase mockado nunca ejercitan la lectura real de `process.env`, así que el
nombre de la variable no se puso a prueba hasta la primera verificación de
integración manual contra un proyecto Supabase real.

**Solución:** `admin.ts` pasa a leer `NEXT_PUBLIC_SUPABASE_URL` (la URL de un
proyecto Supabase no es secreta — por eso ya llevaba ese prefijo en el cliente
público; no hace falta una variable de servidor separada solo para la URL).
Se añadió `lib/supabase/admin.test.ts` con `vi.stubEnv()` para que este tipo de
error de nombre de variable quede cubierto por un test unitario que sí
instancia el cliente real (sin conectar), en vez de depender solo de mocks.

**Lección:** cuando un módulo lee `process.env` directamente, un test que
mockea el cliente entero no prueba nada sobre los nombres de las variables que
usa. Hace falta al menos un test que construya el objeto real con
`vi.stubEnv()`. Ver también `docs/LESSONS.md`.
