# Firefly Chat Hardening Implementation Plan (Plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the app acting on unvalidated model output, show the user every field before it is written, survive a hung upstream without losing work, become installable, remember the conversation, and confine the page with a Content Security Policy.

**Architecture:** Every new decision lands in `public/js/domain/` as a pure function with tests; `services/` gains abort handling behind its existing injected `fetchImpl`; `ui/` gains rendering only; `app.js` re-wires the confirmation flow around a validated intent instead of the model's prose. The server gains one middleware.

**Tech Stack:** Node 20+, Express 4, `node:test`, `node:assert/strict`, `node:zlib` for icon generation. No new dependencies, no build step.

**Spec:** `docs/superpowers/specs/2026-09-20-firefly-chat-modularization-design.md`

## Scope

Implements **R1, R2, R3, R4, R6, R7, R8**.

**R5 (accessibility) and R9 (truth pass) are out of scope by the owner's decision.** Do not implement them, and do not partially implement them while nearby. One consequence to leave alone deliberately: R6 makes the README's "PWA" claim true, but its "Tailwind CSS" claim stays false because R9 is out. Leave the README alone.

## A deliberate departure from the previous plan

Plan 1 embedded complete code and a pre-written RED/GREEN script into every task. That bought reliable transcription on cheap models — and cost the design pressure that writing a test before the implementation exists is *for*. It was the right trade for a refactor where the design already existed. It is the wrong trade here, because R1–R8 are new behaviour and the tests should shape the interfaces.

So this plan gives you, per task: the **exact signature**, the **acceptance criteria**, and a **table of concrete input/output cases your tests must cover**. It does not give you the test bodies or the implementation. Write the failing test yourself, watch it fail, then make it pass.

The cases in the tables are a floor, not a ceiling. If you see a case the table missed, add it and say so in your report.

## Global Constraints

- **Zero new dependencies.** `package.json` keeps exactly `express` and `dotenv`. No devDependencies. Tests use built-in `node:test` and `node:assert/strict`.
- **The dependency rule.** `domain/` imports only from `domain/` — no `fetch`, no `document`, no `window`, no `localStorage`, no clock reads. Time and randomness arrive as arguments. `services/` may import `domain/`; every side effect arrives through an injected dependency. `ui/` may import `domain/`, never `services/`. Only `app.js` wires the layers. **`domain/` and `services/` must run under plain Node with no DOM.**
- **Comments in Spanish**, matching the codebase. Test names in English.
- **Test commands never take a directory argument.** On Node 24 a positional directory makes the runner try to load the directory itself and report `pass 0, fail 1`. Use explicit file paths for focused runs, and bare `node --test` or `npm test` for the whole suite.
- **The suite starts at 103 passing.** It must never go down. If an existing test has to change, that is a deliberate act you justify in your report.
- **No `Co-Authored-By` or AI attribution in commits.** The repository owner forbids it.
- Heredocs in this shell truncate past ~110 lines; use a file-writing tool for anything longer. `ripgrep` is not installed; plain `grep` works.

## Interfaces that already exist

You are building on Plan 1. These are real and verified — do not redefine them.

| Module | Exports |
|---|---|
| `domain/format.js` | `escapeHtml(v)`, `formatCurrency(v, locale?)`, `formatNumber(v, locale?)`, `toIsoDate(date)` |
| `domain/installments.js` | `splitAmountIntoInstallments(monto, cantidad)`, `installmentDates(isoStr, cantidad)` |
| `domain/confirmation.js` | `isAffirmative(t)`, `isNegative(t)`, `nextAction(pendingIntent, t)` → `'confirm' \| 'cancel' \| 'interpret'` |
| `domain/messages.js` | `renderBalances`, `renderBudgets`, `renderRecent`, `renderTransactionResult(intent, montos)` |
| `domain/profiles.js` | `PROFILES_STORAGE_KEY`, `initialProfilesState()`, `normalizeProfilesState(raw)`, `activeProfile(s)`, `upsertProfile(s,id,p)`, `removeProfile(s,id)`, `authHeaders(p)` |
| `domain/prompt.js` | `buildSystemPrompt({today, assetAccounts, revenueAccounts, categories, tags, defaultAssetAccount})`, `buildMessages({systemPrompt, history, userText})` |
| `services/fireflyApi.js` | `createFireflyApi({fetchImpl, getHeaders, maxPages, now})` → `{fetchAllPages, loadReferenceData, createTransaction, balances, budgets, recentTransactions}` |
| `services/groqApi.js` | `DEFAULT_MODEL`, `createGroqApi({fetchImpl, getHeaders, model})` → `{interpret({messages})}` |
| `services/profileStore.js` | `createProfileStore({storage, key})` → `{read(), write(state)}` |
| `ui/chat.js` | `createChatView({chatElement, statusElement})` → `{addMessage(texto, tipo, esHtml), setStatus(t, color), history(limit), renderBalances, renderBudgets, renderRecent, renderTransactionResult}` |
| `server/app.js` | `createApp({env, fetchImpl, publicDir})` |

