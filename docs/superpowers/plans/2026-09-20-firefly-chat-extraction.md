# Firefly Chat Extraction Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all logic out of `public/index.html` and `server.js` into focused ES modules covered by a `node --test` suite, with byte-for-byte identical application behavior.

**Architecture:** The client splits into `domain/` (pure functions, no DOM, no network, no clock), `services/` (side effects arriving through injected dependencies), and `ui/` (DOM only, no logic). The server splits into a `createApp()` factory plus route and HTTP helper modules, so routes can be mounted in a test without binding a fixed port. The whole project becomes ESM so tests and the browser load the same files.

**Tech Stack:** Node 20+, Express 4, `node:test`, `node:assert/strict`. No new dependencies of any kind.

**Spec:** `docs/superpowers/specs/2026-09-20-firefly-chat-modularization-design.md`

## Global Constraints

- **Zero new dependencies.** `package.json` keeps exactly `express` and `dotenv`. No devDependencies.
- **The dependency rule (spec 4.1):** `domain/` imports only from `domain/` — no `fetch`, no `document`, no `window`, no `localStorage`, no clock reads. Time arrives as an argument. `services/` may import `domain/`. `ui/` may import `domain/`, never `services/`. Only `app.js` wires them.
- **`domain/` and `services/` must run under plain Node with no DOM present.** This is what the test suite depends on.
- **No behavior change in this plan.** Every task in Plan 1 preserves current behavior exactly. Requirements R1–R9 belong to Plan 2.
- **Comments and identifiers in Spanish where the file already uses Spanish**, matching the existing codebase. Test names in English.
- **Dockerfile and docker-compose.yml are not modified.** `node server.js` remains the entry point.
- **Line endings:** existing files are CRLF. Keep them.
- **Test commands never take a directory argument.** On Node 24 a positional directory makes the runner try to load the directory itself and the run fails (`pass 0, fail 1`). Use explicit file paths for a focused run, and bare `node --test` (which discovers recursively from the cwd, skipping `node_modules`) for the whole suite. Verified on Node v24.18.1: `node --test test/` fails, `node --test` passes.

---

### Task 1: Convert to ESM and extract the server

