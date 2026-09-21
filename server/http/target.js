// Validación del destino que el cliente propone para el proxy de Firefly III.
// Todo acá es puro: no hay red, no hay process.env, no hay Express.

export function parseAllowedHosts(raw) {
  return String(raw || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

// Devuelve { baseUrl } o { error }. Nunca lanza.
export function resolveFireflyBase(rawUrl, allowedHosts = []) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { error: 'La URL de Firefly III no es válida.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: 'Solo se admiten URLs http o https.' };
  }

  if (parsed.username || parsed.password) {
    return { error: 'La URL de Firefly III no debe incluir credenciales.' };
  }

  if (allowedHosts.length > 0 && !allowedHosts.includes(parsed.host.toLowerCase())) {
    return { error: 'El host de Firefly III no está en la lista permitida.' };
  }

  return { baseUrl: (parsed.origin + parsed.pathname).replace(/\/$/, '') };
}

// El endpoint lo elige el cliente y no puede salirse del prefijo /api/v1/.
// En vez de parchear el string a mano (eso es lo que dejaba pasar "..%5c..%5c"
// como un solo segmento "seguro"), le hacemos la misma pregunta que fetch: le
// pedimos a la propia URL de WHATWG que resuelva el endpoint contra el prefijo
// y comprobamos que el resultado siga en el mismo origen y bajo ese prefijo.
// Eso cierra de una sola vez las barras invertidas, los "..", y cualquier
// variante de encoding, porque es el mismo parser el que decide.
export function buildFireflyTargetUrl(baseUrl, endpoint, queryString = '') {
  let prefix;
  let target;
  try {
    prefix = new URL(`${baseUrl}/api/v1/`);
    target = new URL(`${endpoint}${queryString}`, prefix);
  } catch {
    return { error: 'Endpoint de Firefly III inválido.' };
  }

  if (target.origin !== prefix.origin || !target.pathname.startsWith(prefix.pathname)) {
    return { error: 'Endpoint de Firefly III inválido.' };
  }

  return { url: target.toString() };
}
