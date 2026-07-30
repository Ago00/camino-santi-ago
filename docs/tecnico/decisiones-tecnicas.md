# Decisiones técnicas

Log permanente de decisiones de arquitectura. Cada entrada: qué se decidió, qué
alternativas se valoraron, por qué se eligió, fecha.

---

## DT-001 — Dos representaciones de la traza: cálculo y pintado

**Fecha:** 2026-07-30 · **Tarea:** F1 — Base

**Decisión.** La traza vive en dos ficheros con responsabilidades distintas:

| | Cálculo | Pintado |
|---|---|---|
| Fichero | `lib/traza/traza.geojson` | `lib/traza/traza-mapa.geojson` |
| Puntos | 7.121 (sin simplificar, traza extendida DT-005) | ~2.011 (Douglas-Peucker, 3 m) |
| Peso | ~147 KB | ~42 KB (~16 KB gzip) |
| Dónde se usa | Solo servidor (`proyeccion.ts`) | Se envía al navegador (mapa, F3) |
| Exactitud | Longitud real, intocable | ±3 m, estética |

**Por qué.** Douglas-Peucker corta esquinas y por tanto **siempre acorta la
línea**. Medido sobre nuestra traza real **antes de la extensión sur de F1.1**
(6.911 puntos, 100 km) — el análisis sigue siendo válido, las cifras son históricas:

| Tolerancia | Puntos | Longitud | Pérdida |
|---|---|---|---|
| — | 6.911 | 100,0008 km | — |
| 1 m | 3.198 | 99,934 km | −67 m |
| 3 m | 1.724 | 99,662 km | −339 m |
| 5 m | 1.302 | 99,419 km | −582 m |
| 10 m | 829 | 98,769 km | −1.232 m |

Una tolerancia de 5 m es visualmente invisible en el mapa y aun así evapora
**582 metros**. Si el cálculo usara la traza simplificada, Santi llegaría al
Obradoiro y la web le diría que le faltan 600 m — el fallo más caro posible,
justo en el momento que justifica todo el proyecto.

**Consecuencia de diseño:** `proyeccion.ts` se ejecuta **en servidor**. Al
cliente solo viajan los números del `Progreso`, no la traza de cálculo.

**Alternativas valoradas.** Una sola traza simplificada (descartada: rompe la
distancia). Una sola traza completa enviada al cliente (descartada: 147 KB sobre
la cobertura móvil de la ruta, y el cálculo en cliente sería manipulable).

**Tolerancia elegida para el pintado: 3 m.** 5 m ahorra 9 KB y no compensa
arriesgar fidelidad visual en el elemento central del producto.

---

## DT-002 — La meta es la Praza do Obradoiro; la traza mide 100,21 km

> ⚠️ **DEROGADA parcialmente por DT-005** (2026-07-30). La meta en el Obradoiro
> y el tramo final manual siguen vigentes. Lo que decae es el punto de inicio y
> el objetivo de longitud: la traza ya no persigue una cifra, es un corredor.

**Fecha:** 2026-07-30 · **Tarea:** F1 — Base · **Decisión de producto de Santi**

**Contexto.** La traza oficial de la Xunta termina en **Praza da Quintana**,
detrás de la catedral, a 93 m en línea recta del Obradoiro (andando son ~210 m:
no se atraviesa la catedral, hay que rodearla). Tres objetivos que hasta ahora
eran compatibles dejaron de serlo:

```
(a) arrancar en el mojón físico del km 100
(b) terminar en la Praza do Obradoiro
(c) que el total sean 100,000 km exactos
```

**Decisión.** Se extiende la traza hasta el Obradoiro (+209,5 m) y **el inicio no
se mueve**. La traza pasa a medir **100,210 km**. Se renuncia a (c).

**Por qué.** 210 m sobre 100 km es un 0,2%. Mantener el inicio conserva el punto
ya calculado y validado contra el mojón, evita rehacer el recorte desde el KML
original, y deja un pelín de margen: se anda algo más de lo que se promete, nunca
menos. La cifra "100 km" es el nombre del reto, no una medición de precisión.

**Alternativas valoradas.**
- *Extender y recortar 210 m por el inicio* para mantener 100,000 km exactos.
  Descartada por Santi: mueve un punto de inicio ya bueno para ganar precisión
  simbólica.
- *Dejar la traza en Quintana* y pintar el Obradoiro como icono. Descartada: la
  barra marcaría 100% dos minutos antes de pisar la plaza.

**Deuda que genera.** Los ~210 m finales son geometría **dibujada a mano** (5
waypoints rodeando la catedral por Praza da Inmaculada), no dato oficial. Van
marcados con `tramo_final_manual: true` en las propiedades del GeoJSON y
registrados en `DEBT.md` para validar sobre el terreno.

**Waypoints del tramo manual** (lon, lat):

| # | Coordenada | Lugar | Tramo |
|---|---|---|---|
| 1 | -8.543659, 42.880599 | Fin de la traza oficial (Quintana) | — |
| 2 | -8.543850, 42.880950 | Quintana, extremo norte | 42,0 m |
| 3 | -8.544300, 42.881350 | Praza da Inmaculada (Azabachería) | 57,6 m |
| 4 | -8.544900, 42.881050 | Arco do Pazo de Xelmírez | 59,2 m |
| 5 | -8.544800, 42.880600 | **Praza do Obradoiro** | 50,7 m |

---

## DT-003 — `proyeccion.ts` es dominio puro con la traza inyectada

**Fecha:** 2026-07-30 · **Tarea:** F1 — Base

**Decisión.** API en dos piezas:

```ts
prepararTraza(geojson): TrazaPreparada      // km acumulados por vértice, una vez
calcularProgreso(historico, traza): Progreso
```

