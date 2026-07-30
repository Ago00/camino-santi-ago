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

## La traza es un corredor: el recorrido real empieza donde Santi pulse Iniciar

**Fecha:** 2026-07-30
**Decidido por:** Santi

**Decisión.** La traza deja de representar el recorrido exacto y pasa a ser un
**corredor previsto** que comienza varios kilómetros antes del punto de salida
real. La barra de progreso arranca en 0% en el momento en que Santi pulsa
Iniciar, sea cual sea el punto de la traza donde se encuentre en ese momento.

Lo que experimenta Santi (y los espectadores): la barra empieza en 0% cuando
él dice "empiezo", avanza según se mueve, y llega al 100% al pisar el
Obradoiro. El corredor extendido por el sur es invisible para el usuario: solo
importa que el sistema tenga traza suficiente para cubrir cualquier punto de
arranque razonable.

**Por qué.** El inicio actual de la traza estaba 1,7 km al norte de O Porriño,
lo que equivale aproximadamente a la escala del mojón 98,7. El criterio de Santi
era arrancar junto a un mojón que grabara ≥ 100 km. No era posible localizar ese
mojón con precisión suficiente (las coordenadas de los mojones físicos no están
en ningún dataset público). La solución fue ensanchar el margen sur de la traza
hasta que cualquier mojón con cifra ≥ 100 quede dentro del corredor, y dejar que
el recorrido real lo defina el momento del Iniciar.

**Alternativas valoradas:**
- Localizar el mojón del km 100 con datos de campo (Wikiloc, Street View, fotos
  geolocalizadas) → descartado por Santi a favor de estimar, más rápido y
  suficiente dado el diseño de corredor.
- Estimar a partir del mojón 99,408 (único documentado cerca) contando ~500 m
  hacia atrás → encadena dos estimaciones (posición del cruce, espaciado regular)
  para ganar una precisión que el diseño de corredor hace innecesaria.

**Consecuencia técnica:** la traza pasa de 100,21 km a ~105 km (7.121 puntos).
El porcentaje se calcula desde la proyección del primer punto del intento, no
desde el origen del corredor. Ver `docs/tecnico/decisiones-tecnicas.md` → DT-005
para el detalle de implementación.

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
