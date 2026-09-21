// Regla de cacheo del service worker, en un único lugar. sw.js importa esto
// (worker registrado como módulo ES) en vez de copiar la regla adentro del
// propio worker: la exclusión de /api/ es la única regla que no puede
// divergir entre dos copias.
//
// Puro: sin fetch, sin caches, sin self. Corre bajo Node normal, lo que es
// lo que hace testeable esta función sin un navegador.

// Todo lo que está bajo /api/ es un proxy hacia Firefly III o Groq: un saldo
// o una lista de transacciones servidos desde una caché vieja es un número
// equivocado mostrado como si fuera verdad a alguien tomando decisiones de
// plata. Esa ruta nunca es cacheable, sin excepciones.
export function shouldCache(pathname) {
  return !pathname.startsWith('/api/');
}

// El app shell que install() precachea. Lista explícita, sin glob: si se
// agrega un módulo JS nuevo bajo public/js/ y no se lo suma acá a mano, ese
// módulo no queda disponible offline (fallará al cargar sin red), en vez de
// fallar en silencio por un patrón que "debería" haberlo agarrado.
export const APP_SHELL = [
  '/',
  '/index.html',
  '/css/app.css',
  '/js/app.js',
  '/js/domain/cacheRules.js',
  '/js/domain/confirmation.js',
  '/js/domain/format.js',
  '/js/domain/installments.js',
  '/js/domain/intent.js',
  '/js/domain/messages.js',
  '/js/domain/profiles.js',
  '/js/domain/prompt.js',
  '/js/domain/submitGuard.js',
  '/js/services/fireflyApi.js',
  '/js/services/groqApi.js',
  '/js/services/profileStore.js',
  '/js/ui/chat.js',
  '/js/ui/configModal.js'
];
