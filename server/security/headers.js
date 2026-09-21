// Content Security Policy: confina cada fuente al propio origen de la app.
// Se expone como dato (CSP_DIRECTIVES) además del middleware para que las
// pruebas puedan afirmar sobre la política sin depender del formato exacto
// del string del header.
//
// - default/script/style/connect/manifest: solo 'self'. El HTML ya no tiene
//   estilos ni handlers inline (tareas anteriores los quitaron), así que no
//   hace falta 'unsafe-inline' en ningún lado.
// - img-src suma 'data:' porque la UI usa URIs de datos para íconos/generados.
// - worker-src 'self' es necesario para que el service worker (registrado con
//   { type: 'module' } e importando /js/domain/cacheRules.js) pueda cargar.
// - manifest-src 'self' porque index.html enlaza /manifest.json.
// - frame-ancestors, base-uri y form-action quedan negados por completo: esta
//   página nunca necesita ser embebida, cambiar su <base> ni enviar un form.
export const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'connect-src': ["'self'"],
  'manifest-src': ["'self'"],
  'img-src': ["'self'", 'data:'],
  'worker-src': ["'self'"],
  'frame-ancestors': ["'none'"],
  'base-uri': ["'none'"],
  'form-action': ["'none'"]
};

function buildHeaderValue(directives) {
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

// Middleware de Express: agrega el header en toda respuesta que pase por acá.
// Se monta antes de express.static para que también cubra los archivos
// estáticos, no solo las rutas de proxy.
export function securityHeaders() {
  const headerValue = buildHeaderValue(CSP_DIRECTIVES);
  return (req, res, next) => {
    res.setHeader('Content-Security-Policy', headerValue);
    next();
  };
}
