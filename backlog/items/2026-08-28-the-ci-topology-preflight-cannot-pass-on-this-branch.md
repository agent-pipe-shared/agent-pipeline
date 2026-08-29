---
schema: pipeline.backlog-item.v1
id: pipeline.ci-topology-preflight-cannot-pass-on-this-branch
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: none
done_when: script-exit-zero plugins/pipeline-core/scripts/verify-topology-preflight.mjs
source: "Measured live, 2026-08-28, by running verify-topology-preflight.mjs at HEAD after an unrelated change and then isolating each rejecting sub-check with a controlled probe."
---

# The CI topology preflight cannot pass on this repository's own working branch, for three independent reasons

## Why this is urgent rather than tidy

`.github/workflows/verify.yml` runs
`plugins/pipeline-core/scripts/verify-topology-preflight.mjs` as a **blocking
step in two separate jobs** ("Typed Git topology preflight", lines 39-40 and
66-67). It is not advisory and has no continue-on-error.

The branch carries **2835 unpushed commits**; the last push was 2026-08-16. So
this gate has had no opportunity to fail publicly — and the 0.6.0 release push is
what will finally reach it.

## Three layers, each measured separately

Running the script at HEAD failed at the FIRST layer; fixing that revealed the
second and third. They are independent — none is a consequence of another.

### Layer 1 — definition inventory drift (fixed 2026-08-28, see below)

`VTP-DEFINITION-REQUALIFICATION-REQUIRED`. The script compares
`plugins/pipeline-core/config/ai-assisted-definition-inventory.json` against a
freshly built `definitionInventoryRecord()`:

| | recorded | current |
| --- | --- | --- |
| `definitionCount` | 34 | 43 |
| `inventorySha256` | `82b7cb37…` | `c46e239e…` |

The record was last written on 2026-08-02 (`b2d3725b`). Since then **398
commits** touched the three directories `buildAiDefinitionInventory()` walks
(`hooks/`, `agents/`, `skills/`). The drift is the legitimate accumulated
history of four weeks of work on exactly the files it tracks.

**And nothing writes that file.** Grepping `plugins/` and `harness/` for
`ai-assisted-definition-inventory` returns exactly one file: the script that
reads it. No writer, no `--activate` mode, no regeneration command. The two
Cyborg commits that last moved it did so by hand. That is why it went four weeks
unrefreshed — not carelessness, but the absence of the one thing that would make
refreshing it routine.

### Layer 2 — the independent checks exclude themselves

`AIH-INDEPENDENT-CHECK-MISSING`, `missing: ["scope", "guard"]`.

`runIndependentChecks()` deliberately skips a check whose own command file
appears in the candidate diff — you cannot validate a change using the thing
that changed. Correct in principle. But the candidate diff here is computed
against `docs/product-capability-inventory.json`'s `sourceBaseline`, which is
`28ff2d2b` (**2026-08-09**), producing **1604 changed paths**. Over a window
that wide, `harness/scripts/check-doc-contracts.mjs` and
`plugins/pipeline-core/hooks/guard-git.test.mjs` have both been touched, so both
self-exclude, so `evaluateChangeIntegrity` reports them missing and rejects.

This is not a bug in the exclusion rule. It is the rule meeting a candidate
window it was never sized for.

### Layer 3 — the required reviewer is never configured

`AIH-INDEPENDENT-REVIEW-REQUIRED`.

`routeSecurityReview()` marks a candidate sensitive when any changed path
matches `hooks/`, `.claude/`, `project/`, `workflows`, `security`, or any
`*.test.mjs` — which is essentially every candidate this repository produces. A
sensitive candidate is admitted only when `reviewerId` is a string different
from `authorId`.

`reviewerId` comes from `process.env.PIPELINE_SECURITY_REVIEWER_ID`. **The
workflow step that runs this script declares no `env:` block at all**, so the
variable is unset in CI exactly as it is locally. The check therefore cannot
pass in CI for a sensitive candidate, regardless of the repository's configured
variables — nothing forwards them to that step.

Verified by reading the workflow, not inferred from the local failure.

## The shared root

Layers 2 and 3 are the same mistake in two places: a gate designed for a
small, PR-sized candidate diff with a named human reviewer, wired into a
long-lived branch with a month-old baseline and no reviewer plumbing. Layer 1 is
the sibling shape recorded twice already on 2026-08-28 — a hand-maintained
record duplicating data the code derives, with no producer.

## What was done, and what it does NOT do

The Layer 1 record was regenerated on 2026-08-28 from
`definitionInventoryRecord()` rather than transcribed, and the script now gets
past that check.

**This does not unblock the push.** Layers 2 and 3 still reject, so the CI step
still fails. An earlier draft of this item claimed the regeneration cleared the
release path; that claim was wrong and is corrected here. The regeneration is
worth keeping only because it removes one confounding layer from whoever fixes
the other two — it buys no green.