`app.js` holds `pendingIntent`, and `processUserMessage(texto)` routes on `nextAction(pendingIntent, texto)`.

---

### Task 1: Validate model output before acting (R1)

The model returns well-formed JSON describing something that may not exist. Today a hallucinated account name becomes a Firefly 422 the user cannot interpret, and a `date` the model invents is never checked.

**Files:**
- Create: `public/js/domain/intent.js`
- Test: `test/domain/intent.test.js`
- Modify: `public/js/app.js` (validate before acting on an interpreted intent)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `validateIntent(raw, context) => { ok: true, intent } | { ok: false, reason, field }`
  - `context` is `{ assetAccounts: string[], revenueAccounts: string[], categories: string[], today: string }`
  - `intent` on success is `raw` with `date` defaulted and `installments` normalized to an integer ≥ 1.
  - `reason` is a Spanish sentence the user reads. `field` is the offending key.

**Rules:**
- `type` must be one of `withdrawal`, `deposit`, `transfer`, `query`.
- `amount` must be a finite number greater than zero — **except** when `type` is `query`, where it is ignored.
- `date`, when present, must match `YYYY-MM-DD` **and** be a real calendar date. When absent, default to `context.today`.
- `installments`, when present, must be an integer ≥ 1.
- For `withdrawal`, `source_name` must match a `context.assetAccounts` entry, case-insensitively and whitespace-trimmed.
- For `deposit`, `destination_name` must match an `assetAccounts` entry the same way.
- When an account does not match, `reason` names the closest candidate: the first synced account that contains the supplied string, or that the supplied string contains, compared case-insensitively. If neither holds for any account, offer no suggestion rather than a guess.
- **A numeric string is coerced, not rejected.** `"3000"` becomes `3000`. `response_format: json_object` guarantees valid JSON, not correct types, and rejecting an amount the user plainly meant is worse than accepting it. `Number(raw.amount)` must still be finite and greater than zero after coercion, so `"abc"` and `""` are still rejected.

**Cases your tests must cover:**

| Input | Expected |
|---|---|
| valid withdrawal, account `"galicia"`, synced `["Galicia"]` | `ok: true`, matched case-insensitively |
| `type: "sarasa"` | `ok: false`, `field: 'type'` |
| `amount: 0` on a withdrawal | `ok: false`, `field: 'amount'` |
| `amount: -50` | `ok: false`, `field: 'amount'` |
| `amount: "3000"` (string) | `ok: true`, `intent.amount === 3000` — coerce, see below |
| `amount` absent, `type: "query"` | `ok: true` |
| `date: "2026-02-30"` | `ok: false`, `field: 'date'` |
| `date: "31-01-2026"` | `ok: false`, `field: 'date'` |
| `date` absent | `ok: true`, `intent.date === context.today` |
| `installments: 2.5` | `ok: false`, `field: 'installments'` |
| `installments` absent | `ok: true`, `intent.installments === 1` |
| withdrawal, `source_name: "Galiciaa"`, synced `["Galicia"]` | `ok: false`, `reason` mentions `Galicia` |
| withdrawal, `source_name: "Banco Nación"`, synced `["Galicia"]` | `ok: false`, no suggestion invented |
| deposit, `destination_name` not in assets | `ok: false`, `field: 'destination_name'` |
| `raw` is `null` / a string / an array | `ok: false`, never throws |

