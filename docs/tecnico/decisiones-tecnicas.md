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
| Puntos | 6.911 (sin simplificar) + tramo final | ~1.700 (Douglas-Peucker, 3 m) |
| Peso | ~147 KB | ~37 KB (~15 KB gzip) |
| Dónde se usa | Solo servidor (`proyeccion.ts`) | Se envía al navegador (mapa, F3) |
| Exactitud | Longitud real, intocable | ±3 m, estética |

**Por qué.** Douglas-Peucker corta esquinas y por tanto **siempre acorta la
línea**. Medido sobre nuestra traza real:

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
depender del GeoJSON real de 6.911 vértices: fixtures legibles y fallos que
señalan la línea exacta del bug. `prepararTraza` separada evita recalcular las
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
