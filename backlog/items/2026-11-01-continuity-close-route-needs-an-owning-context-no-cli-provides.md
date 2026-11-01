---
schema: pipeline.backlog-item.v1
id: pipeline.continuity-close-route-needs-an-owning-context-no-cli-provides
type: defect
owner: pipeline
status: open
done_when: manual
release: 0.7.1
created: 2026-11-01
sprint: alfred
source: "Consumer finding (2026-11-01): close-feature step 3, `pipeline-state.mjs continuity-result-bootstrap-plan`, is refused SDC-AUTHORITY-UNAVAILABLE (companion-owning-lifecycle-context-required) in a project whose session-authority registry exists; another consumer ran the same step directly and it succeeded."
---

# The Continuity close route calls State verbs that need an owning context no CLI provides

## What happened

A consumer closing an onboarding epic followed the ordered Continuity route of the close-feature skill: plan-start and apply-start of the close lifecycle, the
transition to `checkpointed` (both applied), then `pipeline-state.mjs continuity-result-bootstrap-plan` with no flags. That step exits 2:
`State authority route unavailable (SDC-AUTHORITY-UNAVAILABLE: companion-owning-lifecycle-context-required)`. The session-authority repair inspection of the
project reads clean (lock absent, all producers ok, no drift), so the refusal is not repair debris. A second consumer ran the same two commands (plan, then
apply) directly from its project root on an earlier build and never saw this refusal.

## Cause (read from the code)

`scripts/pipeline-state.mjs` (~13967-13983) takes the companion route for every entry in `STATE_COMPANION_ENTRIES` **only when the project's session-authority
catalogue is present** (`stateCataloguePresent`); without the catalogue the direct route runs, which is why the second consumer was not affected. On the
companion route `prepareStateCompanion` (~14550) requires a context handle from `readSourceOwnedOnboardingContinuityCompanionContext`
(`lib/onboarding-continuity.mjs` ~10337). That handle exists only inside an `AsyncLocalStorage` scope that `runOwnedContinuityCompanionState` enters, and that
function is reached only through `continuityExecuteCompanionOperation`, i.e. the owning port's `executeCompanionOperation` on an armed `onboarding-continuity`
member bound to a requester session. In the repository that port is driven by test fixtures (`design-approval-route.e2e.test.mjs`
`bindRouteOwner`/`ownedCli`, `pipeline-state-result-bootstrap.test.mjs`) and by controlled-method code; no shipped CLI or hook enters it for
`continuity-result-bootstrap-plan`, `continuity-result-bootstrap-apply` or `close-feature`. The requirement dates from the 2026-10-12 checkpoint
(`d02409a8a`).

So in a project with a session-authority catalogue, the close-feature skill's step 3 (and the State verbs after it: the Result bootstrap apply, the close
request, `close-feature`) cannot be run from a shell session, and the skill does not say what else to do.

## Open points before the fix

- Whether a shipped route is meant to exist (an owning-lifecycle CLI that arms the member and wraps these entries) and is missing, or the skill describes a
  route that only applies without a catalogue.
- Which of the other companion entries (`set-feature`, `submit-plan`, `present-plan`, `continuity-init`, `afk-project`) the same consumers reached, and by which
  command, since they are in the same set.
- Why the catalogue exists in one consumer and not the other.

## PO tile (decided 2026-11-01: option A, D231; PO word: into candidate 15c)

- A (recommended): ship the owning route as a CLI (arms the `onboarding-continuity` member for the session and runs one named companion entry through
  `executeCompanionOperation`, with the same gates), and document it in the close-feature skill. Protected kernel files.
- B: make the direct route available again for the Result-bootstrap and close entries when the PO attends the command (a smaller change, but it reopens
  the owner-bound State write the companion design closed).
- C: no change; a consumer with a session-authority catalogue cannot close an epic through the Continuity route.

## Interim route in 0.7.0

None found by reading. The consumer must not force the registry or the member.
