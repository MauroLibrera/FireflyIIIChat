import { renderBalances, renderBudgets, renderRecent, renderTransactionResult } from '../domain/messages.js';

export function createChatView({ chatElement, statusElement }) {
  // esHtml solo puede ser true para marcado que construye la app, nunca para
  // texto del usuario ni del modelo.
  function addMessage(texto, tipo = 'bot', esHtml = false) {
    const msg = document.createElement('div');
    msg.className = `message ${tipo}`;

    if (esHtml) {
      msg.innerHTML = texto;
    } else {
      msg.textContent = texto;
    }

    chatElement.appendChild(msg);
    chatElement.scrollTop = chatElement.scrollHeight;
  }

  function setStatus(texto, color) {
    statusElement.innerText = texto;
    statusElement.style.color = color;
  }

  // Los últimos mensajes como contexto. Se excluye el último elemento:
  // ya fue agregado al DOM y se envía aparte como el texto del usuario.
  function history(limit = 4) {
    return Array.from(chatElement.querySelectorAll('.message'))
      .slice(-(limit + 1), -1)
      .map((msg) => ({
        role: msg.classList.contains('user') ? 'user' : 'assistant',
        content: msg.textContent
      }));
  }

  // Los cuatro renderers son lógica pura y viven en domain/messages.js (con
  // sus propios tests); se re-exponen acá para que app.js no tenga que
  // cambiar cómo los consume.
  return { addMessage, setStatus, history, renderBalances, renderBudgets, renderRecent, renderTransactionResult };
}
