# Changelog

---

## 2026-07-31 — Foto de Santi y perfil de elevación en la web pública

**Tipo:** Feature

En el modo "Antes" de la web pública: la sección "Quién camina" ahora tiene
una tarjeta de foto (con un dibujo de silueta mientras no haya foto real, se
sustituye por una línea de código en cuanto Santi la tenga). Y debajo del
mapa del recorrido se han añadido las estadísticas del reto — distancia
total, metros de subida y metros de bajada — junto con un gráfico del
perfil de elevación de toda la ruta. Los datos de altitud son reales,
obtenidos de un servicio público de elevación y calculados una sola vez.

---

## 2026-07-31 — Fix: vulnerabilidad de severidad alta en una dependencia de desarrollo

**Tipo:** Fix (seguridad)

Una auditoría de dependencias encontró una vulnerabilidad conocida (denegación
de servicio) en una librería usada solo por las herramientas de desarrollo
(el comprobador de estilo de código y el medidor de cobertura de tests), no
por la web en sí. Se ha corregido ajustando qué versión exacta de esa
librería usan internamente esas herramientas. No afecta a la web pública ni
a ningún dato de usuario.

---

## 2026-07-31 — Fix (definitivo): el mapa en directo no mostraba calles ni terreno, solo la traza

**Tipo:** Fix

El mapa mostraba la ruta del reto (línea naranja) pero el fondo — calles,
ríos, relieve — quedaba en blanco. Un primer intento de arreglo (indicar a
mano dónde está el proceso auxiliar del mapa) mejoró el diagnóstico pero no
resolvió el problema de fondo: ese proceso auxiliar seguía sin poder cargar
del todo una pieza interna que necesita, otra vez sin ningún error visible en
pantalla. La solución definitiva empaqueta esa pieza junto con el proceso
auxiliar en un único fichero autocontenido durante la compilación, y lo sirve
tal cual desde la web sin pasar por el paso de compilación que fallaba.
Verificado visualmente (captura de pantalla contra el build de producción
real): el mapa carga calles, costa y relieve por completo, sin ningún error
en la consola del navegador.

---

## 2026-07-31 — Fix: los estilos de Tailwind no se aplicaban en ninguna página

**Tipo:** Fix

Faltaba el fichero `postcss.config.mjs` que conecta Tailwind con el proceso
de compilación — sin él, ninguna clase de Tailwind (tipografía, colores,
espaciados, tamaños) llegaba a aplicarse realmente, aunque el código las
tuviera escritas correctamente. La web se veía sin ningún estilo desde que
existe el proyecto; no se notó antes porque F1 y F2 no tenían pantallas
reales que mirar. F3 es la primera fase con UI visual, y es donde se detectó
al abrir la preview.

---

## 2026-07-31 — Fix: la página principal quedaba congelada con los datos del momento del despliegue

**Tipo:** Fix

La página principal se generaba una sola vez al desplegar la web y ya no se
actualizaba sola después — con el tiempo habría mostrado siempre la misma
fase del reto y el mismo progreso, aunque Santi ya hubiera empezado a andar
o hubiera llegado a Santiago. Ahora se recalcula en cada visita, como estaba
previsto.

---

## 2026-07-31 — F3: Web pública (mapa, progreso en directo, formularios, textos)

**Tipo:** Feature

La web pública deja de ser un placeholder: ahora muestra tres momentos del
reto según el estado real en la base de datos.

Antes de que Santi empiece a andar, la página cuenta el reto como un hilo
vertical: la historia, el recorrido completo en el mapa, quién camina, por
qué lo hace por intenciones, y los formularios para dejar una intención o un
comentario.

Mientras Santi está en marcha, la web muestra un mapa en directo con su
posición, el tramo ya andado y el que falta, un tinte de cielo que cambia
según la hora real del día, cuántos kilómetros lleva y le quedan, cuánto
tiempo lleva caminando y a qué ritmo. Los datos se actualizan solos cada 30
segundos sin que nadie tenga que recargar la página.

Al llegar a Santiago, todo queda congelado en el momento de la meta con un
mensaje de llegada, y el muro de comentarios paginado sigue abierto para que
la gente pueda felicitarle.

También hay un pequeño peregrino animado que deambula libre por la pantalla,
deja huellas al andar, y se enfada (durante 3 segundos) si alguien le pincha.

**Importante:** el progreso que se muestra al público nunca incluye datos
internos del rastreador GPS (batería, precisión, si el punto viene de la app
o se ha metido a mano) — solo la posición y la hora, cerrando una deuda de
seguridad pendiente desde F1.

---

## 2026-07-31 — Fix: primer deploy en Vercel fallaba por detección incorrecta del gestor de paquetes

**Tipo:** Fix

