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

// Mapa de tipo a etiqueta legible. No hay un mapeo equivalente en el resto
// del código (renderTransactionResult arma su frase entera por tipo en vez
// de traducir el campo), así que se define acá.
const ETIQUETAS_TIPO = {
  withdrawal: 'Gasto',
  deposit: 'Ingreso',
  transfer: 'Transferencia',
  query: 'Consulta'
};

// Arma una fila <div class="confirmation-row"> con su etiqueta, u omite la
// fila entera si el valor está vacío: así nunca se imprime "undefined" para
// un campo que el modelo no llenó (p. ej. category_name en una transferencia).
function filaConfirmacion(etiqueta, valor) {
  if (valor === undefined || valor === null || valor === '') return '';
  return `<div class="confirmation-row"><span class="confirmation-label">${escapeHtml(etiqueta)}:</span> ${escapeHtml(valor)}</div>`;
}

// Tarjeta de confirmación estructurada (Task 2, R2): el usuario confirma
// contra los campos reales que la app está por enviar a Firefly, no contra
// una frase que escribió el modelo sobre sí mismo (mensaje_confirmacion).
// `intent` ya pasó por validateIntent (Task 1): acá no se vuelve a validar.
export function renderConfirmationCard(intent, montos) {
  const tipoLegible = ETIQUETAS_TIPO[intent.type] || intent.type;
  const numCuotas = montos.length;

  const filaCuotas =
    numCuotas > 1
      ? filaConfirmacion('Cuotas', `${numCuotas} de $${montos[0]} c/u`)
      : filaConfirmacion('Cuotas', String(intent.installments ?? numCuotas));

  const filas = [
    filaConfirmacion('Tipo', tipoLegible),
    filaConfirmacion('Monto', intent.type === 'query' ? '' : formatCurrency(intent.amount)),
    filaConfirmacion('Descripción', intent.description),
    filaConfirmacion('Origen', intent.source_name),
    filaConfirmacion('Destino', intent.destination_name),
    filaConfirmacion('Categoría', intent.category_name),
    filaConfirmacion('Fecha', intent.date),
    filaCuotas
  ].join('');

  return `<div class="confirmation-card">
    <div class="confirmation-card-title">🧾 Confirmá los datos antes de registrar</div>
    ${filas}
    <div class="confirmation-actions">
      <button type="button" class="button-confirm confirmation-confirm-btn">✅ Confirmar</button>
      <button type="button" class="button-cancel confirmation-cancel-btn">❌ Cancelar</button>
    </div>
  </div>`;
}
