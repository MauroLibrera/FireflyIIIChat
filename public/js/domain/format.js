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

// El original usaba DOS formatos distintos y hay que conservar los dos:
// saldos y movimientos fuerzan un mínimo de dos decimales, los presupuestos
// no fuerzan ninguno. Unificarlos cambia "$15.000" por "$15.000,00" en
// pantalla, que es un cambio de comportamiento visible.
export function formatCurrency(valor, locale = 'es-AR') {
  return Number(valor).toLocaleString(locale, { minimumFractionDigits: 2 });
}

export function formatNumber(valor, locale = 'es-AR') {
  return Number(valor).toLocaleString(locale);
}

// "sv-SE" devuelve el formato ISO AAAA-MM-DD en hora local, sin desfase UTC.
export function toIsoDate(fecha) {
  return fecha.toLocaleDateString('sv-SE');
}
