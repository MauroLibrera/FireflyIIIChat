import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, formatCurrency, formatNumber, toIsoDate } from '../../public/js/domain/format.js';

test('escapeHtml neutralises markup', () => {
  assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHtml('Tom & Jerry'), 'Tom &amp; Jerry');
  assert.equal(escapeHtml('say "hi"'), 'say &quot;hi&quot;');
  assert.equal(escapeHtml("it's"), 'it&#39;s');
});

test('escapeHtml escapes ampersands before anything else', () => {
  assert.equal(escapeHtml('&lt;'), '&amp;lt;');
});

test('escapeHtml treats null and undefined as empty', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(0), '0');
});

test('formatCurrency uses the Argentine grouping with at least two decimals', () => {
  assert.equal(formatCurrency(1234.5), '1.234,50');
  assert.equal(formatCurrency(0), '0,00');
});

test('formatNumber forces no decimals, matching the budget screen', () => {
  // Budgets rendered with no fraction options originally. Forcing two decimals
  // here turns "$15.000" into "$15.000,00" on a screen the user reads daily.
  assert.equal(formatNumber(15000), '15.000');
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(1234.5), '1.234,5');
});

test('toIsoDate formats without a UTC shift', () => {
  assert.equal(toIsoDate(new Date(2026, 0, 31)), '2026-01-31');
  assert.equal(toIsoDate(new Date(2026, 11, 1)), '2026-12-01');
});