**Files:**
- Modify: `package.json` (add `"type": "module"`, add test script)
- Modify: `server.js` (becomes a 10-line entry point)
- Create: `server/app.js`
- Create: `server/http/target.js`
- Create: `server/http/forward.js`
- Create: `server/proxy/groq.js`
- Create: `server/proxy/firefly.js`
- Test: `test/server/target.test.js`
- Test: `test/server/proxy.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `parseAllowedHosts(raw: string) => string[]`
  - `resolveFireflyBase(rawUrl: string, allowedHosts: string[]) => { baseUrl: string } | { error: string }`
  - `isSafeEndpoint(endpoint: string) => boolean`
  - `forwardResponse(res, response: Response, origen: string) => Promise<void>`
  - `createGroqHandler({ env, fetchImpl }) => (req, res) => Promise<void>`
  - `createFireflyHandler({ env, fetchImpl }) => (req, res) => Promise<void>`
  - `createApp({ env, fetchImpl, publicDir }) => express.Application`

**Why ESM:** the browser needs `public/js/*.js` to be modules, and `node --test` must import those same files. Node only treats `.js` as ESM when `package.json` declares `"type": "module"`, which converts the server too. The alternative — naming client files `.mjs` — relies on Express serving the right MIME type for an extension it handles less predictably. Converting the whole project is the simpler contract.

- [ ] **Step 1: Write the failing unit test for target validation**

Create `test/server/target.test.js`:

```js
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
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test test/server/target.test.js`
Expected: FAIL — `Cannot find module .../server/http/target.js`

- [ ] **Step 3: Declare the project as ESM**

Edit `package.json` to add `"type": "module"` and a test script. The full file:

```json
{
  "name": "firefly-chat",
  "version": "1.0.0",
  "description": "Proxy y Chat para Firefly III y Groq",
  "main": "server.js",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "test": "node --test"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "express": "^4.22.3"
  }
}
```

- [ ] **Step 4: Create `server/http/target.js`**

```js
// Validación del destino que el cliente propone para el proxy de Firefly III.
// Todo acá es puro: no hay red, no hay process.env, no hay Express.

export function parseAllowedHosts(raw) {
  return String(raw || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

// Devuelve { baseUrl } o { error }. Nunca lanza.
export function resolveFireflyBase(rawUrl, allowedHosts = []) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { error: 'La URL de Firefly III no es válida.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: 'Solo se admiten URLs http o https.' };
  }

  if (parsed.username || parsed.password) {
    return { error: 'La URL de Firefly III no debe incluir credenciales.' };
  }

  if (allowedHosts.length > 0 && !allowedHosts.includes(parsed.host.toLowerCase())) {
    return { error: 'El host de Firefly III no está en la lista permitida.' };
  }

  return { baseUrl: (parsed.origin + parsed.pathname).replace(/\/$/, '') };
}

// El endpoint lo elige el cliente y no puede salirse del prefijo /api/v1/.
// fetch normaliza los segmentos ".." antes de enviar, y %2e cuenta como punto.
export function isSafeEndpoint(endpoint) {
  const segmentos = String(endpoint)
    .split('/')
    .map((seg) => seg.toLowerCase().split('%2e').join('.'));

  return !segmentos.some((seg) => seg === '..' || seg === '.');
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `node --test test/server/target.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 6: Create `server/http/forward.js`**

```js
// Reenvía la respuesta remota sin asumir que el cuerpo es JSON.
// Un 204, una página de error de un reverse proxy o un cuerpo vacío ya no
// se convierten en un 500 que oculta la causa real.
export async function forwardResponse(res, response, origen) {
  if (response.status === 204 || response.status === 304) {
    return res.status(response.status).end();
  }

  const raw = await response.text();
  if (!raw) {
    return res.status(response.status).end();
  }

  try {
    return res.status(response.status).json(JSON.parse(raw));
  } catch {
    return res.status(502).json({
      error: `${origen} devolvió una respuesta que no es JSON.`,
      upstreamStatus: response.status,
      body: raw.slice(0, 300)
    });
  }
}
```

- [ ] **Step 7: Create `server/proxy/groq.js`**

```js
import { forwardResponse } from '../http/forward.js';

export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// fetchImpl y env se inyectan para poder testear sin red y sin variables reales.
export function createGroqHandler({ env = process.env, fetchImpl = fetch } = {}) {
  return async function groqHandler(req, res) {
    try {
      // Lee la clave enviada desde el localStorage de la PWA, o del .env como fallback
      const groqKey = (req.headers['x-groq-key'] || env.GROQ_API_KEY || '').trim();

      if (!groqKey) {
        return res.status(401).json({ error: 'Falta la API Key de Groq.' });
      }

      const response = await fetchImpl(GROQ_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(req.body)
      });

      return await forwardResponse(res, response, 'Groq');
    } catch (err) {
      console.error('Error en Proxy Groq:', err);
      return res.status(500).json({ error: err.message });
    }
  };
}
```

- [ ] **Step 8: Create `server/proxy/firefly.js`**

```js
import { forwardResponse } from '../http/forward.js';
import { parseAllowedHosts, resolveFireflyBase, isSafeEndpoint } from '../http/target.js';

export function createFireflyHandler({ env = process.env, fetchImpl = fetch } = {}) {
  const allowedHosts = parseAllowedHosts(env.FIREFLY_ALLOWED_HOSTS);

  return async function fireflyHandler(req, res) {
    try {
      const endpoint = req.params[0];

      if (!isSafeEndpoint(endpoint)) {
        return res.status(400).json({ error: 'Endpoint de Firefly III inválido.' });
      }

      // Lee la URL y el Token enviados desde la PWA o del .env como fallback
      const rawUrl = (req.headers['x-firefly-url'] || env.FIREFLY_URL || '').trim();
      const fireflyToken = (req.headers['x-firefly-token'] || env.FIREFLY_TOKEN || '').trim();

      if (!rawUrl || !fireflyToken) {
        return res.status(401).json({ error: 'Falta la URL o el Token de Firefly III.' });
      }

      const { baseUrl, error } = resolveFireflyBase(rawUrl, allowedHosts);
      if (error) {
        return res.status(400).json({ error });
      }

      const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
      const targetUrl = `${baseUrl}/api/v1/${endpoint}${queryString}`;

      const fetchOptions = {
        method: req.method,
        headers: {
          Authorization: `Bearer ${fireflyToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        }
      };

      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const response = await fetchImpl(targetUrl, fetchOptions);

      return await forwardResponse(res, response, 'Firefly III');
    } catch (err) {
      console.error('Error en Proxy Firefly:', err);
      return res.status(500).json({ error: err.message });
    }
  };
}
```

- [ ] **Step 9: Create `server/app.js`**

```js
import express from 'express';
import { fileURLToPath } from 'node:url';
import { createGroqHandler } from './proxy/groq.js';
import { createFireflyHandler } from './proxy/firefly.js';

const DEFAULT_PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));

// No se lee process.env en el cuerpo del módulo: los imports de ESM se evalúan
// antes de que server.js ejecute dotenv.config(), así que la configuración
// tiene que leerse recién cuando se llama a createApp().
export function createApp({ env = process.env, fetchImpl = fetch, publicDir = DEFAULT_PUBLIC_DIR } = {}) {
  const app = express();

  app.use(express.json());

  // Servir los archivos estáticos desde la carpeta 'public' (index.html)
  app.use(express.static(publicDir));

  // Proxy para Groq
  app.post('/api/groq', createGroqHandler({ env, fetchImpl }));

  // Proxy para Firefly III
  app.all(/^\/api\/firefly\/(.*)/, createFireflyHandler({ env, fetchImpl }));

  return app;
}
```

- [ ] **Step 10: Rewrite `server.js` as the entry point**

```js
import dotenv from 'dotenv';
import { createApp } from './server/app.js';

// Se carga .env.local primero y .env como respaldo (la primera ocurrencia gana).
// Los imports de ESM ya se evaluaron en este punto, por eso server/app.js no
// puede leer process.env en el cuerpo del módulo.
dotenv.config({ path: ['.env.local', '.env'] });

const PORT = process.env.PORT || 3000;

createApp().listen(PORT, () => {
  console.log(`🚀 Firefly Chat Backend en puerto ${PORT}`);
});
```

- [ ] **Step 11: Write the failing integration test**

Create `test/server/proxy.test.js`:

```js
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
```

- [ ] **Step 12: Run the full suite**

Run: `npm test`
Expected: PASS, all tests in `test/server/`.

- [ ] **Step 13: Verify the real entry point still boots**

Run: `node server.js`
Expected: prints the startup line on port 3000. Stop it with Ctrl+C.

This step catches the ESM ordering trap: if `server/app.js` ever reads `process.env` in its module body, `dotenv.config()` will not have run yet and the fallbacks silently become empty.

- [ ] **Step 14: Commit**

```bash
git add package.json server.js server test
git commit -m "refactor: convert to ESM and extract the server into testable modules"
```

---

### Task 2: Extract formatting and installment domain modules

**Files:**
- Create: `public/js/domain/format.js`
- Create: `public/js/domain/installments.js`
- Test: `test/domain/format.test.js`
- Test: `test/domain/installments.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `escapeHtml(value: unknown) => string`
  - `formatCurrency(value: number, locale?: string) => string`
  - `toIsoDate(date: Date) => string`
  - `splitAmountIntoInstallments(amount: number, count: number) => string[]`
  - `installmentDates(startIso: string, count: number) => string[]`

**Note on `escapeHtml`:** the current implementation uses `document.createElement`, which the dependency rule forbids in `domain/`. It becomes a pure string transform. This also escapes quotes, which the DOM version did not.

**Note on ICU:** `formatCurrency` and `toIsoDate` rely on `toLocaleString`/`toLocaleDateString` with the `es-AR` and `sv-SE` locales. These need a full-ICU Node build. Official Node 20 binaries and the `node:20-alpine` image ship full ICU, so this works, but if `formatCurrency(1234.5)` returns `1,234.50` instead of `1.234,50` the runtime fell back to `en-US` and the build lacks ICU. That is the diagnosis, not a broken test. Verify with `node -e "console.log(new Intl.NumberFormat('es-AR').format(1234.5))"` before changing any assertion.

- [ ] **Step 1: Write the failing tests**

Create `test/domain/format.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, formatCurrency, toIsoDate } from '../../public/js/domain/format.js';

test('escapeHtml neutralises markup', () => {
  assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHtml('Tom & Jerry'), 'Tom &amp; Jerry');
  assert.equal(escapeHtml('say "hi"'), 'say &quot;hi&quot;');
  assert.equal(escapeHtml("it's"), 'it&#39;s');
});

test('escapeHtml escapes ampersands before anything else', () => {
  assert.equal(escapeHtml('&lt;'), '&amp;lt;');
});

test('escapeHtml treats null and undefined as empty', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(0), '0');
});

test('formatCurrency uses the Argentine grouping with two decimals', () => {
  assert.equal(formatCurrency(1234.5), '1.234,50');
  assert.equal(formatCurrency(0), '0,00');
});

test('toIsoDate formats without a UTC shift', () => {
  assert.equal(toIsoDate(new Date(2026, 0, 31)), '2026-01-31');
  assert.equal(toIsoDate(new Date(2026, 11, 1)), '2026-12-01');
});
```

Create `test/domain/installments.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitAmountIntoInstallments, installmentDates } from '../../public/js/domain/installments.js';

const sumCents = (parts) => parts.reduce((total, part) => total + Math.round(Number(part) * 100), 0);

test('a single installment is the whole amount', () => {
  assert.deepEqual(splitAmountIntoInstallments(100, 1), ['100.00']);
});

test('an indivisible amount still sums to the total', () => {
  const parts = splitAmountIntoInstallments(10000, 3);
  assert.deepEqual(parts, ['3333.34', '3333.33', '3333.33']);
  assert.equal(sumCents(parts), 1000000);
});

test('the smallest possible split loses nothing', () => {
  const parts = splitAmountIntoInstallments(0.05, 3);
  assert.deepEqual(parts, ['0.02', '0.02', '0.01']);
  assert.equal(sumCents(parts), 5);
});

test('awkward divisions sum to the total', () => {
  assert.equal(sumCents(splitAmountIntoInstallments(1234.56, 7)), 123456);
  assert.equal(sumCents(splitAmountIntoInstallments(999.99, 12)), 99999);
});

test('installmentDates clamps to the last day of a short month', () => {
  assert.deepEqual(installmentDates('2026-01-31', 3), ['2026-01-31', '2026-02-28', '2026-03-31']);
});

test('installmentDates respects a leap year', () => {
  assert.deepEqual(installmentDates('2028-01-31', 2), ['2028-01-31', '2028-02-29']);
});

test('installmentDates leaves a safe day untouched', () => {
  assert.deepEqual(installmentDates('2026-03-15', 3), ['2026-03-15', '2026-04-15', '2026-05-15']);
});

test('installmentDates crosses the year boundary', () => {
  assert.deepEqual(installmentDates('2026-12-31', 2), ['2026-12-31', '2027-01-31']);
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `node --test test/domain/format.test.js test/domain/installments.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `public/js/domain/format.js`**

```js
// Funciones puras de formato. Sin DOM: escaparHtml no puede usar createElement
// porque este módulo también corre bajo Node en los tests.

const REEMPLAZOS = [
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&#39;']
];

export function escapeHtml(valor) {
  if (valor === null || valor === undefined) return '';

  // El ampersand va primero para no re-escapar las entidades que generamos.
  return REEMPLAZOS.reduce((texto, [buscar, reemplazo]) => texto.split(buscar).join(reemplazo), String(valor));
}

export function formatCurrency(valor, locale = 'es-AR') {
  return Number(valor).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "sv-SE" devuelve el formato ISO AAAA-MM-DD en hora local, sin desfase UTC.
export function toIsoDate(fecha) {
  return fecha.toLocaleDateString('sv-SE');
}
```

- [ ] **Step 4: Create `public/js/domain/installments.js`**

```js
import { toIsoDate } from './format.js';

// Repartir en centavos: dividir y redondear cada cuota perdía plata
// (10000 en 3 cuotas facturaba 9999.99). El sobrante va a las primeras.
export function splitAmountIntoInstallments(monto, cantidad) {
  const totalCentavos = Math.round(Number(monto) * 100);
  const centavosBase = Math.floor(totalCentavos / cantidad);
  const centavosSobrantes = totalCentavos - centavosBase * cantidad;

  return Array.from({ length: cantidad }, (_, i) => {
    const centavosCuota = centavosBase + (i < centavosSobrantes ? 1 : 0);
    return (centavosCuota / 100).toFixed(2);
  });
}

// El día se recorta al último del mes destino, porque
// new Date(2026, 0 + 1, 31) desbordaría al 3 de marzo.
export function installmentDates(fechaInicialIso, cantidad) {
  const [year, month, day] = fechaInicialIso.split('-').map(Number);

  return Array.from({ length: cantidad }, (_, i) => {
    const diasDelMes = new Date(year, month + i, 0).getDate();
    return toIsoDate(new Date(year, month - 1 + i, Math.min(day, diasDelMes)));
  });
}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `node --test test/domain/format.test.js test/domain/installments.test.js`
Expected: PASS, 13 tests.

- [ ] **Step 6: Commit**

```bash
git add public/js/domain/format.js public/js/domain/installments.js test/domain
git commit -m "refactor: extract format and installment domain modules"
```

---

### Task 3: Extract profile state and its storage service

**Files:**
- Create: `public/js/domain/profiles.js`
- Create: `public/js/services/profileStore.js`
- Test: `test/domain/profiles.test.js`
- Test: `test/services/profileStore.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `initialProfilesState() => State` where `State` is `{ activeProfileId: string, profiles: Record<string, Profile> }` and `Profile` is `{ name, fireflyUrl, fireflyToken, groqKey }`
  - `normalizeProfilesState(raw: unknown) => State`
  - `activeProfile(state: State) => Profile`
  - `upsertProfile(state: State, id: string, profile: Profile) => State`
  - `removeProfile(state: State, id: string) => State`
  - `authHeaders(profile: Profile) => Record<string, string>`
  - `createProfileStore({ storage, key? }) => { read(): State, write(state: State): void }`

`upsertProfile` and `removeProfile` return new state objects; they never mutate the argument. `removeProfile` refuses to delete the last remaining profile and returns the state unchanged.

- [ ] **Step 1: Write the failing domain tests**

Create `test/domain/profiles.test.js`:

```js
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
  // assert.equal, not deepEqual: this pins reference identity, so a future
  // refactor that starts cloning on this branch fails instead of passing.
  assert.equal(removeProfile(state, 'default'), state);
});

test('normalize rejects an array masquerading as a profiles record', () => {
  assert.equal(normalizeProfilesState({ profiles: ['a', 'b'] }).activeProfileId, 'default');
  assert.equal(Array.isArray(normalizeProfilesState({ profiles: ['a', 'b'] }).profiles), false);
  assert.equal(normalizeProfilesState(['a', 'b']).activeProfileId, 'default');
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
```

Create `test/services/profileStore.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `node --test test/domain/profiles.test.js test/services/profileStore.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `public/js/domain/profiles.js`**

```js
export const PROFILES_STORAGE_KEY = 'firefly_profiles_cfg';

// Estructura usada cuando no hay nada guardado o lo guardado es inservible
export function initialProfilesState() {
  return {
    activeProfileId: 'default',
    profiles: {
      default: { name: 'Personal', fireflyUrl: '', fireflyToken: '', groqKey: '' }
    }
  };
}

// Un valor corrompido no puede dejar la app inusable.
export function normalizeProfilesState(raw) {
  // Array.isArray importa: un array es typeof "object" y tiene claves, así que
  // { profiles: ["a","b"] } pasaría el chequeo y rompería el contrato Record.
  const esValido =
    raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    raw.profiles &&
    typeof raw.profiles === 'object' &&
    !Array.isArray(raw.profiles) &&
    Object.keys(raw.profiles).length > 0;

  if (!esValido) return initialProfilesState();

  const ids = Object.keys(raw.profiles);
  const activeProfileId = raw.profiles[raw.activeProfileId] ? raw.activeProfileId : ids[0];

  return { activeProfileId, profiles: raw.profiles };
}

export function activeProfile(state) {
  return state.profiles[state.activeProfileId] || {};
}

export function upsertProfile(state, id, profile) {
  return {
    activeProfileId: id,
    profiles: { ...state.profiles, [id]: profile }
  };
}

// Siempre tiene que quedar al menos un perfil.
export function removeProfile(state, id) {
  if (Object.keys(state.profiles).length <= 1) return state;

  const profiles = { ...state.profiles };
  delete profiles[id];

  const activeProfileId = profiles[state.activeProfileId] ? state.activeProfileId : Object.keys(profiles)[0];

  return { activeProfileId, profiles };
}

export function authHeaders(profile) {
  return {
    'Content-Type': 'application/json',
    'x-firefly-url': profile.fireflyUrl || '',
    'x-firefly-token': profile.fireflyToken || '',
    'x-groq-key': profile.groqKey || ''
  };
}
```

- [ ] **Step 4: Create `public/js/services/profileStore.js`**

```js
import { PROFILES_STORAGE_KEY, initialProfilesState, normalizeProfilesState } from '../domain/profiles.js';

// storage se inyecta para poder testear sin navegador. En producción es localStorage,
// que puede lanzar en modo privado o con el almacenamiento bloqueado.
export function createProfileStore({ storage, key = PROFILES_STORAGE_KEY }) {
  return {
    read() {
      let crudo;
      try {
        crudo = storage.getItem(key);
      } catch (err) {
        console.warn('No se pudo leer la configuración de perfiles:', err);
        return initialProfilesState();
      }

      if (!crudo) return initialProfilesState();

      try {
        return normalizeProfilesState(JSON.parse(crudo));
      } catch (err) {
        console.warn('Configuración de perfiles ilegible, se reinicia:', err);
        return initialProfilesState();
      }
    },

    write(state) {
      try {
        storage.setItem(key, JSON.stringify(state));
      } catch (err) {
        console.warn('No se pudo guardar la configuración de perfiles:', err);
      }
    }
  };
}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `node --test test/domain/profiles.test.js test/services/profileStore.test.js`
Expected: PASS, 16 tests.

- [ ] **Step 6: Commit**

```bash
git add public/js/domain/profiles.js public/js/services/profileStore.js test/domain/profiles.test.js test/services/profileStore.test.js
git commit -m "refactor: extract profile state and storage into modules"
```

---

### Task 4: Extract the confirmation state machine and the prompt builder

**Files:**
- Create: `public/js/domain/confirmation.js`
- Create: `public/js/domain/prompt.js`
- Test: `test/domain/confirmation.test.js`
- Test: `test/domain/prompt.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `isAffirmative(text: string) => boolean`
  - `isNegative(text: string) => boolean`
  - `nextAction(pendingIntent: object | null, text: string) => 'confirm' | 'cancel' | 'interpret'`
  - `buildSystemPrompt(context) => string` where `context` is `{ today, assetAccounts, revenueAccounts, categories, tags, defaultAssetAccount }`
  - `buildMessages({ systemPrompt, history, userText }) => Array<{ role, content }>`

`history` is an array of `{ role, content }` already excluding the current message. `buildMessages` does not trim it; the caller decides how much history to pass.

- [ ] **Step 1: Write the failing tests**

Create `test/domain/confirmation.test.js`:

```js
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
```

Create `test/domain/prompt.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt, buildMessages } from '../../public/js/domain/prompt.js';

const context = {
  today: '2026-09-20',
  assetAccounts: ['Galicia', 'Tarjeta Visa'],
  revenueAccounts: ['Sueldo'],
  categories: ['Comida'],
  tags: ['super'],
  defaultAssetAccount: 'Galicia'
};

test('the prompt carries the synced data the model needs', () => {
  const prompt = buildSystemPrompt(context);
  assert.match(prompt, /2026-09-20/);
  assert.match(prompt, /Galicia/);
  assert.match(prompt, /Tarjeta Visa/);
  assert.match(prompt, /Sueldo/);
  assert.match(prompt, /Comida/);
  assert.match(prompt, /super/);
});

test('the prompt never ends mid-sentence', () => {
  const prompt = buildSystemPrompt(context).trimEnd();
  assert.ok(/[.:"\]}]$/.test(prompt), `prompt ends with: ${JSON.stringify(prompt.slice(-40))}`);
});

test('the prompt keeps its worked confirmation example', () => {
  // A few-shot example steers the model's output format. It was dropped once
  // while moving this prompt and nothing caught it, so pin it.
  const prompt = buildSystemPrompt(context);
  assert.match(prompt, /pidiendo validación\. Ejemplo:/);
  assert.match(prompt, /¿Confirmás el gasto de \$15\.000 en 'Supermercado'/);
});

test('the prompt states the confirmation rule exactly once', () => {
  const prompt = buildSystemPrompt(context);
  const occurrences = prompt.split('REGLAS OBLIGATORIAS DE CONFIRMACIÓN').length - 1;
  assert.equal(occurrences, 1);
  assert.equal(prompt.includes('REGLAS DE CONFIRMACIÓN:'), false);
});

test('buildMessages places history between the system prompt and the user text', () => {
  const messages = buildMessages({
    systemPrompt: 'SYS',
    history: [{ role: 'user', content: 'café 3000' }, { role: 'assistant', content: '¿Confirmás?' }],
    userText: 'si'
  });

  assert.deepEqual(messages.map((m) => m.role), ['system', 'user', 'assistant', 'user']);
  assert.equal(messages[0].content, 'SYS');
  assert.equal(messages[3].content, 'si');
});

test('buildMessages works with no history', () => {
  const messages = buildMessages({ systemPrompt: 'SYS', history: [], userText: 'hola' });
  assert.deepEqual(messages.map((m) => m.role), ['system', 'user']);
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `node --test test/domain/confirmation.test.js test/domain/prompt.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `public/js/domain/confirmation.js`**

```js
const AFIRMATIVAS = ['si', 'sí', 'correcto', 'dale', 'ok', 'confirmar', 's', 'confirmo', 'ya', 'claro', 'de una'];
const NEGATIVAS = ['no', 'cancelar', 'incorrecto', 'n', 'pará', 'espera', 'cancela'];

// La comparación es contra el mensaje completo: "no gasté 3000" es una
// corrección, no una cancelación.
export function isAffirmative(texto) {
  return AFIRMATIVAS.includes(String(texto).trim().toLowerCase());
}

export function isNegative(texto) {
  return NEGATIVAS.includes(String(texto).trim().toLowerCase());
}

export function nextAction(pendingIntent, texto) {
  if (!pendingIntent) return 'interpret';
  if (isAffirmative(texto)) return 'confirm';
  if (isNegative(texto)) return 'cancel';
  return 'interpret';
}
```

- [ ] **Step 4: Create `public/js/domain/prompt.js`**

Copy the prompt text from the current `consultarGroq` in `public/index.html` verbatim, with the trailing truncated block already removed on this branch. `today` replaces the inline `hoyStr`.

```js
export function buildSystemPrompt({ today, assetAccounts, revenueAccounts, categories, tags, defaultAssetAccount }) {
  return `Sos un asistente financiero que parsea lenguaje natural a un JSON estricto para la API de Firefly III.
    La fecha de hoy es: ${today}

    Cuentas de Activo disponibles:
    ${JSON.stringify(assetAccounts)}

    Cuentas de Ingreso disponibles:
    ${JSON.stringify(revenueAccounts)}

    Categorías existentes en Firefly III:
    ${JSON.stringify(categories)}

    Etiquetas (tags) existentes en Firefly III:
    ${JSON.stringify(tags)}

    Cuenta de activo por defecto: "${defaultAssetAccount}"

    Devolverás ÚNICAMENTE un objeto JSON válido con este formato:
    {
        "type": "withdrawal" | "deposit" | "transfer" | "query",
        "requiere_confirmacion": boolean,
        "mensaje_confirmacion": string,
        "query_type": "balance" | "budget" | "recent_transactions" | null,
        "amount": number,
        "description": string,
        "source_name": string,
        "destination_name": string,
        "category_name": string,
        "installments": number,
        "tags": string[],
        "date": "YYYY-MM-DD"
    }

    REGLAS OBLIGATORIAS DE CONFIRMACIÓN (LEER CON ATENCIÓN):
    1. SIEMPRE debes establecer "requiere_confirmacion": true para CUALQUIER registro de transacción (gasto, ingreso o transferencia), A MENOS que el usuario explícitamente diga palabras como "registra directamente", "sin confirmar" o "confirmado".
    2. Cuando "requiere_confirmacion" sea true:
       - Genera todos los campos de la transacción normalmente ("amount", "description", "source_name", etc.).
       - Escribe un "mensaje_confirmacion" claro en lenguaje natural pidiendo validación. Ejemplo:
         "¿Confirmás el gasto de $15.000 en 'Supermercado' usando la cuenta 'Galicia' bajo la categoría 'Comida'?"
    3. Para consultas de saldo/movimientos ("type": "query"), SIEMPRE establece "requiere_confirmacion": false y "mensaje_confirmacion": "".

    REGLAS PARA CONSULTAS Y CONSULTAS DE SALDO:
    1. Si el usuario está HACIENDO UNA PREGUNTA o pidiendo información (no registrando un gasto/ingreso), marcá "type": "query".
    2. "query_type":
    - "balance": Si pregunta por saldos ("¿Cuánto me queda?", "Saldo de Galicia", "Saldos actuales").
    - "budget": Si pregunta por presupuestos ("¿Cuánto me queda en comida?", "Estado de presupuestos").
    - "recent_transactions": Si pide ver sus últimos movimientos ("¿Cuáles fueron mis últimos gastos?").
    - Si "query_type" es "balance" o "budget" y menciona una cuenta o categoría específica, asignala a "source_name" o "category_name".

    REGLAS DE MAPPING:
    1. "category_name": Asigná la categoría que mejor describa el gasto.
    - Priorizá siempre reutilizar una de la lista de "Categorías existentes".
    - Si ninguna encaja adecuadamente, podés crear un nombre de categoría nuevo corto en formato Title Case (ej: "Restaurantes", "Mascotas", "Tecnología").
    - Para las transferencias internas ("transfer"), podés devolver un string vacío "".
    2. "tags": Analizá la intención del gasto y asigná entre 1 y 3 etiquetas relevantes.
    - Priorizá siempre reutilizar etiquetas del listado de "Etiquetas existentes".
    - Si ninguna etiqueta existente encaja, podés crear una nueva etiqueta limpia (en minúsculas, palabras simples sin espacios, ej: "cafeteria", "supermercado", "transporte", "salida").
    - Si el usuario pone un hashtag explícito en el texto (ej: #salidas), incluyo esa etiqueta.
    3. "withdrawal":
    - source_name: Nombre exacto de la cuenta de activo. Si no menciona ninguna, usá "${defaultAssetAccount}".
    - destination_name: El comercio o concepto del gasto.
    4. "deposit":
    - source_name: Fuente de ingreso (ej: "Sueldo").
    - destination_name: Cuenta de activo donde entra el dinero.
    5. "transfer":
    - Movimiento entre dos cuentas de activo propias.
    6. "installments": Cantidad de cuotas (1 por defecto).
    7. Compras en Cuotas o Tarjeta de Crédito:
    - Si el gasto menciona "cuotas" (o "installments > 1") o nombra una tarjeta de crédito (ej: "Visa", "Mastercard", "Tarjeta", "Galicia crédito"), seleccioná la cuenta de tarjeta correspondiente de la lista de "Cuentas de Activo".
    - Si no se especifica el nombre de la tarjeta pero hay cuotas, busca una cuenta de activo que contenga la palabra "Tarjeta" o "Crédito".
    8. "date":
    - Si el usuario no menciona ninguna fecha, usá la fecha de hoy ("${today}").
    - Si menciona fechas relativas (ej: "ayer", "hace 3 días", "el lunes pasado", "el 15 de este mes"), calculá y devolvé la fecha exacta en formato "YYYY-MM-DD" tomando como referencia que hoy es ${today}.`;
}

export function buildMessages({ systemPrompt, history = [], userText }) {
  return [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: userText }];
}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `node --test test/domain/confirmation.test.js test/domain/prompt.test.js`
Expected: PASS, 11 tests.

- [ ] **Step 6: Commit**

```bash
git add public/js/domain/confirmation.js public/js/domain/prompt.js test/domain/confirmation.test.js test/domain/prompt.test.js
git commit -m "refactor: extract confirmation rules and prompt builder"
```

---

### Task 5: Extract the Firefly and Groq service clients

**Files:**
- Create: `public/js/services/fireflyApi.js`
- Create: `public/js/services/groqApi.js`
- Test: `test/services/fireflyApi.test.js`
- Test: `test/services/groqApi.test.js`

**Interfaces:**
- Consumes: `authHeaders` from `domain/profiles.js`, `splitAmountIntoInstallments` and `installmentDates` from `domain/installments.js`.
- Produces:
  - `createFireflyApi({ fetchImpl, getHeaders, maxPages? }) => api`
  - `api.fetchAllPages(path) => Promise<object[]>`
  - `api.loadReferenceData() => Promise<{ assetAccounts, revenueAccounts, tags, categories }>` (arrays of strings)
  - `api.createTransaction(intent) => Promise<void>`
  - `api.balances() => Promise<Array<{ nombre, saldo, moneda }>>`
  - `api.budgets({ start, end }) => Promise<Array<{ name, spent }>>`
  - `api.recentTransactions({ end, limit? }) => Promise<Array<{ date, description, amount, type, source_name }>>`
  - `createGroqApi({ fetchImpl, getHeaders, model? }) => { interpret({ messages }) => Promise<object> }`

`getHeaders` is a zero-argument function returning the auth headers, so a profile switch takes effect without rebuilding the client.

- [ ] **Step 1: Write the failing tests**

Create `test/services/fireflyApi.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFireflyApi } from '../../public/js/services/fireflyApi.js';

function pagedFetch({ totalPages, lastPageCount = 3, seen = [] }) {
  return async (url) => {
    seen.push(url);
    const page = Number(new URL(url, 'http://x').searchParams.get('page'));
    const count = page === totalPages ? lastPageCount : 100;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: Array.from({ length: count }, (_, i) => ({ attributes: { name: `n${page}-${i}`, tag: `t${page}-${i}` } })),
        meta: { pagination: { total_pages: totalPages } }
      })
    };
  };
}

test('fetchAllPages walks every page', async () => {
  const seen = [];
  const api = createFireflyApi({ fetchImpl: pagedFetch({ totalPages: 3, seen }), getHeaders: () => ({}) });
  const items = await api.fetchAllPages('/api/firefly/tags');
  assert.equal(items.length, 203);
  assert.deepEqual(seen.map((u) => new URL(u, 'http://x').searchParams.get('page')), ['1', '2', '3']);
});

test('fetchAllPages uses ? on a bare path and & when a query exists', async () => {
  const seen = [];
  const api = createFireflyApi({ fetchImpl: pagedFetch({ totalPages: 1, seen }), getHeaders: () => ({}) });
  await api.fetchAllPages('/api/firefly/tags');
  await api.fetchAllPages('/api/firefly/accounts?type=asset');
  assert.ok(seen[0].includes('tags?limit=100'));
  assert.ok(seen[1].includes('type=asset&limit=100'));
});

test('fetchAllPages stops at the page cap', async () => {
  const seen = [];
  const api = createFireflyApi({ fetchImpl: pagedFetch({ totalPages: 999, seen }), getHeaders: () => ({}), maxPages: 5 });
  await api.fetchAllPages('/api/firefly/tags');
  assert.equal(seen.length, 5);
});

test('fetchAllPages throws a stated error on a failed response', async () => {
  const api = createFireflyApi({ fetchImpl: async () => ({ ok: false, status: 401 }), getHeaders: () => ({}) });
  await assert.rejects(() => api.fetchAllPages('/api/firefly/tags'), /401/);
});

test('createTransaction sends one entry per installment with exact amounts', async () => {
  let body = null;
  const api = createFireflyApi({
    fetchImpl: async (_url, opts) => { body = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => ({}) }; },
    getHeaders: () => ({})
  });

  await api.createTransaction({
    type: 'withdrawal', amount: 10000, installments: 3, date: '2026-01-31',
    description: 'Lavarropas', source_name: 'Visa', destination_name: 'Tienda',
    category_name: 'Hogar', tags: ['hogar']
  });

  assert.equal(body.transactions.length, 3);
  assert.deepEqual(body.transactions.map((t) => t.amount), ['3333.34', '3333.33', '3333.33']);
  assert.deepEqual(body.transactions.map((t) => t.date), ['2026-01-31', '2026-02-28', '2026-03-31']);
  assert.equal(body.transactions[0].description, 'Lavarropas (Cuota 1/3)');
  assert.equal(body.transactions[0].category_name, 'Hogar');
  assert.equal(body.group_title, 'Lavarropas (3 cuotas)');
});

test('createTransaction sends a single entry with no group title', async () => {
  let body = null;
  const api = createFireflyApi({
    fetchImpl: async (_url, opts) => { body = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => ({}) }; },
    getHeaders: () => ({})
  });

  await api.createTransaction({ type: 'withdrawal', amount: 150.5, date: '2026-03-10', description: 'Café', source_name: 'Galicia', destination_name: 'Bar', tags: [] });

  assert.equal(body.transactions.length, 1);
  assert.equal(body.transactions[0].amount, '150.50');
  assert.equal(body.transactions[0].description, 'Café');
  assert.equal(body.group_title, undefined);
});

test('createTransaction surfaces the Firefly message on failure', async () => {
  const api = createFireflyApi({
    fetchImpl: async () => ({ ok: false, status: 422, json: async () => ({ message: 'Account not found' }) }),
    getHeaders: () => ({})
  });
  await assert.rejects(
    () => api.createTransaction({ type: 'withdrawal', amount: 1, date: '2026-03-10', description: 'x', source_name: 'y', destination_name: 'z', tags: [] }),
    /Account not found/
  );
});

test('budgets passes the date range through', async () => {
  let requested = null;
  const api = createFireflyApi({
    fetchImpl: async (url) => { requested = url; return { ok: true, status: 200, json: async () => ({ data: [{ attributes: { name: 'Comida', spent: [{ sum: '-15000' }] } }] }) }; },
    getHeaders: () => ({})
  });

  const result = await api.budgets({ start: '2026-09-01', end: '2026-09-30' });
  assert.ok(requested.includes('start=2026-09-01'));
  assert.ok(requested.includes('end=2026-09-30'));
  assert.deepEqual(result, [{ name: 'Comida', spent: 15000 }]);
});

test('balances maps account attributes', async () => {
  const api = createFireflyApi({
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: [{ attributes: { name: 'Galicia', current_balance: '1234.5', currency_symbol: '$' } }], meta: { pagination: { total_pages: 1 } } }) }),
    getHeaders: () => ({})
  });
  assert.deepEqual(await api.balances(), [{ nombre: 'Galicia', saldo: 1234.5, moneda: '$' }]);
});

test('recentTransactions flattens grouped entries', async () => {
  const api = createFireflyApi({
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: [
      { attributes: { transactions: [{ date: '2026-09-19T00:00:00+00:00', description: 'Café', amount: '3000', type: 'withdrawal', source_name: 'Galicia' }] } }
    ] }) }),
    getHeaders: () => ({})
  });

  const result = await api.recentTransactions({ end: '2026-09-20' });
  assert.equal(result.length, 1);
  assert.equal(result[0].description, 'Café');
});
```

Create `test/services/groqApi.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGroqApi } from '../../public/js/services/groqApi.js';

const okResponse = (content) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) });

test('interpret returns the parsed model object', async () => {
  const api = createGroqApi({ fetchImpl: async () => okResponse('{"type":"withdrawal","amount":3000}'), getHeaders: () => ({}) });
  assert.deepEqual(await api.interpret({ messages: [] }), { type: 'withdrawal', amount: 3000 });
});

test('interpret sends the messages and requests a json object', async () => {
  let body = null;
  const api = createGroqApi({
    fetchImpl: async (_url, opts) => { body = JSON.parse(opts.body); return okResponse('{}'); },
    getHeaders: () => ({})
  });

  await api.interpret({ messages: [{ role: 'system', content: 'SYS' }, { role: 'user', content: 'hola' }] });

  assert.equal(body.messages.length, 2);
  assert.equal(body.response_format.type, 'json_object');
  assert.equal(body.temperature, 0.1);
});

test('interpret reports a non-JSON model answer instead of throwing a parse error', async () => {
  const api = createGroqApi({ fetchImpl: async () => okResponse('lo siento, no entiendo'), getHeaders: () => ({}) });
  await assert.rejects(() => api.interpret({ messages: [] }), /no devolvió un JSON/);
});

test('interpret surfaces an upstream error message', async () => {
  const api = createGroqApi({
    fetchImpl: async () => ({ ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({ error: { message: 'Invalid API Key' } }) }),
    getHeaders: () => ({})
  });
  await assert.rejects(() => api.interpret({ messages: [] }), /Invalid API Key/);
});

test('interpret tolerates an error body that is not JSON', async () => {
  const api = createGroqApi({
    fetchImpl: async () => ({ ok: false, status: 502, statusText: 'Bad Gateway', json: async () => { throw new Error('not json'); } }),
    getHeaders: () => ({})
  });
  await assert.rejects(() => api.interpret({ messages: [] }), /Bad Gateway/);
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `node --test test/services/fireflyApi.test.js test/services/groqApi.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `public/js/services/fireflyApi.js`**

```js
import { splitAmountIntoInstallments, installmentDates } from '../domain/installments.js';

const DEFAULT_MAX_PAGES = 20;

export function createFireflyApi({ fetchImpl = fetch, getHeaders, maxPages = DEFAULT_MAX_PAGES }) {
  async function request(path, options = {}) {
    return fetchImpl(path, { ...options, headers: getHeaders() });
  }

  // Firefly III devuelve 50 elementos por página; sin esto el modelo no veía
  // el resto de los datos.
  async function fetchAllPages(ruta) {
    const items = [];
    let pagina = 1;
    let totalPaginas = 1;

    do {
      const separador = ruta.includes('?') ? '&' : '?';
      const res = await request(`${ruta}${separador}limit=100&page=${pagina}`);
      if (!res.ok) throw new Error(`Error consultando ${ruta} (HTTP ${res.status}).`);

      const json = await res.json();
      items.push(...(json.data || []));

      const paginacion = json.meta && json.meta.pagination;
      totalPaginas = (paginacion && paginacion.total_pages) || 1;
      pagina++;
    } while (pagina <= totalPaginas && pagina <= maxPages);

    return items;
  }

  async function loadReferenceData() {
    const [asset, revenue, tags, categories] = await Promise.all([
      fetchAllPages('/api/firefly/accounts?type=asset'),
      fetchAllPages('/api/firefly/accounts?type=revenue'),
      fetchAllPages('/api/firefly/tags'),
      fetchAllPages('/api/firefly/categories')
    ]);

    return {
      assetAccounts: asset.map((a) => a.attributes.name),
      revenueAccounts: revenue.map((a) => a.attributes.name),
      tags: tags.map((t) => t.attributes.tag),
      categories: categories.map((c) => c.attributes.name)
    };
  }

  async function createTransaction(intent) {
    const numCuotas = intent.installments || 1;
    const montos = splitAmountIntoInstallments(intent.amount, numCuotas);
    const fechas = installmentDates(intent.date, numCuotas);

    const transactions = montos.map((amount, i) => ({
      type: intent.type,
      date: fechas[i],
      amount,
      description: numCuotas > 1 ? `${intent.description} (Cuota ${i + 1}/${numCuotas})` : intent.description,
      source_name: intent.source_name,
      destination_name: intent.destination_name,
      category_name: intent.category_name || null,
      tags: intent.tags || []
    }));

    const payload = { transactions };
    if (numCuotas > 1) {
      payload.group_title = `${intent.description} (${numCuotas} cuotas)`;
    }

    const res = await request('/api/firefly/transactions', { method: 'POST', body: JSON.stringify(payload) });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.message || 'Error al registrar en Firefly III.');
    }
  }

  async function balances() {
    const cuentas = await fetchAllPages('/api/firefly/accounts?type=asset');
    return cuentas.map((a) => ({
      nombre: a.attributes.name,
      saldo: parseFloat(a.attributes.current_balance),
      moneda: a.attributes.currency_symbol || '$'
    }));
  }

  // Firefly solo devuelve "spent" cuando se acota el rango de fechas.
  async function budgets({ start, end }) {
    const res = await request(`/api/firefly/budgets?start=${start}&end=${end}`);
    if (!res.ok) throw new Error('No se pudieron consultar los presupuestos.');

    const json = await res.json();
    return (json.data || []).map((b) => ({
      name: b.attributes.name,
      spent: b.attributes.spent ? Math.abs(parseFloat(b.attributes.spent[0]?.sum || 0)) : 0
    }));
  }

  async function recentTransactions({ end, limit = 10 }) {
    const res = await request(`/api/firefly/transactions?limit=${limit}&page=1&order=date&dir=desc&end=${end}`);
    if (!res.ok) throw new Error('No se pudieron consultar las últimas transacciones.');

    const json = await res.json();
    const salida = [];

    for (const group of json.data || []) {
      for (const tx of (group.attributes && group.attributes.transactions) || []) {
        salida.push(tx);
      }
    }

    return salida;
  }

  return { fetchAllPages, loadReferenceData, createTransaction, balances, budgets, recentTransactions };
}
```

- [ ] **Step 4: Create `public/js/services/groqApi.js`**

```js
export const DEFAULT_MODEL = 'openai/gpt-oss-120b';

export function createGroqApi({ fetchImpl = fetch, getHeaders, model = DEFAULT_MODEL }) {
  async function interpret({ messages }) {
    const res = await fetchImpl('/api/groq', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.1
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(`Groq API Error: ${errData.error?.message || res.statusText}`);
    }

    const data = await res.json();
    const contenido = data.choices?.[0]?.message?.content ?? '';

    try {
      return JSON.parse(contenido);
    } catch {
      // El modelo puede responder en prosa; eso no es una excepción de parseo
      // para el usuario, es un fallo del modelo que hay que poder contar.
      throw new Error('El modelo no devolvió un JSON válido.');
    }
  }

  return { interpret };
}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `node --test test/services/fireflyApi.test.js test/services/groqApi.test.js`
Expected: PASS, 15 tests.

- [ ] **Step 6: Commit**

```bash
git add public/js/services/fireflyApi.js public/js/services/groqApi.js test/services/fireflyApi.test.js test/services/groqApi.test.js
git commit -m "refactor: extract Firefly and Groq service clients"
```

---

### Task 6: Wire the page to the modules

This is the task that deletes the inline script. It changes no behavior; every branch it contains already exists in `public/index.html` today.

**Files:**
- Create: `public/css/app.css`
- Create: `public/js/ui/chat.js`
- Create: `public/js/ui/configModal.js`
- Create: `public/js/app.js`
- Modify: `public/index.html` (remove the inline `<style>` and `<script>`, remove every `onclick` and `style` attribute, add class names, load the module)

**Interfaces:**
- Consumes: everything produced by Tasks 2–5.
- Produces: no test-facing interface. `ui/` and `app.js` are not imported by tests.

**Two traps to respect:**
1. **Module scripts are deferred.** `app.js` runs after the document is parsed, so every `onclick="foo()"` attribute in the markup breaks — those functions are no longer globals. Each one becomes an `addEventListener` registered in `app.js`, keyed by `id`.
2. **Inline styles block the CSP in Plan 2.** Every `style="..."` attribute in the modal markup moves into `public/css/app.css` as a class, copied declaration for declaration so any visual difference is attributable to the move.

- [ ] **Step 1: Extract the stylesheet**

Move the contents of the existing `<style>` block in `public/index.html` verbatim into `public/css/app.css`. Then, for each element carrying a `style="..."` attribute, add a class to `app.css` containing those exact declarations and replace the attribute with the class. Suggested class names, matching the elements that currently carry inline styles:

`.icon-button`, `.modal-overlay`, `.modal-card`, `.modal-title`, `.field-label`, `.field-input`, `.profile-row`, `.button-primary`, `.button-actions`, `.button-confirm`, `.button-cancel`, `.button-danger`

Worked example, so the transformation is unambiguous. The current markup:

```html
<button id="btn-config" onclick="abrirModalConfig()" style="background:none; border:none; color:white; font-size:1.2rem; cursor:pointer;">⚙️</button>
```

becomes this in `public/css/app.css`:

```css
.icon-button { background: none; border: none; color: white; font-size: 1.2rem; cursor: pointer; }
```

and this in `public/index.html` (the `onclick` also goes, per Step 6):

```html
<button id="btn-config" class="icon-button">⚙️</button>
```

Every declaration is carried across unchanged. Do not tidy values while moving them: a visual difference must be attributable to the move, not to a simultaneous edit.

Replace the `<style>` block with:

```html
<link rel="stylesheet" href="/css/app.css">
```

- [ ] **Step 2: Verify the page still renders identically**

Run: `npm start`, open `http://localhost:3000`, compare against the current page.
Expected: no visual difference. The app will not be interactive yet — the inline script is still present and the styles simply moved.

- [ ] **Step 3: Create `public/js/ui/chat.js`**

```js
import { escapeHtml, formatCurrency } from '../domain/format.js';

export function createChatView({ chatElement, statusElement }) {
  // esHtml solo puede ser true para marcado que construye la app, nunca para
  // texto del usuario ni del modelo.
  function addMessage(texto, tipo = 'bot', esHtml = false) {
    const msg = document.createElement('div');
    msg.className = `message ${tipo}`;

    if (esHtml) {
      msg.innerHTML = texto;
    } else {
      msg.textContent = texto;
    }

    chatElement.appendChild(msg);
    chatElement.scrollTop = chatElement.scrollHeight;
  }

  function setStatus(texto, color) {
    statusElement.innerText = texto;
    statusElement.style.color = color;
  }

  // Los últimos mensajes como contexto. Se excluye el último elemento:
  // ya fue agregado al DOM y se envía aparte como el texto del usuario.
  function history(limit = 4) {
    return Array.from(chatElement.querySelectorAll('.message'))
      .slice(-(limit + 1), -1)
      .map((msg) => ({
        role: msg.classList.contains('user') ? 'user' : 'assistant',
        content: msg.textContent
      }));
  }

  function renderBalances(cuentas) {
    let html = '<b>💳 Saldos actuales:</b><br>';
    for (const c of cuentas) {
      html += `• <b>${escapeHtml(c.nombre)}:</b> ${escapeHtml(c.moneda)}${formatCurrency(c.saldo)}<br>`;
    }
    return html;
  }

  function renderBudgets(presupuestos) {
    let html = '<b>📊 Estado de Presupuestos:</b><br>';
    for (const b of presupuestos) {
      html += `• <b>${escapeHtml(b.name)}:</b> Gastado $${formatCurrency(b.spent)}<br>`;
    }
    return html;
  }

  function renderRecent(transacciones) {
    let html = '<b>📜 Últimos movimientos reales:</b><br>';
    for (const tx of transacciones) {
      const signo = tx.type === 'withdrawal' ? '-' : '+';
      const fecha = tx.date ? tx.date.split('T')[0] : '';
      html += `• <i>${escapeHtml(fecha)}</i> | <b>${escapeHtml(tx.description)}</b>: ${signo}$${formatCurrency(tx.amount)} (${escapeHtml(tx.source_name)})<br>`;
    }
    return html;
  }

  function renderTransactionResult(intent, montos) {
    const metaInfo = [];
    if (intent.category_name) metaInfo.push(`📁 Categoría: <b>${escapeHtml(intent.category_name)}</b>`);
    if (intent.tags && intent.tags.length > 0) {
      metaInfo.push(`🏷️ Tags: ${intent.tags.map((t) => `#${escapeHtml(t)}`).join(', ')}`);
    }

    const extraHtml = metaInfo.length > 0 ? `<br><small>${metaInfo.join(' | ')}</small>` : '';
    const numCuotas = montos.length;

    if (intent.type === 'transfer') {
      return `✅ Transferencia de <b>$${escapeHtml(intent.amount)}</b> de <i>${escapeHtml(intent.source_name)}</i> a <i>${escapeHtml(intent.destination_name)}</i>.${extraHtml}`;
    }

    return numCuotas > 1
      ? `✅ Registradas <b>${numCuotas} cuotas</b> de $${montos[0]} en <i>${escapeHtml(intent.source_name)}</i> para "${escapeHtml(intent.description)}".${extraHtml}`
      : `✅ Registrado gasto de <b>$${escapeHtml(intent.amount)}</b> en <i>${escapeHtml(intent.source_name)}</i> para "${escapeHtml(intent.description)}".${extraHtml}`;
  }

  return { addMessage, setStatus, history, renderBalances, renderBudgets, renderRecent, renderTransactionResult };
}
```

- [ ] **Step 4: Create `public/js/ui/configModal.js`**

```js
import { activeProfile, upsertProfile, removeProfile } from '../domain/profiles.js';

export function createConfigModal({ store, onSaved }) {
  const overlay = document.getElementById('modal-config');
  const select = document.getElementById('cfg-profile-select');
  const nameInput = document.getElementById('cfg-profile-name');
  const urlInput = document.getElementById('cfg-firefly-url');
  const tokenInput = document.getElementById('cfg-firefly-token');
  const groqInput = document.getElementById('cfg-groq-key');

  function fillForm() {
    const state = store.read();
    const profile = state.profiles[select.value] || {};
    nameInput.value = profile.name || '';
    urlInput.value = profile.fireflyUrl || '';
    tokenInput.value = profile.fireflyToken || '';
    groqInput.value = profile.groqKey || '';
  }

  function renderSelector() {
    const state = store.read();
    select.innerHTML = '';

    for (const id of Object.keys(state.profiles)) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = state.profiles[id].name || id;
      if (id === state.activeProfileId) opt.selected = true;
      select.appendChild(opt);
    }

    fillForm();
  }

  function open() {
    overlay.style.display = 'flex';
    renderSelector();
  }

  function close() {
    overlay.style.display = 'none';
  }

  function createDraft() {
    const newId = `profile_${Date.now()}`;
    const opt = document.createElement('option');
    opt.value = newId;
    opt.textContent = 'Nuevo Perfil';
    opt.selected = true;
    select.appendChild(opt);

    nameInput.value = 'Nuevo Perfil';
    urlInput.value = '';
    tokenInput.value = '';
    groqInput.value = '';
  }

  function save() {
    const id = select.value || `profile_${Date.now()}`;
    const profile = {
      name: nameInput.value.trim() || 'Sin nombre',
      fireflyUrl: urlInput.value.trim(),
      fireflyToken: tokenInput.value.trim(),
      groqKey: groqInput.value.trim()
    };

    store.write(upsertProfile(store.read(), id, profile));
    close();
    alert(`✅ Perfil "${profile.name}" activado y guardado.`);
    onSaved();
  }

  function removeCurrent() {
    const state = store.read();
    const id = select.value;

    if (Object.keys(state.profiles).length <= 1) {
      alert('❌ Debe existir al menos un perfil.');
      return;
    }

    if (!confirm(`¿Seguro que querés eliminar el perfil "${state.profiles[id].name}"?`)) return;

    store.write(removeProfile(state, id));
    renderSelector();
    alert('🗑️ Perfil eliminado.');
  }

  select.addEventListener('change', fillForm);
  document.getElementById('btn-config').addEventListener('click', open);
  document.getElementById('btn-profile-new').addEventListener('click', createDraft);
  document.getElementById('btn-config-save').addEventListener('click', save);
  document.getElementById('btn-config-cancel').addEventListener('click', close);
  document.getElementById('btn-profile-delete').addEventListener('click', removeCurrent);

  return { open, close, isConfigured: () => {
    const profile = activeProfile(store.read());
    return Boolean(profile.fireflyUrl && profile.fireflyToken);
  } };
}
```

- [ ] **Step 5: Create `public/js/app.js`**

```js
import { toIsoDate } from './domain/format.js';
import { activeProfile, authHeaders } from './domain/profiles.js';
import { nextAction } from './domain/confirmation.js';
import { buildSystemPrompt, buildMessages } from './domain/prompt.js';
import { splitAmountIntoInstallments } from './domain/installments.js';
import { createProfileStore } from './services/profileStore.js';
import { createFireflyApi } from './services/fireflyApi.js';
import { createGroqApi } from './services/groqApi.js';
import { createChatView } from './ui/chat.js';
import { createConfigModal } from './ui/configModal.js';

const store = createProfileStore({ storage: window.localStorage });
const getHeaders = () => authHeaders(activeProfile(store.read()));

const firefly = createFireflyApi({ getHeaders });
const groq = createGroqApi({ getHeaders });

const chat = createChatView({
  chatElement: document.getElementById('chat'),
  statusElement: document.getElementById('status-text')
});

const inputMessage = document.getElementById('inputMessage');
const sendBtn = document.getElementById('sendBtn');

let reference = { assetAccounts: [], revenueAccounts: [], tags: [], categories: [] };
let defaultAssetAccount = '';
let pendingIntent = null;

const modal = createConfigModal({ store, onSaved: loadReferenceData });

async function loadReferenceData() {
  try {
    reference = await firefly.loadReferenceData();
    defaultAssetAccount = reference.assetAccounts[0] || '';

    chat.setStatus(
      `Sincronizado (${reference.assetAccounts.length} cuentas / ${reference.categories.length} cat / ${reference.tags.length} tags)`,
      '#4ade80'
    );
  } catch (err) {
    console.error(err);

    // Sin URL ni token el fallo es esperable: guiar en vez de mostrar un error
    if (!modal.isConfigured()) {
      chat.setStatus('Configurá tu Firefly III para empezar', '#facc15');
      chat.addMessage('Todavía no hay un perfil configurado. Abrí ⚙️ y cargá la URL y el token de Firefly III.', 'bot');
      modal.open();
      return;
    }

    chat.setStatus('❌ Error al sincronizar datos.', '#f87171');
  }
}

async function handleQuery(intent) {
  const hoy = toIsoDate(new Date());

  if (intent.query_type === 'balance') {
    let cuentas = await firefly.balances();
    if (intent.source_name) {
      cuentas = cuentas.filter((c) => c.nombre.toLowerCase().includes(intent.source_name.toLowerCase()));
    }
    if (cuentas.length === 0) return '📉 No encontré información para esa cuenta.';
    return chat.renderBalances(cuentas);
  }

  if (intent.query_type === 'budget') {
    const ahora = new Date();
    const inicioMes = toIsoDate(new Date(ahora.getFullYear(), ahora.getMonth(), 1));
    const finMes = toIsoDate(new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0));

    const presupuestos = await firefly.budgets({ start: inicioMes, end: finMes });
    if (presupuestos.length === 0) return '📊 No tenés presupuestos activos configurados.';
    return chat.renderBudgets(presupuestos);
  }

  if (intent.query_type === 'recent_transactions') {
    const transacciones = await firefly.recentTransactions({ end: hoy });
    if (transacciones.length === 0) return '📑 No hay transacciones registradas hasta la fecha.';
    return chat.renderRecent(transacciones.slice(0, 5));
  }

  return '❓ No pude interpretar qué consulta querés realizar.';
}

async function submitIntent(intent) {
  await firefly.createTransaction(intent);
  const montos = splitAmountIntoInstallments(intent.amount, intent.installments || 1);
  return chat.renderTransactionResult(intent, montos);
}

async function processUserMessage(texto) {
  const accion = nextAction(pendingIntent, texto);

  if (accion === 'confirm') {
    chat.addMessage('⏳ Registrando transacción en Firefly III...', 'bot');
    const resultado = await submitIntent(pendingIntent);
    pendingIntent = null;
    chat.addMessage(resultado, 'bot', true);
    return;
  }

  if (accion === 'cancel') {
    pendingIntent = null;
    chat.addMessage('🚫 Operación cancelada. Podés indicarme la corrección.', 'bot');
    return;
  }

  const systemPrompt = buildSystemPrompt({
    today: toIsoDate(new Date()),
    assetAccounts: reference.assetAccounts,
    revenueAccounts: reference.revenueAccounts,
    categories: reference.categories,
    tags: reference.tags,
    defaultAssetAccount
  });

  const intent = await groq.interpret({
    messages: buildMessages({ systemPrompt, history: chat.history(4), userText: texto })
  });

  if (intent.requiere_confirmacion) {
    pendingIntent = intent;
    chat.addMessage(intent.mensaje_confirmacion, 'bot');
    return;
  }

  if (intent.type === 'query') {
    chat.addMessage(await handleQuery(intent), 'bot', true);
    return;
  }

  chat.addMessage(await submitIntent(intent), 'bot', true);
}

async function sendMessage() {
  const texto = inputMessage.value.trim();
  if (!texto) return;

  chat.addMessage(texto, 'user');
  inputMessage.value = '';
  sendBtn.disabled = true;

  try {
    await processUserMessage(texto);
  } catch (err) {
    chat.addMessage(`❌ Error: ${err.message}`, 'bot error');
  } finally {
    sendBtn.disabled = false;
  }
}

sendBtn.addEventListener('click', sendMessage);
inputMessage.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

loadReferenceData();
```

- [ ] **Step 6: Rewrite `public/index.html`**

Apply these transformations. The markup itself is unchanged apart from attributes:

1. Delete the whole `<script>...</script>` block.
2. Add `<script type="module" src="/js/app.js"></script>` immediately before `</body>`.
3. Remove every `onclick="..."` attribute and give the element an `id` the modules already expect: `btn-config`, `btn-profile-new`, `btn-config-save`, `btn-config-cancel`, `btn-profile-delete`. `sendBtn` and `cfg-profile-select` already have theirs.
4. Remove every `style="..."` attribute, replacing it with the class introduced in Step 1.

- [ ] **Step 7: Verify the application end to end**

Run: `npm start` and exercise every path against a real Firefly instance, or a stub:
- the page loads with no console error
- with no profile configured, the modal opens and the status is amber
- saving a profile triggers a resync and the status turns green
- a spend message produces a confirmation, and `si` registers it
- `no` cancels
- a balance query, a budget query and a recent-movements query each render

Expected: behavior identical to the pre-refactor app.

- [ ] **Step 8: Run the whole suite one final time**

Run: `npm test`
Expected: PASS, every test from Tasks 1–5.

- [ ] **Step 9: Commit**

```bash
git add public/index.html public/css public/js
git commit -m "refactor: wire the page to extracted modules and delete the inline script"
```

---

## Done when

- `npm test` passes with no dependencies installed beyond `express` and `dotenv`.
- `public/index.html` contains no `<script>` body, no `<style>` body, no `onclick` and no `style` attribute.
- `node server.js` boots and serves the app exactly as before.
- Application behavior is unchanged.

## What comes next

Plan 2 covers requirements R1–R9 from the spec: model output validation, the structured confirmation card, timeout and abort, recoverable errors, accessibility, the PWA shell, transcript persistence, the Content Security Policy, and the truth pass on the README. It gets written against the interfaces this plan actually produces rather than predicted ones.
