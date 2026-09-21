import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAffirmative, isNegative, nextAction } from '../../public/js/domain/confirmation.js';

test('affirmative words are recognised regardless of case and padding', () => {
  for (const word of ['si', 'sí', 'correcto', 'dale', 'ok', 'confirmar', 's', 'confirmo', 'ya', 'claro', 'de una']) {
    assert.equal(isAffirmative(word), true, word);
    assert.equal(isAffirmative(`  ${word.toUpperCase()}  `), true, word);
  }
});

test('negative words are recognised', () => {
  for (const word of ['no', 'cancelar', 'incorrecto', 'n', 'pará', 'espera', 'cancela']) {
    assert.equal(isNegative(word), true, word);
  }
});

test('a sentence containing a keyword is not a bare confirmation', () => {
  assert.equal(isAffirmative('si compré dos cafés'), false);
  assert.equal(isNegative('no gasté 3000 en el super'), false);
});

test('with no pending intent every message is interpreted', () => {
  assert.equal(nextAction(null, 'si'), 'interpret');
  assert.equal(nextAction(null, 'gasté 3000'), 'interpret');
});

test('with a pending intent yes confirms and no cancels', () => {
  const pending = { type: 'withdrawal' };
  assert.equal(nextAction(pending, 'dale'), 'confirm');
  assert.equal(nextAction(pending, 'cancelar'), 'cancel');
});

test('with a pending intent an unrelated message is interpreted', () => {
  assert.equal(nextAction({ type: 'withdrawal' }, 'en realidad fueron 2000'), 'interpret');
});
