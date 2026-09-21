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
