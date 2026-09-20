# Firefly Chat: Modularization and Hardening

Date: 2026-09-20
Status: Approved for planning
Branch: developing

## 1. Context

The application is a natural-language front end for Firefly III: an Express process
that serves a single static page and proxies two upstreams (Groq and Firefly III).
All client logic lives in one inline script inside `public/index.html`.

Five commits on this branch fixed defects that shared one root cause. Three separate
features had never executed even once:

- `procesarConsultaFirefly` referenced an undeclared `FIREFLY_TOKEN`, so every balance,
  budget and recent-movements query threw before its first request.
- The conversation history was assembled into `messagesPayload` and then discarded.
- `category_name` was displayed in the confirmation message but never sent to Firefly.

None of these are subtle. They survived because the code had no module boundaries and
no place to put a test. This design addresses that cause, not only the symptoms.

A second finding shapes the scope below. At the initial commit the browser held no
credentials: the proxy read the Firefly token and the Groq key from the environment,
which is the property the README still advertises. Commit `065b934` moved both into
`localStorage` to support multiple profiles. The feature was worth having; the
security property it inverted is still undocumented.

## 2. Goals

1. Extract the inline client script into ES modules served without a build step.
2. Split the server into mountable modules so its HTTP behavior can be tested.
3. Establish a test suite that runs with `node --test` and adds zero dependencies.
4. Deliver the Tier 1 and Tier 2 requirements in section 6.

## 3. Non-goals

- Server-side credential storage and session authentication. This restores the
  property `065b934` inverted, but it is a separate project with its own login
  system and it would dominate this work.
- Offline transaction queueing via background sync.
- Bundler, TypeScript, or any UI framework.
- Any change to the deployment model: Docker, Compose and Tailscale stay as they are.

## 4. Architecture

### 4.1 The dependency rule

This is the contract that makes the code testable, and it is the one rule that must
not be bent:

- `domain/` imports only from `domain/`. No `fetch`, no `document`, no `window`,
  no `localStorage`, no clock reads. Time and randomness arrive as arguments.
- `services/` may import `domain/`. Every side effect it performs arrives through an
  injected dependency, so a test passes a stub instead of a network.
- `ui/` may import `domain/` for formatting. It never imports `services/`.
- `app.js` is the only client module that wires the three together, and the only one
  that reads the DOM at load time.

Stated the other way: `domain/` and `services/` must run under plain Node with no DOM
present. That single property is what the test suite depends on.

### 4.2 Client module map

| Module | Responsibility | Test approach |
|---|---|---|
| `domain/profiles.js` | profile state shape, validation, add, delete, activate | pure unit |
| `domain/installments.js` | centavo split, month-clamped date schedule | pure unit |
| `domain/confirmation.js` | affirmative and negative detection, pending-intent state machine | pure unit |
| `domain/intent.js` | validate model output against real accounts and categories | pure unit |
| `domain/prompt.js` | build the system prompt from synced data | pure unit |
| `domain/format.js` | HTML escaping, currency, dates | pure unit |
| `services/fireflyApi.js` | pagination, transactions, balances, budgets, recent | stubbed `fetch` |
| `services/groqApi.js` | request, parse, map model failures | stubbed `fetch` |
| `services/profileStore.js` | persistence | stubbed storage |
| `services/chatHistory.js` | persist and restore the transcript | stubbed storage |
| `ui/chat.js` | render messages and the confirmation card | not tested |
| `ui/configModal.js` | profile modal, focus trap | not tested |
| `app.js` | wiring and bootstrap | not tested |

`ui/` stays untested on purpose. That is only honest if it holds no logic, so any
branch heavier than an if on a boolean belongs in `domain/`.

### 4.3 Server module map

`server.js` remains the container entry point so the Dockerfile does not change. It
becomes a three-line file that calls a factory, which is what makes the routes
testable without binding a port.

