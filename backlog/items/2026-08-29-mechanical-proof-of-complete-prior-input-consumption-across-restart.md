---
schema: pipeline.backlog-item.v1
id: pipeline.mechanical-proof-of-complete-prior-input-consumption-across-restart
type: requirement
owner: pipeline
status: closed
closed_at: 2026-08-29
closure_repository: self
closure_commit: 3d244dae4daa4a9603b3b7062947de4e729960dd
closure_evidence: plugins/pipeline-core/scripts/check-resume-consumption.test.mjs
created: 2026-08-29
sprint: nova
done_when: path-exists plugins/pipeline-core/scripts/check-resume-consumption.mjs
source: "PO ruling, recorded by scratch/greenfield-triage-2026-08-29.md finding F14 as the durable form of F12+F13, observed during the 2026-08-29 three-runner greenfield test."
---

# A restart must mechanically prove the complete prior user input was read, not merely claim it

## What happened

F12 (`pipeline.resume-hint-capture-consumes-card-that-failed-schema-
validation`) showed the resume card can be silently destroyed by its own
validation failure. F13 (`pipeline.undocumented-transcript-fallback-selects-
wrong-file-by-mtime`) showed that, once state is empty, an agent's own
recovery guess can be wrong with no correction. Both failures rendered
identically from the outside: the agent proceeded as if it had picked up
where the user left off, with no way for the user or a later reviewer to
tell that it had not. The PO's ask is the durable, mechanism-independent
form of both: prove, mechanically, that the complete prior user input was
actually read across a restart — not just that some card exists, and not
that the agent asserts it read something.

## Where it is

This is a requirement for new mechanism, not a location of an existing bug.
The closest existing building blocks, read for this item:

