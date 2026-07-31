# Changelog

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
