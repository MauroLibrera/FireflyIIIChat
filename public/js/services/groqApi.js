export const DEFAULT_MODEL = 'openai/gpt-oss-120b';

export function createGroqApi({ fetchImpl = fetch, getHeaders, model = DEFAULT_MODEL }) {
  async function interpret({ messages }) {
    const res = await fetchImpl('/api/groq', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.1
      })
    });

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
