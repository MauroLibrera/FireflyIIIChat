import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldCache, APP_SHELL } from '../../public/js/domain/cacheRules.js';

// La regla que no puede romperse: nada bajo /api/ es cacheable. Un saldo o
// una lista de transacciones servidos desde la caché es un número
// equivocado mostrado como si fuera verdad. Estos casos van primero.

test('a Firefly balances/transactions endpoint under /api/firefly is never cacheable', () => {
  assert.equal(shouldCache('/api/firefly/accounts'), false);
});

test('the Groq LLM endpoint under /api/ is never cacheable', () => {
  assert.equal(shouldCache('/api/groq'), false);
});

test('any other path under /api/ is never cacheable', () => {
  assert.equal(shouldCache('/api/anything'), false);
});

// Fix round 1: shouldCache no puede depender de propiedades incidentales de
// otros archivos (la regex case-sensitive del proxy, el guard response.ok
// del worker) para que /api/ en otra forma quede afuera. Tiene que resolverlo
// sola, a partir únicamente de su propio input.

test('an uppercase /API/ variant is never cacheable', () => {
  assert.equal(shouldCache('/API/firefly/accounts'), false);
});

test('a mixed-case /Api/ variant is never cacheable', () => {
  assert.equal(shouldCache('/Api/Groq'), false);
});

test('a full URL whose pathname is under /api/ is never cacheable', () => {
  assert.equal(shouldCache('https://host/api/groq'), false);
});

test('an empty string is never cacheable', () => {
  assert.equal(shouldCache(''), false);
});

// Control en minúscula: el camino feliz sigue anclado después del fix de
// normalización, tanto para un pathname suelto como para una URL completa.
test('a lowercase /api/ path stays never-cacheable (control)', () => {
  assert.equal(shouldCache('/api/groq'), false);
});

test('a full URL whose pathname is not under /api/ is cacheable (control)', () => {
  assert.equal(shouldCache('https://host/index.html'), true);
});

// Casos felices: lo que compone el shell de la app (y otros estáticos que
// no son /api/) sí es cacheable.

test('the root path is cacheable', () => {
  assert.equal(shouldCache('/'), true);
});

test('index.html is cacheable', () => {
  assert.equal(shouldCache('/index.html'), true);
});

test('the app stylesheet is cacheable', () => {
  assert.equal(shouldCache('/css/app.css'), true);
});

test('the app entry module is cacheable', () => {
  assert.equal(shouldCache('/js/app.js'), true);
});

test('the web app manifest is cacheable', () => {
  assert.equal(shouldCache('/manifest.json'), true);
});

// APP_SHELL: la lista explícita que se precachea en install. Nada de glob:
// si un módulo nuevo no se agrega acá a mano, no queda offline.

test('APP_SHELL is a non-empty array of explicit paths', () => {
  assert.ok(Array.isArray(APP_SHELL));
  assert.ok(APP_SHELL.length > 0);
});

test('APP_SHELL includes the document and stylesheet entry points', () => {
  assert.ok(APP_SHELL.includes('/'));
  assert.ok(APP_SHELL.includes('/index.html'));
  assert.ok(APP_SHELL.includes('/css/app.css'));
});

test('APP_SHELL includes the app entry module', () => {
  assert.ok(APP_SHELL.includes('/js/app.js'));
});

test('every path listed in APP_SHELL is itself cacheable under shouldCache', () => {
  for (const path of APP_SHELL) {
    assert.equal(shouldCache(path), true, `expected ${path} to be cacheable`);
  }
});

test('APP_SHELL contains no path under /api/', () => {
  assert.ok(APP_SHELL.every((path) => !path.startsWith('/api/')));
});
