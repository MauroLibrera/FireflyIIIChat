import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatHistory } from '../../public/js/services/chatHistory.js';

function fakeStorage(initial = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key, next) => { value = next; },
    get raw() { return value; }
  };
}

// Mismo helper que profileStore.test.js: el store avisa por consola en cada
// recuperación, y sin capturarlo eso imprime stack traces en una corrida
// verde. Capturar el warning es lo que convierte "no explotó" en "de verdad
// tomó el camino de recuperación".
function captureWarnings(fn) {
  const original = console.warn;
  const calls = [];
  console.warn = (...args) => calls.push(args);
  try {
    return { result: fn(), calls };
  } finally {
    console.warn = original;
  }
}

test('reading empty storage yields an empty array', () => {
  const history = createChatHistory({ storage: fakeStorage() });
  assert.deepEqual(history.read(), []);
});

test('corrupt JSON does not throw, recovers to an empty array, and warns once', () => {
  const history = createChatHistory({ storage: fakeStorage('{{{ not json') });
  const { result, calls } = captureWarnings(() => history.read());
  assert.deepEqual(result, []);
  assert.equal(calls.length, 1);
});

test('a storage that throws on read yields an empty array and does not throw', () => {
  const history = createChatHistory({ storage: { getItem() { throw new Error('denied'); }, setItem() {} } });
  const { result } = captureWarnings(() => history.read());
  assert.deepEqual(result, []);
});

test('a storage that throws on write does not propagate out of append', () => {
  const history = createChatHistory({ storage: { getItem: () => null, setItem() { throw new Error('quota'); } } });
  captureWarnings(() => {
    assert.doesNotThrow(() => history.append({ texto: 'hola', tipo: 'user', esHtml: false }));
  });
});

test('append keeps at most `limit` entries, dropping the oldest', () => {
  const history = createChatHistory({ storage: fakeStorage(), limit: 50 });
  for (let i = 1; i <= 51; i++) {
    history.append({ texto: `entry-${i}`, tipo: 'user', esHtml: false });
  }
  const entries = history.read();
  assert.equal(entries.length, 50);
  assert.equal(entries[0].texto, 'entry-2');
  assert.equal(entries[entries.length - 1].texto, 'entry-51');
});

test('a round trip preserves texto, tipo and esHtml', () => {
  const history = createChatHistory({ storage: fakeStorage() });
  history.append({ texto: 'Saldo: $100', tipo: 'bot', esHtml: false });
  const [entry] = history.read();
  assert.equal(entry.texto, 'Saldo: $100');
  assert.equal(entry.tipo, 'bot');
  assert.equal(entry.esHtml, false);
});

test('esHtml: true is preserved, not coerced', () => {
  const history = createChatHistory({ storage: fakeStorage() });
  history.append({ texto: '<div>tarjeta</div>', tipo: 'bot', esHtml: true });
  const [entry] = history.read();
  assert.equal(entry.esHtml, true);
});

test('clear empties the stored history', () => {
  const history = createChatHistory({ storage: fakeStorage() });
  history.append({ texto: 'hola', tipo: 'user', esHtml: false });
  history.clear();
  assert.deepEqual(history.read(), []);
});