- [ ] **Step 1: Write the failing tests** for every row above in `test/domain/intent.test.js`. Import only from `../../public/js/domain/intent.js`.
- [ ] **Step 2: Run them and watch them fail** — `node --test test/domain/intent.test.js`. Expect `ERR_MODULE_NOT_FOUND`. Paste the real output into your report.
- [ ] **Step 3: Implement `domain/intent.js`** to make them pass. Pure: no clock read, `today` arrives in `context`.
- [ ] **Step 4: Run them and watch them pass.**
- [ ] **Step 5: Wire it into `app.js`.** After `groq.interpret(...)` returns and before anything acts on the result, validate it. On `ok: false`, post `reason` to the chat with `addMessage(..., 'bot error')` and **return without calling Firefly and without setting `pendingIntent`**. On `ok: true`, continue with the validated `intent`.
- [ ] **Step 6: Run the whole suite** — `npm test`. State the new total.
- [ ] **Step 7: Commit.** Subject: `feat: validate model output before it reaches Firefly`.

**Acceptance:** a hallucinated account name never reaches Firefly, and a transaction with no `date` is dated today by the validator rather than by the service.

---

### Task 2: Structured confirmation card (R2)

Today the user confirms against a sentence the model wrote about itself. They should confirm against the fields the app is actually about to send.

**Files:**
- Modify: `public/js/domain/messages.js` (add the card renderer)
- Test: `test/domain/messages.test.js` (extend)
- Modify: `public/js/ui/chat.js` (render a card with working controls)
- Modify: `public/js/app.js` (route the controls)

**Interfaces:**
- Consumes: `validateIntent` from Task 1 — the card renders a **validated** intent, never raw model output.
- Produces:
  - `renderConfirmationCard(intent, montos)` in `domain/messages.js` → HTML string. `montos` is the output of `splitAmountIntoInstallments`.
  - `addConfirmationCard(html, { onConfirm, onCancel })` on the object `createChatView` returns.

**Rules:**
- The card shows, as labelled fields: type, amount, source, destination, category, date, and installments. Omit a row whose value is empty rather than printing `undefined`.
- When `installments > 1`, show the per-installment amount and the count.
- **Every interpolated value is escaped** with `escapeHtml`. The existing four renderers are the pattern; match them.
- Typing `sí`/`no` must keep working exactly as now. The buttons are an addition, not a replacement.
- After either control is used, the card's buttons must not fire again. Disable them.

**Cases your tests must cover** (`renderConfirmationCard` is pure — test it directly):

| Input | Expected |
|---|---|
| single-installment withdrawal, all fields present | every field appears, correctly labelled |
| `category_name: ''` | no category row, and no `undefined` anywhere in the output |
| `installments: 3`, `montos: ['3333.34','3333.33','3333.33']` | shows the count and the per-installment amount |
| `description: '<img src=x onerror=alert(1)>'` | escaped, no raw `<img` in the output |
| `source_name` with an ampersand | escaped as `&amp;` |
| transfer type | source and destination both shown |

- [ ] **Step 1: Write the failing tests** for `renderConfirmationCard`.
- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Implement `renderConfirmationCard`.**
- [ ] **Step 4: Run and watch them pass.**
- [ ] **Step 5: Add `addConfirmationCard` to `ui/chat.js`.** It appends the card, then finds its two buttons and attaches the callbacks. `ui/` holds no logic: the decision of *what* to render stays in `domain/messages.js`, and this function only wires DOM.
- [ ] **Step 6: Re-route `app.js`.** Where it currently posts `intent.mensaje_confirmacion` as a plain message, post the card instead, with `onConfirm` and `onCancel` calling the same code paths that `nextAction` returning `'confirm'` and `'cancel'` already reach. Extract those two paths into named functions so the typed route and the clicked route cannot drift apart.
- [ ] **Step 7: Add the card's CSS** to `public/css/app.css` as classes. **No inline `style=` attributes** — Task 7's Content Security Policy forbids them, and one attribute makes that policy decorative.
- [ ] **Step 8: Run the whole suite.**
- [ ] **Step 9: Commit.** Subject: `feat: confirm transactions against a structured card`.

**Acceptance:** every field the app is about to send is visible before it is sent, and clicking Confirm does exactly what typing `sí` does.

---

### Task 3: Timeout, abort, and recoverable errors (R3 client half, R4)

`fetch` has no default timeout. The server proxies already abort their own upstream calls — that landed with the security fixes — but the browser's call to the proxy does not, so a hung proxy hangs the page. And when a submit fails, the parsed intent is thrown away and the user retypes their sentence.

