---
schema: pipeline.backlog-item.v1
id: pipeline.the-ai-hardening-gate-has-no-home-in-any-approved-feature-package
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: nova-b
done_when: contains specs/sprint-nova-epic/spec.md ai-assisted-hardening
tracking: "Scheduled for Nova B (PO decision 2026-08-28)"
source: "Re-Critic vtpgate2-368458af finding F5, re-measured and found wider than reported"
---

# A shipped security control has no work package and no acceptance criterion in the approved feature package

## What was measured

The Re-Critic reported: *"no acceptance criterion located in the briefed spec
for this change (c9). Evidence full-file rg over specs/sprint-nova-epic/spec.md
returned only line 1572."*

Line 1572 was read directly. It is the `B1-I` row of the Detailed
Implementation table, and the word it matched appears in the phrase
`ADR-0047 ownership/mode/link-count repair hardening` — an unrelated use of the
word. The single hit was a false positive, so the real count is zero:

| file | occurrences of `ai-assisted-hardening` or `verify-topology-preflight` |
|---|---|
| `specs/sprint-nova-epic/spec.md` | 0 |
| `specs/sprint-nova-epic/prd_sprint-nova-epic.md` | 0 |
| `specs/sprint-nova-epic/acceptance.md` | 0 |

The AI-assisted hardening gate — `plugins/pipeline-core/lib/ai-assisted-hardening.mjs`,
`plugins/pipeline-core/scripts/ai-assisted-hardening-gate.mjs` and
`plugins/pipeline-core/scripts/verify-topology-preflight.mjs`, plus their
suites — appears in the approved feature package neither as a work package, nor
as an acceptance criterion, nor in any row of the path-scope table that
`check-artifact-topology` enforces.

## Why it exists anyway

The gate was not planned into the epic. It grew out of a delivery blocker (the
CI topology preflight could not pass on this repository's own branch,
`pipeline.the-ci-topology-preflight-cannot-pass-on-this-branch`), two rounds of
Critic findings, and two PO decisions on 2026-08-28 — "Suite + named reviewer",
then "harden the source of the reviewer ID". That is legitimate work with a
legitimate trigger. What it never acquired is a home.

## Why it matters more than tidiness

1. **Scope becomes unanswerable.** A later session asking "may I change the
   hardening gate under this feature?" has nothing to read. The path-scope table
   is the mechanism that answers exactly that question, and these files are in no
   row of it.
2. **There is no criterion of correctness.** The control's contract lives in
   `backlog/evidence/2026-08-28-self-excluded-review-path-design.md`. That
   document is good and it is tracked, but it is evidence, not specification:
   nothing binds a future change to it, and no gate checks a delivery against it.
3. **The finding recurs.** An independent reviewer already raised it once. The
   next review of this code region raises it again, at the cost of another round,
   until the package says something about the gate.

## Proposal (confirm before assuming)

Amend the epic package through the sanctioned `feature-package-reconcile`
ceremony — not by editing the approved artifacts in place — to add:

- a work-package row naming the three source files and their suites as the
  allowed scope, in the same shape every other row uses;
- acceptance criteria for the control's actual behaviour, derived from the
  design contract's sections A and G: a self-excluded check counts only via the
  base-revision path or via candidate-suite-plus-named-review; the reviewer
  identity counts only from the repository variable; an unresolvable,
  non-ancestor or empty delivery window fails closed.

The ceremony is available: `pipeline.critical-command-kinds-excludes-feature-package-reconcile`,
which previously blocked it, is closed.

## Triage, 2026-08-28

- **Decision:** accepted. **Assignment: `sprint: nova`, scheduled for Nova B**
  (PO decision, 2026-08-28). Not a candidate blocker — the control is
  implemented, measured and green; what is missing is its record in the approved
  package.
- **Deliberately not done now:** running the reconcile ceremony immediately. It
  touches `check-artifact-topology` (`FTP-ARTIFACT-1`) and `threat-model-tests`
  and drops `guard-devplan` to `draft` mid-run — a poor trade against a finished
  candidate awaiting three-runner tests, for a gain that is entirely
  documentary. The work is scheduled rather than deferred open-endedly.
- **Companion item:** `pipeline.the-ci-topology-preflight-cannot-pass-on-this-branch`
  covers the three technical layers of the same gate. This item covers only its
  absence from the approved package; the two do not overlap and neither closes
  the other.
