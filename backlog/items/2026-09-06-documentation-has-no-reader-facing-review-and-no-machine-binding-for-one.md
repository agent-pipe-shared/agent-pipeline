---
schema: pipeline.backlog-item.v1
id: pipeline.documentation-has-no-reader-facing-review-and-no-machine-binding-for-one
type: requirement
owner: pipeline
status: open
created: 2026-09-06
source: "PO ruling 2026-09-06 in session: documentation work must end with a reader's Critic who reads as a user and checks comprehensibility, order, granularity and weighting; the PO also asked where it belongs mechanically (push, preflight, release preflight) and named the candidate-regress problem himself. First round run the same day as NVA-B-DOCREADER-1, evidence backlog/evidence/2026-09-06-doc-reader-review-round1.md"
sprint: nova-b
done_when: manual
---

# Documentation has no reader-facing review, and no machine binding for one

## Description

Every documentation check this repository runs is structural. Links resolve
(`check-doc-contracts.mjs`), every `docs/` path is classified
(`check-observation-governance.mjs`), every verify surface is declared
(`check-product-capability-inventory.mjs`), the ADR corpus agrees with itself
(`check-adr-consistency.mjs`), and a commit range that touched a governed path
carries a reconciliation record (`check-doc-reconciliation.mjs`, push layer 1b).
Not one of them asks whether a document is comprehensible, whether its sections
are in a sensible order for a reader arriving new, or whether what matters most
is presented most prominently.

That last axis has a specific, named failure mode: agent-written documentation
systematically over-presents whatever was built most recently and
under-presents older capability that is far more consequential. A structural
check cannot see it, and the technical Critic will not report it — it reviews a
diff against a contract and will pass a page that is correct and unreadable.

The PO requires a second review of a different kind — a reader's Critic, a
Lektor — closing every documentation block: it reads as a user of the product,
and it reports comprehensibility, order, granularity and weighting. What is
open is not whether it happens but where it is anchored so that it cannot be
skipped, and that question has a real constraint attached.

## Triggering situation

- PO ruling in session on 2026-09-06, in the middle of the 0.6.2 documentation
  work, after two dispatches had corrected release-line drift on the front
  doors without anyone asking whether those pages work as documents.
- A first round was run the same day (`NVA-B-DOCREADER-1`); its output is
  `backlog/evidence/2026-09-06-doc-reader-review-round1.md`. That round found,
  among other things, that the word "audit" appears in two of the six
  front-door documents while the PO-decided audience is teams carrying audit
  obligations. The round is evidence that the review produces findings no
  existing check produces; it is not evidence that the placement question is
  answered.
- The PO's own framing of the constraint: a reader's review that runs at the
  release preflight and produces findings forces documentation changes, which
  produce a new candidate, which the preflight would then have to review
  again.

## Affected artifact

- `docs/push-release-flow.md` — layer 1b is the existing precedent for binding
  a documentation obligation to an exact commit range.
- `harness/scripts/check-doc-reconciliation.mjs` — the mechanism to copy, and
  itself under-enforced (see the coverage note below).
- `harness/review-protocol.md` and `docs/adr/0014-critic-contract.md` — the
  Critic contract, which this review is deliberately NOT an instance of: it
  receives documents rather than a diff, and it judges presentation rather
  than correctness. Whether it becomes a second role, a second Critic lane, or
  a named dispatch pattern is part of what this item decides.
- `roles/` — if it becomes a role, it needs a contract of its own.
- `plugins/pipeline-core/skills/close-block/SKILL.md` — step 4's drift checks
  are the closest existing home for a documentation-block gate.

## Proposal

Three parts, in order of confidence.

**1. Separate the expensive judgment from the cheap binding.** The review
itself costs a full agent run over roughly 110 KB of prose and produces
findings that need rework. Running that at a push is disproportionate, and
running it at the release preflight creates exactly the candidate regress the
PO named. Neither is necessary: the expensive part belongs inside the
documentation block, where rework is normal and cheap. What the release
preflight then checks is not the review but its record — does a reader's
review exist that names the current documentation state?

That is the shape `check-doc-reconciliation.mjs` already uses, and its own
header explains why: an obligation recorded in a handover has a
one-context-window lifetime, so it binds the obligation to a commit range
instead, and the record is written as the last commit because writing it
changes the tree it would otherwise have to live inside. A reader-review
record follows the same contract: run the review, resolve the findings, then
commit the record naming the resolved state. No regress, because the expensive
step sits before the freeze and the preflight only recomputes a binding.

**2. Decide the review's own contract.** It is not the Critic of ADR-0014 and
must not inherit that contract by default. What the first round showed works:
a blind phase reading only the user-facing documents, with no source, no
capability inventory and no history, so its verdict on comprehensibility is a
real reader's verdict; then a weighting phase against the declared capability
set, which is where the recency inversion becomes visible. Findings are cuts
and reorderings with a file and line range, never replacement prose. That
two-phase split is the substance of the role and should be written down before
it is automated.

**3. Fix the precedent's own coverage while copying it.** Layer 1b enforces
only against ADRs that carry a `**Governs:**` line. Measured 2026-09-06:

| ADRs in `docs/adr/` | carrying a `Governs:` line |
|---|---|
| 80 | 12 |

The checker counts the rest and never enforces on them, deliberately, so it
would be usable on day one. That was a reasonable start and has not been
followed up. Copying the mechanism for a reader-review record while its
original enforces on roughly a sixth of the corpus would inherit the same
quiet gap. Adding the missing `Governs:` lines is cheap and mechanical, and it
is worth its own item rather than being folded into this one silently.

**Also worth deciding, but not blocking the above:** the PO raised this as
something users of the product could have too, not only an internal practice.
The bias is not repository-specific — anyone whose documentation is written by
an agent gets the newest feature first and the most important one last, and
the blind phase is the part nobody builds for themselves because it looks like
wasted effort until it produces a finding. If this becomes a shipped
capability it needs an entry in `docs/product-capability-inventory.json` and
the usual honest status tag; it is a candidate, not a commitment.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted by the PO on 2026-09-07; use the proposed review/binding split and wire the work into the backlog.
- **Rationale:** review inside the documentation block permits normal rework; release preflight checks only a record bound to the reviewed documentation state. Approval does not claim that the binding exists yet.
- **Assignment (if accepted):** Nova B documentation block; prerequisite: `pipeline.complete-adr-governs-coverage-before-reader-review-binding`. Preserve the reader review's blind phase and invalidate its binding when covered documentation changes.
- **Date:** 2026-09-07
