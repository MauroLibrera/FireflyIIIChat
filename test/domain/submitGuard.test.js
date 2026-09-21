import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSubmitGuard } from '../../public/js/domain/submitGuard.js';

test('tryStart succeeds on an idle guard', () => {
  const guard = createSubmitGuard();
  assert.equal(guard.tryStart(), true);
});

test('a second tryStart is refused while the first is still in flight', () => {
  const guard = createSubmitGuard();
  assert.equal(guard.tryStart(), true);
  assert.equal(guard.tryStart(), false);
});

test('finish frees the guard for a new tryStart', () => {
  const guard = createSubmitGuard();
  guard.tryStart();
  guard.finish();
  assert.equal(guard.tryStart(), true);
});

test('busy reflects the current state', () => {
  const guard = createSubmitGuard();
  assert.equal(guard.busy, false);
  guard.tryStart();
  assert.equal(guard.busy, true);
  guard.finish();
  assert.equal(guard.busy, false);
});

test('a refused tryStart does not reset an in-flight guard', () => {
  const guard = createSubmitGuard();
  guard.tryStart();
  guard.tryStart(); // refused, no debe tocar el estado
  assert.equal(guard.busy, true);
});
