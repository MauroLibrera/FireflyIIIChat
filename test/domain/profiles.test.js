import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialProfilesState,
  normalizeProfilesState,
  activeProfile,
  upsertProfile,
  removeProfile,
  authHeaders
} from '../../public/js/domain/profiles.js';

test('the initial state has exactly one usable profile', () => {
  const state = initialProfilesState();
  assert.equal(state.activeProfileId, 'default');
  assert.equal(Object.keys(state.profiles).length, 1);
  assert.equal(state.profiles.default.name, 'Personal');
});

test('normalize accepts a well-formed state unchanged', () => {
  const raw = { activeProfileId: 'p1', profiles: { p1: { name: 'Trabajo', fireflyUrl: 'http://a', fireflyToken: 't', groqKey: 'g' } } };
  assert.equal(normalizeProfilesState(raw).profiles.p1.name, 'Trabajo');
  assert.equal(normalizeProfilesState(raw).activeProfileId, 'p1');
});

test('normalize repoints an active id that no longer exists', () => {
  const raw = { activeProfileId: 'ghost', profiles: { p1: { name: 'Trabajo' } } };
  assert.equal(normalizeProfilesState(raw).activeProfileId, 'p1');
});

test('normalize falls back for unusable input', () => {
  for (const raw of [null, undefined, 'a string', 42, {}, { profiles: {} }, { profiles: null }]) {
    assert.equal(normalizeProfilesState(raw).activeProfileId, 'default');
  }
});

test('activeProfile returns the selected profile', () => {
  const state = { activeProfileId: 'p1', profiles: { p1: { name: 'Trabajo' } } };
  assert.equal(activeProfile(state).name, 'Trabajo');
});

test('upsertProfile adds without mutating the original', () => {
  const state = initialProfilesState();
  const next = upsertProfile(state, 'p2', { name: 'Nuevo', fireflyUrl: '', fireflyToken: '', groqKey: '' });
  assert.equal(Object.keys(next.profiles).length, 2);
  assert.equal(Object.keys(state.profiles).length, 1);
  assert.equal(next.activeProfileId, 'p2');
});

test('upsertProfile replaces an existing profile', () => {
  const state = initialProfilesState();
  const next = upsertProfile(state, 'default', { name: 'Renombrado', fireflyUrl: '', fireflyToken: '', groqKey: '' });
  assert.equal(Object.keys(next.profiles).length, 1);
  assert.equal(next.profiles.default.name, 'Renombrado');
});

test('removeProfile keeps at least one profile', () => {
  const state = initialProfilesState();
  assert.deepEqual(removeProfile(state, 'default'), state);
});

test('removeProfile activates a survivor', () => {
  let state = initialProfilesState();
  state = upsertProfile(state, 'p2', { name: 'Nuevo', fireflyUrl: '', fireflyToken: '', groqKey: '' });
  const next = removeProfile(state, 'p2');
  assert.equal(Object.keys(next.profiles).length, 1);
  assert.equal(next.activeProfileId, 'default');
});

test('authHeaders maps a profile onto the proxy headers', () => {
  assert.deepEqual(authHeaders({ fireflyUrl: 'http://a', fireflyToken: 't', groqKey: 'g' }), {
    'Content-Type': 'application/json',
    'x-firefly-url': 'http://a',
    'x-firefly-token': 't',
    'x-groq-key': 'g'
  });
});

test('authHeaders tolerates an empty profile', () => {
  assert.deepEqual(authHeaders({}), {
    'Content-Type': 'application/json',
    'x-firefly-url': '',
    'x-firefly-token': '',
    'x-groq-key': ''
  });
});
