---
schema: pipeline.backlog-item.v1
id: pipeline.scratch-write-refused-during-intake-against-documented-exemption
type: defect
owner: pipeline
status: closed
created: 2026-08-28
closed_at: 2026-08-29
closure_repository: self
closure_commit: 53693c3dac13a361a0ed6aa7f62421f4c67758c7
closure_evidence: backlog/items/2026-08-28-a-scratch-write-is-refused-during-intake-against-the-documented-exemption.md
sprint: nova
source: "Claude/Windows greenfield run, 2026-08-28, sections 7 and 11 of its own analysis (docs/pipeline-haertungstest-und-analyse.md)."
---

# A scratch write is refused during `intake-required`, contradicting the exemption the onboarding skill documents

## What happened

The Claude run was blocked **twice** writing its design document to `scratch/`
during `intake-required` (`GUARD-LIFECYCLE-NOT-READY`), and a `mkdir` probe was
refused a third time. It then spent roughly seven tool calls reading
`guard-lifecycle-ready.mjs` to understand why.

## Why it is a defect and not a runner error

The `pipeline-start` skill states the opposite in its own words: `scratch/` is
"permitted by the containment guard without an exception, and exempt from the
dev-plan gate in every phase — including `draft`". Two guards hold different
scratch policies, the lifecycle guard does not carry the exemption, and the
lifecycle guard wins.

A documented promise that the enforcement layer does not honour is worse than an
undocumented restriction: it sends the agent looking for its own mistake.

## The part that makes it blocking, not annoying

The Claude session resolved it by **reading the guard's source** — possible only
because that run was self-hosting the Pipeline repository. A consumer project
installs the plugin and has no comparable route: the refusal names the rule but
not the way forward, and `retryActions` is empty. For a consumer this is a stop,
not a detour.

## Direction

- Give the lifecycle-ready guard the same scratch exemption the containment and
  dev-plan guards already have, for the `intake-*` phases specifically.
- Or, if refusing scratch during intake is deliberate, say so in the skill and
  in the refusal, and name the admitted alternative.

The one thing that must not remain is the current state, where documentation and
enforcement disagree and the refusal teaches neither.

## Acceptance criteria

- A scratch write during `intake-required` either succeeds, or is refused with a
  message naming the sanctioned alternative.
- The skill text and the guard agree, verified by a test that exercises the
  phase rather than asserting the prose.

## Related

- `2026-08-28-a-heredoc-refusal-teaches-no-substitute.md` — same family: a
  correct refusal that names no way forward.

## Closing note (reconciliation, 2026-08-29)

Both acceptance criteria are met. Commit `53693c3dac13a361a0ed6aa7f62421f4c67758c7`
admits any Edit/Write/NotebookEdit and matching `mkdir` resolving inside the
repository's own `scratch/` during `intake-required` and
`intake-design-questions-required`, narrowed by `resolve()`+`pathInside()`, and
updated the `pipeline-start` skill text to name the admission explicitly. `node
--test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` (172/172,
including `NVA-GF-SCRATCH: intake statuses admit any resolved scratch/ write and
matching mkdir, nothing wider`) exits 0.
