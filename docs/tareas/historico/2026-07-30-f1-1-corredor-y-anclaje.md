# Tarea en curso

**Título:** F1.1 — La traza pasa a ser un corredor: extensión sur y anclaje del progreso
**Tipo:** Feature (ajuste sobre F1, antes de fusionar su PR)
**Estado:** Implementación
**Iniciada:** 2026-07-30
**Rama:** `feature/f1-base` (la misma de F1 — su PR #1 sigue abierto sin fusionar)

## Prompt clarificado

Santi decide que el reto debe **arrancar en un mojón físico cuya cifra grabada
sea ≥ 100 km**. El inicio actual de la traza no lo cumple: está 1,7 km al norte
de O Porriño, que en la escala de los mojones es ≈98,7.

No se puede localizar el mojón con datos (no existen sus coordenadas en ningún
dataset público, y nuestra medición difiere de la grabada entre +1,5 y +3,7 km).
La salida es un cambio de concepto, en palabras del propio Santi:

> *"la ruta empieza donde yo le dé a iniciar"*
> *"debe mostrar que llevo lo que lleve y que me queda lo calculado; debemos
> hacerlo de manera que empiece antes de los 100 km calculados"*

**La traza deja de ser el recorrido y pasa a ser el corredor previsto.** Se
extiende con margen por el sur y el recorrido real lo define Santi al pulsar
Iniciar.

### Alcance

- **Incluye:** extensión sur de la traza (~4,7 km, total ≈105 km), regeneración
  de los dos GeoJSON, anclaje del porcentaje al primer punto del intento,
  actualización de tests y documentación.
- **Excluye:** calibrar los km mostrados con la escala de los mojones (decisión
  aplazada a F3 por Santi) · localizar el mojón exacto · todo lo de F2-F5.

### Comportamiento esperado

| Caso | Antes | Ahora |
|---|---|---|
| Traza total | 100,21 km | ≈105 km |
| Inicio de la traza | 1,7 km al norte de O Porriño | ~3 km al sur de O Porriño |
| Barra al pulsar Iniciar | 0% (inicio = origen de traza) | **0%**, ancle donde ancle |
| Barra si arranca en km 4 de la traza | marcaría ~4% | **0%** |
| Barra al llegar al Obradoiro | 100% | 100% |
| Odómetro | km reales andados | sin cambios |
| km restantes | separación + plan restante | sin cambios |

### Supuestos asumidos

- El margen de ~5 km es suficiente: cubre el escenario de desfase más pesimista
  (+3,7 km) con holgura, y el sobrante no cuesta nada porque el recorrido real
  arranca en el Iniciar.
- La meta en el Obradoiro y el tramo final manual de DT-002 siguen vigentes: solo
  decaen el punto de inicio y el objetivo de longitud.

## Diseño

Mockup: N/A — sin UI.

## Decisión técnica / Diagnóstico

Aprobada por Santi el 2026-07-30. Detalle completo en `docs/tecnico/decisiones-tecnicas.md`
→ **DT-005** (deroga el inicio y el objetivo de longitud de DT-002).

1. **Extensión sur.** Prolongar la traza de cálculo ~4,7 km hacia el sur desde su
   inicio actual, atravesando O Porriño en dirección Tui, hasta ~3 km al sur del
   centro. Fuente: el KML original (`camino/docs/traza-source/extracted/doc.kml`),
   que contiene la ruta completa desde Tui. Total resultante ≈105 km.
2. **Anclaje del progreso.** El porcentaje se mide desde la proyección del
   **primer punto válido del histórico** hasta el final de la traza, no desde el
   origen de la traza. Sigue siendo monótono. Odómetro y km restantes no cambian
   de semántica.
3. **Se abandona el objetivo de longitud exacta.** El compromiso pasa a ser
   "nunca menos de 100 km".

## Archivos modificados

### Trabajo 1 — Extensión sur de la traza
- `scripts/simplificar-traza.ts` — reescrito para leer el KML original y anteponer ~4,7 km al sur
- `docs/traza-source/doc.kml` — copiado del repo de la POC (fuente CC BY-SA 4.0 Xunta)
- `lib/traza/traza.geojson` — regenerado: 7.121 puntos, 104,9684 km
- `lib/traza/traza-mapa.geojson` — regenerado: 2.011 puntos, 104,6778 km

### Trabajo 2 — Anclaje del progreso
- `lib/traza/proyeccion.ts` — nuevo cálculo de porcentaje anclado al primer punto del intento

### Trabajo 3 — Tests
- `lib/traza/proyeccion.test.ts` — 8 tests nuevos; guardarraíl de longitud actualizado; test de continuidad añadido. Total: 21 tests (todos en verde)

### Trabajo 4 — Documentación
- `CHANGELOG.md` — entrada F1.1
- `DEBT.md` — deuda de desfase pantalla/piedras registrada
- `AGENTS.md` — cifra de longitud actualizada
- `docs/tecnico/arquitectura.md` — cifras de puntos y longitud actualizadas
- `docs/producto/contexto.md` — descripción de la traza actualizada al concepto de corredor

## Quality gates

| Gate | Resultado |
|---|---|
| `pnpm typecheck` | VERDE — 0 errores |
| `pnpm lint` | VERDE — 0 errores |
| `pnpm test` | VERDE — 21/21 tests pasan |
| `pnpm build` | VERDE — build producción OK |

## Historial de revisión

- 2026-07-30: Implementación completada por el Implementador. Pendiente revisión del Reviewer.
- 2026-07-30: Revisión del Reviewer — **APROBADO** con 2 recomendaciones registradas en DEBT.md. Sin bloqueantes. Pasa al Agente de Seguridad.
- 2026-07-30: Revision de Seguridad F1.1 — **APROBADO**. Sin vulnerabilidades bloqueantes. Aviso de diseno registrado para F2: el primer punto del historico ancla el porcentaje de forma permanente; si en F2 no se valida que ese punto sea genuino (autenticado, dentro de la traza, no inyectado), un atacante podria fijar el ancla en el km 104 y dejar la barra siempre al 100%. La autenticacion del token de ingesta en F2 es el control que cierra esto.
- 2026-07-30: Ronda de limpieza final por el Implementador. 4 correcciones: (1) aserción laxa `toBeGreaterThanOrEqual(1)` en test de velocidad imposible cambiada a `.toBe(1)`; otras 3 aserciones laxas endurecidas en el mismo fichero (separacionM desvío-menor: [70,100], separacionM desvío-mayor: >1500, porcentaje acc mala: [20,30]). (2) Cifras de DT-001 (7.121 puntos, tabla DP marcada como pre-extensión) y DT-003 actualizadas en decisiones-tecnicas.md. (3) Entrada "La traza es un corredor" añadida a decisiones-producto.md. (4) Vector de seguridad F2 (envenenamiento del ancla) añadido a DEBT.md con prioridad Alta. Gates: typecheck VERDE, lint VERDE, test 21/21 VERDE, build VERDE.
