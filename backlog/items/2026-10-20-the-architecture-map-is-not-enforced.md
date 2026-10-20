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

## Status (2026-10-20): first stage built, not accepted

- `plugins/pipeline-core/scripts/architecture-boundary-check.mjs` walks `git ls-files` and applies
  `unowned-path`, `ambiguous-ownership`, `forbidden-dependency` and `over-line-bound` (default
  1000 lines). The bound, excluded trees and accepted exceptions live in
  `architecture/boundary-policy.json`; a line-bound exception records `maxLines` and is a
  ratchet, so a file that grows past it fails again. `--write-policy` writes a first policy that
  accepts the current violations. The fitness evaluator, whose outcomes the rigor lifecycle binds
  by digest, is unchanged.
- The briefing skeleton (`dispatch-briefing.mjs`) names, under "Context files", the owning module
  of the touched paths, its responsibility, its allowed dependencies and its public contracts.
- Measured on this repository before any policy: 2630 source files, 910 violations (683
  unowned, 674 of them under `specs/**` evidence; 215 over 1000 lines; 12 forbidden imports).
  The committed policy excludes `specs/**` and `backlog/evidence/**` and accepts 115 entries:
  101 line-bound ratchets, the root installers `install-agy.mjs`, `setup.mjs` and
  `setup.test.mjs` with no map module yet, and 11 pipeline-core tests that import harness
  scripts against the map's direction (harness -> pipeline-core only). Those 14 are follow-up
  work for the map, not for the check.
- Open: the suite registration and a Verify phase (ceremony C14).
