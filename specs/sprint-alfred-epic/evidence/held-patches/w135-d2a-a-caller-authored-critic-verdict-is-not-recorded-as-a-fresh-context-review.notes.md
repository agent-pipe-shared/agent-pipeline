# w135 — a caller-authored Critic verdict is not recorded as a fresh-context review (candidate 19, D2a)

Applies on top of the chain at w133. Criterion binding: AC-108 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it adds

- `scripts/session-critic-finalizer.mjs`:
  - `finalize` now runs `originGate` before the result is built (the verdict schema check still runs first, so verdict errors keep their place ahead of origin errors). `buildResult` takes the label and writes it as a new optional top-level key `independence` of the result; the session flags follow the label: `caller-authored-fallback` gives `freshContext: false`, `historyInherited: true`; `source-issued-origin` gives `true` / `false`.
  - `validateResult` accepts the closed key set with or without `independence`: no label means the legacy `true` / `false`; each label requires its matching flags; any other label is `SCF-RESULT-BINDING`. The packet-side `sessionBinding` checks are untouched.
  - `receiptFor` copies `independence` into the receipt only when the result carries it, so a legacy stored result still projects to its legacy receipt (the lifecycle readers recompute the receipt from the stored result and compare).
- `lib/session-critic-finalizer-read.mjs`: `validateSessionCriticReceipt` accepts the receipt with or without `independence`: no label means `true` / `false`; fallback label requires `false` / `true`; source label requires `true` / `false`; anything else is `SCF-RECEIPT`.
- `scripts/session-critic-finalizer.test.mjs`: the assertions of the existing Cut A (4) and Cut A (5) cases were extended (no new `test(` case): the old "receipt has no independence key" assertions became the new label and flag assertions, plus the legacy, consistent and inconsistent receipt matrix.

## Checks

- The extended cases were red before the production edit (90 of 92). Run alone in the clone by the Elephant after the Goldfish checkpoint: `session-critic-finalizer.test.mjs` 92 of 92, `critic-export-policy.test.mjs` 23 of 23, `critic-lifecycle-admission.test.mjs` 8 of 8, `critic-verify-lifecycle.test.mjs` 28 of 28.
- Readers of the receipt flags outside the three files (`review-admission-read.mjs`, `critic-lifecycle-admission.mjs`, `critic-verify-lifecycle.mjs`) all go through the changed validators; the last two suites above exercise them.

## Not changed / not proven

- Who may call the fallback is unchanged; no close, push or other gate refuses a fallback receipt (that is the next slice).
- Receipts already on disk have no label and still validate; there is no migration.
- The packet-side session binding (schema, key list, flags) is untouched, so the packet readers in `critic-export-policy.mjs` and `critic-packet-preflight-read.mjs` behave as before.
- The full Verify run was not made.
