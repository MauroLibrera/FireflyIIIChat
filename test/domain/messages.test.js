import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderBalances,
  renderBudgets,
  renderRecent,
  renderTransactionResult,
  renderConfirmationCard
} from '../../public/js/domain/messages.js';

test('renderBalances shows the currency symbol and a two-decimal amount per account', () => {
  const html = renderBalances([
    { nombre: 'Galicia', saldo: 15000, moneda: '$' },
    { nombre: 'Ahorros', saldo: 0, moneda: 'US$' }
  ]);

  assert.match(html, /Galicia/);
  assert.match(html, /\$15\.000,00/);
  assert.match(html, /US\$0,00/);
});

test('renderBalances escapes a hostile account name instead of injecting markup', () => {
  const html = renderBalances([{ nombre: '<img src=x onerror=alert(1)>', saldo: 100, moneda: '$' }]);

  assert.doesNotMatch(html, /<img /);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('renderBudgets shows a whole-peso amount with no decimals', () => {
  // Regresión de la Task 6, fix round 1: presupuestos nunca forzó decimales
  // en el original; unificarlo con formatCurrency mostraba "$15.000,00"
  // en vez de "$15.000".
  const html = renderBudgets([{ name: 'Comida', spent: 15000 }]);

  assert.match(html, /Comida/);
  assert.match(html, /\$15\.000<br>/);
  assert.doesNotMatch(html, /15\.000,00/);
});

test('renderBudgets escapes a hostile budget name instead of injecting markup', () => {
  const html = renderBudgets([{ name: '<script>alert(1)</script>', spent: 100 }]);

  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('renderRecent flips the sign between a withdrawal and a deposit, and truncates the date at T', () => {
  const html = renderRecent([
    { type: 'withdrawal', date: '2026-01-15T00:00:00+00:00', description: 'Super', amount: 500, source_name: 'Galicia' },
    { type: 'deposit', date: '2026-01-16T00:00:00+00:00', description: 'Sueldo', amount: 1000, source_name: 'Empresa' }
  ]);

  assert.match(html, /2026-01-15.*-\$500,00/);
  assert.match(html, /2026-01-16.*\+\$1\.000,00/);
  assert.doesNotMatch(html, /T00:00:00/);
});

test('renderRecent escapes a hostile description or source_name instead of injecting markup', () => {
  const html = renderRecent([
    { type: 'withdrawal', date: '2026-01-15T00:00:00+00:00', description: '<script>alert(1)</script>', amount: 500, source_name: '<img src=x onerror=alert(2)>' }
  ]);

  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img /);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(2\)&gt;/);
});

test('renderTransactionResult for a transfer', () => {
  const html = renderTransactionResult(
    { type: 'transfer', amount: 5000, source_name: 'Galicia', destination_name: 'Ahorros' },
    ['5000.00']
  );

  assert.match(html, /Transferencia/);
  assert.match(html, /Galicia/);
  assert.match(html, /Ahorros/);
});

test('renderTransactionResult for multiple installments', () => {
  const html = renderTransactionResult(
    { type: 'withdrawal', amount: 3000, source_name: 'Visa', description: 'Notebook' },
    ['1000.00', '1000.00', '1000.00']
  );

  assert.match(html, /Registradas <b>3 cuotas<\/b> de \$1000\.00/);
  assert.match(html, /Notebook/);
});

test('renderTransactionResult for a single installment', () => {
  const html = renderTransactionResult(
    { type: 'withdrawal', amount: 3000, source_name: 'Galicia', description: 'Café' },
    ['3000.00']
  );

  assert.match(html, /Registrado gasto de <b>\$3000<\/b>/);
  assert.match(html, /Café/);
});

test('a hostile description or source_name is escaped, not injected as markup', () => {
  const html = renderTransactionResult(
    { type: 'withdrawal', amount: 100, source_name: '<img src=x onerror=alert(1)>', description: '<script>alert(2)</script>' },
    ['100.00']
  );

  assert.doesNotMatch(html, /<img /);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
});

test('renderConfirmationCard shows every labelled field for a single-installment withdrawal', () => {
  const html = renderConfirmationCard(
    {
      type: 'withdrawal',
      amount: 3000,
      description: 'Super',
      source_name: 'Galicia',
      destination_name: 'Supermercado',
      category_name: 'Comida',
      date: '2026-01-15',
      installments: 1
    },
    ['3000.00']
  );

  assert.match(html, /Galicia/);
  assert.match(html, /Supermercado/);
  assert.match(html, /Comida/);
  assert.match(html, /2026-01-15/);
  assert.match(html, /Super/);
  assert.match(html, /3\.000,00/);
  // Cada dato mostrado tiene que tener una etiqueta identificable al lado.
  assert.match(html, /Tipo/);
  assert.match(html, /Monto/);
  assert.match(html, /Origen/);
  assert.match(html, /Destino/);
  assert.match(html, /Categor/);
  assert.match(html, /Fecha/);
  assert.match(html, /Cuotas/);
});

test('renderConfirmationCard omits the category row when category_name is empty and never prints undefined', () => {
  const html = renderConfirmationCard(
    {
      type: 'withdrawal',
      amount: 3000,
      description: 'Super',
      source_name: 'Galicia',
      destination_name: 'Supermercado',
      category_name: '',
      date: '2026-01-15',
      installments: 1
    },
    ['3000.00']
  );

  assert.doesNotMatch(html, /Categor/);
  assert.doesNotMatch(html, /undefined/);
});

test('renderConfirmationCard shows the installment count and the per-installment amount', () => {
  const html = renderConfirmationCard(
    {
      type: 'withdrawal',
      amount: 10000,
      description: 'Notebook',
      source_name: 'Visa',
      destination_name: 'Tienda',
      category_name: 'Tecnología',
      date: '2026-01-15',
      installments: 3
    },
    ['3333.34', '3333.33', '3333.33']
  );

  // Finding 5, fix round 2: /3/ como regex nunca podía fallar (matchea "2026",
  // "3.333", clases CSS, etc.), así que no probaba nada. Se ata la cantidad
  // de cuotas y el monto por cuota a la misma fila, tal como los arma
  // filaConfirmacion, para que el assert sí falle si cualquiera de los dos
  // deja de mostrarse.
  assert.match(html, /Cuotas:<\/span> 3 de \$3\.333,34 c\/u/);
});

// Fix round 1, finding 2: la tarjeta mezclaba dos formatos de moneda en el
// mismo cartel (Monto con formatCurrency, Cuotas con el string crudo de
// splitAmountIntoInstallments). Se fija el formato acá para que no pueda
// volver a divergir en silencio. No se toca renderTransactionResult: ese
// comportamiento es deliberado y preexistente de un plan anterior.
test('renderConfirmationCard formats the per-installment amount the same way as Monto, not as the raw API string', () => {
  const html = renderConfirmationCard(
    {
      type: 'withdrawal',
      amount: 10000,
      description: 'Notebook',
      source_name: 'Visa',
      destination_name: 'Tienda',
      category_name: 'Tecnología',
      date: '2026-01-15',
      installments: 3
    },
    ['3333.34', '3333.33', '3333.33']
  );

  assert.match(html, /3\.333,34/);
  assert.doesNotMatch(html, /3333\.34/);
});

test('renderConfirmationCard escapes a hostile description instead of injecting markup', () => {
  const html = renderConfirmationCard(
    {
      type: 'withdrawal',
      amount: 100,
      description: '<img src=x onerror=alert(1)>',
      source_name: 'Galicia',
      destination_name: 'Comercio',
      category_name: '',
      date: '2026-01-15',
      installments: 1
    },
    ['100.00']
  );

  assert.doesNotMatch(html, /<img /);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('renderConfirmationCard escapes an ampersand in source_name', () => {
  const html = renderConfirmationCard(
    {
      type: 'withdrawal',
      amount: 100,
      description: 'Compra',
      source_name: 'Galicia & Cía',
      destination_name: 'Comercio',
      category_name: '',
      date: '2026-01-15',
      installments: 1
    },
    ['100.00']
  );

  assert.match(html, /Galicia &amp; Cía/);
});

test('renderConfirmationCard shows both source and destination for a transfer', () => {
  const html = renderConfirmationCard(
    {
      type: 'transfer',
      amount: 5000,
      description: '',
      source_name: 'Galicia',
      destination_name: 'Ahorros',
      category_name: '',
      date: '2026-01-15',
      installments: 1
    },
    ['5000.00']
  );

  assert.match(html, /Galicia/);
  assert.match(html, /Ahorros/);
});

test('renderConfirmationCard omits the destination row when destination_name is empty', () => {
  const html = renderConfirmationCard(
    {
      type: 'withdrawal',
      amount: 100,
      description: 'Compra',
      source_name: 'Galicia',
      destination_name: '',
      category_name: '',
      date: '2026-01-15',
      installments: 1
    },
    ['100.00']
  );

  assert.doesNotMatch(html, /Destino/);
  assert.doesNotMatch(html, /undefined/);
});

test('renderConfirmationCard omits the description row when description is empty, without printing undefined', () => {
  const html = renderConfirmationCard(
    {
      type: 'transfer',
      amount: 5000,
      description: '',
      source_name: 'Galicia',
      destination_name: 'Ahorros',
      category_name: '',
      date: '2026-01-15',
      installments: 1
    },
    ['5000.00']
  );

  assert.doesNotMatch(html, /undefined/);
});

test('renderConfirmationCard labels a deposit and a withdrawal in Spanish, not the raw type string', () => {
  const withdrawal = renderConfirmationCard(
    { type: 'withdrawal', amount: 100, description: '', source_name: 'Galicia', destination_name: 'Comercio', category_name: '', date: '2026-01-15', installments: 1 },
    ['100.00']
  );
  const deposit = renderConfirmationCard(
    { type: 'deposit', amount: 100, description: '', source_name: 'Sueldo', destination_name: 'Galicia', category_name: '', date: '2026-01-15', installments: 1 },
    ['100.00']
  );

  // Finding 5, fix round 2: filaConfirmacion emite "</span> withdrawal</div>",
  // con un espacio antes del valor, así que />withdrawal</ nunca podía
  // matchear ni aunque se mostrara el string en inglés sin traducir. Se
  // afirma directamente que la etiqueta en español está presente y que el
  // tipo crudo en inglés no aparece en ningún lado del HTML.
  assert.match(withdrawal, /Gasto/);
  assert.doesNotMatch(withdrawal, /withdrawal/);
  assert.match(deposit, /Ingreso/);
  assert.doesNotMatch(deposit, /deposit/);
});

test('renderConfirmationCard includes distinguishable confirm and cancel controls for ui/chat.js to wire up', () => {
  const html = renderConfirmationCard(
    { type: 'withdrawal', amount: 100, description: '', source_name: 'Galicia', destination_name: 'Comercio', category_name: '', date: '2026-01-15', installments: 1 },
    ['100.00']
  );

  assert.match(html, /confirmation-confirm-btn/);
  assert.match(html, /confirmation-cancel-btn/);
  // Nada de estilos inline: la CSP de la Task 7 los prohíbe.
  assert.doesNotMatch(html, /style=/);
});

// Fix round 1, finding 1: tags es uno de los ocho campos que
// services/fireflyApi.js manda a Firefly y la tarjeta no lo mostraba. Se
// presenta igual que renderTransactionResult (#tag separados por coma) para
// que la confirmación y el resultado posterior se lean igual.
test('renderConfirmationCard shows tags escaped, formatted as #tag joined by commas', () => {
  const html = renderConfirmationCard(
    {
      type: 'withdrawal',
      amount: 100,
      description: 'Compra',
      source_name: 'Galicia',
      destination_name: 'Comercio',
      category_name: '',
      date: '2026-01-15',
      installments: 1,
      tags: ['super', '<script>alert(1)</script>']
    },
    ['100.00']
  );

  assert.match(html, /#super/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /#&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /#super, #&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test('renderConfirmationCard omits the tags row when tags is absent', () => {
  const html = renderConfirmationCard(
    {
      type: 'withdrawal',
      amount: 100,
      description: 'Compra',
      source_name: 'Galicia',
      destination_name: 'Comercio',
      category_name: '',
      date: '2026-01-15',
      installments: 1
    },
    ['100.00']
  );

  assert.doesNotMatch(html, /Tags/);
  assert.doesNotMatch(html, /undefined/);
});

test('renderConfirmationCard omits the tags row when tags is an empty array', () => {
  const html = renderConfirmationCard(
    {
      type: 'withdrawal',
      amount: 100,
      description: 'Compra',
      source_name: 'Galicia',
      destination_name: 'Comercio',
      category_name: '',
      date: '2026-01-15',
      installments: 1,
      tags: []
    },
    ['100.00']
  );

  assert.doesNotMatch(html, /Tags/);
  assert.doesNotMatch(html, /undefined/);
});
