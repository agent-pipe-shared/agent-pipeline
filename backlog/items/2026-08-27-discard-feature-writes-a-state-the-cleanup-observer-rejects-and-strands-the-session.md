---
schema: pipeline.backlog-item.v1
id: pipeline.discard-feature-writes-a-state-the-cleanup-observer-rejects-and-strands-the-session
type: defect
owner: pipeline
status: open
created: 2026-08-27
sprint: alfred
source: "Hit live, 2026-08-27, in the Alfred clone, executing the epic switch the tool itself directs (discard-feature then set-feature). Reproduced against the source the same session; line references verified."
---

# `discard-feature` writes a state shape the session-cleanup observer rejects, and the guard then blocks the `set-feature` that would leave it

## The loop, measured

`discard-feature` is the structurally admitted route out of an active feature
with no Result (its own gate: continuity present AND `authority.result ===
null`). Executing it on 2026-08-27 produced, in order:

1. `discard-feature` succeeds; state now has `discardedFeatures[]`, no
   `activeFeature`, no `continuity` — exactly the shape
   `validDiscardedTransitionState` (`lib/onboarding-continuity.mjs:305`)
   accepts, and the continuity classifier duly classified it `valid`
   (after the sibling closed-Result drift, filed separately, was repaired).
2. `project-onboarding-v3 inspect --intent session` nevertheless reports
   `partial` with `cleanup_recovery_observation_unavailable`, because
   `observeSessionCleanupState` (`lib/onboarding-continuity.mjs:2232`) knows
   exactly TWO shapes for a state without active continuity — design
   transition (`:2239`) and close transition (`:2253`) — and raises
   `SESSION-CLEANUP-STATE-MALFORMED` for a discard transition.
   `validClosedTransitionState` demands `closedFeatures.at(-1).closedAt ===
   updatedAt`; after a discard, `updatedAt` carries the discard timestamp.
3. `guard-lifecycle-ready` reads the `partial` readiness and blocks EVERY tool
   call except its own recovery lane — including
   `pipeline-state.mjs set-feature`, the exact command that would restore a
   shape both observers accept.
4. The typed recovery path dead-ends by design:
   `session-cleanup.mjs plan-human-recovery` returns `decision-required` with
   two candidates that are both `mutation: false`. Nothing can clear the
   condition from inside the session.

Escape used: the PO ran `set-feature` in their own shell (outside the
PreToolUse boundary). Readiness returned to `ready` immediately — confirming
the state content was never the problem, only the observer's coverage.

## The defect, precisely

Two validators disagree about the same bytes. `validDiscardedTransitionState`
was added alongside `discard-feature`; `observeSessionCleanupState` was never
taught the shape. The result is a sanctioned lifecycle verb whose documented
happy path terminates in a state the readiness stack rejects, with the exit
command blocked by the very guard reading that rejection.

## Why this is Alfred material

Mechanical governance depends on the lifecycle's own transitions being closed
under its own observers: every state a sanctioned writer can produce must be a
state every reader accepts. This incident is a counterexample with a
session-blocking cost, and it is the second one in the same repository (the
first: a legacy plan-revocation shape, recovered via
`continuity-authority-revision-recover`). A conformance check — enumerate
sanctioned writer outcomes, assert every observer classifies each as
ready/valid — would have caught both before they shipped.

## Affected artifact

- `plugins/pipeline-core/lib/onboarding-continuity.mjs`
  (`observeSessionCleanupState`, `:2232` — the missing discard branch)
- `plugins/pipeline-core/scripts/pipeline-state.mjs` (`discard-feature`, which
  cannot currently promise a ready follow-on state)
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` (blocks the exit
  command while the condition stands; correct behavior, wrong precondition)

## Proposal

Not designed here; three candidate layers, first is the direct fix:

1. Teach `observeSessionCleanupState` the discard shape by reusing the
   existing `validDiscardedTransitionState` — mirroring its design/closed
   branches (`sessionCleanup: null`, no binding expected).
2. Consider whether `discard-feature` should refuse to strand: either verify
   the post-state against the full observer set before committing the write,
   or take the follow-on feature in the same transaction.
3. Generalize: a writer/observer conformance suite in Verify — every sanctioned
   `pipeline-state.mjs` verb's output state is classified by
   `classifyOnboardingContinuity` AND `observeSessionCleanupState`; any
   `damaged`/`malformed` classification of a sanctioned outcome fails the
   suite. This is the mechanical-governance fix; 1 alone fixes one instance.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
