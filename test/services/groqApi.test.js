import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createGroqApi, DEFAULT_MODEL, GROQ_TIMEOUT_MS } from '../../public/js/services/groqApi.js';

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
  assert.equal(body.model, DEFAULT_MODEL);
  assert.equal(body.response_format.type, 'json_object');
  assert.equal(body.temperature, 0.1);
});

test('interpret sends the injected headers on the request', async () => {
  let headers = null;
  const api = createGroqApi({
    fetchImpl: async (_url, opts) => { headers = opts.headers; return okResponse('{}'); },
    getHeaders: () => ({ 'x-groq-key': 'secret-key' })
  });

  await api.interpret({ messages: [] });

  assert.deepEqual(headers, { 'x-groq-key': 'secret-key' });
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

test('GROQ_TIMEOUT_MS is exported and defaults to 20000', () => {
  assert.equal(GROQ_TIMEOUT_MS, 20000);
});

test('interpret sends an AbortSignal', async () => {
  let signal = null;
  const api = createGroqApi({
    fetchImpl: async (_url, opts) => { signal = opts.signal; return okResponse('{}'); },
    getHeaders: () => ({})
  });

  await api.interpret({ messages: [] });

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

  const api = createGroqApi({ fetchImpl: async () => okResponse('{}'), getHeaders: () => ({}), timeoutMs: 7 });

  await api.interpret({ messages: [] });

  assert.equal(capturedMs, 7);
});

// Fix round 1: un fetchImpl fabricado con name = 'AbortError' pasaba aunque
// el guard estuviera mal, porque nada disparaba jamás un timeout real. Esto
// cubre igual el caso de un abort manual (AbortController().abort()), que sí
// rechaza con ese nombre y que el guard también tiene que seguir traduciendo.
test('a manually aborted request surfaces a timeout message instead of AbortError', async () => {
  const abortError = new Error('The operation was aborted');
  abortError.name = 'AbortError';

  const api = createGroqApi({
    fetchImpl: async () => { throw abortError; },
    getHeaders: () => ({})
  });

  await assert.rejects(() => api.interpret({ messages: [] }), (err) => {
    assert.match(err.message, /tiempo de espera/);
    assert.doesNotMatch(err.message, /AbortError/);
    return true;
  });
});

// El caso real: AbortSignal.timeout() rechaza con name 'TimeoutError', no
// 'AbortError' (verificado contra un servidor colgado de verdad antes de
// escribir este test). fetchImpl acá es el fetch real -- respeta la señal
// de verdad -- apuntado a un servidor que nunca contesta, con un timeoutMs
// de milisegundos en vez de los 20000 reales: discrimina el bug sin esperar
// más que unos milisegundos.
test('a genuinely stalled request times out and surfaces a readable message', async () => {
  const server = http.createServer(() => {}); // nunca responde
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const api = createGroqApi({
    fetchImpl: (path, opts) => fetch(`http://127.0.0.1:${port}${path}`, opts),
    getHeaders: () => ({}),
    timeoutMs: 30
  });

  try {
    await assert.rejects(() => api.interpret({ messages: [] }), (err) => {
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

test('interpret still succeeds normally with the timeout signal attached', async () => {
  const api = createGroqApi({ fetchImpl: async () => okResponse('{"type":"withdrawal"}'), getHeaders: () => ({}) });
  assert.deepEqual(await api.interpret({ messages: [] }), { type: 'withdrawal' });
});
