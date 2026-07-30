# Decisiones de producto

Log de decisiones relevantes de producto. Cada entrada: qué se decidió, qué
alternativas se valoraron, por qué se eligió, fecha.

---

## La meta es la Praza do Obradoiro

**Fecha:** 2026-07-30
**Decidido por:** Santi

**Decisión.** La barra de progreso llega al 100% cuando Santi pisa la
**Praza do Obradoiro**, no la Praza da Quintana (fin de la traza oficial de la Xunta).

**Alternativas valoradas:**
- Dejar la meta en Quintana (fin de la traza oficial) y marcar el Obradoiro como
  un icono decorativo → descartado. La barra marcaría 100% dos minutos antes de
  pisar la plaza, que es el momento más importante del reto.
- Extender la traza y recortar 210 m por el inicio para mantener exactamente
  100,000 km → descartado. Mueve el punto de inicio ya calculado y validado
  contra el mojón físico, por ganar una precisión simbólica que no aporta.

**Consecuencia técnica:** la traza pasa a medir 100,210 km. Los últimos ~210 m
son geometría dibujada a mano (Quintana → Obradoiro rodeando la catedral).
Pendiente validar sobre el terreno. Ver `DEBT.md`.

---

## Repo nuevo, no reutilizar la POC

**Fecha:** 2026-07-30
**Decidido por:** Santi (con análisis del Arquitecto)

**Decisión.** Proyecto nuevo (`camino-santi-ago`, repo público), no reutilizar
el repo de la POC (`camino-tracking-poc`).

**Por qué:** la POC tiene deuda de estructura (sin App Router estructurado, sin
tipado estricto, dependencias de experimentos). Partir de cero permite hacer bien
la base sin cargar con los compromisos de la exploración.

La POC queda congelada como referencia. Su `lib/stats.ts` (haversine) y los
patrones de MapLibre con overlay SVG se reutilizan.

---

## No se muestra el pueblo actual en la web pública

**Fecha:** 2026-07-30 (decisión de la especificación v1)

**Decisión.** La web pública no muestra "Ahora: cerca de [pueblo]". Sí en el
panel admin (con lista propia, sin API externa).

**Por qué:** requiere geocodificación inversa (MapTiler API, con límite en plan
free) y la lista de pueblos por km. Se aparca para no bloquear la v1.

---

## ETA fuera de scope

**Fecha:** 2026-07-30 (decisión de la especificación v1)

**Decisión.** La web no calcula ni muestra ETA (hora estimada de llegada).

**Por qué:** el ritmo de Santi bajará con el cansancio de manera no lineal
durante el reto, haciendo cualquier estimación engañosa. Sí se muestra el
ritmo medio global, que es descriptivo sin prometer un tiempo.
