import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateIntent } from '../../public/js/domain/intent.js';

const CONTEXT = {
  assetAccounts: ['Galicia'],
  revenueAccounts: [],
  categories: [],
  today: '2026-09-21'
};

test('a valid withdrawal matches the synced account case-insensitively', () => {
  const result = validateIntent(
    { type: 'withdrawal', amount: 3000, source_name: 'galicia', description: 'super' },
    CONTEXT
  );
  assert.equal(result.ok, true);
  assert.equal(result.intent.amount, 3000);
});

test('an unrecognised type is rejected', () => {
  const result = validateIntent({ type: 'sarasa', amount: 100 }, CONTEXT);
  assert.equal(result.ok, false);
  assert.equal(result.field, 'type');
});

test('a missing type is rejected', () => {
  const result = validateIntent({ amount: 100 }, CONTEXT);
  assert.equal(result.ok, false);
  assert.equal(result.field, 'type');
});

test('a zero amount on a withdrawal is rejected', () => {
  const result = validateIntent(
    { type: 'withdrawal', amount: 0, source_name: 'Galicia' },
    CONTEXT
  );
  assert.equal(result.ok, false);
  assert.equal(result.field, 'amount');
});

test('a negative amount is rejected', () => {
  const result = validateIntent(
    { type: 'withdrawal', amount: -50, source_name: 'Galicia' },
    CONTEXT
  );
  assert.equal(result.ok, false);
  assert.equal(result.field, 'amount');
});

test('a non-numeric amount string is rejected', () => {
  const result = validateIntent(
    { type: 'withdrawal', amount: 'abc', source_name: 'Galicia' },
    CONTEXT
  );
  assert.equal(result.ok, false);
  assert.equal(result.field, 'amount');
});

test('an empty amount string is rejected', () => {
  const result = validateIntent(
    { type: 'withdrawal', amount: '', source_name: 'Galicia' },
    CONTEXT
  );
  assert.equal(result.ok, false);
  assert.equal(result.field, 'amount');
});

test('a missing amount on a withdrawal is rejected, not just an invalid one', () => {
  const result = validateIntent({ type: 'withdrawal', source_name: 'Galicia' }, CONTEXT);
  assert.equal(result.ok, false);
  assert.equal(result.field, 'amount');
});

test('a numeric amount string is coerced instead of rejected', () => {
  const result = validateIntent(
    { type: 'withdrawal', amount: '3000', source_name: 'Galicia' },
    CONTEXT
  );
  assert.equal(result.ok, true);
  assert.equal(result.intent.amount, 3000);
});

test('a query with no amount is accepted', () => {
  const result = validateIntent({ type: 'query', query_type: 'balance' }, CONTEXT);
  assert.equal(result.ok, true);
});

test('a query with a nonsensical amount is still accepted, because amount is ignored', () => {
  const result = validateIntent({ type: 'query', amount: 'no-numero' }, CONTEXT);
  assert.equal(result.ok, true);
});

test('an impossible calendar date is rejected', () => {
  const result = validateIntent({ type: 'query', date: '2026-02-30' }, CONTEXT);
  assert.equal(result.ok, false);
  assert.equal(result.field, 'date');
});

test('a date in the wrong format is rejected', () => {
  const result = validateIntent({ type: 'query', date: '31-01-2026' }, CONTEXT);
  assert.equal(result.ok, false);
  assert.equal(result.field, 'date');
});

test('an impossible month is rejected', () => {
  const result = validateIntent({ type: 'query', date: '2026-13-01' }, CONTEXT);
  assert.equal(result.ok, false);
  assert.equal(result.field, 'date');
});

test('a missing date defaults to context.today', () => {
  const result = validateIntent({ type: 'query' }, CONTEXT);
  assert.equal(result.ok, true);
  assert.equal(result.intent.date, CONTEXT.today);
});

test('a fractional installments count is rejected', () => {
  const result = validateIntent({ type: 'query', installments: 2.5 }, CONTEXT);
  assert.equal(result.ok, false);
  assert.equal(result.field, 'installments');
});

test('a zero installments count is rejected', () => {
  const result = validateIntent({ type: 'query', installments: 0 }, CONTEXT);
  assert.equal(result.ok, false);
  assert.equal(result.field, 'installments');
});

test('a negative installments count is rejected', () => {
  const result = validateIntent({ type: 'query', installments: -1 }, CONTEXT);
  assert.equal(result.ok, false);
  assert.equal(result.field, 'installments');
});

test('a stringified installments count is rejected, unlike amount it is not coerced', () => {
  const result = validateIntent({ type: 'query', installments: '3' }, CONTEXT);
  assert.equal(result.ok, false);
  assert.equal(result.field, 'installments');
});

test('a missing installments count defaults to 1', () => {
  const result = validateIntent({ type: 'query' }, CONTEXT);
  assert.equal(result.ok, true);
  assert.equal(result.intent.installments, 1);
});

test('a withdrawal from an unknown account suggests the closest synced account it contains', () => {
  const result = validateIntent(
    { type: 'withdrawal', amount: 100, source_name: 'Galiciaa' },
    CONTEXT
  );
  assert.equal(result.ok, false);
  assert.equal(result.field, 'source_name');
  assert.match(result.reason, /Galicia/);
});

test('a withdrawal from an unknown account offers no suggestion when nothing is close', () => {
  const result = validateIntent(
    { type: 'withdrawal', amount: 100, source_name: 'Banco Nación' },
    CONTEXT
  );
  assert.equal(result.ok, false);
  assert.equal(result.field, 'source_name');
  assert.doesNotMatch(result.reason, /Galicia/);
});

test('a withdrawal not exactly matching an account still suggests it when the account contains the supplied text', () => {
  const context = { ...CONTEXT, assetAccounts: ['Banco Galicia'] };
  const result = validateIntent(
    { type: 'withdrawal', amount: 100, source_name: 'galicia' },
    context
  );
  // Matching es EXACTO (case-insensitive/trim), no por substring: "galicia" no
  // es igual a "Banco Galicia", así que se rechaza. Pero la sugerencia sí usa
  // containment en cualquier dirección, así que debe nombrar "Banco Galicia".
  assert.equal(result.ok, false);
  assert.equal(result.field, 'source_name');
  assert.match(result.reason, /Banco Galicia/);
});

test('a deposit to an account outside assetAccounts is rejected', () => {
  const result = validateIntent(
    { type: 'deposit', amount: 100, destination_name: 'Cuenta Inexistente' },
    CONTEXT
  );
  assert.equal(result.ok, false);
  assert.equal(result.field, 'destination_name');
});

test('a deposit to a synced account matches case-insensitively', () => {
  const result = validateIntent(
    { type: 'deposit', amount: 100, destination_name: 'GALICIA' },
    CONTEXT
  );
  assert.equal(result.ok, true);
});

test('a null raw value is rejected without throwing', () => {
  assert.doesNotThrow(() => {
    const result = validateIntent(null, CONTEXT);
    assert.equal(result.ok, false);
  });
});

test('a string raw value is rejected without throwing', () => {
  assert.doesNotThrow(() => {
    const result = validateIntent('gasté 3000', CONTEXT);
    assert.equal(result.ok, false);
  });
});

test('an array raw value is rejected without throwing', () => {
  assert.doesNotThrow(() => {
    const result = validateIntent(['withdrawal', 3000], CONTEXT);
    assert.equal(result.ok, false);
  });
});

test('an undefined raw value is rejected without throwing', () => {
  assert.doesNotThrow(() => {
    const result = validateIntent(undefined, CONTEXT);
    assert.equal(result.ok, false);
  });
});
