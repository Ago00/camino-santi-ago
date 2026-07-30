# Contexto del producto

## Qué es

**Camino de Santi·ago** es una web para seguir en directo el reto de Santi:
caminar del tirón ~100 km del Camino Portugués Central (O Porriño → Praza do
Obradoiro de Santiago de Compostela, 24-30 h sin dormir), ofrecido por intenciones
de familia y amigos.

El nombre juega con "Camino de Santiago" y "Camino de Santi (ago)" — "…y este
camino, ¡no lo hago solo!"

## Para quién

- **Santi** — el protagonista, que lleva el móvil con OwnTracks enviando su posición.
- **Familia y amigos** — espectadores que siguen el progreso en directo, dejan
  intenciones (siempre privadas) y comentarios, y viven el reto desde casa.
- **Santi como admin** — accede al panel para controlar el estado del reto,
  moderar comentarios y corregir posiciones si hace falta.

## Qué problema resuelve

Sin esta web, los familiares y amigos de Santi no pueden saber dónde está ni cómo
va el reto. La web convierte un esfuerzo físico solitario en una experiencia
compartida: cada % de la barra es un momento de conexión con las personas que le
importan.

## Estado actual

- **F0 — Infraestructura**: completada (repo, Supabase, Vercel, MapTiler).
- **F1 — Base**: completada (scaffolding, traza, dominio de progreso, tipos, docs).
- **F2 — Datos e ingesta**: pendiente.
- **F3 — Web pública**: pendiente.
- **F4 — Panel admin**: pendiente.
- **F5 — Cierre**: pendiente.

## Traza

La ruta parte del mojón físico del km 100 del Camino Portugués Central
(~1,8 km antes de O Porriño) hasta la **Praza do Obradoiro** de Santiago de
Compostela. Total: **100,210 km** (los últimos ~210 m son geometría manual
pendiente de validar sobre el terreno — ver `DEBT.md`).

Fuente: Xunta de Galicia (abertos.xunta.gal), CC BY-SA 4.0.
