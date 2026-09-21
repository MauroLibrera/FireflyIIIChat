// Constructores puros de los mensajes HTML del chat. Sin DOM: se movieron
// desde ui/chat.js porque, aunque viven en la capa de mensajería, son lógica
// (loops, ramas de tres vías) y merecen tests sin necesitar un navegador.
import { escapeHtml, formatCurrency, formatNumber } from './format.js';

export function renderBalances(cuentas) {
  let html = '<b>💳 Saldos actuales:</b><br>';
  for (const c of cuentas) {
    html += `• <b>${escapeHtml(c.nombre)}:</b> ${escapeHtml(c.moneda)}${formatCurrency(c.saldo)}<br>`;
  }
  return html;
}

export function renderBudgets(presupuestos) {
  let html = '<b>📊 Estado de Presupuestos:</b><br>';
  for (const b of presupuestos) {
    html += `• <b>${escapeHtml(b.name)}:</b> Gastado $${formatNumber(b.spent)}<br>`;
  }
  return html;
}

export function renderRecent(transacciones) {
  let html = '<b>📜 Últimos movimientos reales:</b><br>';
  for (const tx of transacciones) {
    const signo = tx.type === 'withdrawal' ? '-' : '+';
    const fecha = tx.date ? tx.date.split('T')[0] : '';
    html += `• <i>${escapeHtml(fecha)}</i> | <b>${escapeHtml(tx.description)}</b>: ${signo}$${formatCurrency(tx.amount)} (${escapeHtml(tx.source_name)})<br>`;
  }
  return html;
}

export function renderTransactionResult(intent, montos) {
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
