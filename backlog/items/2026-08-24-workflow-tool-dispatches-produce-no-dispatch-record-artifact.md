---
schema: pipeline.backlog-item.v1
id: pipeline.workflow-tool-dispatches-produce-no-dispatch-record-artifact
type: defect
owner: pipeline
status: open
created: 2026-08-24
source: "Third delta Critic review of sprint-agy-runner, finding F3 (specs/sprint-agy-runner/evidence/2026-08-24-delta3-critic-review-agy-runner.md); PO-accepted disposition 2026-08-24"
due: 2026-08-31
---

# Workflow-tool dispatches produce no `evidence/dispatch-record-<TASK_ID>.json` artifact

## Description

Five commits in the `sprint-agy-runner` AGY-FIX2 correction wave (`30e0adcc`,
`06483053`, `42196d50`, `1b55b98c`, `c15ccdff`) carry a `Dispatch: <ID>
(goldfish)` trailer for a goldfish task that genuinely ran through the
Workflow tool, but `evidence/` contains no
`dispatch-record-<TASK_ID>.json` for any of them — while the prior wave's
`agent()`-via-Agent-tool dispatches (`AGY-FIX-PUSHGUARD`, `AGY-FIX-HARDENING`,
etc.) do have their standard dispatch-record artifacts, ruling out pruning as
the explanation. `dispatch-authorship-verify.mjs` therefore cannot confirm
these five commits' authorship claim mechanically; they are `UNVERIFIABLE`
by the machine check, not `PASS`.

Root cause (not yet confirmed by reading the Workflow tool's dispatch path):
the Workflow tool's `agent()` primitive does not write the standard
`evidence/dispatch-record-<TASK_ID>.json` artifact that a template-built
Agent-tool dispatch does — a gap in the Workflow-tool integration, not
fabricated authorship on the commits themselves (accepted PO disposition,
`specs/sprint-agy-runner/evidence/2026-08-24-delta3-critic-review-agy-runner.md`
"PO disposition, 2026-08-24 (round 3, F3/F4/F5)").

## Why this matters

`agent-obligations.md` §6 makes the goldfish dispatch trailer a checkable
claim, and the Workflow tool is an explicitly sanctioned Elephant-only
dispatch mechanism
(`plugins/pipeline-core/skills/pipeline-start/references/workflow-dispatch.md`)
— every commit produced through it should be just as machine-verifiable as
one produced through a direct Agent-tool dispatch. As long as this gap
stands, every Workflow-tool-dispatched commit's authorship trailer is
structurally unverifiable, which will surface as a repeat Critic finding on
every future package that uses the Workflow tool for a Goldfish fan-out.

## Candidate shape (not a spec)

- Confirm the actual root cause: read how `agent()` results are surfaced
  back to the calling Elephant session and whether the standard
  dispatch-record-writing step (used by the template-built Agent-tool path)
  is simply never invoked for a Workflow-tool dispatch, or invoked but
  writing to a path `dispatch-authorship-verify.mjs` doesn't look at.
  `workflow-dispatch.md` may already document an expected evidence shape
  for `agent()` dispatches that just isn't being produced — check before
  assuming a net-new artifact format is needed.
- Either have the Elephant write the standard `dispatch-record-<TASK_ID>.json`
  itself immediately after a Workflow-tool `agent()` call returns (mirroring
  what a goldfish subagent would have written for itself), or extend
  `dispatch-authorship-verify.mjs` to accept an equivalent Workflow-tool-native
  evidence shape if one already exists.

## Acceptance

- A Workflow-tool `agent()` dispatch that lands a commit with a `Dispatch:
  <ID> (goldfish)` trailer produces a `dispatch-record-<TASK_ID>.json`
  artifact (or equivalent) that `dispatch-authorship-verify.mjs` recognizes
  and passes, with no manual reconstruction after the fact.
- Existing template-built Agent-tool dispatches are unaffected.
