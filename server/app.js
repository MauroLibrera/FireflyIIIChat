import express from 'express';
import { fileURLToPath } from 'node:url';
import { createGroqHandler } from './proxy/groq.js';
import { createFireflyHandler } from './proxy/firefly.js';
import { securityHeaders } from './security/headers.js';

const DEFAULT_PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));

// No se lee process.env en el cuerpo del módulo: los imports de ESM se evalúan
// antes de que server.js ejecute dotenv.config(), así que la configuración
// tiene que leerse recién cuando se llama a createApp().
export function createApp({ env = process.env, fetchImpl = fetch, publicDir = DEFAULT_PUBLIC_DIR } = {}) {
  const app = express();

  // Se monta antes que todo lo demás (incluido express.static) para que la
  // Content Security Policy cubra también los archivos estáticos, no solo
  // las rutas de proxy.
  app.use(securityHeaders());

  app.use(express.json());

  // Servir los archivos estáticos desde la carpeta 'public' (index.html)
  app.use(express.static(publicDir));

  // Proxy para Groq
  app.post('/api/groq', createGroqHandler({ env, fetchImpl }));

  // Proxy para Firefly III
  app.all(/^\/api\/firefly\/(.*)/, createFireflyHandler({ env, fetchImpl }));

  return app;
}
