---
schema: pipeline.backlog-item.v1
id: pipeline.the-architecture-map-is-not-enforced
type: defect
owner: pipeline
status: open
created: 2026-10-20
source: "PO report scratch/pipeline-feedback-03.md, finding PF-54 (named FB3-PF-54 here), PO class major; scope D56 (1)"
sprint: none
done_when: manual
---

# The architecture map is not enforced

## Description

The Pipeline generates an architecture map with `ownedPaths`, `allowedDependencies` and a
contract per module, but no dispatch, guard or Verify step checks a diff against it. A
Goldfish may create files outside every module's `ownedPaths`, import across modules that do
not allow it, or grow one file without bound. The only size warning, `SQ-WARN-SCOPE-SIZE`,
counts paths in the write scope. The map acts only through what the Elephant writes into a
briefing by hand, so it does not prevent the classic failure of agents bolting code on:
ever-growing catch-all files and cross-imports. A cross-cutting check (for example a
module-boundary test) cannot be dispatched either, because every binding needs a Spec
criterion.

## Acceptance (first stage, D56 (1))

- A generic check derived from the map, runnable in Verify: each tracked source file belongs
  to exactly one module's `ownedPaths`; each relative import stays inside its module or goes
  to a module listed in `allowedDependencies`; each source file stays under a configurable
  line bound, with an exception list. Each violation names the file, the module and the rule.
- The briefing skeleton names, for the touched paths, the module, its allowed dependencies and
  its contract.
- A project without a map is reported `not-applicable`, never failed.
- Later stage, not in this candidate: a dispatch route for cross-cutting quality or
  architecture work without a feature criterion.
