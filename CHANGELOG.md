# Changelog

---

## 2026-08-12 — El gráfico de "Tráfico" ahora deja claro que son visitas y muestra la cifra de cada tramo

**Tipo:** Mejora

En la pestaña "Tráfico" del panel, el gráfico de la evolución en el tiempo
antes era solo una curva sin ninguna cifra visible. Ahora tiene una etiqueta
("Visitas por tramo") encima, y cada punto muestra el número de visitas de
ese tramo — no hace falta pasar el ratón ni adivinar por la altura de la
línea.

---

## 2026-08-12 — Los textos de los formularios de intención/comentario y de los feeds ya se pueden editar desde el panel

**Tipo:** Feature

Los textos del formulario "Deja una intención" (título, subtítulo,
placeholders, etiqueta del checkbox de anónimo, botón), del formulario
"¡Comenta!" (título, placeholders, etiquetas público/privado, botón), del
muro de comentarios ("Cargar más comentarios" / "Eso es todo por ahora") y
del feed "Minuto a minuto" (kicker, "Cargar más", mensaje de lista vacía)
estaban fijos en el código. Ahora son editables desde `/admin` → Textos,
como el resto de textos de la web pública. El mensaje de error de ambos
formularios ("No se ha podido enviar. Inténtalo de nuevo.") comparte una
única entrada editable, porque es el mismo texto en los dos sitios.

---

## 2026-08-12 — Los textos de la pantalla "en directo" y de las estadísticas ya se pueden editar desde el panel

**Tipo:** Mejora

Ahora se pueden editar desde `/admin` el texto de la cinta "En directo · ahora
mismo · Estoy caminando" que aparece mientras Santi está caminando, y las
etiquetas de las tres estadísticas ("En marcha", "Caminados", "Ritmo medio")
que se muestran en las cuatro pantallas de seguimiento (modo guiado y modo
libre, durante y al llegar). Comportamiento idéntico al actual hasta que se
editen desde el panel.

---

## 2026-08-12 — Los textos de la pantalla "antes" y del progreso en directo ya se pueden editar desde el panel

**Tipo:** Feature

Nuevos textos editables desde `/admin` en la pantalla previa al reto (badge de
la ruta, kickers y títulos de cada bloque, nombre y subtítulo bajo la foto de
quien camina) y en los indicadores de progreso que se ven mientras el reto
está en marcha (el mojón kilométrico, la distancia restante en modo libre y
las etiquetas del perfil de elevación). El título de marca "Camino de
Santi·ago" y su subtítulo se mantienen fijos, sin editar, por su tratamiento
visual especial.

---

## 2026-08-12 — Nueva pestaña "Tráfico" en el panel: cuánta gente visita la web durante el reto

**Tipo:** Feature

Nueva pestaña "Tráfico" en `/admin` para ver, mientras Santi camina, cuánta
gente entra a la web pública: visitas totales y visitantes distintos desde
que empezó el reto, un gráfico con la evolución en el tiempo (con selector
de granularidad: cada 5 minutos, cada 30 minutos o cada hora) y un desglose
por página y por origen (de dónde vino cada visitante). No requiere ninguna
cookie de consentimiento ni recoge datos personales — solo cuenta visitas de
forma anónima.

---

## 2026-08-12 — Los textos de la pantalla de llegada ya se pueden editar desde el panel

**Tipo:** Feature

