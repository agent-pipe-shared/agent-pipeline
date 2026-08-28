---
schema: pipeline.backlog-item.v1
id: pipeline.onboarding-asks-published-in-one-window-only
type: defect
owner: pipeline
status: closed
created: 2026-08-28
closed_at: 2026-08-29
closure_repository: self
closure_commit: cceafb06a68e8b0e0154da180021c2561c1ec1c4
closure_evidence: backlog/items/2026-08-28-the-onboarding-asks-are-published-in-one-window-and-never-again.md
sprint: nova
tracking: "NOW / Nova A — happy-path blocking at the PO's second touch: the onboarding questions reach the human through exactly one command's response, so a run that passes that point never asks them again."
source: "Found by NVA-V3-PENDINGASKS while wiring the guided driver to consume nextAction.pendingAsks, measured against a real fresh repository; the two call sites were then read directly (project-onboarding-v3.mjs lines 5447 and 5449) rather than inferred from the measurement."
---

# The onboarding asks are published in one window and never again

## What was measured

`withPendingAsksSurfacedOnNextAction()` merges five pending asks — author identity,
push-approval mode, verify contract, trust anchor, project-ignore gap — onto
`nextAction.pendingAsks`. It is called from exactly two places
(`lib/project-onboarding-v3.mjs` lines 5447 and 5449), and **both sit inside
`applyLifecycle()`'s `operation === "portable"` branch**: the two exits of the
`apply-portable-seed` activation, one for the digest-mismatch case and one for the
successful apply.

Nothing else calls it. A plain `inspect` — the command the guided driver re-anchors on
after every apply, and the command any other consumer reads state with — goes through
`v4Inspection()` directly and carries no `pendingAsks` at all.

So the questions exist for the duration of one command's response. A run that is past
`apply-portable-seed` cannot see them, whether or not anyone answered them.

## Why this is not the driver's defect

`scripts/onboarding-init.mjs` now reads `pendingAsks` generically and stops on it
(NVA-V3-PENDINGASKS), which fixed the half that was the driver's: before that, the asks
were published and consumed by nothing. Measured on a fresh repository, the driver used to
execute straight past all three published asks and stop two commands later at an unrelated
question; it now stops at the exact step that publishes them.

But a re-entrant run — the normal case, since the driver is restart-resilient by design —
re-anchors on `inspect`, and `inspect` publishes nothing. The driver cannot close that
without knowing which command re-surfaces which ask, which is precisely the domain
knowledge its own contract forbids it to hold. The gap is on the publishing side.

## Why it matters here

The PO's acceptance bar for the happy path makes answering these the second of five human
touches ("ich beantworte eine reihe anfragen fürs onboarding (modus, author, etc.)"). Three
of the five asks are exactly that set. A question that is only askable inside one command's
response is a question the human may never be asked — and the consequences land later and
elsewhere: an unset push-approval mode resolves to `signature`, and an unconfigured verify
contract makes the push gate unsatisfiable by construction.

## Direction

Publish the asks from the observation, not from one mutation's response. Whatever reads the
repository's current state should be able to answer "what is still unanswered here?" —
which is what the five ask-builders already compute from disk, independently of how the
caller arrived.

The narrow version is to merge the same chain onto `v4Inspection()`'s own result so any
`inspect` carries it. Check first whether that changes an existing consumer's expected
shape: the asks are additive sibling fields today, and this must not turn an unrelated
caller's `ready` result into something its own validator rejects — the ready-gate's exact
key comparison is the obvious hazard, and it has already failed twice on exactly this kind
of additive field.

## Acceptance criteria

- An `inspect` of a repository with unanswered onboarding questions carries those questions,
  so a re-entrant guided run surfaces them again rather than continuing past them.
- Answering an ask removes it from subsequent observations; nothing re-asks an answered one.
- Adding the asks to the observation does not break a consumer that validates the
  observation's shape — checked against the readiness gate specifically, not assumed.
- Measured on a genuinely fresh repository across two separate driver runs, not asserted
  from unit fixtures.

## Related

- `2026-08-28-push-approval-mode-is-not-chosen-at-onboarding.md` — the first half of this,
  where the ask was published and consumed by nothing. The driver side is now fixed; this is
  what remains.
- `2026-08-28-onboarding-must-elicit-the-real-verify-contract.md` — one of the five asks,
  and the one whose absence makes the push gate unsatisfiable.
- `2026-08-28-the-ready-gate-hand-maintains-a-mirror-of-a-shape-it-does-not-own.md` — the
  hazard the Direction's second paragraph names, twice realised already.
- `2026-08-28-nothing-checks-that-a-shipped-capability-is-reachable.md` — the class:
  published by one builder, reachable from one path only.

## Closing note (reconciliation, 2026-08-29)

Commit `cceafb06a68e8b0e0154da180021c2561c1ec1c4` merges the same pending-ask
computation into every ordinary `inspect` via a new shared helper
(`withAllPendingOnboardingAsksAttached`, reused unchanged at both existing
`apply-portable-seed` call sites) and a sibling
(`withPendingOnboardingAsksOnNextActionOnly`) that attaches to
`nextAction.pendingAsks` only, deliberately never the raw per-field side
channels, because those are not in `project-onboarding-ready-gate.mjs`'s closed
key sets and would otherwise fail every non-ready session closed. All four
acceptance criteria confirmed:
`an ordinary inspect surfaces every pending ask whose condition is still true,
not only the apply-portable-seed call`, `an ask whose condition has been
resolved stops appearing on the next ordinary inspect`, `the ready status
observation is unaffected by the ask-window change, checked against the real
ready gate`, and `the five-wrapper pending-asks composition is expressed
exactly once in the library source`. `node --test
plugins/pipeline-core/lib/project-onboarding-v3.test.mjs` (144/144) exits 0.
