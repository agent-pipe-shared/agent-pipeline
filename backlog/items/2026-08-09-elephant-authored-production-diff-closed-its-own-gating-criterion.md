---
schema: pipeline.backlog-item.v1
id: pipeline.elephant-authored-production-diff-closed-its-own-gating-criterion
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "Independent Critic FAIL (2026-08-09, F2) on a full-range review of the Phoenix measurement/closure wave (57 commits, 8e7a2f7..f7d9c0d)."
due: 2026-09-08
expires: 2026-09-08
---

# Elephant-authored production diff closed its own gating criterion

## Description

Commit `78c6ef1` added 232 lines to the canonical, TP-5-protected
`harness/scripts/pipeline-state.test.mjs`, registering PHX-WP-GATE's 26 staged
`feature-package-reconcile` cases. The commit message states plainly
`Dispatch: none -- Elephant, under the active signed maintenance window`. It
was written directly by the orchestrating (Elephant) session, not dispatched
to a fresh-context Goldfish.

Per `roles/elephant.md` EL-01, production diffs should originate from
dispatched Goldfish sessions; a narrow stage-0 fast-path exception exists
(≤2 files, ≤~25 diff lines) and it explicitly excludes test-file changes.
This 232-line, single-file test-registration diff does not qualify. Every
other test-authoring commit in the same wave (`8df045f`, `2a25520`, `055cb8b`,
`500d5cc`, `d536fcd`, `fdb0292`, `3161a8e`, `0b53f89`, `2594552`, `de13e92`,
`9f5e680`, and the three `PHX-WP-DOC-*` commits) carries a grounded
`Dispatch: PHX-WP-* (goldfish)` trailer or a dispatch-record artifact; `78c6ef1`
is the one exception.

**Why it happened, named plainly rather than excused:** the signed TP-3+TP-5
maintenance window has a hard 4-hour TTL that starts ticking at `prepare`. At
the point the window was opened, dispatching a fresh Goldfish, briefing it,
waiting for it to bootstrap, read the 26 staged cases and the target file,
transplant the code, verify, and commit — all before independently re-verifying
its result — was judged slower and riskier than doing the (already fully
scoped, already-tested, purely additive) transplant directly. That judgment
traded a real EL-01 violation for perceived time pressure on a criterion the
same session had itself just spent effort making time-boxed. An independent
Critic caught this; the orchestrating session did not flag it on its own.

**What this is not:** the maintenance window itself (`evidence/phx-p-ac-08-gmw-
request.json`) is genuine and correctly candidate-bound — it authorizes
*lifting file protection*, not a change in *who* may author the diff. Those are
different gates, and only the first was actually held.

## Triggering situation

Live, 2026-08-09, during the Phoenix epic's measurement/closure wave, at the
point P-AC-08's signed maintenance window was open and its four-hour clock
was running.

## Affected artifact

`harness/scripts/pipeline-state.test.mjs` (the diff itself, already landed,
not proposed for reversal — reverting/amending a landed commit is a separate,
larger decision than filing the gap); `roles/elephant.md` EL-01 (no change
proposed here, the rule is correct — the violation is in not having followed
it); the maintenance-window ceremony itself, which has no built-in reminder
that lifting file protection and authorizing self-authorship are different
questions.

## Proposal

Not designed here. Candidates for a future session:

1. A checklist item in the maintenance-window `prepare`/`install` flow (or in
   `docs/push-release-flow.md`) stating explicitly: opening a window lifts
   guard-testpath protection; it does NOT create a stage-0-equivalent
   exception to EL-01 authorship discipline. The diff inside the window still
   needs a Goldfish dispatch unless it independently qualifies for stage-0.
2. Consider whether the 4-hour TTL is workable at all for a diff that
   requires a dispatch round-trip, or whether maintenance-window ceremonies
   should assume and budget for at least one Goldfish cycle inside the
   window from the start, rather than treating dispatch overhead as the thing
   to cut when the clock is running.
3. A lighter-weight self-check: before an Elephant session commits directly to
   any file under `project/guard-config.json`'s `protectedTestPaths`, even
   under an active signed window, require an explicit stated stage-0
   qualification check (file count, line count, no-test-file confirmation) —
   the same check EL-01 already defines, just made a mandatory pre-commit
   question rather than an implicit judgment call.

## Triage — reviewed 2026-08-18

- **Decision:** Confirmed still open, exactly as described. Not resolving here.
- **Rationale:** Re-checked 2026-08-18: none of `docs/push-release-flow.md`, `roles/elephant.md`, or `plugins/pipeline-core/lib/guard-maintenance-window.mjs` mentions the checklist distinction this item proposes (file-protection lift vs. authorship-exception), and Nova has no equivalent either. The item's own Proposal section is explicit that it is "Not designed here" and lists three undesigned candidate directions — a checklist reminder, re-budgeting the maintenance-window TTL to assume a Goldfish round-trip, or a mandatory pre-commit stage-0 self-check — with a real tradeoff between them (process overhead vs. window duration vs. a new gate) that only the PO should settle.
- **Assignment (if accepted):** PO to choose among the three named candidates before a dispatch is briefed.
- **Date:** 2026-08-18

### PO Decision — 2026-08-18

- **Decision:** Candidate 3 — a mandatory pre-commit stage-0 self-check. Before any Elephant-authored commit to a `project/guard-config.json`-protected path, even under an active signed maintenance window, an explicit stated stage-0 qualification check (file count, line count, no-test-file confirmation) is required.
- **Rationale:** Elephant recommendation, adopted: a hard mandatory gate targets the actual root cause (an implicit judgment call made under TTL time pressure) directly, unlike a checklist reminder (candidate 1, easy to skip — which is exactly how this violation happened) or re-budgeting the maintenance-window TTL (candidate 2, changes window duration without closing the gap it doesn't actually address).
- **Assignment:** Dispatch-ready — brief a Goldfish to add the mandatory stage-0 self-check to the maintenance-window `prepare`/`install` flow, alongside candidate 1's checklist clarification (opening a window lifts file protection; it does not create a stage-0-equivalent EL-01 exception) as low-cost documentation.
- **Date:** 2026-08-18