| Module | Responsibility |
|---|---|
| `server.js` | entry point: `createApp().listen(PORT)` |
| `server/app.js` | `createApp()` returns a configured Express app |
| `server/http/forward.js` | forward an upstream response without assuming JSON |
| `server/http/target.js` | validate the client-supplied Firefly URL and endpoint |
| `server/proxy/firefly.js` | Firefly route handler |
| `server/proxy/groq.js` | Groq route handler |
| `server/security/headers.js` | Content Security Policy and related headers |

### 4.4 Static assets

`public/index.html` keeps only markup and loads `<script type="module" src="/js/app.js">`.
The inline `<style>` block and every `style="..."` attribute in the modal move verbatim
into `public/css/app.css` as classes. This is not cosmetic: inline styles would force
`style-src` to allow unsafe inline styles and make the policy in R8 decorative.

Express already serves `public/` statically, so no server change is needed to deliver
the new files.

## 5. Data flow

```
user text
  -> app.js
  -> domain/confirmation.js        is there a pending intent, and is this yes or no?
       yes  -> submit the pending intent
       no   -> discard, keep the text for correction
       none -> continue
  -> services/groqApi.js           system prompt + last 4 turns + user text
  -> domain/intent.js              validate against synced accounts and categories
       invalid -> explain what is wrong, keep the raw text for correction
  -> ui/chat.js                    render the confirmation card
  -> user confirms
  -> domain/installments.js        centavo split and date schedule
  -> services/fireflyApi.js        POST /transactions
  -> ui/chat.js                    result, or a recoverable error with the intent intact
```

## 6. Requirements

### Tier 1

**R1. Validate model output before acting.**
`domain/intent.js` exports `validateIntent(raw, context)` returning either
`{ ok: true, intent }` or `{ ok: false, reason, field }`. It checks: `type` is one of
withdrawal, deposit, transfer, query; `amount` is a finite number greater than zero;
`date` matches `YYYY-MM-DD` and parses to a real calendar date; `installments` is an
integer of at least 1; and for a withdrawal, `source_name` exists in the synced asset
accounts. Account matching is case-insensitive and whitespace-trimmed. When no account
matches, `reason` names the first synced account that contains the supplied string as a
substring, or that the supplied string contains; if neither holds for any account, no
suggestion is offered rather than a guessed one. Malformed JSON from the model produces
a stated failure, never a thrown exception.

Acceptance: a hallucinated account name never reaches Firefly. A non-JSON model
response renders a readable message.

**R2. Structured confirmation card.**
The confirmation renders as labelled fields (type, amount, source, destination,
category, date, installments) rather than a prose sentence, with explicit confirm and
cancel controls. Typing the existing affirmative and negative words keeps working.

Acceptance: every field the app is about to send is visible before it is sent.

**R3. Timeout and abort.**
All upstream calls use `AbortController` with a per-service timeout constant, exported
from the service module so tests can shorten it: 20 seconds for Groq, 15 seconds for
Firefly. On abort the user is told the request timed out and is offered a retry.

Acceptance: a stalled upstream fails within the timeout instead of hanging.

**R4. Recoverable errors.**
When a submit fails, the validated intent is retained so a retry re-submits it without
a second model round trip. A correction reuses the pending intent as context.

Acceptance: a failed transaction never forces the user to retype the sentence.

**R5. Accessibility on the primary surface.**
The chat log is `role="log"` with `aria-live="polite"`. The modal is
`role="dialog"` with `aria-modal="true"`, traps focus, closes on ESC, and returns
focus to the control that opened it. Every input gets an associated `label`.

Acceptance: the transcript is announced, and the modal is operable from the keyboard
alone.

### Tier 2

**R6. Make it an installable PWA.**
Add `manifest.json` (name, short_name, `start_url`, standalone display, theme color,
192 and 512 icons) and a service worker that caches the app shell under a
`CACHE_VERSION` constant. The worker must never cache `/api/`. On activate it deletes
every cache whose key differs from the current version.

