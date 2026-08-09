# Tarea en curso

**Título:** Subida de fotos del minuto a minuto: fallo por el límite de 4,5 MB de Vercel
**Tipo:** Bug
**Estado:** Implementación
**Iniciada:** 2026-08-08

## Prompt clarificado

Durante la prueba real del 2026-08-07, adjuntar una foto a una entrada del
"minuto a minuto" desde el panel admin fallaba de forma intermitente: varios
fallos seguidos, alguna foto que sí entraba, y un tramo de 2 h 30 min sin
poder subir ninguna (entradas reales del feed: "Por problemas técnicos no
puedo subir más fotos" a las 06:27Z y "Vuelvo a poder subir fotos!" a las
08:11Z). Publicar solo texto siempre funcionó.

Debe existir lo siguiente al terminar:

1. **Cualquier foto que Santi haga con el iPhone se puede publicar**, sin
   importar lo que pese el original, tanto eligiéndola de la galería como
   haciéndola desde el propio navegador.
2. **La subida es rápida con cobertura mala** — el escenario real es andar
   30 h por Galicia con 4G irregular. Que una foto tarde 40 s en subir es un
   fallo de producto aunque técnicamente acabe funcionando.
3. **Cuando algo falle, Santi ve en pantalla el motivo real**, no un error
   genérico ni un botón que se queda colgado. Hoy
   `components/admin/ComposerMinutoAMinuto.tsx` hace
   `await crearMinutoAMinuto(formData)` dentro de `startTransition` sin
   `try/catch` ni estado de error, así que ni siquiera los mensajes ya
   escritos en `lib/supabase/storage.ts` llegan nunca al usuario.
4. **Si falla, no se pierde lo escrito** — el texto y la foto siguen en el
   formulario para reintentar.

## Alcance

- **Incluye:** el flujo de adjuntar y publicar foto del composer del panel
  admin (`ComposerMinutoAMinuto.tsx`, `crearMinutoAMinuto`,
  `lib/supabase/storage.ts`, `next.config.ts`) y el feedback de error de ese
  formulario.
- **Excluye explícitamente:** el corte a 1000 filas de PostgREST que congela
  el mapa y el progreso (bug 2, tarea aparte); las entradas del feed con
  `lat`/`lon` a `null` por la caché en memoria no compartida entre instancias
  serverless (bug 3, tarea aparte, ya registrado en `DEBT.md`); el modo
  guiado y el dominio de proyección (`lib/traza/`), que no se tocan; la
  edición de fotos ya publicadas (DT-013 la descartó a propósito).

## Comportamiento en casos límite

- **Foto enorme (iPhone 48 MP, 8-12 MB):** se publica igual, sin que Santi
  tenga que hacer nada.
- **El navegador no puede procesar la imagen** (formato raro, API no
  disponible): no se bloquea la publicación; se intenta con el fichero
  original y, si tampoco cabe, se muestra un error explícito con el motivo,
  antes de gastar la subida.
- **Fallo de red a mitad de subida:** mensaje de error visible, texto y foto
  intactos en el formulario para reintentar.
- **Entrada sin foto:** comportamiento actual sin cambios.

## Supuestos asumidos

- **La copia publicada puede perder calidad, pero lo mínimo imprescindible.**
  El usuario aceptó primero una reducción fija a ~1600 px y después la
  rechazó explícitamente ("me parece muy loco reducir tanto la calidad"). Al
  medirlo sobre sus fotos reales quedó claro que no hacía falta: a resolución
  nativa y calidad alta ya se baja del límite. El supuesto vigente es
  **conservar la resolución nativa siempre que quepa**, y bajar solo peldaños
  concretos cuando no quepa (ver DT-017). Este es el supuesto que manda; la
  redacción anterior queda derogada.
- **La copia reducida puede ser la única copia que exista.** Santi adjunta
  fotos tanto desde la galería como con "Hacer foto" desde el navegador, y
  iOS no guarda en el carrete las fotos hechas desde el navegador. Como ha
  confirmado que la calidad reducida le vale, se acepta; no se le pide que
  cambie de hábito ni el sistema depende de que lo recuerde a las 20 h de
  caminata.
- **Solo Santi publica** — el panel es de admin único (DT-010), sesión de 7
  días, así que no hay concurrencia de varios autores que considerar.
- **Solo fotos, no vídeo** — los MIME aceptados hoy son jpeg/png/webp y no
  hay petición de ampliarlos.

## Diseño
Mockup: N/A — no hay pantalla nueva; el composer existente gana estado de
error y estado de progreso.

## Decisión técnica / Diagnóstico

### Diagnóstico (confirmado empíricamente, 2026-08-08)

**Causa raíz:** Vercel rechaza en el edge, con `413` y
`x-vercel-error: FUNCTION_PAYLOAD_TOO_LARGE`, cualquier petición de más de
~4,5 MB, **antes de invocar la función**. La foto viaja dentro del `FormData`
de la Server Action `crearMinutoAMinuto`, así que las fotos de más de ~4,4 MB
nunca llegan a ejecutar ni una línea del código del proyecto.

Medido contra producción (`POST /api/track` con token inválido a propósito,
`https://camino-santi-ago-sage.vercel.app`):

| Body enviado | Respuesta |
|---|---|
| 4,0 MB | `401` — llega a la función |
| 4,3 MB | `401` — llega a la función |
| 4,5 MB | **`413 FUNCTION_PAYLOAD_TOO_LARGE`** |
| 5,0 MB | **`413 FUNCTION_PAYLOAD_TOO_LARGE`** |
| 6,0 MB | **`413 FUNCTION_PAYLOAD_TOO_LARGE`** |

**Evidencia corroborante:** las 7 fotos que sí subieron el día de la prueba
pesan 2,04 / 1,79 / 3,39 / 2,49 / 4,48 / 0,85 / 4,42 MB — **todas por debajo
de 4,5 MB**. En el bucket `minuto-a-minuto` no hay ningún objeto huérfano:
ninguna subida llegó a fallar en Supabase. Todos los fallos ocurrieron antes
de entrar al servidor.

**Dos creencias falsas que había en el código:**

- `experimental.serverActions.bodySizeLimit: "10mb"` (`next.config.ts`) no
  sirve de nada aquí. Es un límite de aplicación que Next aplica *dentro* de
  la función; el de 4,5 MB es de plataforma y Next no puede subirlo. El
  comentario que acompaña a esa opción documenta explícitamente lo contrario
  y hay que corregirlo.
- `TAMANO_MAXIMO_BYTES = 8 MB` (`lib/supabase/storage.ts`) es inalcanzable:
  ninguna petición de 8 MB llega jamás a esa comprobación.

