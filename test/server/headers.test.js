import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../../server/app.js';
import { CSP_DIRECTIVES } from '../../server/security/headers.js';

let upstream;
let upstreamPort;
let server;
let baseUrl;

before(async () => {
  // Upstream falso para probar el caso proxied: solo necesita devolver JSON
  // reconocible para confirmar que el body no se altera al pasar por el
  // middleware de headers.
  upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ received_url: req.url }));
  });
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  upstreamPort = upstream.address().port;

  server = createApp({ env: {} }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => upstream.close(resolve));
});

test('GET / includes a Content-Security-Policy header', async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.equal(res.status, 200);
  assert.ok(res.headers.get('content-security-policy'), 'expected a Content-Security-Policy header');
});

test('the header value confines default-src to self and denies framing', async () => {
  const res = await fetch(`${baseUrl}/`);
  const header = res.headers.get('content-security-policy');
  assert.match(header, /default-src 'self'/);
  assert.match(header, /frame-ancestors 'none'/);
});

test('the header value never allows unsafe-inline or unsafe-eval', async () => {
  const res = await fetch(`${baseUrl}/`);
  const header = res.headers.get('content-security-policy');
  assert.doesNotMatch(header, /unsafe-inline/);
  assert.doesNotMatch(header, /unsafe-eval/);
});

test('GET /js/app.js (a static asset) also carries the header', async () => {
  const res = await fetch(`${baseUrl}/js/app.js`);
  assert.equal(res.status, 200);
  assert.ok(res.headers.get('content-security-policy'), 'expected the header on static assets too');
});

test('a proxied Firefly response still returns its JSON unchanged, with the header present', async () => {
  const res = await fetch(`${baseUrl}/api/firefly/accounts`, {
    headers: {
      'x-firefly-url': `http://127.0.0.1:${upstreamPort}`,
      'x-firefly-token': 'TESTTOKEN'
    }
  });
  assert.equal(res.status, 200);
  assert.ok(res.headers.get('content-security-policy'), 'expected the header on proxied responses too');
  const body = await res.json();
  assert.equal(body.received_url, '/api/v1/accounts');
});

// El resto de los casos verifica CSP_DIRECTIVES como dato, tal como pide la
// interfaz: así una prueba puede afirmar sobre la política sin depender del
// formato exacto del string del header.

test('CSP_DIRECTIVES confines default, script, style, connect and manifest sources to self', () => {
  assert.deepEqual(CSP_DIRECTIVES['default-src'], ["'self'"]);
  assert.deepEqual(CSP_DIRECTIVES['script-src'], ["'self'"]);
  assert.deepEqual(CSP_DIRECTIVES['style-src'], ["'self'"]);
  assert.deepEqual(CSP_DIRECTIVES['connect-src'], ["'self'"]);
  assert.deepEqual(CSP_DIRECTIVES['manifest-src'], ["'self'"]);
});

test('CSP_DIRECTIVES allows images from self and data: URIs', () => {
  assert.deepEqual(CSP_DIRECTIVES['img-src'], ["'self'", 'data:']);
});

test('CSP_DIRECTIVES allows the service worker via worker-src self', () => {
  assert.deepEqual(CSP_DIRECTIVES['worker-src'], ["'self'"]);
});

test('CSP_DIRECTIVES denies framing, base uri and form action outright', () => {
  assert.deepEqual(CSP_DIRECTIVES['frame-ancestors'], ["'none'"]);
  assert.deepEqual(CSP_DIRECTIVES['base-uri'], ["'none'"]);
  assert.deepEqual(CSP_DIRECTIVES['form-action'], ["'none'"]);
});
