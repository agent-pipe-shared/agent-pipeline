---
schema: pipeline.backlog-item.v1
id: pipeline.critic-dispatches-cannot-persist-their-scratch-notes
type: defect
owner: pipeline
status: open
created: 2026-08-27
sprint: alfred
source: "Measured twice on 2026-08-27, independently, by both design-review Critic dispatches of the sprint-alfred-epic package (reports persisted under specs/sprint-alfred-epic/evidence/critic/)."
---

# Critic dispatches cannot persist their scratch notes, defeating the review protocol's own truncation-recovery mechanism

## What was measured

Both round-1 design-review Critics (sonnet route on `74e5a4d4`, opus route
on `584acbda`) independently reported `critic-notes.md` persistence as
**unavailable** and emitted their reports chat-only:

1. The critic agent definition (`plugins/pipeline-core/agents/critic.md`)
   deliberately grants no `Write` tool — correct for a read-only reviewer.
2. The closed shell grammar (`guard-lifecycle-ready`) refuses every
   content-writing shell shape: redirects (`>`, `2>&1`, `| tee`) always;
   and `node -e '...writeFileSync(...)'` as `GUARD-DEVPLAN-SHELL` in the
   `opaque-interpreter-code` lane — unconditionally while any feature is in
   `draft` lifecycle, even though the target path was inside the sanctioned
   `scratch/dispatch/<own-subdir>/` prefix (round-1A measured this exact
   refusal).
3. `mkdir` succeeds (no content), so the per-dispatch scratch directory
   exists but stays empty.

## The defect, precisely

Two canon rules contradict under the current toolset/guard combination:

- CR-06-D (`roles/critic.md` §5.5) and `templates/prompts/critic-review.md`
  ("Report durability", recovery item 6) MANDATE appending Phase-A
  candidates to `critic-notes.md` and reading that file to recover a
  truncated review.
- The critic toolset plus the closed grammar make every mechanism for that
  write refused. The template's own fallback clause ("state that persistence
  was unavailable") is currently not the exception but the only reachable
  path.

Consequence: a truncated Critic run loses ALL intermediate state — exactly
the failure class of
`backlog/items/2026-08-08-long-dispatches-truncate-before-emitting-their-report.md`,
whose designated mitigation this gap disables. The C2 closing-allowance
design (spec `specs/sprint-alfred-epic/spec.md` §6.2) inherits the same
problem for its "write record as the opening act" practice if the writing
role has no admitted write route.

## Affected artifacts

- `plugins/pipeline-core/agents/critic.md` (toolset: no Write)
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` /
  `guard-devplan` (`opaque-interpreter-code` lane refuses scratch-targeted
  interpreter writes)
- `roles/critic.md` §5.5, `templates/prompts/critic-review.md` (mandate the
  unreachable write)

## Proposal (not designed here)

Candidate routes, one is enough: (a) grant the critic agent `Write` scoped
by guard policy to `scratch/dispatch/**` (tool-scope layer — fits WP-A2's
placement policy); (b) a sanctioned read-only-safe note-append helper script
admitted by the guard's exempt table; (c) teach the
`opaque-interpreter-code` lane a statically-verifiable scratch-write form.
Alfred context: B2-iii (read-only retry lane) is adjacent but does not cover
writes; the fix belongs in the B2 family's design space and feeds the C1
receipt class "dispatch truncation".

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
