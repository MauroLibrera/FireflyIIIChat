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

test('reading empty storage yields the initial state', () => {
  const store = createProfileStore({ storage: fakeStorage() });
  assert.equal(store.read().activeProfileId, 'default');
});

test('corrupt storage does not throw and recovers', () => {
  const store = createProfileStore({ storage: fakeStorage('{{{ not json') });
  assert.equal(store.read().activeProfileId, 'default');
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
  assert.equal(store.read().activeProfileId, 'default');
});

test('a storage that throws on write does not propagate', () => {
  const store = createProfileStore({ storage: { getItem: () => null, setItem() { throw new Error('quota'); } } });
  assert.doesNotThrow(() => store.write(store.read()));
});