**Files:**
- Modify: `public/js/services/fireflyApi.js`, `public/js/services/groqApi.js`
- Test: `test/services/fireflyApi.test.js`, `test/services/groqApi.test.js` (extend)
- Modify: `public/js/app.js`

**Interfaces:**
- Produces: `FIREFLY_TIMEOUT_MS = 15000` exported from `fireflyApi.js`; `GROQ_TIMEOUT_MS = 20000` exported from `groqApi.js`. Both factories accept a `timeoutMs` override so a test can use a small value.
- Consumes: Task 1's validated intent, Task 2's card.

**Rules:**
- Every outbound call passes an abort signal built from the timeout.
- An abort surfaces to the user as a sentence saying the request timed out — not as `AbortError`.
- **R4:** when submitting a validated intent fails for any reason, `pendingIntent` is retained and the user is offered a retry that re-submits without a second model round trip.
- A retry that succeeds clears `pendingIntent`. A cancel clears it too.

**Cases your tests must cover:**

| Case | Expected |
|---|---|
| `fetchImpl` that rejects with an `AbortError` | the service throws an error whose message names a timeout, not `AbortError` |
| the signal passed to `fetchImpl` | is an `AbortSignal` |
| `timeoutMs` override | reaches the signal construction (assert on what the service was configured with, not on wall-clock timing) |
| a normal successful call | still succeeds, unchanged |

**Do not write a test that waits 15 seconds.** Inject a small `timeoutMs` or assert on the configuration. A test that sleeps is a test nobody runs.

- [ ] **Step 1: Write the failing tests** for both services.
- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Implement the timeouts** in both services.
- [ ] **Step 4: Run and watch them pass.**
- [ ] **Step 5: Implement R4 in `app.js`** — retain `pendingIntent` on a failed submit and offer the retry. Reuse Task 2's card controls if that is the natural shape; if you add a separate retry control, say why in your report.
- [ ] **Step 6: Run the whole suite.**
- [ ] **Step 7: Commit.** Subject: `feat: time out stalled requests and keep a failed intent for retry`.

**Acceptance:** a stalled proxy fails within the timeout with a readable message, and a failed transaction never forces the user to retype the sentence.

---

### Task 4: Application icons (R6, part 1)

An installable PWA needs real icons. Generating PNGs with zero dependencies is possible because `node:zlib` is built in.

**Files:**
- Create: `scripts/make-icons.mjs`
- Create: `public/icons/icon-192.png`, `public/icons/icon-512.png` (generated, committed)
- Test: `test/scripts/icons.test.js`

**Interfaces:**
- Produces: `writePng(path, { width, height, rgb })` exported from `scripts/make-icons.mjs`, plus a `main()` that writes both icons.

**Rules:**
- A minimal valid PNG is: the 8-byte signature, an `IHDR` chunk, one `IDAT` chunk holding zlib-deflated scanlines each prefixed with a `0` filter byte, and an `IEND` chunk. Every chunk carries a CRC32 of its type and data. Write the CRC yourself; it is about ten lines.
- Use the app's theme colour `#0f172a` as the background with a lighter `#38bdf8` block centred at half size. A solid, legible mark is enough; this is not a design exercise.
- The script is run once by hand and its output is committed. It is not part of `npm start` and adds no build step.

**Cases your tests must cover:**

| Case | Expected |
|---|---|
| both files exist | true |
| first 8 bytes | the PNG signature `89 50 4E 47 0D 0A 1A 0A` |
| `IHDR` width/height for each file | 192×192 and 512×512 respectively |
| file size | greater than zero and under 100 KB |

- [ ] **Step 1: Write the failing tests** — parse the PNG header yourself with `fs.readFileSync` and `Buffer.readUInt32BE`. No image library.
- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Implement `scripts/make-icons.mjs`** and run it to produce both files.
- [ ] **Step 4: Run and watch them pass.**
- [ ] **Step 5: Commit** the script and both PNGs. Subject: `feat: generate application icons without a build step`.

**Acceptance:** two valid PNGs of the right dimensions exist, produced by committed code rather than by hand.

---

### Task 5: Manifest and service worker (R6, part 2)

**Files:**
- Create: `public/manifest.json`, `public/sw.js`
- Create: `public/js/domain/cacheRules.js`
- Test: `test/domain/cacheRules.test.js`
- Modify: `public/index.html` (manifest link, theme colour), `public/js/app.js` (register the worker)

