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
// fetch normaliza los segmentos ".." antes de enviar, y %2e cuenta como punto.
export function isSafeEndpoint(endpoint) {
  const segmentos = String(endpoint)
    .split('/')
    .map((seg) => seg.toLowerCase().split('%2e').join('.'));

  return !segmentos.some((seg) => seg === '..' || seg === '.');
}
