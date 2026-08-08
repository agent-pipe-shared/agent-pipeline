---
schema: pipeline.backlog-item.v1
id: pipeline.po-authority-decision-prd-candidate-static
type: defect
owner: pipeline
status: open
created: 2026-08-08
source: "Found live on 2026-08-08 while recovering this repository's own PO authority drift, after an edit to the bound PRD reopened the plan gate. Promised as a filing in that recovery and filed here. Observed against plugins/pipeline-core/scripts/pipeline-state.mjs in this tree."
---

# `po-authority-decision-plan` presents a PRD option whose unavailability is a constant, not a measurement

## Description

When the bound PRD and Spec drift apart, `pipeline-state.mjs po-authority-decision-plan`
presents the PO with two candidates and a status for each:

```
{ selectedCandidate: "prd",  status: "unavailable", code: "PO-DECISION-REFERENCED-SPEC-BYTES-UNAVAILABLE" }
{ selectedCandidate: "spec", status: "available",   … }
```

**The `prd` row is a literal in the output object** (`pipeline-state.mjs:4332-4337`).
Nothing about the repository is examined before it is emitted, and the matching
guard (`:4359-4362`) refuses a `--selection prd` unconditionally with the same
reason. The status field says *unavailable*; the code says *never available*.

**Why the distinction matters to the human reading it.** A two-row table with a
status column is the shape of a measurement — it reads as "we looked, and in your
repository this one cannot be formed". A PO who takes it that way will assume a
differently-shaped repository would offer the option, and will look for what makes
theirs different. There is nothing to find.

## What the option would mean, and whether it is genuinely impossible

The two candidates are not symmetric, and the asymmetry is real:

- **`spec` (implemented):** accept the Spec's current bytes as authority and rewrite
  the PRD's `spec-sha256` marker to match (`replaceRebindMarker`, `:3974-3977`).
  Everything needed is on disk.
- **`prd` (refused):** keep the Spec version the PRD was actually written against —
  the one its marker names by digest. That needs those *bytes*, and the state file
  stores only the digest. Hence the reason code.

So the refusal is honest in the general case. **It is not honest in a Git
repository.** The Spec is a tracked file; a walk of `git log` over its path,
hashing each revision, either finds the digest or proves it absent. The code never
attempts this — and in the case that motivated the filing, the referenced Spec
version was an ordinary earlier commit on this branch, which is the common case, not
the exotic one.

That turns a permanent refusal into a recoverable one for most real drift, and it is
the difference between "the PO must re-approve against the new Spec" and "the PO may
keep the plan they approved".

## Consequence

Every authority drift resolves the same way: adopt the current Spec, reopen the plan
gate, re-approve. That is the correct outcome when the Spec genuinely moved on
purpose. It is the wrong one when the Spec changed by accident and the PRD is the
document worth keeping — and the mechanism offers no way to say so.

## Affected artifact

`plugins/pipeline-core/scripts/pipeline-state.mjs` — the static candidate row at
`:4332-4337`, the unconditional guard at `:4359-4362`, and
`buildPoAuthorityDecisionPlan` at `:3937-4009`, which computes the drift but never
the recoverability of the referenced bytes.

**Ownership note:** this module belongs to the Nova session. This item is a filing,
not a repair, and should not be fixed from a Phoenix session — two sessions editing
one module is a collision this project has already paid for once (phase-plan R4
records the same reasoning for `guard-maintenance-window.mjs`).

## Proposal

**Owner: PO**, for assignment to Nova. Ordered by cost.

1. **Cheapest, and worth doing regardless: stop presenting it as a measurement.**
   Either drop the `prd` row from the output or give it a code that says what is
   true — the option is not implemented. A constant dressed as a status costs the
   next reader a diagnosis.
2. **Then decide whether it should be implemented.** Resolving the referenced Spec
   bytes from Git history is a bounded piece of work: walk the tracked Spec path,
   hash each revision, match the marker digest. It either finds them or reports
   `unavailable` for a reason that was actually established.
3. **Do not extend the option to untracked or exported history.** If the bytes are
   genuinely gone — a squashed branch, an export boundary, an untracked Spec — the
   current refusal is the right answer and should keep its reason code. The fix is
   to reach the recoverable cases, not to weaken the check.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
