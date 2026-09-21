import { escapeHtml, formatCurrency } from '../domain/format.js';

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

  function renderBalances(cuentas) {
    let html = '<b>💳 Saldos actuales:</b><br>';
    for (const c of cuentas) {
      html += `• <b>${escapeHtml(c.nombre)}:</b> ${escapeHtml(c.moneda)}${formatCurrency(c.saldo)}<br>`;
    }
    return html;
  }

  function renderBudgets(presupuestos) {
    let html = '<b>📊 Estado de Presupuestos:</b><br>';
    for (const b of presupuestos) {
      html += `• <b>${escapeHtml(b.name)}:</b> Gastado $${formatCurrency(b.spent)}<br>`;
    }
    return html;
  }

  function renderRecent(transacciones) {
    let html = '<b>📜 Últimos movimientos reales:</b><br>';
    for (const tx of transacciones) {
      const signo = tx.type === 'withdrawal' ? '-' : '+';
      const fecha = tx.date ? tx.date.split('T')[0] : '';
      html += `• <i>${escapeHtml(fecha)}</i> | <b>${escapeHtml(tx.description)}</b>: ${signo}$${formatCurrency(tx.amount)} (${escapeHtml(tx.source_name)})<br>`;
    }
    return html;
  }

  function renderTransactionResult(intent, montos) {
    const metaInfo = [];
    if (intent.category_name) metaInfo.push(`📁 Categoría: <b>${escapeHtml(intent.category_name)}</b>`);
    if (intent.tags && intent.tags.length > 0) {
      metaInfo.push(`🏷️ Tags: ${intent.tags.map((t) => `#${escapeHtml(t)}`).join(', ')}`);
    }

    const extraHtml = metaInfo.length > 0 ? `<br><small>${metaInfo.join(' | ')}</small>` : '';
    const numCuotas = montos.length;

    if (intent.type === 'transfer') {
      return `✅ Transferencia de <b>$${escapeHtml(intent.amount)}</b> de <i>${escapeHtml(intent.source_name)}</i> a <i>${escapeHtml(intent.destination_name)}</i>.${extraHtml}`;
    }

    return numCuotas > 1
      ? `✅ Registradas <b>${numCuotas} cuotas</b> de $${montos[0]} en <i>${escapeHtml(intent.source_name)}</i> para "${escapeHtml(intent.description)}".${extraHtml}`
      : `✅ Registrado gasto de <b>$${escapeHtml(intent.amount)}</b> en <i>${escapeHtml(intent.source_name)}</i> para "${escapeHtml(intent.description)}".${extraHtml}`;
  }

  return { addMessage, setStatus, history, renderBalances, renderBudgets, renderRecent, renderTransactionResult };
}
