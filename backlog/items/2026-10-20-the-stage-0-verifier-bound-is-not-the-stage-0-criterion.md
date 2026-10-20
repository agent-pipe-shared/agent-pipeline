---
schema: pipeline.backlog-item.v1
id: pipeline.the-stage-0-verifier-bound-is-not-the-stage-0-criterion
type: defect
owner: pipeline
status: open
created: 2026-10-20
source: "Ordinal-2 delta Critic of e6fec04a0..f62b5143a, finding F-A (major), 2026-10-20"
sprint: none
done_when: manual
---

# The stage-0 verifier bound is not the stage-0 criterion

## Description

The operating model allows the Elephant's stage-0 fast path for at most 2 files and about 25
lines (`templates/prompts/agent-obligations.md` §6, operating-model §3.3).
`scripts/dispatch-authorship-verify.mjs` accepts `Dispatch: stage-0 (elephant)` up to
`ELEPHANT_STAGE0_MAX_PATHS = 10` paths (line 153), with no line bound. A 7-path, 1244-line
commit therefore PASSes as `elephant-direct-declared`, and the misdeclaration is invisible to
the tooling.

D55 Q12 added `Dispatch: D<n> (elephant-exception)` for this case, but an installed plugin that
predates it refuses the new form. So a session on an older installed build can only write the
stage-0 trailer.

## Acceptance

- The verifier applies the operating-model criterion. Above it, a stage-0 trailer is UNVERIFIABLE
  (or FAIL) and names the exception form.
- The installed commit guard admits the exception form as soon as the source does, or a
  plugin-refresh notice names the gap.
