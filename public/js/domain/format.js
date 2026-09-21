// Funciones puras de formato. Sin DOM: escaparHtml no puede usar createElement
// porque este módulo también corre bajo Node en los tests.

const REEMPLAZOS = [
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&#39;']
];

export function escapeHtml(valor) {
  if (valor === null || valor === undefined) return '';

  // El ampersand va primero para no re-escapar las entidades que generamos.
  return REEMPLAZOS.reduce((texto, [buscar, reemplazo]) => texto.split(buscar).join(reemplazo), String(valor));
}

export function formatCurrency(valor, locale = 'es-AR') {
  return Number(valor).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "sv-SE" devuelve el formato ISO AAAA-MM-DD en hora local, sin desfase UTC.
export function toIsoDate(fecha) {
  return fecha.toLocaleDateString('sv-SE');
}