El primer despliegue en Vercel fallaba al instalar dependencias porque el
proyecto no declaraba el gestor de paquetes en el campo estándar que Vercel
reconoce, lo que provocaba un conflicto entre npm y pnpm durante la
instalación. Se añade ese campo con la versión exacta de pnpm en uso y se
retira una configuración duplicada que, además, generaba un fichero de
bloqueo de dependencias con un formato no estándar (dos documentos en vez de
uno), origen del error de parseo en Vercel.

## 2026-07-30 — Fix: el cliente admin de Supabase no leía la URL configurada

**Tipo:** Fix

Una verificación de integración real detectó que la conexión a la base de
datos desde el servidor (usada por el endpoint que recibe la posición GPS)
buscaba el nombre de una variable de configuración que nunca había existido
en el proyecto, así que fallaba en el primer uso real aunque todo estuviera
bien configurado según el plan. Corregido para que use la misma dirección
que ya usa el resto del sistema.

---

## 2026-07-30 — F2: Ronda final de endurecimiento tras revisión

**Tipo:** Fix

Últimos ajustes de F2 tras la aprobación de Reviewer y Seguridad: el endpoint
de ingesta ahora rechaza explícitamente coordenadas y marcas de tiempo
físicamente imposibles antes de procesarlas, y se añaden tests que confirman
que una petición vacía o con datos corruptos no se guarda nunca. Queda
también anotada como pendiente, antes de exponer el sistema a internet, la
protección frente a un abuso masivo de peticiones al endpoint.

---

## 2026-07-30 — F2: Datos e ingesta (código listo, verificación con cuentas reales pendiente)

**Tipo:** Feature

Queda escrita la capa de datos del proyecto: el esquema completo de las 5
tablas (intentos, posiciones, intenciones, comentarios, textos) con sus
políticas de privacidad, y el endpoint que recibe la posición GPS de Santi
desde el móvil durante el reto.

El endpoint de ingesta incorpora dos protecciones nuevas frente a manipulación:
compara el token de acceso de forma que no se pueda adivinar cronometrando
las respuestas del servidor, y rechaza cualquier punto que aparezca a más de
100 km del recorrido previsto — así un dato falso o corrupto no puede
adelantar artificialmente la barra de progreso.

**Importante:** no hay todavía cuentas de Supabase ni Vercel dadas de alta
(pendiente de F0), así que nada de esto se ha probado contra una base de
datos real. El código está completo y cubierto con tests que simulan la base
de datos, pero falta la verificación de extremo a extremo — aplicar el
esquema, cargar las claves de acceso y comprobar que todo funciona con datos
reales — en cuanto las cuentas existan.

---

## 2026-07-30 — F1.1: Limpieza final post-revisión (aserciones, documentación, deuda de seguridad)

**Tipo:** Mejora

Cuatro arreglos menores tras la aprobación del Reviewer y del Agente de Seguridad. Los tests del motor de progreso tienen aserciones más precisas (valores exactos o rangos ajustados donde el resultado es determinista). La documentación técnica refleja las cifras actuales de la traza (7.121 puntos, 104,97 km) y distingue claramente qué análisis es histórico. El log de decisiones de producto tiene ya la entrada del concepto de corredor. El riesgo de seguridad de F2 queda registrado formalmente como deuda de prioridad alta.

---

## 2026-07-30 — F1.1: La traza pasa a ser un corredor y el progreso arranca desde donde Santi pulsa Iniciar

**Tipo:** Feature

La traza del camino se extiende ~4,7 km hacia el sur, pasando por O Porriño y llegando hasta ~3 km al sur del centro. El total pasa de 100,21 km a ~105 km. Con este margen, el mojón físico del km 100 queda siempre dentro del corredor, sea cual sea el desfase real entre nuestra medición y la escala grabada en las piedras.

La barra de progreso ya no empieza donde empieza la traza: arranca donde Santi pulse Iniciar. Esto evita que la web marque ~4,5% antes de dar un paso. El odómetro y los km restantes no cambian de comportamiento.

---

## 2026-07-30 — F1: Correcciones de seguridad y limpieza de dependencias

**Tipo:** Fix

Se parchean dos grupos de CVEs de alta severidad en dependencias transitivas de
Next.js mediante overrides de pnpm: `sharp` (4 CVEs en libvips) y `postcss`
(path traversal + XSS). Se elimina la dependencia fantasma `@turf/length` y se
reubica `@turf/simplify` en devDependencies. La auditoría de producción queda
en cero vulnerabilidades.

---

## 2026-07-30 — F1: Base del proyecto

**Tipo:** Feature

Se establece la base sobre la que se construyen las fases F2-F5. Incluye el
scaffolding completo (Next.js 16, TypeScript estricto, Tailwind v4, Vitest),
la traza del camino extendida hasta la Praza do Obradoiro (100,21 km), el
motor de cálculo de progreso con barra monótona y odómetro real, los tipos
de dominio que usarán las siguientes fases, y toda la documentación técnica
y de producto del framework.

La web muestra un placeholder sobrio. El diseño real entra en F3.