**Interfaces:**
- Produces: `shouldCache(pathname)` in `domain/cacheRules.js` → boolean; `APP_SHELL` in the same module → the array of paths precached.
- **Register the worker as an ES module** — `navigator.serviceWorker.register('/sw.js', { type: 'module' })` — so `sw.js` can `import { shouldCache, APP_SHELL } from './js/domain/cacheRules.js'` and the caching rule has exactly one definition. The alternative, a classic worker duplicating the rule inline, guarantees the two copies drift and the `/api/` exclusion is the one rule that must not drift. Module service workers need Chrome 91+, Safari 16.4+ or Firefox 111+; registration is guarded, so an older browser simply gets no worker and a page that still works.

**Rules:**
- **The worker must never cache anything under `/api/`.** That is the one rule that turns this feature into a data-corruption bug if broken.
- `CACHE_VERSION` is a constant at the top of `sw.js` with a comment stating that it must be bumped in the same commit as any app-shell change. On `activate`, delete every cache whose key differs from the current version.
- The app shell is `index.html`, `css/app.css`, and the JS modules. List them explicitly; do not glob.
- Registration in `app.js` is guarded by `'serviceWorker' in navigator` and its failure must not break the page.

**Cases your tests must cover** (`shouldCache` is pure):

| Input | Expected |
|---|---|
| `/` | true |
| `/index.html` | true |
| `/css/app.css` | true |
| `/js/app.js` | true |
| `/api/firefly/accounts` | **false** |
| `/api/groq` | **false** |
| `/api/anything` | **false** |
| `/manifest.json` | true |

- [ ] **Step 1: Write the failing tests** for `shouldCache`, with `/api/` cases first — that is the rule that matters.
- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Implement `domain/cacheRules.js`.**
- [ ] **Step 4: Run and watch them pass.**
- [ ] **Step 5: Write `public/manifest.json`** — `name`, `short_name`, `start_url: '/'`, `display: 'standalone'`, `background_color` and `theme_color` `#0f172a`, and both icons from Task 4 with correct `sizes` and `type`.
- [ ] **Step 6: Write `public/sw.js`** — install precaches the shell, activate cleans old caches, fetch serves the shell from cache and **always** passes `/api/` straight through to the network.
- [ ] **Step 7: Link the manifest** from `index.html` and add the `theme-color` meta. Register the worker in `app.js`.
- [ ] **Step 8: Verify the server serves them** — boot on a spare port with a timeout and confirm `/manifest.json`, `/sw.js` and both icons return 200. Paste the real output.
- [ ] **Step 9: Run the whole suite.**
- [ ] **Step 10: Commit.** Subject: `feat: make the app installable with an app-shell service worker`.

**Acceptance:** the manifest and worker are served, `/api/` is never cached, and a version bump replaces the shell.

---

### Task 6: Persist the transcript (R7)

**Files:**
- Create: `public/js/services/chatHistory.js`
- Test: `test/services/chatHistory.test.js`
- Modify: `public/js/ui/chat.js`, `public/js/app.js`, `public/index.html` (a clear control), `public/css/app.css`

**Interfaces:**
- Produces: `createChatHistory({ storage, key = 'firefly_chat_history', limit = 50 })` → `{ read(), append(entry), clear() }`
- An `entry` is `{ texto, tipo, esHtml }` — the same three arguments `addMessage` takes.

**Rules:**
- `read()` returns an array, always. Corrupt or absent storage yields `[]` and must never throw — `services/profileStore.js` is the established pattern for this; follow it, including capturing the warning rather than letting it print during tests.
- `append()` keeps at most `limit` entries, discarding the oldest.
- A storage that throws on read or write must not propagate.
- **Never persist anything from a profile.** The transcript holds rendered messages only. Note in your report that query results containing account balances *do* get persisted, and that this is the intended meaning of "persist the transcript" — the owner should know it, and it is a reason the limit exists.

**Cases your tests must cover:**

| Case | Expected |
|---|---|
| empty storage | `read()` returns `[]` |
| corrupt JSON | `read()` returns `[]`, does not throw, warns once |
| storage `getItem` throws | `read()` returns `[]`, does not throw |
| storage `setItem` throws | `append()` does not throw |
| append 51 entries with `limit: 50` | 50 retained, the oldest dropped |
| round trip | an appended entry comes back with `texto`, `tipo` and `esHtml` intact |
| `esHtml: true` preserved | true, not coerced |

