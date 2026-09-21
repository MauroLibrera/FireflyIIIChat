import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderBalances, renderBudgets, renderRecent, renderTransactionResult } from '../../public/js/domain/messages.js';

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
