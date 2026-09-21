export const DEFAULT_MODEL = 'openai/gpt-oss-120b';

// fetch no tiene timeout por defecto: sin esto, un proxy colgado deja la
// página colgada con él. Este límite es sobre el salto navegador -> proxy;
// el proxy tiene el suyo propio (server/proxy/groq.js) para el salto
// proxy -> Groq, y ambos valen 20000 por la misma razón sin ser el mismo timeout.
export const GROQ_TIMEOUT_MS = 20000;

export function createGroqApi({ fetchImpl = fetch, getHeaders, model = DEFAULT_MODEL, timeoutMs = GROQ_TIMEOUT_MS }) {
  async function interpret({ messages }) {
    let res;
    try {
      res = await fetchImpl('/api/groq', {
        method: 'POST',
        headers: getHeaders(),
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model,
          messages,
          response_format: { type: 'json_object' },
          temperature: 0.1
        })
      });
    } catch (err) {
      // Ver el comentario equivalente en fireflyApi.js: un abort por timeout
      // no puede llegarle al usuario como "AbortError".
      if (err.name === 'AbortError') {
        throw new Error('La solicitud a Groq superó el tiempo de espera.');
      }
      throw err;
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(`Groq API Error: ${errData.error?.message || res.statusText}`);
    }

    const data = await res.json();
    const contenido = data.choices?.[0]?.message?.content ?? '';

    try {
      return JSON.parse(contenido);
    } catch {
      // El modelo puede responder en prosa; eso no es una excepción de parseo
      // para el usuario, es un fallo del modelo que hay que poder contar.
      throw new Error('El modelo no devolvió un JSON válido.');
    }
  }

  return { interpret };
}
