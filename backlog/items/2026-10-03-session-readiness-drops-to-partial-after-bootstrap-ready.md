---
schema: pipeline.backlog-item.v1
id: pipeline.session-readiness-drops-to-partial-after-bootstrap-ready
type: defect
owner: pipeline
status: open
created: 2026-10-03
source: "Manual observation, Claude Code session on Windows, 2026-10-03, feat/sprint-alfred at a0d83ce78."
sprint: alfred
done_when: manual
---

# Session readiness is `partial` after a fully ready bootstrap sequence

## Description

The bootstrap sequence ran as `pipeline-start` prescribes. The preflight
returned `ready`. Its `nextAction`, `project-onboarding-v3.mjs inspect --intent
bootstrap --runner claude`, returned `ready`, and `pipeline-state.mjs inspect`
returned `draft` as expected. Shortly afterwards a read-only `git grep` was
refused with `GUARD-LIFECYCLE-NOT-READY: Pipeline session readiness is partial`.
The guard demanded a further `inspect --intent session` that neither the
preflight nor `SKILL.md` names. That inspect then returned `ready` with
`sessionCapability: passed`. Of two parallel `git grep` calls in the same turn,
one was refused and one admitted.

The prescribed sequence therefore does not by itself produce the readiness the
guard checks, and the switch between the two states looks timing-dependent.
A possible contributor is the failed observation-governance bootstrap
(`OGB-CHECK-FAILED`) in between. Not measured.

## Triggering situation

Bootstrap re-entry 2026-10-03 per `docs/0.7-recovery-2026-10-03.md`.

## Affected artifact

`plugins/pipeline-core/skills/pipeline-start/SKILL.md` (command sequence),
`scripts/pipeline-start-preflight.mjs` (`nextAction` intent), and the
readiness evaluation in `hooks/guard-lifecycle-ready.mjs`.

## Proposal

Make the documented bootstrap sequence end in the exact readiness state the
guard evaluates: either the preflight emits `--intent session` for an
interactive session, or the guard accepts a ready `bootstrap` readback. Record
the transition that sets `partial` with a typed reason, and test that parallel
read-only calls see one consistent readiness snapshot.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**

## Observed again 2026-10-05

Flapping readiness `partial` was seen again in the Alfred session. It is not
caused by GUARD-READ-TARGET (the Explore lookup). Hypothesis: concurrent
preflights rewrite authority state. Not measured. Instrument first, then fix.
