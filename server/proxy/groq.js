import { forwardResponse } from '../http/forward.js';

export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

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
        headers: {
          Authorization: `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(req.body)
      });

      // El await es deliberado: sin él, un rechazo de la lectura del cuerpo
      // escapa de este try/catch y se vuelve un unhandled rejection que tumba el proceso.
      return await forwardResponse(res, response, 'Groq');
    } catch (err) {
      console.error('Error en Proxy Groq:', err);
      return res.status(500).json({ error: err.message });
    }
  };
}
