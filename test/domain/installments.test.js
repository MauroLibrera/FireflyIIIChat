import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitAmountIntoInstallments, installmentDates } from '../../public/js/domain/installments.js';

const sumCents = (parts) => parts.reduce((total, part) => total + Math.round(Number(part) * 100), 0);

test('a single installment is the whole amount', () => {
  assert.deepEqual(splitAmountIntoInstallments(100, 1), ['100.00']);
});

test('an indivisible amount still sums to the total', () => {
  const parts = splitAmountIntoInstallments(10000, 3);
  assert.deepEqual(parts, ['3333.34', '3333.33', '3333.33']);
  assert.equal(sumCents(parts), 1000000);
});

test('the smallest possible split loses nothing', () => {
  const parts = splitAmountIntoInstallments(0.05, 3);
  assert.deepEqual(parts, ['0.02', '0.02', '0.01']);
  assert.equal(sumCents(parts), 5);
});

test('awkward divisions sum to the total', () => {
  assert.equal(sumCents(splitAmountIntoInstallments(1234.56, 7)), 123456);
  assert.equal(sumCents(splitAmountIntoInstallments(999.99, 12)), 99999);
});

test('installmentDates clamps to the last day of a short month', () => {
  assert.deepEqual(installmentDates('2026-01-31', 3), ['2026-01-31', '2026-02-28', '2026-03-31']);
});

test('installmentDates respects a leap year', () => {
  assert.deepEqual(installmentDates('2028-01-31', 2), ['2028-01-31', '2028-02-29']);
});

test('installmentDates leaves a safe day untouched', () => {
  assert.deepEqual(installmentDates('2026-03-15', 3), ['2026-03-15', '2026-04-15', '2026-05-15']);
});

test('installmentDates crosses the year boundary', () => {
  assert.deepEqual(installmentDates('2026-12-31', 2), ['2026-12-31', '2027-01-31']);
});