### Decisión aprobada por el usuario (2026-08-09) — DT-017

Aprobada la **Opción A′: compresión adaptativa en el navegador + reintento
automático**, **sin cola persistente en IndexedDB**. Ver `DT-017` en
`docs/tecnico/decisiones-tecnicas.md` para el análisis completo y las
alternativas descartadas. Resumen de lo que hay que construir:

1. **Compresor adaptativo en el cliente.** Módulo nuevo (dominio de imagen,
   fuera de los componentes de UI). Escalera de intentos que empieza por
   **resolución nativa a calidad alta** y solo baja un peldaño si el
   resultado no cabe en el presupuesto: calidad alta → calidad media →
   3000 px → 2560 px → … Se para en el primer resultado que quepa. Debe
   respetar la orientación EXIF (una foto vertical de iPhone no puede salir
   tumbada) y normalizar la salida a JPEG.

   **Datos medidos sobre las 4 fotos reales del intento 10** (todas
   4032×3024, 12,2 MP) — la escalera debe elegir el primer peldaño de esta
   tabla que quepa, es decir, en el caso normal **resolución nativa intacta**:

   | Original | Nativa q0,92 | Nativa q0,85 | 2560 px q0,85 |
   |---|---|---|---|
   | 4,48 MB | 3,42 MB | 2,34 MB | 1,03 MB |
   | 4,42 MB | 3,16 MB | 2,27 MB | 1,10 MB |
   | 3,39 MB | 2,75 MB | 1,73 MB | 0,81 MB |
   | 2,04 MB | 1,72 MB | 1,05 MB | 0,45 MB |

   (Medido con libvips/mozjpeg, no con el `canvas` del navegador: sirve para
   fijar el orden de magnitud y el orden de la escalera, no como garantía
   byte a byte. Por eso la escalera **comprueba el tamaño real resultante en
   cada peldaño** en vez de fiarse de una tabla.)

2. **Presupuestos coherentes con la plataforma.** El presupuesto del
   compresor y `TAMANO_MAXIMO_BYTES` de `lib/supabase/storage.ts` (hoy 8 MB,
   inalcanzable) se fijan por debajo de los ~4,5 MB del edge de Vercel,
   dejando margen para el resto del `FormData` y el overhead de multipart.
   Elegir los valores concretos y justificarlos en comentario.

3. **Degradación sin bloqueo.** Si el navegador no puede procesar la imagen,
   se intenta con el fichero original; si ese tampoco cabe en el
   presupuesto, se muestra el error **en el cliente, antes de subir nada**
   (no tiene sentido gastar 40 s de 4G rural en una petición que el edge va
   a rechazar).

4. **Reintento automático con espera creciente** ante fallos de red o
   respuestas no definitivas, con el estado visible en el composer
   ("Reintentando…"). Los errores de validación (formato no permitido,
   demasiado grande) **no se reintentan** — reintentar algo que va a fallar
   igual solo gasta batería y datos. Sin cola persistente en IndexedDB:
   decisión explícita del usuario, y iOS Safari no soporta Background Sync
   (prometer subida en segundo plano sería falso).

5. **El composer deja de tragarse los errores.** Hoy
   `ComposerMinutoAMinuto.tsx` hace `await crearMinutoAMinuto(formData)`
   dentro de `startTransition` sin `try/catch`: cualquier fallo se propaga a
   un error boundary y el mensaje real nunca llega al usuario. Debe capturar,
   mostrar el motivo en pantalla, y **conservar texto y foto** para
   reintentar.

6. **`next.config.ts`:** ajustar `bodySizeLimit` y **corregir su comentario**,
   que hoy afirma explícitamente lo contrario de lo que ocurre en producción
   (dice que sin subirlo "cualquier foto de móvil normal se rechaza", cuando
   el límite real que manda es el de plataforma, que Next no puede elevar).

**Fuera de alcance (no tocar):** el esquema de BD, las políticas de Storage,
el contrato de `crearMinutoAMinuto` (sigue recibiendo un `File` en el
`FormData` y subiendo con `service role`), y `lib/traza/`.

## Archivos modificados

**Nuevos**

| Fichero | Qué hace |
|---|---|
| `lib/imagen/limites-subida.ts` | Tamaño máximo (4 MiB), presupuesto del compresor (3,5 MiB) y formatos aceptados. Los comparten cliente y servidor; cada número lleva su porqué frente al corte de ~4,5 MB del edge de Vercel. |
| `lib/imagen/escalera-compresion.ts` | Dominio puro: peldaños (calidad antes que dimensiones), `LADO_LARGO_MAXIMO_PX` (techo de 4032 px por el límite de área de canvas de iOS), `calcularDimensionesDestino`, `recorrerEscalera`. La codificación entra como parámetro. |
| `lib/imagen/escalera-compresion.test.ts` | 19 tests: elección de peldaño, no ampliar, redondeo, lado mínimo, deduplicación de codificaciones, ningún peldaño cabe, escalera vacía, error del codificador, y el techo de resolución (48 MP no se codifica nativa, área siempre bajo el límite de iOS, 12 MP intacta). |
| `lib/imagen/preparar-foto.ts` | Solo cliente: decodifica en `<img>` (orientación EXIF aplicada), recodifica a JPEG en `<canvas>` reutilizado, degrada al original si el navegador falla, y decide el mensaje de "demasiado grande". |
| `lib/imagen/preparar-foto.test.ts` | 6 tests de `elegirFotoAEnviar` (la única decisión pura del módulo). |
| `lib/envio/errores-de-envio.ts` | Dominio puro: `ErrorNoReintentable`, detección de fallo de red (Chrome/Safari/Firefox), acción desaparecida tras un despliegue, control de flujo de Next, política de reintento y mensajes para el usuario. |
| `lib/envio/errores-de-envio.test.ts` | 20 tests de clasificación y de redacción de mensajes (incluido que no se filtra el mensaje crudo de un error inesperado). |
| `lib/envio/reintentar.ts` | Dominio puro: `calcularEsperaMs` (1 s, 2 s, 4 s) y `ejecutarConReintentos` con la espera inyectada. |
| `lib/envio/reintentar.test.ts` | 9 tests: sin espera al primer intento, esperas crecientes, no reintentar lo definitivo, agotar intentos, avisos de reintento. |

**Modificados**

