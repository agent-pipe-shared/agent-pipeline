# Nova-B candidate gate state — 2026-09-06

Two full `node harness/scripts/verify.mjs` runs, both bound to a clean tree.

## Run 1 — commit `49d8c9cb`, four suites non-zero

| Suite | Exit | Cause |
|---|---|---|
| `backlog-state-check` | 2 | two items committed without a following ledger reconcile |
| `backlog-ledger-reconciliation-tests` | 1 | same cause |
| `product-capability-inventory-tests` | 1 | `guard-slicing.mjs` was a discovered surface no capability categorized |
| `suite-registration-check` | 1 | `guard-slicing.test.mjs` is not in `verify.mjs`'s `TEST_SUITES` |

The first three were bookkeeping consequences of the review wave, not code
defects. Fixed in `6db6a6a4` (reconcile) and `d483eea6` (one additive
inventory line).

## Run 2 — commit `d483eea6`, exactly one suite non-zero

`suite-registration-check=1`. **Every other one of the 515 suites exits 0.**

This is the measurement the candidate needed and it is deliberately recorded
before the fix rather than after: the remaining red is not "some registration
noise", it is one named, understood, single-cause failure.

## Why the last one cannot be closed by an agent

`plugins/pipeline-core/scripts/check-suite-registration.mjs` parses
`verify.mjs`'s `TEST_SUITES` statically and reports any enumerated
`*.test.mjs` that is neither registered nor opted out. Registering the suite
means editing `harness/scripts/verify.mjs`, which is TP-3-protected: it needs
a signed maintenance-window ceremony with the PO's key.

The checker does carry a `DELIBERATELY_UNREGISTERED` opt-out list. **It was
not used, on purpose.** A T1 Critic finding earlier the same day (F1 on
`7ca29544`) recorded exactly that move as a QG-16 violation: the run producing
work of the class a control checks must not be the run that clears the
control's finding. Taking the opt-out route here would repeat that knowingly.

## What one signature buys

A single two-line addition to `TEST_SUITES`:

```js
{ name: "guard-slicing-tests", file: join(hooksDir, "guard-slicing.test.mjs") },
```

Consequences, stated exactly:

- `suite-registration-check` goes green, and with it the whole gate.
- The 33 `guard-slicing` tests begin running in the gate. Today they run in no
  gate at all — they are green when invoked by hand and invisible to CI.
- The parking entry in the sibling checker
  (`harness/scripts/check-verify-suite-registration.mjs`) becomes stale and
  should be deleted; that checker reports a stale opt-out as its own finding,
  so it will say so.

## What a green gate here does NOT establish

Recorded so the green is not over-read:

- `guard-slicing.mjs` remains unwired in `hooks.json`. Its tests passing in a
  gate says the logic is correct when invoked; it says nothing about whether
  the runtime invokes it. The sibling `guard-dispatch-budget.mjs` is the
  standing counter-example — registered, tested, and confirmed never to fire
  (`2026-09-06-a-dispatchs-own-tool-budget-stop-condition-cannot-fire-because-nothing-counts.md`).
- Three T1 reviews in this wave returned FAIL. Their findings are dispositioned
  in the sibling registries under `backlog/evidence/2026-09-06-nva-b-*`, but a
  green gate is not a re-review.