### Update 2026-08-28, later the same day — two of the three layers moved

The sentence above ("Layers 2 and 3 still reject") is no longer true and is
superseded here rather than edited away. Measured at `03c6e1e4` with the CI's
own invocation shape
(`PIPELINE_CANDIDATE_BASE=2eb4466c…`, `PIPELINE_SECURITY_REVIEWER_ID` set):
`status: ready`, `VTP-READY`, `AIH-CANDIDATE-ADMITTED`, `integrity.missing: []`,
exit 0.

- **Layer 3 — CLOSED.** The workflow step now declares the `env:` block this
  item reported missing (`.github/workflows/verify.yml:41` and `:71`), the
  repository variable is set, and the rule was hardened so the identity counts
  only from that variable and never from `--reviewer-id`
  (`03c6e1e4`; contract in
  `backlog/evidence/2026-08-28-self-excluded-review-path-design.md` section G).
  The emitted result now records `reviewerIdentity: {id, source}`, so which
  source cleared the check is visible in the artifact.
- **Layer 2 — symptom closed, root NOT closed.** `missing` is now `[]` over the
  same wide window, but not because the window was sized for the gate. A
  self-excluded check gained a second admission path — its own suite passing at
  the candidate revision AND a named reviewer distinct from the author, from a
  trusted source (PO decision "Suite + named reviewer", 2026-08-28). The
  Proposal's option 2 below — moving `sourceBaseline` forward, or computing the
  candidate diff against a bounded reference — remains untaken, and the window
  still drifts. `deliveryBase: {commit, source}` is now recorded, so a narrowed
  window is at least visible rather than silent.
- **Layer 1 — UNCHANGED, still open.** The record is regenerated, but the
  question this item insists must be answered first — is the stored definition
  record a **tripwire** or a **cache**? — has not been answered, and no producer
  exists. Nothing about today's work touched it.

**This item stays open.** Its second acceptance criterion ("each of the three
layers is closed by a decision that is written down") is not met while Layer 1's
question is unanswered and Layer 2 is closed at the symptom. The first criterion
is met for the CI invocation shape.

A companion item covers a different gap in the same gate:
`pipeline.the-ai-hardening-gate-has-no-home-in-any-approved-feature-package`
(the control has no work package or acceptance criterion in the approved epic
package). The two do not overlap and neither closes the other.

## Proposal

Not designed here. The three layers need different answers:

1. **A producer for the definition record**, or its removal. It holds only
   `schema`, `inventorySha256` and `definitionCount`, all three computed by
   `definitionInventoryRecord()`. If nothing else consumes it, "derive, do not
   declare" is the same answer the capability inventory just got. One question
   must be answered first, explicitly: is the stored record a **tripwire** (a
   human attested to this definition set) or a **cache**? If a tripwire, it needs
   a writer that records who requalified and why, not a derivation.
2. **A candidate window sized for the gate.** Either `sourceBaseline` moves
   forward as part of release preparation, or the preflight computes its
   candidate diff against something bounded (the merge-base with the delivery
   branch, the previous release tag) rather than an inventory field that drifts.
3. **Reviewer plumbing, or an honest exemption.** Either the workflow step
   forwards `PIPELINE_SECURITY_REVIEWER_ID`, or the rule states which contexts
   are exempt. A required check nothing can satisfy is not a control.

## Acceptance

- `node plugins/pipeline-core/scripts/verify-topology-preflight.mjs` exits 0 on
  this repository's own working branch, or the workflow no longer runs a step
  that cannot pass here.
- Each of the three layers is closed by a decision that is written down, not by
  widening the gate until it stops firing.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** Every claim here was executed, not inferred: the failing exit at
  HEAD, both drifted inventory values, the 398 intervening commits, the 1604-path
  candidate window, the per-sub-check probe isolating `integrity` and `review`,
  and the workflow read confirming the reviewer variable is never forwarded. The
  urgency is structural rather than stylistic — this is the gate the 0.6.0 push
  meets first, and it currently cannot pass.
- **Assignment (if accepted):** `sprint: none`. By subject this is Alfred's
  (mechanical governance, control integrity), and Alfred is in flight and closed
  to new scope (PO, 2026-08-28); neither Nightwing (product experience) nor
  Batman (optional capabilities) describes a CI gate's own satisfiability.
  **Raised to the PO separately** rather than left to a window, because it blocks
  the release push and the release push is a PO-gated act — the scheduling call
  is theirs, not the next sprint's.
  **Condition for picking it up:** before the 0.6.0 push is attempted, or by
  Alfred's successor, whichever comes first. Third item on `none`; that queue is
  now a visible signal, not a parking lot.
- **Date:** 2026-08-28
