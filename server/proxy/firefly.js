import { forwardResponse } from '../http/forward.js';
import { parseAllowedHosts, resolveFireflyBase, buildFireflyTargetUrl } from '../http/target.js';

// El destino lo puede elegir el cliente por request, así que no confiamos en
// que responda a tiempo: sin esto, un host que acepta la conexión y nunca
// contesta deja el request (y el socket) de Express colgado para siempre.
export const FIREFLY_TIMEOUT_MS = 15000;

export function createFireflyHandler({ env = process.env, fetchImpl = fetch } = {}) {
  const allowedHosts = parseAllowedHosts(env.FIREFLY_ALLOWED_HOSTS);

  return async function fireflyHandler(req, res) {
    try {
      const endpoint = req.params[0];

      // La URL y el Token tienen que salir de la misma fuente: si el cliente
      // eligió el destino, el token también tiene que venir del cliente. El
      // token del .env solo puede viajar hacia la URL del .env; nunca se
      // mezclan, porque mezclarlos es lo que le manda el secreto del dueño a
      // un host que el cliente eligió.
      const clientUrl = (req.headers['x-firefly-url'] || '').trim();
      const clientToken = (req.headers['x-firefly-token'] || '').trim();
      const rawUrl = clientUrl || (env.FIREFLY_URL || '').trim();
      const fireflyToken = clientUrl ? clientToken : clientToken || (env.FIREFLY_TOKEN || '').trim();

      if (!rawUrl || !fireflyToken) {
        return res.status(401).json({ error: 'Falta la URL o el Token de Firefly III.' });
      }

      const { baseUrl, error: baseError } = resolveFireflyBase(rawUrl, allowedHosts);
      if (baseError) {
        return res.status(400).json({ error: baseError });
      }

      const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
      const { url: targetUrl, error: targetError } = buildFireflyTargetUrl(baseUrl, endpoint, queryString);
      if (targetError) {
        return res.status(400).json({ error: targetError });
      }

      const fetchOptions = {
        method: req.method,
        // No seguimos redirects: el allowlist y el chequeo de prefijo solo ven
        // el hop 0. Si el upstream pudiera redirigir, se pasearía por
        // cualquier ruta de sí mismo con el Authorization todavía puesto.
        redirect: 'manual',
        signal: AbortSignal.timeout(FIREFLY_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${fireflyToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        }
      };

      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const response = await fetchImpl(targetUrl, fetchOptions);

      if (response.status >= 300 && response.status < 400) {
        // Descartamos el cuerpo para no dejar el socket del upstream colgando.
        await response.body?.cancel();
        return res.status(502).json({ error: 'Firefly III intentó redirigir la petición y el proxy no sigue redirects.' });
      }

      // El await es deliberado: sin él, un rechazo de la lectura del cuerpo
      // escapa de este try/catch y se vuelve un unhandled rejection que tumba el proceso.
      return await forwardResponse(res, response, 'Firefly III');
    } catch (err) {
      // Si los headers ya se mandaron (p.ej. el body se cortó a mitad de
      // camino después de que forwardResponse ya empezó a responder), un
      // segundo res.status().json() volvería a lanzar y se escaparía como
      // otro unhandled rejection.
      if (res.headersSent) return;
      console.error('Error en Proxy Firefly:', err);
      return res.status(500).json({ error: err.message });
    }
  };
}
