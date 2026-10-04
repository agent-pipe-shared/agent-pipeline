---
schema: pipeline.backlog-item.v1
id: pipeline.design-trailer-verifier-lost-after-closure
type: defect
owner: pipeline
status: open
created: 2026-10-04
source: "Alfred triage batch A (2026-10-04), confirmed by the Elephant with git log -S on the current branch."
sprint: alfred
done_when: manual
---

# The design-commit trailer verifier was lost after its item was closed

## Description

The backlog item `2026-08-27-no-sanctioned-dispatch-trailer-form-exists-for-direct-elephant-design-commits`
was closed on the claim that `dispatch-authorship-verify.mjs` exports `ELEPHANT_DESIGN_ID` and verifies
`Dispatch: design (elephant)` commits. At HEAD, neither `plugins/pipeline-core` nor `harness/scripts`
contains `ELEPHANT_DESIGN_ID`. `lib/commit-message-policy.mjs` rejects the `design (elephant)` form;
live on 2026-10-04 only `stage-0 (elephant)` was accepted. `templates/prompts/agent-obligations.md:176`
still prints the rejected form, which a separate open item records.

`git log -S ELEPHANT_DESIGN_ID` on the current branch lists the adding commits `7535e631f` and
`f17cc5bb0`, plus the two closure commits. It lists no removing non-merge commit, and `7535e631f` is an
ancestor of HEAD. The verifier was most likely dropped by a merge or source import (`git log -S` skips
merges by default).

This means a closed item is not proof that its change still exists. Other closures may have been lost
the same way.

## Acceptance

- The merge or import that dropped the verifier is identified (`git log -S ELEPHANT_DESIGN_ID -m`).
- The trailer grammar is fixed in one place (Spec §21.5 trailer bullet). Either the
  `design (elephant)` form is admitted, path-scoped and verified, or it is removed from every printed
  example and generator.
- A merge-survival check compares the code needles of the closed items' `done_when` / closure
  evidence against HEAD, and fails when a needle disappears.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
