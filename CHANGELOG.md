# Changelog

---

## 2026-08-02 — Ajustes visuales del feed "Minuto a minuto" tras feedback real

**Tipo:** Mejora

Dos ajustes al feed "Minuto a minuto" tras probarlo en producción: el feed
ahora aparece justo debajo de las estadísticas (tiempo, km, ritmo) en vez de
justo debajo del mapa, y las entradas con foto muestran la imagen a ancho
completo y con más presencia visual, en vez de como una pequeña miniatura
junto al texto.

---

## 2026-08-02 — Minuto a minuto: feed en directo con fotos

**Tipo:** Feature

Nueva sección "Minuto a minuto" en el panel de administración, donde Santi
puede publicar entradas cortas de texto con una foto opcional mientras hace
el Camino. Cada entrada guarda automáticamente dónde estaba en ese momento.
En la web pública, durante el reto estas entradas aparecen solas en
directo (como un comentario en vivo) justo junto al mapa; al pinchar una
entrada, el mapa se centra ahí y muestra un marcador temporal con la hora.
En la pantalla de llegada, el feed completo queda visible como recopilatorio
del recorrido, con la misma interacción de clic para ver la posición. El
admin puede editar el texto de sus entradas o eliminarlas en cualquier
momento.

**Fix (mismo día, hallazgo del Agente de Seguridad):** se corrige el límite
de subida de fotos, que por defecto en Next.js rechazaba cualquier foto de
móvil normal (2-8 MB) antes de que llegara a publicarse, pese a que la
funcionalidad estaba pensada para admitir fotos de hasta 8 MB.

---

## 2026-08-01 — Estadísticas de tiempo, distancia y ritmo en la pantalla de llegada

**Tipo:** Feature

La pantalla que se muestra al llegar a Santiago ahora incluye, justo debajo
del mapa, la misma rejilla de tres estadísticas que ya se veía durante el
reto: tiempo total en marcha, kilómetros caminados y ritmo medio del intento
completo. El cabecero de celebración se simplifica y deja de repetir el
tiempo y los kilómetros por separado, para dar paso a esta vista más
completa una vez terminado el reto.

---

## 2026-08-01 — Auto-refresco de fase en la web pública

**Tipo:** Feature

La web pública ahora detecta sola cuando cambia la fase del reto (antes →
durante → llegada, y también los cambios inversos desde el panel de admin) y
se recarga automáticamente, sin que quien esté viéndola tenga que refrescar
a mano. El cambio se refleja en menos de 30-60 segundos desde que se pulsa
el botón correspondiente en el panel de administración.

---

## 2026-08-01 — Refuerzo de la protección de acceso al panel de administración

**Tipo:** Fix

El panel de administración (donde se gestionan las intenciones y comentarios
enviados por terceros, entre otros datos) ahora comprueba la sesión de admin
por sí mismo antes de mostrar cualquier información, además de la protección
que ya existía a la entrada de la web. Es una segunda capa de seguridad para
el dato más privado del proyecto: aunque la primera protección fallara por
cualquier motivo, la página seguiría sin mostrar nada a quien no haya
iniciado sesión.

---

## 2026-08-01 — Protección frente a exceso de peticiones antes del reto

**Tipo:** Mejora

Los endpoints públicos de la web (envío de posición GPS, comentarios,
intenciones, progreso y el login del panel de administración) ahora limitan
cuántas veces se pueden usar en poco tiempo desde el mismo origen. Si alguien
—o algo automatizado— hace un uso anómalamente intensivo de uno de estos
puntos, las peticiones de más se rechazan sin afectar al resto de visitantes.
Preparación de cara al día del reto, sin coste ni cuentas adicionales.

---

## 2026-08-01 — Arrancar el reto por primera vez desde el panel, sin tocar la base de datos

**Tipo:** Fix

Con la base de datos completamente vacía (antes de que el reto se haya
iniciado alguna vez), la sección Actividad del panel admin no ofrecía ningún
botón para empezar — solo un aviso de que no había ningún intento activo.
Ahora, en ese caso, aparece un botón "Iniciar primer intento" que crea la
primera fila desde el propio panel, sin necesidad de intervención manual en
Supabase.

---

## 2026-08-01 — Panel de administración del reto

**Tipo:** Feature

Nueva zona privada `/admin`, protegida con contraseña, desde la que gestionar
el reto en directo sin tocar código ni la base de datos a mano:

- **Actividad**: arrancar el reto (Iniciar), cerrarlo con un mensaje de
  llegada (Finalizar), deshacer un Finalizar si hace falta seguir andando
  (Retomar) o abortar y empezar de cero (Reiniciar, con confirmación —
  ningún dato se borra nunca, el intento anterior queda guardado).
- **Posición**: última posición conocida y el histórico completo, con la
  opción de descartar cualquier punto raro de GPS, no solo el más reciente.
- **Intenciones**: leer y eliminar las intenciones dejadas por familia y
  amigos.
- **Comentarios**: ocultar, volver a mostrar o eliminar comentarios, con
  filtro por todos/públicos/ocultos.
- **Textos**: editar cualquiera de los textos de la web pública sin
  necesidad de desplegar código nuevo.

La sesión de admin dura 7 días y se renueva sola mientras se usa el panel,
para no obligar a volver a iniciar sesión en mitad del reto (24-30 h en
marcha). Queda fuera de esta versión, por decisión explícita, el botón de
"fichar mi posición ahora" (respaldo manual de geolocalización): se confía
en que la app de tracking del móvil es suficiente.

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
