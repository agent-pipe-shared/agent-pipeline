---
schema: pipeline.backlog-item.v1
id: pipeline.dispatch-guard-rejects-built-in-capitalized-agent-types
type: defect
owner: pipeline
status: open
created: 2026-10-03
source: "Live observation, Agent-Pipeline Claude/Windows session 2026-10-03: five parallel read-only verification dispatches with subagent_type Explore were all refused."
sprint: alfred
done_when: manual
---

# Dispatch guard rejects built-in agent types `Explore`/`Plan` with a misleading Advisor message

## Observed again 2026-10-05

Defect 8 of the ALFRED-BACKLOG-20261005 set, reproduced live: two read-only `Explore` dispatches were refused with `APB-DISPATCH-INVALID` ("the Advisor prohibition cannot be assigned to one exact child before launch"), with and without the prohibition sentence in the prompt. Cause: `advisor-prohibition-binding.mjs` `normalizedRole()` accepts only a lowercase grammar, so capitalised built-in names map to `null` and the rejection fires before the prompt is checked for a prohibition at all. Fix direction: (1) reject an unbindable role only when the prompt actually carries the prohibition, otherwise `not-applicable`; (2) accept the host's built-in type names with case-preserving identity. Regression test with the exact live tool_input shapes (`subagent_type: "Explore"`, with and without the prohibition token). Check whether the hook file sits in the protected baseline; if so, ship as a signed package.

## Description

Every `Agent` call with `subagent_type: "Explore"` is refused with
`APB-DISPATCH-INVALID: the Advisor prohibition cannot be assigned to one exact
child before launch.` The cause is `normalizedRole()` in
`plugins/pipeline-core/lib/advisor-prohibition-binding.mjs:23-27`. It only accepts
`^[a-z][a-z0-9-]*$`, so the runner's built-in, capitalised read-only agent types
(`Explore`, `Plan`) map to `null`. `prepareAdvisorProhibitionBindings` (line 54)
then rejects the whole batch. This happens even though no briefing carries the
Advisor prohibition line, so the prohibition logic should have been
`not-applicable`.

Two problems follow:

- The cheapest read-only research route of the runner is unusable under the
  Pipeline. Agents must fall back to write-capable agent types for read-only
  work, which is the opposite of least privilege. This directly feeds the PO
  finding that the Pipeline is too restrictive for self-dispatch
  (`2026-10-03-role-route-preflight-with-self-dispatch-fallback.md`).
- The denial text names an Advisor-prohibition problem that does not exist
  (compare `2026-10-03-read-blocks-and-misleading-denial-texts-across-runners.md`).

## Acceptance

- Role normalisation accepts the runner's real agent-type spellings, or
  compares case-insensitively. A batch without the prohibition line returns
  `not-applicable` before any role parsing can reject it.
- A regression test dispatches `Explore`, `Plan`, `general-purpose` and
  `pipeline-core:*` types, alone and in parallel batches.
- An invalid role produces its own code (for example `APB-ROLE-UNPARSEABLE`)
  naming the offending value.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