| Fichero | Cambio |
|---|---|
| `components/admin/ComposerMinutoAMinuto.tsx` | Prepara la foto antes de enviar; estados "Preparando foto…", "Publicando…", "Reintentando… (intento N)"; mensaje de error visible (`role="alert"`) y formulario intacto al fallar. Además se liberan las URLs de blob de la miniatura (fuga preexistente del mismo flujo: cada una mantenía viva la foto entera en memoria durante toda la sesión). |
| `app/admin/actions.ts` | `crearMinutoAMinuto` devuelve `ResultadoPublicacion` en vez de lanzar los fallos esperados; distingue `ErrorDeSubidaDeFoto` (mensaje mostrable) de un fallo inesperado (a logs, mensaje genérico). |
| `lib/supabase/storage.ts` | Límites y lista de MIME importados de `lib/imagen/limites-subida.ts`; `TAMANO_MAXIMO_BYTES` de 8 MB (inalcanzable) → 4 MiB; nueva clase `ErrorDeSubidaDeFoto`; mensajes derivados de la constante. |
| `lib/types.ts` | Nuevo tipo `ResultadoPublicacion` con el porqué de devolver el fallo en vez de lanzarlo. |
| `next.config.ts` | `bodySizeLimit` 10mb → 4.5mb y comentario corregido: subirlo no amplía el límite real, que es de plataforma. |
| `app/admin/actions.test.ts` | Tests de fallo adaptados al resultado devuelto + 3 tests nuevos (ok tras insertar, mensaje de subida, no filtrar el error interno). |
| `lib/supabase/storage.test.ts` | Tests de tamaño referidos a la constante compartida + regresión de que el tope queda por debajo del corte del edge + `ErrorDeSubidaDeFoto`. |
| `docs/tecnico/arquitectura.md` | Filas nuevas de `lib/imagen/` y `lib/envio/`, nota en `storage.ts`, `ComposerMinutoAMinuto.tsx` y en la regla de Server Actions. |
| `pnpm-workspace.yaml`, `pnpm-lock.yaml` | Overrides de los 3 advisories altos que bloqueó Seguridad (`brace-expansion` 5.0.8→5.0.9, `js-yaml` 4.3.0→4.3.1, `nanoid` 3.3.16→3.3.18) y comentario de `minimatch` corregido. Sin cambios en `package.json`. |
| `CHANGELOG.md`, `DEBT.md` | Entrada de cierre y dos deudas nuevas (sin test automático del canvas; test intermitente de `app/admin/page.test.ts`). |

**Decisiones de implementación que conviene revisar en la revisión:**

**1. `crearMinutoAMinuto` pasa de `Promise<void>` a `Promise<ResultadoPublicacion>`.**
El punto 5 de la decisión pedía "capturar y mostrar el motivo en pantalla",
pero con un `throw` eso es imposible en producción: Next redacta el mensaje de
todo error lanzado en el servidor y lo sustituye por un texto genérico con
digest — justo el "error genérico" que el prompt clarificado prohíbe. La guía
de Next lo dice explícitamente ("model expected errors as return values"). No
cambia el contrato declarado fuera de alcance (sigue recibiendo un `File` en
el `FormData` y subiendo con `service role`), ni el esquema, ni las políticas
de Storage.

**2. El composer envía con `onSubmit` + `preventDefault` en vez de
`<form action={fn}>`.** React 19 solicita un reset del formulario antes de
ejecutar una `action` de tipo función (verificado en el código de react-dom:
`startHostTransition` llama a `requestFormReset` y luego a la acción), y ese
reset se aplica al terminar la transición, haya ido bien o mal. Con `action`,
al fallar el envío se vaciaría el `<input type="file">` —no controlado— y
quedaría la miniatura en pantalla sin fichero detrás: justo el punto 4 del
prompt clarificado ("si falla, no se pierde lo escrito"). El texto no se veía
afectado porque ya era un input controlado.

**3. Los peldaños "a resolución nativa" están acotados a 4032 px de lado
largo** (`LADO_LARGO_MAXIMO_PX`), añadido en Ronda 2 por el bloqueante B1.
Safari iOS no lanza al superar el área máxima de canvas: devuelve un JPEG en
blanco que pasaría todas las validaciones. Las fotos de 12 MP medidas en
DT-017 siguen codificándose a resolución nativa byte por byte igual; una de
24 o 48 MP acaba en 4032×3024, la resolución para la que existen mediciones.

Las tres desviaciones están ahora registradas en `decisiones-tecnicas.md`
(DT-017, "Nota de cierre"), que es el registro permanente.

## Quality gates

| Gate | Comando | Resultado |
|---|---|---|
| Typecheck | `pnpm typecheck` | ✅ 0 errores |
| Lint | `pnpm lint` | ✅ 0 errores, 0 warnings |
| Tests | `pnpm test` | ✅ 293 tests, 27 ficheros, todo en verde (54 nuevos) |
| Build | `pnpm build` | ✅ compila y genera las 10 rutas |
| Auditoría | `pnpm audit` | ✅ sin vulnerabilidades de ninguna severidad |

**Pendiente de verificación no automatizable (ver `docs/LESSONS.md` y la deuda
nueva en `DEBT.md`):** la recodificación con `canvas` solo se ejecuta en un
navegador real. Antes de dar la tarea por cerrada hay que subir desde el móvil,
en la preview, **una foto horizontal y una vertical** y comprobar que se
publican, que la vertical no sale tumbada y que son visiblemente más rápidas.

## Historial de revisión

### Ronda 1 — Reviewer (2026-08-09): ⚠️ Bloqueantes a corregir

Veredicto: **no pasa**. La solución construida es la aprobada en DT-017, vive en
las capas correctas, está bien tipada y los tests nuevos son de buena calidad.
Dos bloqueantes: uno funcional (un caso límite explícito del prompt clarificado
no se cumple) y uno documental.

**B1 — La escalera no acota el área del canvas: en una foto de más de ~16,7 MP,
iOS puede publicar una imagen en negro o volver al error de "demasiado grande".**
`lib/imagen/escalera-compresion.ts:38-45` — los dos primeros peldaños son
`ladoLargoMaximoPx: null` (resolución nativa) sin ninguna cota de área, y
`lib/imagen/preparar-foto.ts:92-104` entra en la escalera con
`naturalWidth`/`naturalHeight` tal cual. Safari en iOS limita el *backing store*
de un `<canvas>` (del orden de 16,7 Mpx de área); por encima de ese límite no
lanza excepción: `drawImage` no pinta y `toBlob` devuelve un JPEG válido pero en
blanco/negro, que pasa las dos comprobaciones de tamaño y se publica. En el
mejor caso el navegador falla, se degrada al original de 8-12 MB y sale
"demasiado grande" — es decir, el bug original con mejor mensaje. El prompt
clarificado lista como caso límite "Foto enorme (iPhone 48 MP, 8-12 MB): se
publica igual, sin que Santi tenga que hacer nada", y los iPhone recientes
capturan por defecto a 24 MP (5712×4284 = 24,5 Mpx), también por encima del
límite.
*Fix propuesto:* acotar el área de origen antes de recorrer la escalera (o poner
`ladoLargoMaximoPx: 4096` en los dos primeros peldaños). Las 4 fotos reales
medidas en DT-017 son 4032×3024 (12,2 Mpx, lado largo 4032 < 4096): con esta cota
el comportamiento aprobado y medido no cambia ni un byte, solo se protege el caso
que hoy es silenciosamente incorrecto. Añadir el test de la cota en
`escalera-compresion.test.ts` (una foto de 8064×6048 no se codifica a resolución
nativa).