En la pantalla de "llegada", el título y la etiqueta de la cinta superior
("Camino completado" / "¡Ha llegado a Santiago!" en modo guiado, "Intento
completado" / "¡Ha llegado!" en modo libre) estaban fijos en el código. Ahora
son editables desde `/admin` → Textos, como el resto de textos de la web
pública. El mensaje de agradecimiento de debajo ya era editable desde antes.

---

## 2026-08-12 — Icono de la meta y corrección de un bug que congelaba la web pública

**Tipo:** Fix + ajuste visual

El marcador de la meta en el mapa pasa de un emoji genérico de iglesia (⛪) a
una bandera a cuadros (🏁) — símbolo universal de meta. Se probaron antes dos
versiones con la silueta de la Catedral (un icono sencillo y luego uno con
más detalle y el color real de granito de la fachada), pero ninguna convenció
visualmente, así que se optó por lo simple.

Al verificar visualmente este cambio se encontró un bug serio ya presente en
el ajuste del mapa del día anterior (ver entrada de abajo): la web pública
(pantallas "antes", "durante" y "llegada") entraba en un bucle infinito de
renderizado en el navegador nada más cargar, aunque ningún test automático lo
detectaba. La causa: dos de las props nuevas del mapa no se pasaban desde la
mayoría de pantallas y tomaban un valor por defecto que se recreaba en cada
render, lo que disparaba el bucle. Corregido reutilizando siempre el mismo
valor por defecto en vez de crear uno nuevo cada vez.

---

## 2026-08-11 — El mapa en modo guiado ya muestra el camino realmente andado; el panel admin gana una pestaña "Mapa" de comparación

**Tipo:** Feature

Durante el reto en modo guiado, el mapa público ya no dibuja de fondo la ruta
oficial completa: dibuja el recorrido GPS real de Santi, tal y como ya
hacía el modo libre. El marcador de Santiago cambia de estrella (★) a una
catedral (⛪).

El cálculo de la distancia restante, la barra de progreso y el mojón no
cambian en absoluto — siguen midiéndose sobre la ruta oficial completa,
igual que siempre; solo cambia lo que se dibuja en el mapa.

El panel admin gana una pestaña nueva, "Mapa", donde sí se ven las dos
trazas a la vez: la ruta oficial completa y el recorrido real, con una línea
discontinua que conecta la posición actual con el punto exacto de la ruta
oficial que usa el cálculo de kilómetros restantes — útil para comprobar de
un vistazo si el número que ve el público tiene sentido. Si el intento activo
es en modo libre, la pestaña avisa de que no hay ruta oficial de referencia.

La pantalla de llegada a Santiago (modo guiado) también se ha actualizado
para mostrar el recorrido real completo en el mapa, igual que la pantalla
"durante" — antes de este ajuste se quedaba sin ninguna ruta dibujada.

De paso, se ha reforzado el rendimiento de la web pública: mostrar el
recorrido real añadía una consulta extra a cada visita a la página. Ahora esa
consulta se reutiliza durante 20 segundos entre visitas (igual que ya pasaba
con el cálculo de progreso), tanto en modo guiado como en modo libre, para no
sobrecargar la base de datos si la web recibe muchas visitas seguidas.

---

## 2026-08-09 — El modo libre gana tiempo en marcha, ritmo medio y km caminados

**Tipo:** Feature

El modo libre (para retos sin una ruta fija) solo mostraba la distancia
restante en línea recta hasta el destino. Ahora, igual que ya pasa en el modo
guiado, también muestra el tiempo en marcha, el ritmo medio y los kilómetros
realmente caminados, tanto mientras el reto está en curso como en la pantalla
de llegada.

De paso, se ha corregido un problema de fondo que afectaba también al modo
guiado ya en producción: el tiempo en marcha y el ritmo medio se calculaban
con la hora del reloj de quien está mirando la web, no con el último dato
real recibido del móvil. Si el móvil se queda sin batería o sin cobertura,
esas dos cifras seguían subiendo o se desplomaban solas aunque no hubiera
pasado nada nuevo en el reto. Ahora ambas se congelan en el último dato real
hasta que llega uno nuevo, en los dos modos.

---

## 2026-08-09 — Las entradas del minuto a minuto ya no se quedan sin marcador en el mapa

**Tipo:** Fix

Durante la prueba del 2026-08-07, las 16 entradas publicadas en el "minuto a
minuto" se quedaron sin posición asociada: al pinchar cualquiera desde la web
para ver dónde estaba Santi en ese momento, no aparecía ningún marcador en el
mapa. El motivo: la posición se leía de una memoria compartida con la web
pública que casi nunca estaba "caliente" ese día por la poca gente mirando en
directo.

Ahora, si esa memoria está vacía en el momento de publicar, se recalcula la
posición en el momento con el mismo cálculo que usa la web pública — así la
entrada siempre queda con la posición real más reciente (la misma que vería
cualquiera recargando la web en ese instante), salvo en el único caso en que
de verdad todavía no hay ninguna posición registrada (justo tras arrancar el
reto), donde seguir sin marcador es correcto.

---

## 2026-08-09 — El mapa y el progreso ya no se congelan pasadas ~4 horas de reto

**Tipo:** Fix

Durante la prueba real del 2026-08-07 el mapa dejó de actualizarse en mitad
del intento, aunque el móvil seguía enviando la posición sin cortes. La
causa: la base de datos solo entregaba las primeras 1000 posiciones de cada
consulta, y a partir de ahí el mapa, la barra de progreso y los kilómetros
mostrados se quedaban congelados el resto del día — sin ningún aviso de que
algo había dejado de funcionar. En un intento guiado real de 30 horas esto
habría ocurrido a partir de las ~4 horas de empezar.

Ahora el histórico completo de posiciones se trae siempre, sea cual sea su
tamaño. Y para que traerlo entero no vuelva más lento el cálculo del
progreso a medida que pasan las horas, el propio cálculo se ha optimizado
para aprovechar que una persona caminando avanza de forma continua — el
resultado mostrado es exactamente el mismo de siempre, solo mucho más
rápido de calcular con un historial largo.

De paso, la revisión de seguridad de esta misma tarea encontró que ese
mecanismo de respaldo podía forzarse deliberadamente (con acceso al canal
de envío de posiciones) para volver a ralentizar el cálculo — se ha
añadido un límite de seguridad que evita que eso pase, y la carga de la
web pública ahora reutiliza el mismo resultado reciente que ya usa el
resto del sitio en vez de recalcularlo en cada visita.

---

## 2026-08-09 — Las fotos del minuto a minuto se publican siempre, pesen lo que pesen

**Tipo:** Fix

Durante la prueba del 2026-08-07 hubo fotos que no había forma de publicar
(dos horas y media seguidas sin poder subir ninguna, con el botón quedándose
colgado y sin ningún mensaje). El motivo: las fotos de más de unos 4,4 MB —el
tamaño normal de una foto de iPhone— se rechazaban por el camino, antes
siquiera de llegar a la web, y nada lo contaba.

Ahora la foto se comprime en el propio móvil antes de enviarla, conservando
toda la resolución que quepa: en el caso normal la foto se publica con sus
píxeles originales intactos y solo baja de tamaño si de verdad hace falta.
Además pesa bastante menos, así que sube mucho más rápido con la cobertura
irregular del Camino.

Y cuando algo falla, se nota: si se corta la conexión se reintenta solo (con
el aviso en pantalla) y, si aun así no sale, aparece el motivo real escrito
—sin perder el texto ni la foto, que siguen en el formulario para volver a
darle a Publicar—. Publicar solo texto funciona exactamente igual que antes.

De paso, la auditoría de seguridad de esta tarea encontró tres librerías
auxiliares (de las que se usan para compilar y revisar el código, no en la web
publicada) con avisos de seguridad pendientes. Se han actualizado a sus
versiones corregidas.

---

## 2026-08-07 — Compatibilidad temporal mientras la migración del modo de intento no esté aplicada

**Tipo:** Fix

Detectado verificando esta rama en directo contra el Supabase real de
producción: como la migración que añade el modo de intento (guiado/libre)
todavía no se ha aplicado en producción, la web pública mostraba la pantalla
"antes del reto" incluso con un intento realmente en marcha, y el endpoint de
ingesta de posiciones GPS descartaba en silencio todos los puntos recibidos.
Ahora, mientras esa migración no esté aplicada, la web pública y la ingesta
de posiciones se comportan exactamente igual que antes de introducir el modo
de intento — sin perder ningún dato ni ocultar el seguimiento en curso. El
panel admin sigue permitiendo iniciar el reto en modo guiado con normalidad;
el modo libre seguirá necesitando que esa migración esté aplicada.

---

## 2026-08-07 — Modo de intento configurable: guiado o libre, con destino en línea recta

**Tipo:** Feature

Al pulsar "Iniciar" en el panel de administración, ahora se puede elegir el
modo del intento:

- **Guiado** (el de siempre): progreso sobre el Camino Portugués — %, km
  andados/restantes, ritmo, ETA.
- **Libre** (nuevo): pensado para trazar cualquier otra ruta, en cualquier
  lugar. Se fija un destino (latitud/longitud) al iniciar. La web pública
  muestra solo la distancia que queda en línea recta hasta ese destino, y el
  mapa dibuja únicamente el recorrido real (los puntos GPS recibidos,
  conectados según van llegando) — sin ninguna línea de ruta de fondo ni
  barra de progreso.

El modo elegido queda fijo durante todo el intento: para cambiarlo hace falta
"Reiniciar" y elegir de nuevo. El resto de la web (intenciones, comentarios,
minuto a minuto) funciona igual en ambos modos. En modo guiado no hay ningún
cambio de comportamiento.

---

## 2026-08-07 — El corredor sur pasa por el camino que la gente anda de verdad, no por la carretera antigua

**Tipo:** Fix

El tramo sur del corredor (al sur de O Porriño) usaba un trazado del mapa
oficial que, verificado contra un track GPS real de un peregrino, se
desviaba hasta 800 m del camino que se anda de verdad en esa zona. Se ha
sustituido por la variante alternativa que sí coincide con el track real —
el mismo mapa oficial la incluye y empalma de forma exacta con el trazado
anterior, sin ningún salto. Como consecuencia, el corredor gana margen sur
(pasa de ~105 km a ~110 km en total): sigue siendo un margen deliberadamente
generoso, no una medición exacta — el recorrido real y el porcentaje
mostrado siguen fijados por dónde Santi pulse "Iniciar", no por este ajuste.
Sin cambios visibles para quien no compare el mapa con detalle.

---

## 2026-08-02 — Minuto a minuto: la posición guardada en cada entrada coincide con la que ve el mapa público

**Tipo:** Fix

Cada entrada nueva del feed "Minuto a minuto" guarda ahora la misma posición
que en ese momento está mostrando el mapa público, en vez de la posición
más reciente registrada en el sistema. Antes podía darse una pequeña
descoordinación: como el mapa público tarda hasta medio minuto en
actualizarse, una entrada podía quedar con una coordenada ligeramente "más
adelantada" que lo que los espectadores veían pintado al pinchar en ella.
Sin cambios visibles en el mapa, en el resto del panel de admin ni en el
resto de la web pública.

---

## 2026-08-02 — Km restantes: ya no incluyen la vuelta al camino si Santi se desvía

**Tipo:** Fix

Si Santi se desvía de la ruta oficial, los "km restantes" mostrados en la
web ya no incluyen la distancia extra para volver al camino — ahora
muestran solo lo que queda de ruta oficial desde el punto más cercano hasta
Santiago. La barra de progreso, los km andados, el odómetro y el estado
de desvío no cambian.

---

## 2026-08-02 — Ajustes visuales del feed "Minuto a minuto" tras feedback real

**Tipo:** Mejora

Tres ajustes al feed "Minuto a minuto" tras probarlo en producción: el feed
ahora aparece justo debajo de las estadísticas (tiempo, km, ritmo) en vez de
justo debajo del mapa, las entradas con foto muestran la imagen a ancho
completo y con más presencia visual en vez de como una pequeña miniatura
junto al texto, y la foto se muestra ahora completa y sin recortar, con su
proporción real, en vez de forzada a una caja de altura fija.

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
