---
schema: pipeline.backlog-item.v1
id: pipeline.native-windows-verify-red-suite-class
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: "ADR-0051 Follow-up section names this as one of two gaps to track as a dated backlog item; created per backlog/items/2026-08-05-adr-0051-follow-up-gaps-untracked.md's proposal, executed 2026-08-06 night autonomous backlog reconciliation."
due: 2026-09-06
---

# The native-Windows Verify red-suite class from the Cyborg-sprint history has no tracking item

## Description

[ADR-0051](../../docs/adr/0051-dual-runner-tri-platform-development-contract.md)'s
Follow-up section names this gap explicitly: "the native-Windows Verify
red-suite class from the Cyborg-sprint history" — per that history, 11 suites
red on native Windows in both Git-Bash and PowerShell, 25 red in PowerShell
alone. No backlog item existed for this class as a whole; several individual
Windows defects were filed and some closed (e.g.
`backlog/items/2026-07-25-po-gate-authority-path-canonicalization.md`,
`backlog/items/2026-07-25-windows-verify-brittle-test-hygiene.md`, both closed
2026-08-06), but nothing tracks the *class* — whether the remaining count has
shrunk, and by how much, since the original 11/25 measurement.

[ADR-0057](../../docs/adr/0057-runner-platform-support-is-an-implementation-obligation.md),
which landed after this gap was first flagged, restates the same "tracked,
unchanged" language for this class without naming a concrete backlog item
either — confirmed 2026-08-06 by reading it in full: ADR-0057 addresses a
different question (whether ADR-0051's "support" clause is an evidence-matrix
reading or an implementation-obligation reading) and does not resolve or
retire this tracking gap.

## Triggering situation

T1 Critic review finding F5 (2026-08-04/05) named this gap in ADR-0051's
Follow-up section but no backlog item was ever created for it; found
untracked by a later Critic review
(`backlog/items/2026-08-05-adr-0051-follow-up-gaps-untracked.md`, F5's own
follow-up finding), and reconfirmed still untracked after ADR-0057 landed
(2026-08-06 night autonomous backlog reconciliation). Created now, executing
that item's own proposal.

## Affected artifact

The native-Windows portion of `harness/scripts/verify.mjs`'s registered
suite set; no single library file — this is a cross-cutting class, not one
defect.

## Proposal

Not designed yet. First step: re-run (or arrange for the PO to run) Verify on
native Windows against current HEAD to get a fresh red-suite count and diff
it against the original 11/25 measurement — several individual fixes have
landed since (this item's own Description lists two closed examples), so the
class may already be smaller than when first measured. Then either close
individual fixed suites' items as already happens, or, if the class is
large enough to warrant it, track the remaining set as one dated inventory
here rather than as isolated one-off items.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