**B2 — Dos documentos técnicos afirman lo contrario de lo implementado.**
(a) `docs/tecnico/decisiones-tecnicas.md:981` (DT-017, último párrafo) dice
"**No cambia** el contrato de `crearMinutoAMinuto`…", y el contrato sí cambió:
`Promise<void>` → `Promise<ResultadoPublicacion>`. La desviación está bien
razonada y documentada en este `CURRENT.md`, pero `CURRENT.md` se archiva al
cerrar y DT-017 queda como registro permanente diciendo algo falso.
(b) `docs/tecnico/arquitectura.md:41` sigue describiendo
`ComposerMinutoAMinuto.tsx` como "Server Action nativa", cuando ya no usa
`<form action={fn}>` sino `onSubmit` + `preventDefault`.
Es exactamente el patrón recurrente con tres entradas en `DEBT.md` y una lección
propia en `docs/LESSONS.md`; por eso es bloqueante y no recomendación.
*Fix propuesto:* nota de cierre en DT-017 ("el contrato de retorno sí cambia:
los fallos esperados se devuelven como `ResultadoPublicacion`; el `FormData` con
`File` y la subida con `service role` no cambian, y el porqué es…") y corregir la
línea de `arquitectura.md`.

**Recomendaciones registradas en `DEBT.md`:** reintento no idempotente (posible
entrada duplicada), sin cota temporal en la preparación/envío, formato no
comprobado en cliente al degradar al original, `ErrorNoReintentable` sin
productor, y `docs/producto/funcionalidades.md` sin reflejar la copia
recomprimida. Además, mejoras menores a aplicar en esta misma ronda si se
quiere: entradas inalcanzables de `ETIQUETA_BOTON`
(`ComposerMinutoAMinuto.tsx:29-35, 197`), aserción del test de no-filtrado
(`app/admin/actions.test.ts:495`, fijar el mensaje genérico exacto) y el `as`
innecesario de `errores-de-envio.ts:63`.

**Verificado y correcto** (no rehacer): la aritmética de los presupuestos (4 MiB
+ overhead ≈ 4,2 MB, por debajo de los 4,3 MB medidos como buenos); que un fallo
de validación no se reintenta y uno de red sí; que el flujo sin foto y las
entradas ya publicadas no cambian; el cambio a valor de retorno y el `onSubmit`
en vez de `action`, ambos con razonamiento correcto y sin filtrar detalles
internos al cliente.

### Ronda 1 — Implementador (2026-08-09): bloqueantes corregidos

**B1 — corregido.** Nueva constante `LADO_LARGO_MAXIMO_PX = 4032` en
`lib/imagen/escalera-compresion.ts`, usada por los dos primeros peldaños;
`ladoLargoMaximoPx` deja de admitir `null` (esa rama se quedaba sin ningún
productor). Se elige **4032 y no 4096** por dos motivos a la vez: cubre también
el peor caso de área —una imagen cuadrada— en 4032×4032 = 16.257.024 px, por
debajo del límite de iOS con margen, en vez de quedarse justo en 4096×4096 =
16.777.216; y es el lado largo de las fotos medidas en DT-017, que siguen
codificándose a resolución nativa byte por byte igual. Una foto de 24 o 48 MP
acaba en 4032×3024, exactamente la resolución para la que existen mediciones.
Tres tests nuevos en `escalera-compresion.test.ts`: 8064×6048 no se codifica a
resolución nativa; ninguna codificación supera el área máxima de canvas de iOS
ni con una imagen cuadrada de 12000×12000 (el peor caso para una cota por lado
largo); y las fotos de 12 MP medidas quedan intactas. Comentario en
`preparar-foto.ts` explicando que la cota vive en la escalera y por qué, para
que nadie la reintroduzca sin límite.

**B2 — corregido.** Añadida a DT-017 una **nota de cierre** con las tres
desviaciones respecto a lo aprobado, en formato "lo aprobado decía X, se hizo Y
porque Z": el contrato de retorno de `crearMinutoAMinuto`, el `onSubmit` en vez
de `action`, y el techo de resolución de B1. Corregida la fila del composer en
`arquitectura.md` ("Server Action nativa" → `onSubmit` propio, con el motivo).

**Menores — los tres aplicados.** `ETIQUETA_BOTON` sustituido por
`etiquetaDelBoton(estado, pendiente)`, sin ramas inalcanzables; el test de no
filtrado fija ahora el mensaje genérico exacto; eliminado el
`as { digest?: unknown }` de `esControlDeFlujoDeNext`.

**No se ha tocado** ninguna de las 5 recomendaciones registradas en `DEBT.md`
(reintento no idempotente, cota temporal, MIME al degradar al original,
`ErrorNoReintentable` sin productor, `funcionalidades.md`): están fuera del
alcance aprobado.

**Gates:** `typecheck` 0 errores · `lint` 0 errores y 0 warnings · `test` 293
en verde (27 ficheros) · `build` compila las 10 rutas.

**Sigue pendiente la verificación en dispositivo real** (una foto horizontal y
una vertical desde el móvil, en la preview): B1 era justo un fallo que ninguna
quality gate de código puede detectar.

### Ronda 2 — Reviewer (2026-08-09): ✅ Aprobado

Revisadas **solo** las correcciones de esta ronda y sus posibles regresiones.
Los dos bloqueantes están resueltos, los tres menores aplicados, y no se ha
introducido ninguna regresión. Pasa a Seguridad.

**B1 — resuelto, y mejor que la sugerencia de la Ronda 1.** La aritmética se
sostiene: con una cota por lado largo, el área máxima posible es `lado²`, que se
da en la imagen cuadrada; 4032² = 16.257.024 px queda 520.192 px (3,1 %) por
debajo del límite de 16.777.216 de iOS, mientras que el 4096 que yo propuse
daba exactamente el límite — la corrección del Implementador es correcta y su
razonamiento válido. **Fotos de 12 MP intactas:** 4032×3024 tiene lado largo
4032 ≤ 4032, así que `calcularDimensionesDestino` sale por el `return originales`
sin escalar ni redondear: mismos píxeles, mismo canvas, mismo resultado que lo
medido y aprobado en DT-017. **Cota en todos los caminos:** `ladoLargoMaximoPx`
ya no admite `null`, los seis peldaños llevan valor y `recorrerEscalera` pasa
todos por `calcularDimensionesDestino`; `recodificarAJpeg` entrega las
dimensiones sin filtrar a propósito y `crearCodificadorDeLienzo` dimensiona el
canvas solo con lo que le da la escalera — no queda ninguna vía por la que un
canvas se cree con la resolución de origen.

**Los tres tests nuevos fallarían de verdad sin el techo,** y además acotan su
valor por los dos lados: el de 8064×6048 falla si se quita la cota (devolvería
las dimensiones nativas); el de 12000×12000 falla si la cota sube (con
`toBeLessThan`, un techo de 4096 daría 16.777.216 y fallaría — el test codifica
justamente por qué 4096 no vale); y el de 12 MP falla si la cota baja de 4032.
Cota admisible según los tests: exactamente [4032, 4095].

**B2 — resuelto.** La nota de cierre de DT-017 está bien redactada, con el
formato pedido y el porqué de cada desviación; la primera dice explícitamente
que corrige el párrafo anterior del propio documento, así que DT-017 queda
autocontenido y sin contradicción viva. La tercera desviación (el techo) la
añadió el Implementador por su cuenta y hace bien: se aparta del "empieza por
resolución nativa" escrito en el cuerpo de la decisión y ahora queda trazado en
el registro permanente, no solo en este artefacto. La fila del composer en
`arquitectura.md` es correcta.

**Menores:** `etiquetaDelBoton(estado, pendiente)` sin ramas inalcanzables y con
el caso residual documentado; `actions.test.ts` fija el mensaje genérico exacto;
`esControlDeFlujoDeNext` narra con `in` sin `as`. Sin regresiones: la única
firma pública que cambió (`calcularDimensionesDestino`) no tiene más llamantes
que `recorrerEscalera` y sus tests, y el test eliminado (rama `null`) está
cubierto por "no amplía una foto más pequeña" y "lado largo igual al límite".

**Veredicto: ✅ Aprobado — pasa al Agente de Seguridad.** Las 5 recomendaciones
de la Ronda 1 siguen en `DEBT.md`, fuera de alcance a propósito. Recordatorio de
cierre: la verificación en móvil real (una foto horizontal y una vertical en la
preview) sigue siendo obligatoria antes de dar la tarea por cerrada — B1 era
exactamente la clase de fallo que ninguna quality gate de código detecta.

### Ronda 2 — Seguridad (2026-08-09): ❌ Bloqueante (A06 — dependencias)

**Estándares aplicados:** OWASP Top 10 completo, incluida auditoría de
dependencias (A06). Alcance revisado: el `git diff` sin commitear más
`lib/imagen/*` y `lib/envio/*` sin trackear, y los módulos colindantes que
forman la frontera de confianza del flujo (`lib/auth/admin-session.ts`,
`proxy.ts`, `lib/supabase/admin.ts`, `supabase/migrations/0002_minuto_a_minuto.sql`).

#### Issue bloqueante

**S1 — A06 (Componentes vulnerables): `pnpm audit` reporta 3 vulnerabilidades
de severidad alta.** El criterio del framework es explícito: alta o crítica es
bloqueante. Ninguna la introduce esta tarea (el cambio **no añade ni modifica
una sola dependencia**: `package.json` y `pnpm-lock.yaml` no aparecen en el
diff), pero el estado del árbol es el que es y el PR no puede abrirse con él.

| Paquete | Instalada | Parcheada | Advisory | Vía |
|---|---|---|---|---|
| `brace-expansion` | 5.0.8 | `>=5.0.9` | GHSA-rgw5-rvv9-x895 (DoS por arrays intermedios sin cota; **evade la mitigación de CVE-2026-14257**) | `eslint`, `@vitest/coverage-v8` |
| `js-yaml` | 4.3.0 | `>=4.3.1` | GHSA-5p4m-2wfm-xmqj (consumo cuadrático de CPU en `!!omap`) | `eslint>@eslint/eslintrc` |
| `nanoid` | 3.3.16 | `>=3.3.17` | GHSA-2v37-7h3g-55p8 (bucle infinito con generador custom y `size` 0) | `next>postcss`, `@tailwindcss/postcss>postcss` |

**Exposición real (para calibrar, no para rebajar el veredicto):** las tres son
de tiempo de desarrollo/build, no del runtime de producción. `brace-expansion`
y `js-yaml` entran solo por ESLint y por el coverage de Vitest, alimentados con
configuración del propio repo, nunca con input de usuario. `nanoid` entra por
`postcss`, que se ejecuta al construir el CSS, y el advisory exige un generador
custom con `size` 0 que `postcss` no usa. **No hay ninguna ruta desde una
petición HTTP a producción.** Aun así son "high" con parche publicado y el
proyecto ya tiene el mecanismo montado para exactamente esto.

**Fix requerido** — en `pnpm-workspace.yaml`, sección `overrides` (las tres
versiones parcheadas existen ya en el registro: `brace-expansion@5.0.9`,
`js-yaml@4.3.1`, `nanoid@3.3.18`):

```yaml
overrides:
  # ... los existentes ...
  brace-expansion: ">=5.0.9"
  "js-yaml@4": ">=4.3.1"
  "nanoid@3": ">=3.3.17"
```

Tres detalles que no son opcionales al aplicarlo:

1. **`nanoid` y `js-yaml` van acotados por línea mayor** (`@3`, `@4`), igual que
   los `minimatch@3`/`minimatch@9` que ya hay. Un override global a `nanoid`
   resolvería a 6.x, que es ESM puro y rompería `postcss` (pide `^3.3.11`).
   `brace-expansion` sí puede ir global: en el lockfile solo hay una versión
   (5.0.8) y `minimatch@10` ya pide `^5`.
2. **Hay que corregir el comentario que acompaña a los overrides de
   `minimatch`**, que hoy afirma que "la única versión realmente parcheada es la
   línea 5.x de brace-expansion" citando GHSA-mh99-v99m-4gvg. Ese advisory está
   **superado** por GHSA-rgw5-rvv9-x895, y la 5.0.8 que ese override trajo es
   justamente vulnerable. Dejarlo como está reproduce el patrón que ya tiene
   lección propia en `docs/LESSONS.md` y tres entradas en `DEBT.md`: un
   comentario que afirma lo contrario de la realidad.
3. Tras el `pnpm install`, **`pnpm audit` debe quedar en 0 high/critical** y hay
   que volver a pasar las quality gates (`typecheck`, `lint`, `test`, `build`):
   el override toca el árbol de ESLint y de Vitest.

#### Sin issues en el código de la tarea

Revisadas las 10 categorías restantes sobre el cambio. **No hay ninguna
vulnerabilidad en el código** — y lo digo explícitamente porque el silencio no
es aprobación. Lo verificado, uno a uno:

**A01 — Control de acceso.** `crearMinutoAMinuto` sigue llamando a
`requerirSesion()` **por sí misma y como primera instrucción**
(`app/admin/actions.ts:376-383`), sin delegar en `proxy.ts` (DT-010). El nuevo
`try/catch` no abre un fail-open: solo intercepta `SesionInvalidaError` y hace
`throw error` con todo lo demás, así que un fallo al leer cookies no puede
convertirse en "sesión válida". Ninguna línea del cuerpo se ejecuta con sesión
inválida. `subirFotoMinutoAMinuto` no ha ganado llamantes nuevos: sigue
teniendo exactamente uno, y detrás de la sesión.

**A02 — Criptografía.** Sin cambios. El nombre del objeto de Storage sigue
siendo `${Date.now()}-${crypto.randomUUID()}` — CSPRNG, no adivinable; el
prefijo temporal no revela nada que el `created_at` público del feed no revele
ya. Ningún secreto nuevo, hardcoded ni en logs (escaneados `lib/imagen/` y
`lib/envio/`: cero coincidencias de claves/tokens).

**A03 — Inyección.** Sin SQL concatenado (todo por el query builder de
supabase-js), sin `eval`/`new Function`, sin comandos de sistema. El nombre de
fichero del cliente **nunca llega a Storage**: `nombreComoJpeg` solo escribe la
cabecera de la parte multipart y el path del objeto se genera en servidor, así
que no hay travesía de rutas dentro del bucket. Las dos expresiones regulares
nuevas (`preparar-foto.ts:205` y `errores-de-envio.ts:41`) son lineales, sin
cuantificador anidado: no hay ReDoS.

**A04 — Diseño inseguro (el punto que más importaba aquí).** La compresión del
navegador es manipulable por definición, y el servidor no se fía de ella: sigue
validando **tipo MIME contra lista blanca y tamaño** en
`lib/supabase/storage.ts:53-65`, antes de que ningún byte llegue a Storage.
Bajar `TAMANO_MAXIMO_BYTES` de 8 MB a 4 MiB **estrecha** el control, no abre
hueco: 8 MB era un tope inalcanzable (el edge cortaba antes), 4 MiB sí se aplica
de verdad. `bodySizeLimit` baja además de 10mb a 4.5mb, otro estrechamiento. Un
cliente hostil que se salte la escalera entera choca con exactamente las mismas
dos comprobaciones que antes, más estrictas.

**El `contentType` de Storage no lo dicta el cliente.** `contentType: foto.type`
(`storage.ts:72`) solo se alcanza después de que `esMimePermitido()` haya
estrechado el tipo a `image/jpeg | image/png | image/webp`. No hay forma de
subir con `text/html`, `image/svg+xml` ni ningún tipo activo, que es lo que
importaría en un bucket público. La lista blanca compartida
(`lib/imagen/limites-subida.ts`) no relaja nada: son los mismos tres MIME que
antes, ahora en un solo sitio.

**A05 — Configuración.** Ningún secreto ni variable de entorno nueva.
`limites-subida.ts` es importable desde el navegador sin arrastrar nada del
servidor (no tiene imports), y `lib/supabase/storage.ts` —que sí trae el cliente
`service role`— sigue sin ser alcanzable desde el bundle de cliente:
`preparar-foto.ts` importa `limites-subida`, no `storage`. La dirección de la
dependencia es la correcta.

**A07 — Identificación y autenticación.** Sesión intacta (HMAC-SHA256 +
`timingSafeEqual`, cookie `httpOnly`/`secure`/`sameSite: lax`). El fallo de
sesión devuelve **un único mensaje** ("Tu sesión de admin ha caducado…") sin
distinguir cookie ausente, firma inválida o expirada: no es un oráculo.
`verificarSesion()` sigue devolviendo un booleano sin motivo. Y CSRF sigue
cubierto por partida doble: `SameSite=Lax` no envía la cookie en un POST
cross-site, más la comprobación de origen que Next hace en Server Actions.

**A08 — Integridad.** Todo lo validado en cliente se revalida en servidor (MIME,
tamaño, longitud del texto). En el código nuevo no hay ni un `as` para saltarse
validación — el único que había (`errores-de-envio.ts:63`) se eliminó en la
Ronda 1 y ahora narra con `in`.

**A09 — Logging y fuga de información (el punto más sensible del cambio).**
Enumerada **toda** cadena que puede alcanzar el cliente por la vía nueva:
`ResultadoPublicacion.mensaje` solo puede valer uno de siete literales fijos, o
el `message` de un `ErrorDeSubidaDeFoto`, que a su vez son tres literales
redactados a mano. **Ningún mensaje de Supabase o de Storage, nombre de variable
de entorno, ruta o stack trace tiene camino hasta el cliente.** El fallo
inesperado se bifurca a `console.error` (logs de Vercel) y devuelve un genérico
—hay test que fija el mensaje exacto, `actions.test.ts:487`—. El objeto logueado
tampoco arrastra secretos: `getSupabaseAdmin()` nombra las env vars pero nunca
su valor, y un `StorageError` de supabase-js solo lleva mensaje y código.

Por el lado del cliente, `describirFalloDeEnvio` nunca devuelve el `message`
crudo de un error desconocido, y no puede hacerlo por accidente: un error que
cruza la frontera RSC llega como `Error` plano con `digest`, jamás como
instancia de `ErrorNoReintentable`, y el texto redactado de Next no casa con
ninguno de los patrones de `esFalloDeRed`/`esAccionDesaparecida`. El único dato
reflejado es el MIME que envió el propio cliente (`Formato de imagen no
permitido (…)`), que React escapa como texto y no se persiste: ni XSS ni fuga.

**No contradice el criterio de degradación silenciosa de `respuestaVacia()`.**
Son dos fronteras de confianza distintas: `/api/track` es público y sin
autenticar, y ahí callar es lo correcto. Aquí, todo mensaje salvo el de sesión
está detrás de `requerirSesion()`, es decir, solo lo ve el admin autenticado —
que es exactamente quien necesita saber el motivo. Y el de sesión no revela nada
que no revele ya el redirect de `proxy.ts` a `/admin/login`.

**A10 — SSRF.** El cambio no hace ninguna petición saliente con URL construida a
partir de input de usuario. La única URL que se genera, `getPublicUrl()`, se
compone del bucket y de un nombre de objeto generado en servidor.

#### Vectores señalados en el encargo, valorados y descartados

- **Reintento como amplificador de recursos.** Acotado a 3 intentos, en el
  cliente, y **solo ante excepciones**: un `{ok: false}` (sesión caducada, texto
  inválido, foto rechazada) no se reintenta nunca, porque no es un `throw` y
  `ejecutarConReintentos` solo ve lanzados. El factor máximo es 3× sobre una
  operación que ya exige sesión de admin válida: no es vector de agotamiento de
  cuota de Supabase ni de funciones de Vercel para un tercero. Tampoco interfiere
  con DT-011 — el rate limiting vive en los 6 endpoints públicos, y las Server
  Actions del panel nunca han pasado por él (su control de acceso es la sesión,
  no el límite por IP). Lo que sí puede producir un reintento es una **entrada
  duplicada** si la primera petición se completó en servidor y se perdió la
  respuesta: problema de idempotencia, ya registrado por el Reviewer en
  `DEBT.md`, de impacto menor y reversible por el propio admin. No es seguridad.
- **Bomba de descompresión o dimensiones desorbitadas colgando el navegador.**
  El único actor que puede meter un fichero en este flujo es el admin
  autenticado eligiéndolo de su propio dispositivo: atacante y víctima son la
  misma persona, no hay frontera de confianza que cruzar. La superficie de
  recodificación está además acotada por `LADO_LARGO_MAXIMO_PX = 4032` (el canvas
  nunca supera 16.257.024 px) y por la deduplicación de codificaciones de
  `recorrerEscalera`. Queda fuera de esa cota la decodificación previa en `<img>`,
  que es del navegador y no la controla el proyecto; la falta de cota temporal ya
  está en `DEBT.md`. No es una vulnerabilidad.
- **Vía de subida no autenticada al bucket público.** No existe: la migración
  `0002` crea el bucket sin ninguna política de Storage para `anon` (ni de
  lectura ni de escritura), la escritura solo ocurre con `service role` desde el
  servidor, y el único llamante está detrás de `requerirSesion()`. El nombre del
  objeto sigue siendo impredecible (UUID v4). El cambio no toca ni políticas ni
  bucket.
- **Objeto huérfano en Storage.** La foto se sube antes de comprobar que hay
  intento activo, así que ese camino deja un objeto sin fila. Es comportamiento
  **preexistente** (mismo orden antes del cambio) y sin impacto de seguridad:
  contenido no sensible, del propio admin, en un bucket ya público.

#### Nota de método

No he podido usar los MCP de Supabase ni de Vercel (no están disponibles en esta
invocación). La verificación de RLS y del bucket la he hecho contra
`supabase/migrations/0001_esquema_inicial.sql` y `0002_minuto_a_minuto.sql`, que
son la fuente declarada del esquema. **Queda sin verificar contra el proyecto
real** que el estado desplegado coincide con las migraciones —en particular, que
`minuto-a-minuto` no haya ganado políticas de `anon` a mano desde la consola—.
El cambio no las toca, así que no es un riesgo introducido por esta tarea, pero
conviene confirmarlo cuando haya MCP disponible.

#### Veredicto

❌ **Issues bloqueantes — devuelve al Implementador.** Un único bloqueante, S1
(A06), con un fix acotado: tres líneas de `overrides` en `pnpm-workspace.yaml`,
el comentario de `minimatch` corregido, `pnpm install`, y `pnpm audit` en 0
high/critical con las quality gates de nuevo en verde. **El código de la tarea
está limpio: no requiere ni un solo cambio por motivos de seguridad.** Al
volver, basta con reverificar A06 — el resto del análisis sigue siendo válido
mientras el código no se toque.

### Seguridad — Implementador (2026-08-09): S1 corregido

Overrides añadidos en `pnpm-workspace.yaml`. **Sin tocar ni una línea del
código de la tarea**, ni `package.json`. Resolución final verificada contra el
lockfile, con una sola versión de cada paquete en todo el árbol:

| Paquete | Antes | Ahora | Advisory |
|---|---|---|---|
| `brace-expansion` | 5.0.8 | **5.0.9** | GHSA-rgw5-rvv9-x895 |
| `js-yaml` | 4.3.0 | **4.3.1** | GHSA-5p4m-2wfm-xmqj |
| `nanoid` | 3.3.16 | **3.3.18** | GHSA-2v37-7h3g-55p8 |

**Desviación respecto al fix propuesto: los tres rangos llevan cota superior**
(`">=5.0.9 <6"`, `">=4.3.1 <5"`, `">=3.3.17 <4"`), no solo mínimo. El motivo es
la condición nº 1 del propio bloqueante: el valor de un override es el rango
con el que se **resuelve** la dependencia, no un mínimo dentro de la línea que
ya estaba — el selector (`nanoid@3`) solo filtra a qué dependencias se aplica,
no acota el resultado. Comprobado en el registro que las últimas publicadas son
`nanoid` 6.0.1 y `js-yaml` 5.2.3: con `">=3.3.17"` y `">=4.3.1"` sin cota, la
resolución habría saltado a esas mayores, y `nanoid` 6.x es ESM puro y habría
roto `postcss` (pide `^3.3.11`) — exactamente lo que la condición pedía evitar.
Se acota también `brace-expansion` por el mismo motivo, aunque hoy no cambie el
resultado (la última es 5.0.9). `postcss` sigue en 8.5.25, intacto.

**Comentario de `minimatch` corregido:** ya no afirma que "la única versión
realmente parcheada es la línea 5.x de brace-expansion" citando
GHSA-mh99-v99m-4gvg (advisory superado, y la 5.0.8 que ese override trajo era
justo la versión hoy vulnerable). Ahora explica el motivo real y vigente: los
`minimatch` antiguos traían versiones de `brace-expansion` demasiado viejas
para aceptar el override, y se suben para que todo el árbol comparta la línea
que sí recibe parches.

**Gates:** `typecheck` 0 errores · `lint` 0 errores y 0 warnings · `test` 293
en verde · `build` compila las 10 rutas · **`pnpm audit` sin vulnerabilidades
de ninguna severidad** (criterio de cierre del bloqueante).

Comprobación extra: como estos overrides tocan la cadena `postcss`/`nanoid`,
que es la de Tailwind, se verificó —por la lección de `docs/LESSONS.md`— que el
build sigue emitiendo CSS real (25,7 KB con las reglas de las clases usadas),
no solo que compila sin error.

### Ronda 3 — Seguridad (2026-08-09): ✅ Aprobado — A06 cerrado, auditoría completa

Reverificado **solo A06**, como se acordó: el diff nuevo respecto a la Ronda 2 se
limita a `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `CHANGELOG.md`, `docs/LESSONS.md`
y este fichero — confirmado con `git status`. **No se ha tocado ni una línea de
código de la tarea**, así que el análisis de A01-A05 y A07-A10 de la Ronda 2 sigue
vigente tal cual y no se repite aquí.

#### S1 — resuelto y verificado por mí, no solo reportado

| Paquete | Antes | Ahora | Advisory |
|---|---|---|---|
| `brace-expansion` | 5.0.8 | **5.0.9** | GHSA-rgw5-rvv9-x895 |
| `js-yaml` | 4.3.0 | **4.3.1** | GHSA-5p4m-2wfm-xmqj |
| `nanoid` | 3.3.16 | **3.3.18** | GHSA-2v37-7h3g-55p8 |

`pnpm audit --audit-level=low` → **"No known vulnerabilities found"**, ejecutado
por mí en esta revisión. Una sola versión resuelta de cada paquete en el
lockfile (las entradas `js-yaml@4` / `nanoid@3` / `minimatch@3` / `minimatch@9`
que aparecen al grepear son las **claves selectoras** del bloque `overrides`,
no versiones instaladas). `postcss` sigue en 8.5.25 y `sharp` en 0.35.3: el
override no arrastró nada de lado.

Gates reejecutadas por mí, porque el fix que yo mismo exigí toca el árbol de
ESLint y de Vitest y ese riesgo es mío: **293 tests en 27 ficheros en verde**,
`lint` sin salida (0 problemas) y `typecheck` limpio. ESLint —el consumidor
directo de `js-yaml` y `brace-expansion`— arranca y analiza sin incidencias, que
era la comprobación que de verdad importaba.

#### La desviación del YAML: el Implementador tiene razón y yo estaba equivocado

Su corrección es correcta y **el YAML que yo propuse en la Ronda 2 era
defectuoso**. Queda escrito para que no se repita: en pnpm, la clave `nanoid@3`
solo **filtra a qué dependencias se aplica** el override; el **valor** es el
rango con el que se resuelve, y pnpm coge la versión más alta que lo satisfaga.
Un `">=3.3.17"` sin cota no significa "la última 3.x parcheada", significa "la
última publicada que sea >= 3.3.17".

Verificado empíricamente, no razonado sobre el papel: en un proyecto de prueba
aparte con `postcss@8.5.25` y `@eslint/eslintrc@3.3.1` y **exactamente mis
overrides de la Ronda 2**, la resolución da `nanoid@6.0.1` y `js-yaml@5.2.3`.
Es decir, mi propia propuesta habría metido el `nanoid` ESM puro que rompe
`postcss` (que pide `^3.3.16`) — justo el escenario que mi condición nº 1 decía
evitar. La cota superior no es cosmética: es lo que hace que el override
signifique lo que ambos queríamos que significara.

#### Las cotas superiores no dejan fuera ninguna versión parcheada futura

Es la pregunta correcta, y la respuesta es que no, por dos motivos
independientes:

**1. Cada cota es exactamente la mayor que ya declara el consumidor.**
Comprobado contra los `package.json` reales de `node_modules`:

| Override | Cota | Quien lo consume declara |
|---|---|---|
| `brace-expansion` | `<6` | `minimatch@10.2.6` → `^5.0.8` |
| `js-yaml@4` | `<5` | `@eslint/eslintrc` → `^4.3.0` |
| `nanoid@3` | `<4` | `postcss@8.5.25` → `^3.3.16` |

Las cotas no excluyen nada que fuera instalable de todos modos: coinciden con el
`^` que el propio dependiente ya impone. Dentro de cada línea, parches y menores
siguen fluyendo solos — un futuro `nanoid@3.3.19` entraría sin tocar nada.

**2. Y si algún día no bastara, falla en alto, no en silencio.** Un override no
enmascara `pnpm audit`: la auditoría lee el árbol resuelto. Si apareciera un
advisory sobre la línea acotada cuyo parche solo existiera por encima de la cota,
`pnpm audit` volvería a marcarlo en alto y bloquearía igual que S1 — obligando a
revisar cota y consumidor a la vez, que es justo lo que habría que hacer. El
riesgo de "quedarse clavado sin enterarse" no existe.

El comentario que acompaña a los overrides está reescrito, sin la afirmación
falsa sobre GHSA-mh99-v99m-4gvg, y explica el porqué de las cotas. Cierra el
punto 2 del fix de la Ronda 2.

#### Veredicto final

✅ **Sin vulnerabilidades — auditoría de seguridad cerrada, tarea lista para
abrir el PR.**

- **A06:** cerrado. 0 vulnerabilidades conocidas de cualquier severidad.
- **A01-A05, A07-A10:** sin issues, según el análisis de la Ronda 2, que sigue
  válido porque el código de la tarea no se ha tocado. Lo dejo dicho
  explícitamente, no por omisión: **no hay ningún issue de seguridad pendiente
  en esta tarea, de ninguna severidad.**

Dos recordatorios que **no** son de seguridad y no condicionan mi aprobación,
pero que siguen abiertos en el cierre:

1. La **verificación en móvil real** que pide el Reviewer (una foto horizontal y
   una vertical en la preview) sigue siendo obligatoria antes de dar la tarea por
   cerrada.
2. Queda sin comprobar contra el proyecto Supabase real que el bucket
   `minuto-a-minuto` no haya ganado políticas de `anon` a mano desde la consola
   (no había MCP disponible en ninguna de mis dos revisiones). El cambio no toca
   políticas ni bucket, así que no es un riesgo introducido por esta tarea, pero
   conviene confirmarlo cuando haya MCP.

---

Este archivo es la pizarra compartida entre todos los agentes del pipeline: los
subagentes corren aislados y no ven la conversación, así que lo único que
comparten es lo que está escrito aquí. Lo gobierna el Orquestador, que lo crea al
empezar cada tarea con la plantilla del framework y lo archiva al cerrarla.

---

## Cierre

**PR #18 fusionado a `main` y desplegado a producción.** Verificación en
dispositivo real hecha por Santi directamente contra
`https://camino-santi-ago-sage.vercel.app` (sin pasar por la preview, por
decisión explícita): foto horizontal, foto vertical (sin salir tumbada), foto
sin comprimir intencionadamente pesada (activando 48 MP / buscando una foto
con mucha textura) y entrada solo de texto. Resultado: **todo correcto**,
confirmado por el usuario. Tarea cerrada por completo.
