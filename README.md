# Camino de Santi(ago)

Web para seguir en directo el reto de Santi: caminar del tirón ~100 km del Camino
Portugués (del mojón del km 100, antes de O Porriño, hasta la Praza do Obradoiro
en Santiago de Compostela), en 24-30 h sin dormir y ofrecido por intenciones.

Familia y amigos siguen su posición en el mapa, dejan intenciones y comentarios,
y viven la aventura desde casa.

## Estado

En construcción. El plan de ejecución vive en `docs/tecnico/`; la POC que validó
la cadena de tracking está congelada en el repo [camino-tracking-poc](https://github.com/Ago00/camino-tracking-poc).

## Stack

Next.js (App Router) · TypeScript · Tailwind · Supabase (Postgres) · Vercel ·
MapLibre GL + MapTiler · Turf.js

## Traza

`lib/traza/traza.geojson` deriva del dataset oficial *Ruta del Camino Portugués*
de la **Xunta de Galicia** (abertos.xunta.gal), publicado bajo **CC BY-SA 4.0**.
El original sin simplificar se conserva en `docs/traza-camino-portugues.geojson`.
