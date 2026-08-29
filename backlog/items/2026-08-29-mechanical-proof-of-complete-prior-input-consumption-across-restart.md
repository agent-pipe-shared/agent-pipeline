---
schema: pipeline.backlog-item.v1
id: pipeline.mechanical-proof-of-complete-prior-input-consumption-across-restart
type: requirement
owner: pipeline
status: open
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
