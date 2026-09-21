import { forwardResponse } from '../http/forward.js';
import { parseAllowedHosts, resolveFireflyBase, isSafeEndpoint } from '../http/target.js';

export function createFireflyHandler({ env = process.env, fetchImpl = fetch } = {}) {
  const allowedHosts = parseAllowedHosts(env.FIREFLY_ALLOWED_HOSTS);

  return async function fireflyHandler(req, res) {
    try {
      const endpoint = req.params[0];

      if (!isSafeEndpoint(endpoint)) {
        return res.status(400).json({ error: 'Endpoint de Firefly III inválido.' });
      }

      // Lee la URL y el Token enviados desde la PWA o del .env como fallback
      const rawUrl = (req.headers['x-firefly-url'] || env.FIREFLY_URL || '').trim();
      const fireflyToken = (req.headers['x-firefly-token'] || env.FIREFLY_TOKEN || '').trim();

      if (!rawUrl || !fireflyToken) {
        return res.status(401).json({ error: 'Falta la URL o el Token de Firefly III.' });
      }

      const { baseUrl, error } = resolveFireflyBase(rawUrl, allowedHosts);
      if (error) {
        return res.status(400).json({ error });
      }

      const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
      const targetUrl = `${baseUrl}/api/v1/${endpoint}${queryString}`;

      const fetchOptions = {
        method: req.method,
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

      // El await es deliberado: sin él, un rechazo de la lectura del cuerpo
      // escapa de este try/catch y se vuelve un unhandled rejection que tumba el proceso.
      return await forwardResponse(res, response, 'Firefly III');
    } catch (err) {
      console.error('Error en Proxy Firefly:', err);
      return res.status(500).json({ error: err.message });
    }
  };
}
