// Mismo patrón que profileStore.js: storage se inyecta para poder testear
// sin navegador, y ninguna lectura o escritura rota puede tirar abajo el
// chat. La diferencia con profileStore es que acá no hay un estado inicial
// con forma propia (domain/profiles.js) — el historial es simplemente un
// array de mensajes ya renderizados, así que la recuperación cae a [].
export function createChatHistory({ storage, key = 'firefly_chat_history', limit = 50 }) {
  function read() {
    let crudo;
    try {
      crudo = storage.getItem(key);
    } catch (err) {
      console.warn('No se pudo leer el historial del chat:', err);
      return [];
    }

    if (!crudo) return [];

    try {
      const parsed = JSON.parse(crudo);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      // Solo el nombre del error, no el mensaje: como en profileStore, el
      // mensaje de SyntaxError puede incluir un fragmento del texto que
      // falló al parsear, y ese texto es la transcripción del chat.
      console.warn('Historial de chat ilegible, se reinicia:', err.name);
      return [];
    }
  }

  function write(entries) {
    try {
      storage.setItem(key, JSON.stringify(entries));
    } catch (err) {
      console.warn('No se pudo guardar el historial del chat:', err);
    }
  }

  // Guarda como máximo `limit` entradas, descartando las más viejas primero.
  function append(entry) {
    const entries = read();
    entries.push(entry);
    const recortado = entries.length > limit ? entries.slice(entries.length - limit) : entries;
    write(recortado);
  }

  function clear() {
    write([]);
  }

  return { read, append, clear };
}
