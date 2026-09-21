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
