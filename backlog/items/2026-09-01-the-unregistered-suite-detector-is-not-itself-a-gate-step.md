---
schema: pipeline.backlog-item.v1
id: pipeline.the-unregistered-suite-detector-is-not-itself-a-gate-step
type: defect
owner: pipeline
status: open
created: 2026-09-01
sprint: nova-b
done_when: manual
source: "Drafted in scratch/pending-item-suite-registration.md, held there because five dispatches shared the checkout; filed once free. Verified live 2026-09-01 against harness/scripts/verify.mjs and a fresh run of plugins/pipeline-core/scripts/check-suite-registration.mjs."
---

# The detector for unregistered test suites is not itself a gate step, and the gap has recurred at least four times

## What was measured, 2026-09-01

`node plugins/pipeline-core/scripts/check-suite-registration.mjs` exits 1 and
names four test suites that exist on disk and are not registered in
`harness/scripts/verify.mjs` — re-run live for this item, output matches the
draft exactly:

    harness/scripts/print-verify-failures.test.mjs
    plugins/pipeline-core/hooks/guard-push-release-tag-ancestry.test.mjs
    plugins/pipeline-core/scripts/check-critic-skip-coverage.test.mjs
    plugins/pipeline-core/scripts/measure-tofu-push-e2e.test.mjs

## Why the gate does not see it

`harness/scripts/verify.mjs` registers `check-verify-suite-registration.mjs`
(imported at line 54, gate step `verify-suite-registration-check` at line 593).
That script detects DUPLICATE suite ids (`duplicateSuiteIds`). The script that
detects MISSING registrations — `check-suite-registration.mjs` — has its own
test suite registered as a gate step (`check-suite-registration-tests`, line
672), but the script itself is never invoked as a gate step against the real
repository tree. Confirmed by reading `verify.mjs`'s `TEST_SUITES` array
directly: no entry runs `check-suite-registration.mjs` and asserts its exit
code.

So the detector's shape is verified (its own unit tests pass) and its result
against the live tree never is. An unregistered suite is therefore invisible to
the gate by construction, and the only way it surfaces is a person or a Critic
running the script by hand — which is how the four suites above were found.

## The recurrence, from verify.mjs's own comments

This is not a first occurrence. `verify.mjs` carries several registration
blocks (lines ~700, ~723, ~729, ~733) documenting the same discovery on
separate prior occasions — suites that existed on disk, passed standalone, and
were never wired into the gate until a manual run of
`check-suite-registration.mjs` (or a Critic round) found them. Each prior
occurrence was repaired by hand-registering the specific suites found that day;
the detector itself was never promoted to a gate step that would catch the
NEXT occurrence automatically.

## One of the four is from today

`guard-push-release-tag-ancestry.test.mjs` was written 2026-09-01 to pin a
release-tag ancestry notice behaviour. Its suite has never run in the gate. The
protection believed to be in place is not exercised by Verify.

## Relationship to `2026-08-08-a-hardening-round-cannot-register-the-suites-it-writes.md`

That item and its sibling
`2026-08-07-unregistered-suite-is-red-and-invisible-to-verify.md` cover
adjacent but distinct ground, confirmed by reading both items' full Triage/
Closure history:

- The sibling item's candidate 1 (write the detector script) shipped as
  `NVA-SUITEREG-1`/`NVA-SUITEREG-2` and is CLOSED.
- Its candidate 3 (register the suites the detector found) was executed as a
  one-time sweep: the 2026-08-19 closure registered 107 of the 116
  then-unaccounted suites via a signed TP-3 ceremony, with the remaining 9
  explained (6 covered by detector-blind arrays, 3 deliberately left
  unregistered as broken).
- Neither closure promoted `check-suite-registration.mjs` itself to a running
  gate step. The sweep fixed the drift that existed on 2026-08-19; it did not
  stop new drift from recurring, which is exactly what happened again by
  2026-09-01 with the four suites above (including one written the same day).
- `2026-08-08-a-hardening-round-cannot-register-the-suites-it-writes.md`
  itself stays open on its own directions 1/2 (whether suite registration is
  the same risk class as editing `verify.mjs`'s logic, and if so making the
  TP-3 ceremony batchable), deferred to Sprint Alfred as of 2026-08-18 — a
  ceremony-cost question, not the "is the detector wired in" question this
  item asks.

**This item is scoped to what neither covers: making
`check-suite-registration.mjs`'s own result a gate step**, so a future suite
written without registration fails Verify at creation time instead of waiting
for the next manual run or Critic round. The four currently-unregistered
suites above are the immediate, concrete instance of the gap this item names —
their registration is bundled with whatever ceremony promotes the detector
itself, per the pattern already used for `backlog-sprint-assignment-check` and
`resume-consumption-check`.

## Why it was not fixed on discovery

Adding a gate step to `harness/scripts/verify.mjs` requires editing a
protected test path (TP-3), for which no in-session override exists in
signature mode. This registration work belongs in a maintenance window
already scheduled with the PO, alongside the deferred directions 1/2 of the
sibling item above.

## 2026-09-03 — measured and prepared, still blocked on the same signature

Dispatch `NVA-B-SUITEREG-1` changed nothing and stopped on the TP-3 wall, which
this item had already named. It did the measurement first, so the maintenance
window is now a single step rather than an investigation. The full package —
per-suite results, the exact contiguous diff, the runtime delta, and the two
workarounds that were deliberately not taken — is in
`backlog/evidence/2026-09-03-suite-registration-ceremony-package.md`, tracked,
because the dispatch's own record lives in the gitignored `evidence/` tree and
would not survive a fresh checkout.

The four suites are unchanged and **all four pass standalone**: 0.4 s, 4.58 s,
0.15 s and 14.08 s. Suite count would go 506 → 511, adding ≈19.2 s to a ~23
minute gate.

One briefed assumption was refuted by measurement. `measure-tofu-push-e2e` was
briefed as the likely exception, on the reasoning that an end-to-end push
measurement does not belong in a gate. Reading its source: no remote, no URL, no
network call; a disposable temp repository, locally generated keys in a temp
HOME, and scripted answers instead of a human. It is a defensible gate candidate,
and the dispatch was explicitly told to conclude from running it rather than from
its name.

Two workarounds were available and both were correctly refused. Running the
signature ceremony unprompted — nothing authorized spending a PO signature, and
CLAUDE.md forbids seeding one unless the PO can sign immediately. And entering
the four suites into the detector's `DELIBERATELY_UNREGISTERED` opt-out, which
would have turned the detector green by recording a false claim about four
passing suites, and which the detector treats as fatal once stale. Silencing the
detector to make its output green would have inverted this item's whole purpose.

The gap therefore stands exactly as described above, with the cost of closing it
now known and the change ready to apply.