- [ ] **Step 1: Write the failing tests.**
- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Implement `services/chatHistory.js`.**
- [ ] **Step 4: Run and watch them pass.**
- [ ] **Step 5: Wire it in `app.js`, not in `ui/chat.js`.** `app.js` restores the transcript on load before `loadReferenceData()`, and wraps `chat.addMessage` in a local function that both renders and records. `ui/chat.js` must stay ignorant of storage entirely — it takes no callback and gains no dependency. The reason is the layer rule: a `ui/` module that knows about persistence is a `services/` module wearing the wrong name, and `ui/` is the layer this project deliberately leaves untested.
- [ ] **Step 6: Add the clear control** to `index.html` with an id, wire it in `app.js`, style it in `app.css` with a class. **No inline `style=`.**
- [ ] **Step 7: Run the whole suite.**
- [ ] **Step 8: Commit.** Subject: `feat: persist the chat transcript across reloads`.

**Acceptance:** a reload preserves the conversation, the clear control empties it, and a broken storage never takes the app down.

---

### Task 7: Content Security Policy (R8)

This is last because it must cover what Tasks 2, 5 and 6 add.

**Files:**
- Create: `server/security/headers.js`
- Test: `test/server/headers.test.js`
- Modify: `server/app.js`

**Interfaces:**
- Produces: `securityHeaders()` → an Express middleware, and `CSP_DIRECTIVES` → the policy as data so a test can assert on it without string-matching a header.

**Rules:**
- Confine every source to the app's own origin: default, script, style, connect and manifest sources limited to `'self'`; images limited to `'self'` and `data:`; `worker-src 'self'` so the service worker loads; framing, base URI and form action denied outright.
- **No `'unsafe-inline'` anywhere.** If the policy needs it, something in the markup is wrong — find and fix that instead of widening the policy. Tasks 2 and 6 were told not to add inline styles precisely so this stays clean.
- Mount the middleware in `createApp` **before** `express.static`, so it covers static assets too.

**Cases your tests must cover:**

| Case | Expected |
|---|---|
| `GET /` | a `Content-Security-Policy` header is present |
| the header value | contains `default-src 'self'` and `frame-ancestors 'none'` |
| the header value | does **not** contain `unsafe-inline` or `unsafe-eval` |
| `GET /js/app.js` | the header is present on static assets too |
| a proxied `/api/firefly/...` response | still returns its JSON unchanged with the header present |

- [ ] **Step 1: Write the failing tests** in `test/server/headers.test.js`. Mount `createApp({ env: {} })` on port 0 exactly as `test/server/proxy.test.js` does.
- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Implement `server/security/headers.js` and mount it.**
- [ ] **Step 4: Run and watch them pass.**
- [ ] **Step 5: Check for violations you cannot see from Node.** Grep `public/index.html` for `style="` and for any `<script>` without `src` — both must be zero. Paste the real output.
- [ ] **Step 6: Run the whole suite.**
- [ ] **Step 7: Commit.** Subject: `feat: confine the page with a Content Security Policy`.

**Acceptance:** every response carries the policy, nothing needs `unsafe-inline`, and the app still works.

---

## Done when

- `npm test` passes with no dependencies beyond `express` and `dotenv`, and the total is well above the 103 this plan started from.
- A hallucinated account never reaches Firefly; every field is shown before it is written.
- A stalled request times out with a readable message and the intent survives for retry.
- The app is installable, `/api/` is never cached, and the transcript survives a reload.
- Every response carries a CSP with no `unsafe-inline`.

## What this plan does not do

R5 (accessibility) and R9 (truth pass) are deliberately excluded. The README's Tailwind claim remains false, the opening greeting still claims a sync that has not happened, and the chat log still lacks `aria-live`. These are known and recorded, not forgotten.

## Risks

**Stale service worker.** The highest-probability defect here. `CACHE_VERSION`, deleting non-matching caches on activate, and never caching `/api/` are the mitigations, and the `/api/` rule is tested first for that reason.

**The CSP is only as good as the markup.** One inline style or one inline script and the policy either breaks the page or has to be widened into uselessness. Tasks 2 and 6 carry that constraint explicitly.

**Nobody can drive a browser here.** No agent on this work has been able to load the page. Tasks 5 and 6 in particular change behaviour that only manifests in a browser — installability, cache behaviour on reload, the clear control. Report what you could not verify rather than implying you did.
