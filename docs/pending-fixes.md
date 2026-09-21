# Pending fixes

Working backlog. Nothing here is blocking; the app is functional and the test
suite is green at 223. Items are grouped by what they cost you if left alone.

---

## 1. Make the service worker network-first and self-updating

**Why:** today the worker is cache-first over the app shell, so a deployed fix is
invisible until `CACHE_VERSION` is bumped by hand. That discipline already failed
once — a validator fix shipped, the server served it, and the browser kept serving
the old file from cache. The bug looked unfixed on a page whose server had the fix.

**Change, all in `public/sw.js`:**

- **Network-first for the shell.** Ask the server first, fall back to cache only
  when the network fails. Stale code becomes impossible.
- **`skipWaiting()`** so a new worker activates immediately instead of waiting for
  every tab to close.
- **`clients.claim()`** so it takes control of the already-open page on that same
  load, rather than needing a second reload.

**After this:** deploy, reload once, you have the current version. `CACHE_VERSION`
stops governing freshness and only controls cleanup of old caches.

**Cost:** the page waits for the network instead of painting instantly from cache —
a few milliseconds on a tailnet. Offline you would still get the shell, but this app
cannot do anything offline anyway: every action hits `/api/`. Installability to the
home screen is unaffected.

**Alternative considered and rejected:** delete the service worker entirely. Also
fixes it, but costs the home-screen install on a phone-first app.

---

## 2. Needs you, not code

- **Set `FIREFLY_ALLOWED_HOSTS` in the real `.env`.** Until it is set the proxy will
  connect to any host a caller names. The value for this deployment, verified against
  the current `FIREFLY_URL`:

  ```
  FIREFLY_ALLOWED_HOSTS=ubuntu-arm-free.tail3247a4.ts.net:8443
  ```

  The port is required — omitting it rejects your own Firefly. Restart after setting;
  the list is read once at startup.

- **Browser verification.** No agent on this project could open a browser. Ranked,
  with the silent failures marked:
  1. ⚠ Does the service worker register? Registered with `{ type: 'module' }`; if the
     browser does not support that it fails silently and the page looks normal.
  2. ⚠ Install, change one byte, reload — confirms the update path works.
  3. The money path end to end. Then: leave a confirmation card on screen, type a
     correction instead of clicking Cancel, click the **old** card — it must refuse.
  4. ⚠ Does the install prompt appear?
  5. Does the page render under the CSP, and does the status line still change colour?

---

## 3. Correctness, small

- **`validateIntent` ignores two of its own inputs.** It accepts `context.categories`
  and `context.revenueAccounts` and reads neither. Firefly auto-creates categories and
  revenue accounts by name, so a hallucinated `category_name`, or a deposit's
  `source_name`, silently creates new records. Either validate them or drop them from
  the context shape — a parameter the function ignores is a contract that misleads.
- **Literal `"undefined"` in three user-facing messages** when a field is absent rather
  than malformed (`type`, `amount`, account names). The rejection and `field` are
  correct; only the wording is wrong, and that path is untested.
- **The confirmation card's instalment row is wrong for all but the first instalment.**
  It renders `"3 de $3.333,34 c/u"` from `montos[0]`; instalments 2 and 3 are
  `3333.33`. The remainder goes to the first instalments by design.
- **Displayed amount can differ from the sent amount.** `formatCurrency` permits three
  fraction digits while the payload uses `toFixed(2)`, so an amount with three or more
  decimals shows one number and sends another.
- **No guard for `cantidad <= 0`** in `splitAmountIntoInstallments` / `installmentDates`.
  Unreachable today because both call sites coerce with `|| 1`.
- **`budgets` and `recentTransactions` error messages omit the HTTP status** that
  `fetchAllPages` includes, so an expired token surfaces as a bare "no se pudieron
  consultar" with no 401.

---

## 4. Robustness and hygiene

- **A test that fails when an app-shell file changes without a version bump.** This is
  the durable fix for item 1's failure mode, and it is worth having even after the
  network-first change.
- **`CSP_DIRECTIVES` is a mutable export.** A future push into one of its arrays would
  silently weaken the policy for every later `createApp()` in the same process.
  `Object.freeze` on it and its arrays closes that.
- **`request()` in `fireflyApi.js` drops caller-supplied headers** — it spreads
  `...options` and then sets `headers`. No current caller passes any.
- **`captureWarnings` assumes synchronous tests.** It swaps the global `console.warn`
  and restores it in a `finally`; an async test in that file could interleave.
- **The mid-body-disconnect test logs to stderr during a green run.** It is the
  handler's own `console.error` proving the catch fired — assert on it with
  `t.mock.method` rather than leaving it as noise.
- **`chat.history(4)` feeds card text to the model**, including the confirmation card's
  own "✅ Confirmar ❌ Cancelar" labels.
- **A tab closed mid-submit leaves the transcript ending on "⏳ Registrando..."** with no
  resolution, so the user cannot tell whether money moved.
- **The clear-history button wipes the static greeting too**, leaving a blank pane.
- **`fireflyApi.js` carries six responsibilities behind one factory.** If it grows, the
  natural cut is reads vs writes.

---

## 5. Test quality

- **The icon test's `crc32` is byte-for-byte the encoder's.** It catches chunk-framing
  bugs because it recomputes from parsed boundaries, but not a shared misunderstanding
  of CRC32 itself.
- **IHDR compression, filter and interlace bytes are never asserted.** A wrong interlace
  byte would break real decoders while the inflated-length assertion still passed.
- **Icon pixel assertions sample only the corner and the exact centre**, so an
  off-by-one on the block boundary would pass.
- **Three `APP_SHELL` tests overlap.** Harmless.

---

## 6. Documentation still untrue

Out of scope by decision when R9 was dropped, listed so it is not forgotten:

- The README claims **Tailwind CSS**. The styles are hand-written in `public/css/app.css`.
- The opening chat greeting claims it **synchronised your accounts** before any sync has
  happened.
- The manifest omits an explicit `scope`. It defaults to `/` correctly, so this is
  documentation rather than a gap.
