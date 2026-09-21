import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canConfirmPendingIntent } from '../../public/js/domain/pendingIntentGuard.js';

test('a card confirms when it still matches the current pending intent', () => {
  const intent = { type: 'withdrawal', amount: 3000 };
  assert.equal(canConfirmPendingIntent(intent, intent), true);
});

// Finding 1: tarjeta A ($3.000) sigue en pantalla, el usuario tipea una
// corrección ("no, fueron 30000") en vez de tocar Cancelar, pendingIntent
// pasa a ser la intención B ($30.000). Clickear ✅ en la tarjeta A no puede
// terminar escribiendo B.
test('a stale card is refused once the pending intent changed to a different intent', () => {
  const shown = { type: 'withdrawal', amount: 3000 };
  const current = { type: 'withdrawal', amount: 30000 };
  assert.equal(canConfirmPendingIntent(shown, current), false);
});

// Segundo síntoma del mismo hallazgo: si la intención más nueva se
// auto-envía (requiere_confirmacion: false), pendingIntent vuelve a null.
test('a stale card is refused once the pending intent auto-submitted and became null', () => {
  const shown = { type: 'withdrawal', amount: 3000 };
  assert.equal(canConfirmPendingIntent(shown, null), false);
});

// La comparación es de identidad, no de contenido: dos intenciones iguales
// campo a campo pero armadas en interpretaciones distintas del modelo no son
// "la misma tarjeta".
test('two intents with identical fields but different object identity are not treated as the same card', () => {
  const shown = { type: 'withdrawal', amount: 3000 };
  const current = { type: 'withdrawal', amount: 3000 };
  assert.equal(canConfirmPendingIntent(shown, current), false);
});