Versioning discipline: `CACHE_VERSION` is bumped in the same commit as any shell file
change. A stale app shell is the most common way this requirement turns into a bug,
so the constant lives at the top of the worker with a comment saying exactly that.

Acceptance: the app installs to a phone home screen and a version bump replaces the
shell on the next load.

**R7. Persist the transcript.**
`services/chatHistory.js` stores the last 50 rendered messages and restores them on
load. Credentials are never written to history. A visible control clears it.

Acceptance: a reload preserves the conversation; clearing empties it.

**R8. Content Security Policy.**
`server/security/headers.js` sets a policy that confines every source to the app
origin: default, script, style and connect sources limited to self; images limited to
self and data URIs; framing, base URI and form action denied outright.
This depends on section 4.4 having removed every inline style.

Acceptance: the app runs with no CSP violation in the console.

### Truth pass

**R9.** The README drops the Tailwind claim, states the real styling, and documents
`FIREFLY_ALLOWED_HOSTS`. Its security section states plainly that credentials now live
in the browser's local storage per profile, and what that implies. The opening chat
greeting no longer claims a sync that has not happened.

## 7. Error handling

Three categories, each with one owner:

- **Upstream unavailable or non-JSON**: owned by `server/http/forward.js`. Returns 502
  with an excerpt rather than a 500 that hides the cause. Already implemented.
- **Rejected by policy**: owned by `server/http/target.js`. Disallowed scheme, embedded
  credentials, host outside `FIREFLY_ALLOWED_HOSTS`, or a dot segment in the endpoint
  return 400 with a stated reason. Already implemented.
- **Semantically wrong**: owned by `domain/intent.js` (R1). The model produced
  well-formed JSON describing something that does not exist. This is the category the
  app currently has no answer for, and the one that silently writes bad data.

Client rendering escapes by default; markup is opt-in per call site.

## 8. Testing strategy

`node --test test/` with no added dependencies.

- `domain/`: table-driven unit tests. Full coverage is expected because these modules
  are pure by construction.
- `services/`: injected `fetch` and storage stubs. Tests assert the request shape sent
  and the mapping of upstream failures, not the network.
- `server/`: mount `createApp()` on an ephemeral port against a local fake Firefly.
  Assert SSRF rejection, traversal rejection, non-JSON forwarding, 204 passthrough, and
  query-string preservation.
- `ui/`: no automated tests. Justified only while `ui/` holds no logic.

The ad-hoc harnesses written while fixing this branch become permanent cases: profile
storage corruption and recovery, pagination across pages and its request cap, month-end
date clamping, centavo distribution summing to the total, SSRF rejection, endpoint
traversal rejection, and response forwarding.

## 9. Migration sequence

Each step is one commit. Extraction is proven before behavior moves.

1. Server: extract `createApp` and modules. No behavior change.
2. Server test suite over the extracted routes.
3. Client: extract ES modules and the stylesheet. No behavior change.
4. Client test suite over `domain/` and `services/`.
5. R1 model output validation.
6. R2 confirmation card.
7. R3 timeout and abort.
8. R4 recoverable errors.
9. R5 accessibility.
10. R6 PWA shell.
11. R7 transcript persistence.
12. R8 Content Security Policy.
13. R9 truth pass on README, `.env.example` and the greeting.

## 10. Risks

**Stale service worker.** The highest-probability defect in this design. Mitigated by
the `CACHE_VERSION` constant, deleting non-matching caches on activate, and never
caching `/api/`.

**Visual regression from moving styles.** Declarations move verbatim into classes
before any of them is changed, so a difference is attributable to the move.

**ES modules are deferred and same-origin.** Intended here, but it means `app.js` runs
after parsing and any inline handler in the markup would break. Every `onclick`
attribute is replaced by a listener registered in `app.js`.

**Extraction and features in one pass.** Requested deliberately, with the tradeoff
stated. Mitigated by the ordering in section 9: steps 1 to 4 change no behavior, so a
regression found later is attributable to a specific feature commit.
