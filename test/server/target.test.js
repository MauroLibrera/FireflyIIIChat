import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAllowedHosts, resolveFireflyBase, isSafeEndpoint } from '../../server/http/target.js';

test('parseAllowedHosts splits, trims and lowercases', () => {
  assert.deepEqual(parseAllowedHosts(' App:8080 , firefly.example.com '), ['app:8080', 'firefly.example.com']);
  assert.deepEqual(parseAllowedHosts(''), []);
  assert.deepEqual(parseAllowedHosts(undefined), []);
});

test('resolveFireflyBase accepts http and https and strips a trailing slash', () => {
  assert.deepEqual(resolveFireflyBase('http://app:8080', []), { baseUrl: 'http://app:8080' });
  assert.deepEqual(resolveFireflyBase('https://ff.example.com/', []), { baseUrl: 'https://ff.example.com' });
  assert.deepEqual(resolveFireflyBase('https://ff.example.com/sub/', []), { baseUrl: 'https://ff.example.com/sub' });
});

test('resolveFireflyBase rejects non-http schemes', () => {
  assert.ok(resolveFireflyBase('file:///etc/passwd', []).error);
  assert.ok(resolveFireflyBase('gopher://host', []).error);
});

test('resolveFireflyBase rejects embedded credentials', () => {
  assert.ok(resolveFireflyBase('http://user:pass@app:8080', []).error);
});

test('resolveFireflyBase rejects a malformed url', () => {
  assert.ok(resolveFireflyBase('not a url', []).error);
});

test('resolveFireflyBase enforces the allowlist only when it is non-empty', () => {
  assert.deepEqual(resolveFireflyBase('http://app:8080', ['app:8080']), { baseUrl: 'http://app:8080' });
  assert.ok(resolveFireflyBase('http://169.254.169.254', ['app:8080']).error);
  assert.deepEqual(resolveFireflyBase('http://169.254.169.254', []), { baseUrl: 'http://169.254.169.254' });
});

test('isSafeEndpoint rejects dot segments including percent-encoded ones', () => {
  assert.equal(isSafeEndpoint('accounts'), true);
  assert.equal(isSafeEndpoint('accounts/12'), true);
  assert.equal(isSafeEndpoint('search/transactions'), true);
  assert.equal(isSafeEndpoint('../../admin'), false);
  assert.equal(isSafeEndpoint('./accounts'), false);
  assert.equal(isSafeEndpoint('%2e%2e/admin'), false);
  assert.equal(isSafeEndpoint('%2E%2E/admin'), false);
});
