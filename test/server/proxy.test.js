import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../../server/app.js';

let upstream;
let upstreamPort;
let server;
let baseUrl;
let upstreamMode = 'json';
let lastUpstreamUrl = null;

before(async () => {
  upstream = http.createServer((req, res) => {
    lastUpstreamUrl = req.url;
    if (upstreamMode === 'html') {
      res.writeHead(502, { 'Content-Type': 'text/html' });
      return res.end('<html>nginx 502</html>');
    }
    if (upstreamMode === 'empty') {
      res.writeHead(204);
      return res.end();
    }
    if (upstreamMode === 'truncated') {
      // Declara un Content-Length que nunca cumple y corta la conexión a
      // mitad del cuerpo: fuerza a que la lectura del body falle después de
      // que los headers ya llegaron, en vez de que falle el fetch en sí.
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '100' });
      res.write('{"partial": tr');
      return setTimeout(() => res.destroy(), 50);
    }
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

function headers() {
  return {
    'x-firefly-url': `http://127.0.0.1:${upstreamPort}`,
    'x-firefly-token': 'TESTTOKEN',
    'Content-Type': 'application/json'
  };
}

// Petición cruda: fetch normalizaría los ".." antes de enviarlos.
function rawGet(path, extraHeaders = {}) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port: server.address().port, path, method: 'GET', headers: { ...headers(), ...extraHeaders } },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }
    );
    req.end();
  });
}

test('proxies a GET and preserves the query string', async () => {
  upstreamMode = 'json';
  lastUpstreamUrl = null;
  const res = await fetch(`${baseUrl}/api/firefly/budgets?start=2026-09-01&end=2026-09-30`, { headers: headers() });
  assert.equal(res.status, 200);
  assert.equal(lastUpstreamUrl, '/api/v1/budgets?start=2026-09-01&end=2026-09-30');
});

test('forwards a POST body', async () => {
  upstreamMode = 'json';
  const res = await fetch(`${baseUrl}/api/firefly/transactions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ transactions: [] })
  });
  assert.equal(res.status, 200);
  assert.equal(lastUpstreamUrl, '/api/v1/transactions');
});

test('rejects a missing token before contacting the upstream', async () => {
  lastUpstreamUrl = null;
  const res = await fetch(`${baseUrl}/api/firefly/accounts`, {
    headers: { 'x-firefly-url': `http://127.0.0.1:${upstreamPort}` }
  });
  assert.equal(res.status, 401);
  assert.equal(lastUpstreamUrl, null);
});

test('rejects a non-http scheme', async () => {
  const res = await fetch(`${baseUrl}/api/firefly/accounts`, {
    headers: { ...headers(), 'x-firefly-url': 'file:///etc/passwd' }
  });
  assert.equal(res.status, 400);
});

test('rejects embedded credentials', async () => {
  const res = await fetch(`${baseUrl}/api/firefly/accounts`, {
    headers: { ...headers(), 'x-firefly-url': `http://a:b@127.0.0.1:${upstreamPort}` }
  });
  assert.equal(res.status, 400);
});

test('rejects dot segments without contacting the upstream', async () => {
  for (const path of ['/api/firefly/../../admin', '/api/firefly/%2e%2e/admin', '/api/firefly/%2E%2E/admin', '/api/firefly/./accounts']) {
    lastUpstreamUrl = null;
    const res = await rawGet(path);
    assert.equal(res.status, 400, `expected 400 for ${path}`);
    assert.equal(lastUpstreamUrl, null, `upstream was contacted for ${path}`);
  }
});

test('allows a legitimate nested path', async () => {
  upstreamMode = 'json';
  lastUpstreamUrl = null;
  const res = await rawGet('/api/firefly/accounts/12');
  assert.equal(res.status, 200);
  assert.equal(lastUpstreamUrl, '/api/v1/accounts/12');
});

test('turns a non-JSON upstream body into a 502 with an excerpt', async () => {
  upstreamMode = 'html';
  const res = await fetch(`${baseUrl}/api/firefly/accounts`, { headers: headers() });
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.upstreamStatus, 502);
  assert.match(body.body, /nginx 502/);
});

test('contains a mid-body upstream disconnect as a 500 instead of crashing the process', async () => {
  upstreamMode = 'truncated';
  const res = await fetch(`${baseUrl}/api/firefly/accounts`, { headers: headers() });
  assert.equal(res.status, 500);
});

test('passes a 204 through without a body', async () => {
  upstreamMode = 'empty';
  const res = await fetch(`${baseUrl}/api/firefly/accounts`, { headers: headers() });
  assert.equal(res.status, 204);
  assert.equal(await res.text(), '');
});

test('enforces the allowlist when it is configured', async () => {
  const restricted = createApp({ env: { FIREFLY_ALLOWED_HOSTS: '127.0.0.1:1' } }).listen(0, '127.0.0.1');
  await new Promise((resolve) => restricted.once('listening', resolve));
  const url = `http://127.0.0.1:${restricted.address().port}/api/firefly/accounts`;
  const res = await fetch(url, { headers: headers() });
  assert.equal(res.status, 400);
  await new Promise((resolve) => restricted.close(resolve));
});

test('rejects a Groq request with no key', async () => {
  const res = await fetch(`${baseUrl}/api/groq`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [] })
  });
  assert.equal(res.status, 401);
});

test('serves the static page', async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
});
