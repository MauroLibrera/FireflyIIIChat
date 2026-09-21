import { renderBalances, renderBudgets, renderRecent, renderTransactionResult, renderConfirmationCard } from '../domain/messages.js';

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
    return msg;
  }

  // Solo cableo de DOM: qué mostrar en la tarjeta ya lo decidió
  // renderConfirmationCard (domain/messages.js). Acá únicamente se inserta
  // el HTML recibido, se buscan sus dos botones y se conectan los callbacks.
  // Tras usar cualquiera de los dos, ambos se deshabilitan para que no
  // puedan volver a disparar (ni un doble click ni confirmar-y-cancelar).
  function addConfirmationCard(html, { onConfirm, onCancel }) {
    const msg = addMessage(html, 'bot', true);
    const btnConfirmar = msg.querySelector('.confirmation-confirm-btn');
    const btnCancelar = msg.querySelector('.confirmation-cancel-btn');

    function deshabilitarBotones() {
      if (btnConfirmar) btnConfirmar.disabled = true;
      if (btnCancelar) btnCancelar.disabled = true;
    }

    if (btnConfirmar) {
      btnConfirmar.addEventListener('click', () => {
        deshabilitarBotones();
        onConfirm();
      });
    }

    if (btnCancelar) {
      btnCancelar.addEventListener('click', () => {
        deshabilitarBotones();
        onCancel();
      });
    }

    return msg;
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
  return {
    addMessage,
    addConfirmationCard,
    setStatus,
    history,
    renderBalances,
    renderBudgets,
    renderRecent,
    renderTransactionResult,
    renderConfirmationCard
  };
}
