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

- **Decision:** fixed in source — closes after the 0.7.0 candidate host checklist (status stays `open` until then).
- **Rationale:** commit(s) `57e397b0f`.
- **Assignment (if accepted):** sprint-alfred-epic close-out batch.
- **Date:** 2026-10-08.

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **HOST-SESSION-NEEDED** — Item triage closes it only after the 0.7.0 candidate host checklist (an Explore dispatch on an installed host)
  The fix (57e397b0f) is in source; the closing check is a real Explore dispatch on an installed Claude host, which spends a model turn. The regression test with the exact tool_input shapes can be run on Linux but does not close the host checklist.
