---
schema: pipeline.backlog-item.v1
id: pipeline.adr-0051-follow-up-gaps-untracked
type: defect
owner: pipeline
status: closed
created: 2026-08-05
source: "T1 Critic review (Opus, functional-equivalent-read-only) of commits 7f5ac97/d622dc3/9429b94/b14391c, finding F5, Sprint Nova session 2026-08-04/05"
closed_at: 2026-08-06
closure_repository: self
closure_commit: bee2f41a3498a65412284f7786d406188288261b
closure_evidence: backlog/evidence/2026-08-06-third-reconciliation-pass.md
---

# ADR-0051's own gap-tracking mechanism was never instantiated

## Description

ADR-0051 ("Dual-runner … tri-platform development contract") mandates in its
Follow-up section: "Track discovered runner/platform gaps as dated backlog
items referencing this ADR, starting with: the unconditional Codex-specific
restart-barrier read in `project-onboarding-v3.mjs`'s ready path … and the
native-Windows Verify red-suite class from the Cyborg-sprint history." The
commit that landed the ADR (`d622dc3`) and the handover update that referenced
it (`docs/state.md`, commit `9429b94`) created no backlog item at all — the
ADR points at backlog items that do not exist, and `docs/state.md` says
"Tracked in ADR-0051's Follow-up," pointing back at the ADR. A closed loop
with no owner and no due date is a finding, not a mitigation
(`guardrails/quality-gates.md` QG-06).

## Triggering situation

T1 Critic review of the runner-routing fix (finding F5, `docs/adr/0051-dual-runner-tri-platform-development-contract.md` session, 2026-08-04/05). `grep -rln "0051" backlog/` returned no match at review time.

## Affected artifact

`docs/adr/0051-dual-runner-tri-platform-development-contract.md` (Follow-up
section); `plugins/pipeline-core/lib/project-onboarding-v3.mjs` (the named
unconditional `readRestartBarrier` gap — separately, part of this same
finding's fix is also being closed for the *other* named F3/F4 gaps found by
the same review, tracked directly as code fixes rather than backlog items
since they were fixed same-session; this item covers the two gaps ADR-0051
itself named as deferred and NOT fixed same-session: the restart-barrier read,
and native-Windows Verify red suites).

## Proposal

1. Create two dated backlog items (or one combined item with two named
   sub-gaps) referencing ADR-0051 by number: (a) the unconditional
   Codex-specific `readRestartBarrier` call in `project-onboarding-v3.mjs`'s
   ready path for a fresh Claude-only project, (b) the native-Windows Verify
   red-suite class (11 suites red in both Git-Bash and PowerShell, 25 red in
   PowerShell alone, per the Cyborg-sprint history in `docs/state.md`).
2. Each item MUST carry owner (the PO) and an expiry date per QG-06 — this
   item sets that precedent with a 30-day due date; the PO may re-date at
   triage.
3. At the next triage sweep, decide accepted/deferred/rejected for each with
   a stated rationale, closing the loop ADR-0051 opened.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, delivered, closed.
- **Rationale:** proposal steps 1-2 executed 2026-08-06 night: two dated,
  owned, 30-day-expiry items created referencing this ADR by number —
  `backlog/items/2026-08-07-onboarding-ready-path-unconditional-restart-barrier-read.md`
  and
  `backlog/items/2026-08-07-native-windows-verify-red-suite-class.md`.
  Checked first whether [ADR-0057](../../docs/adr/0057-runner-platform-support-is-an-implementation-obligation.md)
  (landed after this item was filed) already resolved either gap: read in
  full, confirmed it addresses a different question (the definition of
  ADR-0051's "support" clause) and restates the same "tracked, unchanged"
  language for the Windows red-suite class without naming a concrete item
  either — i.e. it does not close this loop, and the two new items are
  still needed. Step 3 (the next triage sweep deciding
  accepted/deferred/rejected for each) is for a future session, per this
  item's own proposal — this item's job was only to create them.
- **Assignment (if accepted):** the two new items are unassigned, awaiting
  their own first triage.
- **Date:** 2026-08-06
