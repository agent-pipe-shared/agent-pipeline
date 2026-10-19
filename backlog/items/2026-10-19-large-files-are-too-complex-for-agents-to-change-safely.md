---
schema: pipeline.backlog-item.v1
id: pipeline.large-files-are-too-complex-for-agents-to-change-safely
type: improvement
owner: pipeline
status: open
created: 2026-10-19
source: "PO request (2026-10-19): find the large files that are too complex for agents and split them later"
sprint: none
done_when: manual
---

# Large files are too complex for agents to change safely

## Description

Several source and test files in `plugins/pipeline-core/` and `harness/scripts/` have grown
into single modules of many thousands of lines. Measured examples from the 0.7.0 sprint:

- `harness/scripts/pipeline-state.test.mjs` is about 330 KB. A protected whole-file change
  to it cannot be carried through a byte-identical tool call (ceremony C4).
- `plugins/pipeline-core/lib/project-onboarding-v3.test.mjs` is run in twelve shards
  because one run of the whole file exceeds a tool timeout.

An agent working on such a file reads only an excerpt, so it misses coupling it cannot
see. A dispatch's budget goes on navigation instead of the change. And every protected
change to such a file becomes a whole-file ceremony.

This item is for after 0.7.0. Within 0.7.0, new code keeps the existing module
boundaries and the architecture map.

## Acceptance

- A measured inventory lists every first-party `.mjs` file above a stated size or
  complexity threshold (lines, exports, functions), each with its owning area in the
  architecture map.
- Each listed file has a decision: split (with the target modules and the order),
  keep (with the reason), or retire.
- The split plan respects the protected surfaces. A split of a protected file or a guard
  facade states its ceremony, and keeps pinned export surfaces (such as GSC03) and the
  never-liftable kernel list (GMWKC01) closed.
- The architecture map is updated in the same change as each split.
