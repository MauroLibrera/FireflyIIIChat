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
//
// Fix round 1: esta función tiene que resolver eso sola, a partir únicamente
// de su propio input. Antes dependía de dos propiedades incidentales de
// otros archivos — la regex case-sensitive del proxy en server/app.js y el
// guard `response.ok` de sw.js — que hoy tapan una variante en mayúscula o
// una URL completa, pero ninguna de las dos existe para sostener esta regla:
// si cualquiera de esos dos archivos cambia el día de mañana, el agujero
// reaparece sin que nada lo señale. Por eso acá adentro se normaliza antes
// de comparar, en vez de confiar en que el input ya venga bien formado.
export function shouldCache(pathname) {
  if (typeof pathname !== 'string') return false;

  let path = pathname;

  // Acepta tanto un pathname suelto ("/api/groq") como una URL completa
  // ("https://host/api/groq"): si trae esquema, se extrae el pathname real
  // en vez de comparar contra el string entero, que nunca arranca con '/' y
  // terminaría siendo cacheable por accidente.
  if (path.includes('://')) {
    try {
      path = new URL(path).pathname;
    } catch {
      return false;
    }
  }

  // Sin '/' inicial no es un pathname válido: ni un string vacío ni una
  // palabra suelta cuentan como cacheables.
  if (!path.startsWith('/')) return false;

  // Comparación insensible a mayúsculas: /API/, /Api/ y /api/ son la misma
  // ruta a estos fines. El proxy de Firefly no matchea una variante en
  // mayúscula (server/app.js usa una regex sin flag /i/), pero esta función
  // no depende de esa propiedad ajena para llegar al mismo resultado.
  return !path.toLowerCase().startsWith('/api/');
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
