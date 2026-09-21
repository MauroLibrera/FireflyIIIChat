import { forwardResponse } from '../http/forward.js';

export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Groq es una URL constante, pero igual queda a un salto de red: sin timeout
// un host lento deja el request colgado indefinidamente.
export const GROQ_TIMEOUT_MS = 20000;

// fetchImpl y env se inyectan para poder testear sin red y sin variables reales.
export function createGroqHandler({ env = process.env, fetchImpl = fetch } = {}) {
  return async function groqHandler(req, res) {
    try {
      // Lee la clave enviada desde el localStorage de la PWA, o del .env como fallback
      const groqKey = (req.headers['x-groq-key'] || env.GROQ_API_KEY || '').trim();

      if (!groqKey) {
        return res.status(401).json({ error: 'Falta la API Key de Groq.' });
      }

      const response = await fetchImpl(GROQ_URL, {
        method: 'POST',
        // No seguimos redirects: mismo motivo que en el proxy de Firefly.
        redirect: 'manual',
        signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(req.body)
      });

      if (response.status >= 300 && response.status < 400) {
        // Descartamos el cuerpo para no dejar el socket del upstream colgando.
        await response.body?.cancel();
        return res.status(502).json({ error: 'Groq intentó redirigir la petición y el proxy no sigue redirects.' });
      }

      // El await es deliberado: sin él, un rechazo de la lectura del cuerpo
      // escapa de este try/catch y se vuelve un unhandled rejection que tumba el proceso.
      return await forwardResponse(res, response, 'Groq');
    } catch (err) {
      // Ver el comentario equivalente en firefly.js: evita un segundo send
      // si los headers ya se mandaron.
      if (res.headersSent) return;
      console.error('Error en Proxy Groq:', err);
      return res.status(500).json({ error: err.message });
    }
  };
}
