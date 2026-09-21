// Service worker registrado como módulo ES (ver public/js/app.js), así puede
// importar la regla de cacheo en vez de duplicarla acá adentro. La exclusión
// de /api/ es la única regla que no puede tener dos copias que diverjan.
import { shouldCache, APP_SHELL } from './js/domain/cacheRules.js';

// CACHE_VERSION: subir este valor en el mismo commit que cualquier cambio al
// app shell (index.html, css/app.css o cualquier módulo JS listado en
// APP_SHELL). El activate de abajo borra toda caché cuyo nombre no coincida
// con la versión actual, así un shell viejo no queda pegado en el
// dispositivo de alguien que ya lo tenía instalado.
const CACHE_VERSION = 'firefly-shell-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Regla que no puede romperse: nada bajo /api/ pasa por la caché, ni para
  // leer ni para guardar. Un saldo o una lista de transacciones cacheados es
  // un número equivocado mostrado como si fuera verdad. Dejar pasar el fetch
  // sin llamar a respondWith() equivale a la conducta normal del navegador,
  // sin que este worker intervenga.
  if (event.request.method !== 'GET' || !shouldCache(url.pathname)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        // Solo se cachea una respuesta válida; un 404 o un error de red no
        // se guarda como si fuera el shell real.
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});
