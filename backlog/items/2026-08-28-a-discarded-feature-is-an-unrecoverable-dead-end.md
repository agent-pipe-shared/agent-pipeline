---
schema: pipeline.backlog-item.v1
id: pipeline.discarded-feature-dead-end
type: defect
owner: pipeline
status: closed
created: 2026-08-28
sprint: nova
tracking: "NOW / Nova A — delivered 2026-08-28, same session it was reported"
source: "Consumer project HA, incident report S56 finding B6 (2026-08-28). The reported diagnosis named the validator; re-reading the code here located the real asymmetry at the call site."
closure_evidence: "plugins/pipeline-core/lib/onboarding-continuity.test.mjs, 233/233, including a new check driving both discard shapes through the cleanup reader"
---

# A discarded feature made a repository permanently unobservable

## What was measured

`discard-feature` deliberately never writes to `closedFeatures` — a discard is an honest
record of abandonment, not a manufactured closure. `validClosedTransitionState()`'s final
condition compares `closedFeatures.at(-1).closedAt` against `state.updatedAt`. After a
discard, `updatedAt` carries the discard's timestamp while that entry still carries some
earlier close, so the equality can never hold.

Observed in the consumer's repository:

```
state.updatedAt                      = 2026-08-28T16:24:38.566Z   (discard)
state.closedFeatures.at(-1).closedAt = 2026-08-28T16:13:01.528Z   (earlier close)
```

Result: `SESSION-CLEANUP-STATE-MALFORMED` → readiness `partial` → every pipeline script on
that repository refused, including the recovery the refusal itself named. The only
remaining permitted action was writing the incident report; recovery needed a human at
their own terminal.

## Where the defect actually was

Not in the validator. The continuity projection has always accepted either transition
shape — `validClosedTransitionState(...) || validDiscardedTransitionState(...)` — and
`validDiscardedTransitionState` exists precisely for this case, with a comment saying
validity is decided by timestamp rather than by which array happens to exist.

The session-cleanup OBSERVER (`observeSessionCleanupState`) required the closed shape
alone. That asymmetry between two call sites was the whole defect.

The reported fix — widen `validClosedTransitionState` — would have loosened a check other
code relies on staying narrow. Verifying the claim in the code before acting on it is what
located the real cause.

## What was delivered

The observer accepts either shape, exactly as the projection already does. The
release-proof scan that follows reads `closedFeatures ?? []`, because a repository whose
only transition is a discard carries no such array at all — an empty candidate set, not a
crash. A new test drives both discard shapes (with a prior close, and with none) through
the cleanup reader that was blind to them.

## Related

- `2026-08-28-the-readiness-guard-blocks-the-recovery-command-it-names.md` — this removed
  one way INTO that deadlock, not the deadlock itself.
