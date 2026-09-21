import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAllowedHosts, resolveFireflyBase, buildFireflyTargetUrl } from '../../server/http/target.js';

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
});

// Antes esta prueba se leía como si un allowlist vacío por defecto fuera en
// sí mismo el agujero de seguridad: certificaba que resolveFireflyBase deja
// pasar cualquier host, incluida una IP de metadata como 169.254.169.254.
// Eso sigue siendo cierto — el allowlist es opt-in por diseño, vía
// FIREFLY_ALLOWED_HOSTS — pero ya no es peligroso por sí solo: resolveFireflyBase
// solo valida sintaxis y el allowlist opcional, nunca credenciales. Lo que
// hacía crítico aceptar cualquier host era que firefly.js le pegaba el token
// del .env a una URL elegida por el cliente. Esa mezcla ya no puede pasar
// (ver la prueba de firefly.js "does not forward the env token..."), así
// que aceptar un host sin restricciones vuelve a ser solo una decisión de
// diseño del dueño del servidor, no una fuga de credenciales.
test('resolveFireflyBase leaves host restriction as an opt-in policy, not a credential guarantee', () => {
  assert.deepEqual(resolveFireflyBase('http://169.254.169.254', []), { baseUrl: 'http://169.254.169.254' });
});

test('buildFireflyTargetUrl accepts a simple endpoint and preserves the query string', () => {
  const result = buildFireflyTargetUrl('http://app:8080', 'accounts', '?start=2026-09-01');
  assert.deepEqual(result, { url: 'http://app:8080/api/v1/accounts?start=2026-09-01' });
});

test('buildFireflyTargetUrl accepts a legitimate nested path', () => {
  const result = buildFireflyTargetUrl('http://app:8080', 'accounts/12', '');
  assert.deepEqual(result, { url: 'http://app:8080/api/v1/accounts/12' });
});

test('buildFireflyTargetUrl rejects dot segments including percent-encoded ones', () => {
  for (const endpoint of ['../../admin', '%2e%2e/admin', '%2E%2E/admin']) {
    assert.ok(buildFireflyTargetUrl('http://app:8080', endpoint, '').error, `expected an error for ${endpoint}`);
  }
});

// Un solo "./" no escapa nada: se resuelve dentro del prefijo, igual que lo
// haría el propio fetch. isSafeEndpoint lo rechazaba por match de string sin
// que representara ningún riesgo real; el chequeo de origen+prefijo lo deja
// pasar porque el resultado sigue viviendo bajo /api/v1/.
test('buildFireflyTargetUrl allows a harmless single dot segment', () => {
  const result = buildFireflyTargetUrl('http://app:8080', './accounts', '');
  assert.deepEqual(result, { url: 'http://app:8080/api/v1/accounts' });
});

test('buildFireflyTargetUrl rejects backslash traversal that a string split would miss', () => {
  // ".."+"\\"+".."+"\\"+"admin" llega como un único segmento tras el
  // split('/') ingenuo (isSafeEndpoint lo dejaba pasar); el parser WHATWG
  // trata la barra invertida como separador para esquemas especiales como
  // http/https, así que new URL() sí lo resuelve como travesía.
  const result = buildFireflyTargetUrl('http://app:8080', '..\\..\\admin', '');
  assert.ok(result.error);
});

test('buildFireflyTargetUrl rejects an endpoint that escapes to another origin', () => {
  const result = buildFireflyTargetUrl('http://app:8080', 'http://evil.example.com/api/v1/accounts', '');
  assert.ok(result.error);
});
