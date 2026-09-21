import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createFireflyApi, FIREFLY_TIMEOUT_MS } from '../../public/js/services/fireflyApi.js';

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

test('createTransaction defaults to today when the model omits date', async () => {
  let body = null;
  const api = createFireflyApi({
    fetchImpl: async (_url, opts) => { body = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => ({}) }; },
    getHeaders: () => ({}),
    now: () => new Date(2026, 8, 21) // 21 de septiembre de 2026, reloj inyectado
  });

  await api.createTransaction({ type: 'withdrawal', amount: 100, description: 'Sin fecha', source_name: 'Galicia', destination_name: 'Bar', tags: [] });

  assert.equal(body.transactions[0].date, '2026-09-21');
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

test('balances sends the injected headers on the request', async () => {
  let headers = null;
  const api = createFireflyApi({
    fetchImpl: async (_url, opts) => {
      headers = opts.headers;
      return { ok: true, status: 200, json: async () => ({ data: [], meta: { pagination: { total_pages: 1 } } }) };
    },
    getHeaders: () => ({ 'x-firefly-token': 'secret-token' })
  });

  await api.balances();

  assert.deepEqual(headers, { 'x-firefly-token': 'secret-token' });
});

test('createTransaction sends the injected headers on the request', async () => {
  let headers = null;
  const api = createFireflyApi({
    fetchImpl: async (_url, opts) => {
      headers = opts.headers;
      return { ok: true, status: 200, json: async () => ({}) };
    },
    getHeaders: () => ({ 'x-firefly-token': 'secret-token' })
  });

  await api.createTransaction({ type: 'withdrawal', amount: 1, date: '2026-03-10', description: 'x', source_name: 'y', destination_name: 'z', tags: [] });

  assert.deepEqual(headers, { 'x-firefly-token': 'secret-token' });
});

test('FIREFLY_TIMEOUT_MS is exported and defaults to 15000', () => {
  assert.equal(FIREFLY_TIMEOUT_MS, 15000);
});

test('every outbound request carries an AbortSignal', async () => {
  let signal = null;
  const api = createFireflyApi({
    fetchImpl: async (_url, opts) => {
      signal = opts.signal;
      return { ok: true, status: 200, json: async () => ({ data: [], meta: { pagination: { total_pages: 1 } } }) };
    },
    getHeaders: () => ({})
  });

  await api.balances();

  assert.ok(signal instanceof AbortSignal);
});

// No hay que esperar el timeout real: se espía la construcción de la señal
// y se verifica con qué valor se llamó.
test('a custom timeoutMs reaches the signal construction', async (t) => {
  const original = AbortSignal.timeout;
  let capturedMs = null;
  t.mock.method(AbortSignal, 'timeout', (ms) => {
    capturedMs = ms;
    return original(ms);
  });

  const api = createFireflyApi({
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ data: [], meta: { pagination: { total_pages: 1 } } }) }),
    getHeaders: () => ({}),
    timeoutMs: 5
  });

  await api.balances();

  assert.equal(capturedMs, 5);
});

// Fix round 1: un fetchImpl fabricado con name = 'AbortError' pasaba aunque
// el guard estuviera mal, porque nada disparaba jamás un timeout real. Esto
// cubre igual el caso de un abort manual (AbortController().abort()), que sí
// rechaza con ese nombre y que el guard también tiene que seguir traduciendo.
test('a manually aborted request surfaces a timeout message instead of AbortError', async () => {
  const abortError = new Error('The operation was aborted');
  abortError.name = 'AbortError';

  const api = createFireflyApi({
    fetchImpl: async () => { throw abortError; },
    getHeaders: () => ({})
  });

  await assert.rejects(() => api.balances(), (err) => {
    assert.match(err.message, /tiempo de espera/);
    assert.doesNotMatch(err.message, /AbortError/);
    return true;
  });
});

// El caso real: AbortSignal.timeout() rechaza con name 'TimeoutError', no
// 'AbortError' (verificado contra un servidor colgado de verdad antes de
// escribir este test). fetchImpl acá es el fetch real -- respeta la señal
// de verdad -- apuntado a un servidor que nunca contesta, con un timeoutMs
// de milisegundos en vez de los 15000 reales: discrimina el bug (un guard
// que solo mira 'AbortError' lo deja pasar como DOMException crudo) sin
// esperar más que unos milisegundos.
test('a genuinely stalled request times out and surfaces a readable message', async () => {
  const server = http.createServer(() => {}); // nunca responde
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const api = createFireflyApi({
    fetchImpl: (path, opts) => fetch(`http://127.0.0.1:${port}${path}`, opts),
    getHeaders: () => ({}),
    timeoutMs: 30
  });

  try {
    await assert.rejects(() => api.balances(), (err) => {
      assert.equal(err.constructor.name, 'Error');
      assert.match(err.message, /tiempo de espera/);
      assert.doesNotMatch(err.message, /AbortError/);
      assert.doesNotMatch(err.message, /TimeoutError/);
      return true;
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('a normal successful call still succeeds with the timeout signal attached', async () => {
  const api = createFireflyApi({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ attributes: { name: 'Galicia', current_balance: '10', currency_symbol: '$' } }], meta: { pagination: { total_pages: 1 } } })
    }),
    getHeaders: () => ({})
  });

  assert.deepEqual(await api.balances(), [{ nombre: 'Galicia', saldo: 10, moneda: '$' }]);
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
