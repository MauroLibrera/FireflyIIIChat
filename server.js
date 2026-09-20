// Se carga .env.local primero y .env como respaldo (la primera ocurrencia gana)
require('dotenv').config({ path: ['.env.local', '.env'] });

const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

// Servir los archivos estáticos desde la carpeta 'public' (index.html)
app.use(express.static(path.join(__dirname, 'public')));

// Hosts permitidos para el proxy de Firefly III, separados por coma.
// Con la lista vacía se acepta cualquier host: el proxy queda expuesto a SSRF,
// porque la URL de destino la elige el cliente. Definir FIREFLY_ALLOWED_HOSTS
// en cuanto el servicio sea alcanzable por alguien más que vos.
const ALLOWED_FIREFLY_HOSTS = (process.env.FIREFLY_ALLOWED_HOSTS || '')
  .split(',')
  .map(h => h.trim().toLowerCase())
  .filter(Boolean);

// Valida la URL provista por el cliente y devuelve la base ya normalizada
function resolveFireflyBase(rawUrl) {
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

  if (ALLOWED_FIREFLY_HOSTS.length > 0 && !ALLOWED_FIREFLY_HOSTS.includes(parsed.host.toLowerCase())) {
    return { error: 'El host de Firefly III no está en la lista permitida.' };
  }

  return { baseUrl: (parsed.origin + parsed.pathname).replace(/\/$/, '') };
}

// Reenvía la respuesta remota sin asumir que el cuerpo es JSON.
// Un 204, una página de error de un reverse proxy o un cuerpo vacío ya no
// se convierten en un 500 que oculta la causa real.
async function forwardResponse(res, response, origen) {
  if (response.status === 204 || response.status === 304) {
    return res.status(response.status).end();
  }

  const raw = await response.text();
  if (!raw) {
    return res.status(response.status).end();
  }

  try {
    return res.status(response.status).json(JSON.parse(raw));
  } catch {
    return res.status(502).json({
      error: `${origen} devolvió una respuesta que no es JSON.`,
      upstreamStatus: response.status,
      body: raw.slice(0, 300)
    });
  }
}

// Proxy para Groq
app.post('/api/groq', async (req, res) => {
  try {
    // Lee la clave enviada desde el localStorage de la PWA, o del .env como fallback
    const groqKey = (req.headers['x-groq-key'] || process.env.GROQ_API_KEY || '').trim();

    if (!groqKey) {
      return res.status(401).json({ error: "Falta la API Key de Groq." });
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(req.body)
    });

    return forwardResponse(res, response, 'Groq');
  } catch (err) {
    console.error("Error en Proxy Groq:", err);
    res.status(500).json({ error: err.message });
  }
});

// Proxy para Firefly III
app.all(/^\/api\/firefly\/(.*)/, async (req, res) => {
  try {
    const endpoint = req.params[0];

    // Lee la URL y el Token enviados desde la PWA o del .env como fallback
    const rawUrl = (req.headers['x-firefly-url'] || process.env.FIREFLY_URL || '').trim();
    const fireflyToken = (req.headers['x-firefly-token'] || process.env.FIREFLY_TOKEN || '').trim();

    if (!rawUrl || !fireflyToken) {
      return res.status(401).json({ error: "Falta la URL o el Token de Firefly III." });
    }

    const { baseUrl, error } = resolveFireflyBase(rawUrl);
    if (error) {
      return res.status(400).json({ error });
    }

    const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    const targetUrl = `${baseUrl}/api/v1/${endpoint}${queryString}`;

    const fetchOptions = {
      method: req.method,
      headers: {
        "Authorization": `Bearer ${fireflyToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      }
    };

    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOptions);

    return forwardResponse(res, response, 'Firefly III');
  } catch (err) {
    console.error("Error en Proxy Firefly:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Firefly Chat Backend en puerto ${PORT}`);
});