- `plugins/pipeline-core/lib/resume-hint.mjs` — `captureResumeHint`,
  `inspectResumeHint`, `discardResumeHint`. Today `inspect` reports a status
  (`available`/`absent`/`challenged-stale`/`ignored-invalid`) but nothing
  records that the content was actually READ and incorporated by the next
  session — SKILL.md step 6 states the MUST-DO consumption duty in prose
  only ("the agent MUST read `project/resume-hint.json`'s content... A
  failed or skipped read must be surfaced honestly"), which is exactly the
  "the agent's own assertion" problem this item must not rest its acceptance
  on.
- `plugins/pipeline-core/lib/onboarding-continuity.mjs` —
  `applyOnboardingIntakeCapture`/`readOnboardingIntakeMaterialInput` persist
  material input chunks but likewise have no consumption-receipt concept.

## Proposal

"The agent read it" is not directly observable, so the acceptance criteria
below deliberately do not rest on it. Two mechanical pieces, composed:

1. **Deterministic transcript/session identification.** Whatever identifies
   "the prior session's material input" must be a content-addressed or
   otherwise deterministic reference (e.g. a hash of the captured card's
   bytes, or the resume-hint file's own path plus a monotonic sequence/
   timestamp written by the pipeline itself at capture time) — never an
   mtime-based guess across files the pipeline does not control (this is
   exactly what went wrong in F13).
2. **A recorded consumption receipt.** At bootstrap, when a Resume-Hint or
   captured material input is present, the session writes a receipt (e.g.
   into `project/resume-hint.json` itself, or a sibling file) binding: the
   deterministic identifier from (1), a timestamp, and — machine-checkable,
   not merely asserted — some proof the content was incorporated, such as
   the confirmation-line's own captured "State {{HANDOVER_DATE}}" field being
   forced to derive FROM the receipt rather than being independently typed.
   A later check (a script, or `check-observation-governance.mjs`-style
   verifier) can then assert: "a Resume-Hint was `available` at bootstrap"
   implies "a consumption receipt for that exact identifier exists" — a
   contradiction between those two facts is the mechanical falsifier this
   requirement needs. Add a marker `pipeline.consumption-receipt` at the
   point this mechanism lands.

## Acceptance

- A new script or test can determine, from repository/project state alone
  (no chat/transcript access), whether a session that had an `available`
  Resume-Hint at bootstrap produced a matching consumption receipt before
  its first substantive action.
- The check fails (loudly, not silently) when a Resume-Hint was `available`
  and no matching receipt exists — this is the regression case F12/F13 both
  produced.
- The mechanism does not gate readiness (per the existing "never a
  readiness precondition" rule in SKILL.md step 6) — it is a checkable,
  after-the-fact fact, consistent with the rest of this pipeline's
  deterministic-before-probabilistic posture.
- Not claimed satisfiable purely by an agent's own prose assertion in any
  report — the whole point of this item is that such an assertion is not
  evidence.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** A direct PO ruling, and the durable generalization of two
  already-confirmed defects (F12, F13) in the same restart path — fixing
  those two closes today's specific incidents but leaves the underlying gap
  (no mechanical proof of consumption) open for the next mechanism that
  touches this path.
- **Assignment:** `sprint: nova`; blocks the 0.6.0 candidate as the third
  item in the F12+F13+F14 restart-continuity chain (triage "Ordering
  recommendation" #3) — a requirement, not a defect, so implementing it is
  new work rather than a repair, but the PO named it as must-land before the
  candidate.
- **Date:** 2026-08-29

## Stage 1 landed, 2026-08-29 (dispatch NVA-R4-RESUMERECEIPT, commit c3020e1d)

The observation half of Proposal points 1 and 2 is implemented and merged.
`capture` now records a content digest of the whole card it persisted —
`materialInput` and `values` included — and a new `consume`/`query` CLI pair
binds a consuming session's identity to that digest, derived from the card's
own recorded bytes rather than from anything the caller asserts. Receipts live
under `.git/agent-pipeline/resume-hint/`, never the tracked tree. `query`
distinguishes three outcomes: no card, consumed with a matching digest, and
not-consumed-or-mismatched. A corrupt or stale receipt is reported through the
outcome and is never fatal.

Verified on the merged branch state, not taken from the dispatch report:
`plugins/pipeline-core/scripts/resume-hint.test.mjs` 11/11 exit 0,
`plugins/pipeline-core/lib/resume-hint.test.mjs` 21/21 exit 0,
`harness/scripts/check-consumer-safe-paths.test.mjs` 9/9 exit 0.

**This item stays open, and its `done_when` has been repointed accordingly.**
The old predicate — a `pipeline.consumption-receipt` marker in
`lib/resume-hint.mjs` — was satisfied the moment the mechanism existed, which
is weaker than this item's own Acceptance demands. That Acceptance asks for a
check that **fails loudly** when a Resume-Hint was `available` at bootstrap
and no matching receipt exists. Nothing is wired at bootstrap yet and nothing
fails; the machinery exists but is inert, which the old predicate could not
tell apart from the finished state. The predicate now names the missing
falsifier itself.

That inertness is deliberate, not an oversight: the PO approved
"observe first, enforce later" for this mechanism, the same graduation pattern
the `done_when` UNDECLARED class already follows. Stage 2 is the graduation —
call `resume-hint.mjs consume` at the bootstrap consumption step, and add the
verifier asserting "an `available` card implies a matching receipt". Until
that verifier exists, a receipt proves only that the card's bytes were read,
never that they were understood or acted on.

## Stage 2 landed, 2026-08-29 (dispatch NVA-R11-RESUMECONSUME)

Both remaining Stage-2 pieces are built and merged, as pure composition of
Stage 1's own `inspectResumeHint`/`queryResumeHintConsumption`/
`recordResumeHintConsumption` — no changes to their digest/binding logic.

1. **The verifier.** `plugins/pipeline-core/scripts/check-resume-consumption.mjs`
   (+ `.test.mjs`, 12/12 green) reads (a) whether a Resume-Hint card was
   `available` via `inspectResumeHint`, and (b) whether a matching consumption
   receipt exists for that exact card's current digest via
   `queryResumeHintConsumption`. PASS when no card was available, PASS when
   `available` + a matching receipt exists, FATAL when `available` + no
   matching receipt (absent, corrupt, digest-mismatched, or no digest record
   at all — the F12/F13 regression shape). A synthetic, filesystem-free
   `inspect`/`query`-injection fixture proves the fatal path independent of
   any real repository state, per this item's own Acceptance wording. Never
   wired into any guard or readiness gate. Not registered in
   `harness/scripts/verify.mjs` (TP-3-protected, no in-session override) —
   disclosed in the script's own header, same posture
   `check-backlog-done-predicate.mjs` used before its own later,
   separately-authorized registration.
2. **The missing consume call.** `plugins/pipeline-core/hooks/
   codex-session-start-hint.mjs`'s `resumeHintContextLines()` — the one
   place in this codebase that surfaces a resume-hint card's content into a
   restarting session's context, on every `startup|resume|clear`
   SessionStart (Claude and Codex alike, hooks.json hook 8) — now calls
   `recordResumeHintConsumption({ rootDir, sessionId })` immediately before
   building those lines, using the real hook payload's `session_id` (the
   same field `post-compact-reground.mjs` already reads for the identical
   purpose). Best-effort, wrapped in try/catch, never blocking: a missing
   session id, no digest record, or any I/O failure never prevents the
   card's content from still reaching the session. 33/33 green in
   `codex-session-start-hint.test.mjs` (27 pre-existing + new assertions
   proving the receipt is actually written, per-session, through both the
   direct function call and the real CLI/stdin path).

Verified on the merged branch state: `check-resume-consumption.test.mjs`
12/12 exit 0, `codex-session-start-hint.test.mjs` 33/33 exit 0,
`resume-hint.test.mjs` (lib) 21/21 exit 0 unchanged,
`resume-hint.test.mjs` (scripts) 11/11 exit 0 unchanged,
`check-consumer-safe-paths.test.mjs` 9/9 exit 0 (one new Class B allowlist
entry added for this script's own status-note mention of
`harness/scripts/verify.mjs`).

Left open by the dispatch itself, disclosed rather than silently closed,
pending Elephant verification against the item's own Acceptance criteria
(the "PO-facing acceptance sign-off" reservation came from the dispatch's
own briefing caution, not from anything the Acceptance section actually
demands). All four Acceptance bullets independently re-checked and
confirmed met by the dispatcher: (1) a script determines consumption from
repository/project state alone, no chat/transcript access; (2) it fails
loudly, not silently, on the F12/F13 regression shape; (3) it never gates
readiness anywhere; (4) not satisfiable by prose alone — the fixture proves
the fatal path independent of any real repository state. Closed here.

`check-suite-registration.mjs`'s
`DELIBERATELY_UNREGISTERED` opt-out list was deliberately NOT given a new
entry for the new test file (that list was emptied 2026-08-29 specifically
because an opt-out entry with no trigger to retire it is a standing debt) —
the unregistered-in-`verify.mjs` state is disclosed in prose instead.

## Stage 3 landed, 2026-08-30 (PO explicit request: "bauen wir es jetzt ein
sonst findet es ja keiner" — graduating from observe to enforce)

`check-resume-consumption.mjs` required a live `--session-id` to check
against, which a batch `verify.mjs` run has no way to supply — the real
reason Stage 2 left it unregistered, not only the TP-3 ceremony cost. Closed
by dispatch `NVA-CF-RESUMECHECKANYSESSION` (commit `2437d338`): a new
`--any-session` mode (new lib function `anyResumeHintConsumptionReceipt`,
new CLI flag, additive-only — the existing single-session mode is
byte-for-byte unchanged) answers "does ANY recorded receipt, from any
session, match the currently-available card's digest" — still genuinely
mechanical, no session identity required. Independently re-verified by the
Elephant: `resume-hint.test.mjs` (lib) 26/26, `check-resume-consumption.test.mjs`
21/21, `check-consumer-safe-paths.test.mjs` 9/9.

Registered into `harness/scripts/verify.mjs` via the TP-3 signed-override
ceremony (request `46c5e8fe6149479e67fa8ddc24b25e24ccc392e03a56b0e93c1716aaa90d2641`,
plan `3bb7a50261be98e2e07ed6428eaad3b5e1baf0ddd74821d73579d4eae318e74a`, PO
signature verified against trust anchor
`2de20a39d0f1c13c15350e428ea0c70be50f8fbca26ec88758a8dcb1a880beee`), commit
`03c1edcd`. Sanity-checked live against this repository: PASS
(`RH-CHECK-NO-CARD`, no card currently available). The mechanism is now a
real verify-gate check, not only an on-demand observation.
