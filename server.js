const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

// Servir los archivos estáticos desde la carpeta 'public' (index.html)
app.use(express.static(path.join(__dirname, 'public')));

// Proxy para la API de Groq
app.post('/api/groq', async (req, res) => {
  try {
    const groqKey = (process.env.GROQ_API_KEY || '').trim();
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error("Error en Proxy Groq:", err);
    res.status(500).json({ error: err.message });
  }
});

// Proxy para la API de Firefly III
app.all(/^\/api\/firefly\/(.*)/, async (req, res) => {
  try {
    const endpoint = req.params[0]; // Captura la ruta relativa después de /api/firefly/
    const baseUrl = (process.env.FIREFLY_URL || '').replace(/\/$/, '').trim();
    const fireflyToken = (process.env.FIREFLY_TOKEN || '').trim();

    // Reconstruir los query params (ej: ?type=asset o ?limit=10)
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
    const data = await response.json();

    res.status(response.status).json(data);
  } catch (err) {
    console.error("Error en Proxy Firefly:", err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Firefly Chat Backend escuchando en el puerto ${PORT}`);
});