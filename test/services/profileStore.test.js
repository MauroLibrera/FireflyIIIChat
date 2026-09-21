import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProfileStore } from '../../public/js/services/profileStore.js';

function fakeStorage(initial = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key, next) => { value = next; },
    get raw() { return value; }
  };
}

// The store warns on every recovered failure. Left alone that prints stack
// traces into a green run, so capture the warnings and assert on them instead:
// the noise becomes the assertion that the recovery path actually ran.
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

test('reading empty storage yields the initial state', () => {
  const store = createProfileStore({ storage: fakeStorage() });
  assert.equal(store.read().activeProfileId, 'default');
});

test('corrupt storage does not throw, recovers, and warns once', () => {
  const store = createProfileStore({ storage: fakeStorage('{{{ not json') });
  const { result, calls } = captureWarnings(() => store.read());
  assert.equal(result.activeProfileId, 'default');
  assert.equal(calls.length, 1);
});

test('a round trip preserves the state', () => {
  const storage = fakeStorage();
  const store = createProfileStore({ storage });
  const state = { activeProfileId: 'p1', profiles: { p1: { name: 'Trabajo', fireflyUrl: 'http://a', fireflyToken: 't', groqKey: 'g' } } };
  store.write(state);
  assert.equal(store.read().profiles.p1.name, 'Trabajo');
});

test('a storage that throws on read still yields a usable state', () => {
  const store = createProfileStore({ storage: { getItem() { throw new Error('denied'); }, setItem() {} } });
  const { result, calls } = captureWarnings(() => store.read());
  assert.equal(result.activeProfileId, 'default');
  assert.equal(calls.length, 1);
});

test('a storage that throws on write does not propagate', () => {
  const store = createProfileStore({ storage: { getItem: () => null, setItem() { throw new Error('quota'); } } });
  const { calls } = captureWarnings(() => assert.doesNotThrow(() => store.write(store.read())));
  assert.equal(calls.length, 1);
});
