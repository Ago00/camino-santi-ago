# Funcionalidades

Descripción desde el punto de vista del usuario. Para el detalle técnico, ver
`docs/tecnico/arquitectura.md`.

---

## Web pública

### Tres modos según el estado del reto (`fase`)

**Antes** — presentación del reto. Formulario para dejar intenciones (anónimas
o con nombre, siempre privadas). Formulario para dejar comentarios públicos.

**Durante** — pantalla principal. Mapa en directo con la posición de Santi,
la traza y el tramo ya andado encendido. Barra de progreso (monótona: solo sube).
Estadísticas: km andados, km restantes, tiempo, velocidad media. Hilo de
comentarios públicos.

**Llegada** — el mapa y las estadísticas quedan congeladas en el momento de
llegar. Aparece el mensaje de llegada. Los formularios de intención/comentario
siguen disponibles.

### Progreso

- **Barra de avance** (%) — proyección del punto sobre la traza. Monótona:
  nunca baja aunque Santi retroceda o se desvíe brevemente.
- **Km andados** — odómetro haversine real. Sí sube al retroceder (mide distancia
  real, no solo avance sobre el plan).
- **Km restantes** — return-aware: separación a la traza + plan restante.
  Puede no sumar 100 con la barra: es correcto, miden cosas distintas.

### Intenciones

- Anónimas o con nombre; siempre privadas. Solo el admin las ve.
- No hay límite de intenciones por persona.

### Comentarios

- Siempre llevan nombre del autor.
- El autor elige público o privado. Solo los públicos y no ocultos aparecen en
  la web.

---

## Panel de administración (`/admin`)

Protegido por contraseña única (env var) y cookie firmada HttpOnly.

### Actividad

- **Iniciar** — arranca el reto (transición a fase `durante`).
- **Finalizar** — cierra el reto con mensaje de llegada (transición a `llegada`).
- **Reiniciar** — cierra el intento actual y abre uno nuevo en `antes`. Nada se
  borra de la BD: el historial completo queda intacto por si hay que auditarlo.

### Posición

- "Fichar mi posición ahora" — usa la geolocalización del navegador para enviar
  una posición manual (útil si el móvil falla).
- Ver última posición y cuándo fue.
- Descartar último punto (soft-delete reversible).

### Intenciones

- Leer y eliminar intenciones.

### Comentarios

- Ocultar / mostrar / eliminar comentarios.
- Filtro: todos / públicos / ocultos.

### Textos

- Editar los textos de la web desde el panel sin tocar código.
- El valor por defecto vive en el código; la BD lo sobreescribe si hay una
  entrada para esa clave. Si no hay entrada en BD, la web usa el valor por defecto.