Sin I/O, sin lectura de ficheros, sin `Date.now()` implícito. La traza entra como
parámetro.

**Por qué.** Los tests se escriben con trazas sintéticas de 3 puntos en vez de
depender del GeoJSON real de 7.121 vértices (estado actual; eran 6.911 antes de
la extensión sur de F1.1): fixtures legibles y fallos que señalan la línea exacta
del bug. `prepararTraza` separada evita recalcular las
distancias acumuladas en cada petición (el día del reto habrá ~3.600 posiciones).

---

## DT-004 — Umbrales del dominio en un único módulo

**Fecha:** 2026-07-30 · **Tarea:** F1 — Base

| Constante | Valor | Razón |
|---|---|---|
| `EN_RUTA_MAX_M` | 50 m | El error típico de GPS urbano es de 10-30 m |
| `DESVIO_MENOR_MAX_M` | 250 m | Por encima ya no es ruido: se ha ido por otra calle |
| `VELOCIDAD_MAX_KMH` | 15 km/h | Andando + margen. Por encima es salto de GPS |
| `PRECISION_MAX_M` | 150 m | Puntos más imprecisos no suman al odómetro |

**Por qué en un módulo propio.** El día del reto puede hacer falta ajustar un
umbral en caliente. Buscarlos esparcidos por el código, con el reloj corriendo y
Santi andando, es exactamente lo que no queremos.

---

## DT-005 — La traza es un corredor, no un recorrido: se extiende al sur y el progreso se ancla al inicio real

**Fecha:** 2026-07-30 · **Tarea:** F1.1 — Ajuste de traza y anclaje
**Deroga:** el punto de inicio y el objetivo de longitud de DT-002

**Decisión de producto de Santi.** El reto debe **arrancar en un mojón físico
cuya cifra grabada sea ≥ 100 km**. Y, textualmente: *"la ruta empieza donde yo le
dé a iniciar"* y *"debe mostrar que llevo lo que lleve y que me queda lo
calculado; debemos hacerlo de manera que empiece antes de los 100 km
calculados"*.

### El problema

El inicio actual de la traza está 1,7 km al **norte** de O Porriño siguiendo la
ruta. En la escala de los mojones eso es ≈98,7 km: **incumple el criterio**.

Y no se puede corregir con precisión, por dos motivos independientes:

1. **Las coordenadas de los mojones no existen en ningún dataset público.** El
   dataset de la Xunta solo publica los trazados de etapa; OpenStreetMap en esa
   zona solo tiene mojones de carretera (AP-9V, AG-46). Único ancla documentada
   encontrada: el mojón **99,408**, donde el Camino abandona la N-550 para
   entrar en O Porriño por la rúa Manuel Rodríguez.
2. **Nuestra medición y la grabada en las piedras no coinciden.** Contrastando
   hitos contra las distancias oficiales de etapa, nuestra traza mide de más de
   forma creciente hacia el sur:

   | Hito | Restante s/ traza | Guías | Desvío |
   |---|---|---|---|
   | Padrón | 25,310 km | 23,7 | +1,61 |
   | Caldas de Reis | 44,411 km | 42,3 | +2,11 |
   | Pontevedra | 65,690 km | 63,4 | +2,29 |
   | Redondela | 85,495 km | 83,0 | +2,49 |
   | O Porriño | 101,92 km | 98,2 | +3,72 |

   **No es un fallo de la traza**: se verificó que no se solapa consigo misma en
   ningún punto (0 zonas de repaso), así que no hay tramos duplicados del KML.
   Es la diferencia normal entre un track GPS detallado y las distancias de
   etapa redondeadas de las guías.

### La decisión

**1. La traza se extiende ~4,7 km hacia el sur**, atravesando O Porriño en
dirección Tui, hasta ~3 km al sur del centro. Total ≈ **105 km**.

En vez de acertar el mojón exacto —imposible con los datos disponibles— se
ensancha la red: con 105 km, el punto donde una piedra pone `100` queda dentro de
la traza incluso en el escenario de desfase más pesimista (+3,7 km).

**2. El progreso se ancla al primer punto del intento, no al origen de la traza.**
El porcentaje se mide desde donde Santi pulsa Iniciar hasta el Obradoiro. Sin
esto, con la traza empezando 4,7 km antes, la barra marcaría ~4,5% antes de dar
un paso. Odómetro y km restantes no cambian de semántica.

**3. Se abandona el objetivo de longitud exacta.** El compromiso pasa de "100,000
km exactos" a **"nunca menos de 100"**. Se anda algo más de lo que dice el
titular, nunca menos.

### Por qué esto es robusto

La traza deja de ser *el recorrido* y pasa a ser *el corredor previsto*. Eso la
hace inmune a las dos incógnitas que no podemos cerrar desde aquí (dónde está el
mojón y cuál es el desfase real de la escala grabada): el recorrido de verdad lo
define Santi al pulsar Iniciar.

### Alternativas valoradas

- *Localizar el mojón por investigación* (Wikiloc, fotos geolocalizadas, Street
  View). Descartada por Santi a favor de estimar: más lento y aun así incierto.
- *Estimar desde el mojón 99,408 y contar 500 m hacia atrás.* Encadena dos
  estimaciones (dónde está ese cruce y que el espaciado sea regular) para ganar
  una precisión que el diseño de corredor hace innecesaria.

### Deuda que genera

El día del reto, **la pantalla y las piedras no dirán el mismo número** (~1,5-3,7
km de diferencia). Se aparca deliberadamente hasta F3: cuando Santi ande la ruta
se podrán anotar mojones reales y calibrar con datos en vez de con estimaciones.
Registrado en `DEBT.md`.
