---
schema: "pipeline.backlog-item.v1"
id: "pipeline.the-pipeline-does-not-meet-the-module-and-size-rules-it-imposes-on-projects"
type: "defect"
owner: "pipeline"
status: "open"
created: "2026-11-19"
source: "PO observation 2026-11-19 (the Pipeline's own modules probably break the boundaries it enforces), measured with architecture-boundary-check.mjs and a size and import survey of the candidate 32 tree"
sprint: "alfred"
done_when: manual
---

# The Pipeline does not meet the module and size rules it imposes on projects

## Description

From `0.7.0` the Pipeline requires a project to design in modules, to keep every hand-written source file under 1000 lines (`architecture-boundary-check.mjs`, the `over-line-bound` rule), to let a module import only what it declares, and to hold agent-sized units. Its own source does not meet those rules. Releasing `0.7.0` with a modular, agent-suited architecture as the promise while the product itself is not built that way would contradict the promise.

Measured on the tree of the interim candidate 32 (plugin, harness and top-level scripts; test files and evidence copies under `specs/` excluded unless stated):

- **Size.** 1160 hand-written source files with 374,000 lines; **64 files are over the 1000-line bound and hold 139,000 lines (37 % of the code)**, 14 are over 2000 lines and 4 over 5000: `scripts/pipeline-state.mjs` 16,030, `lib/onboarding-continuity.mjs` 13,239, `lib/project-onboarding-v3.mjs` 8,318, `lib/human-guard-override.mjs` 7,256. Another 76 test files are over 1000 lines (from candidate 32 on, test files carry no hard bound, but the report-only budgets list them).
- **Accepted, not fixed.** The boundary policy of the repository carries 103 `over-line-bound` exceptions, each a ratchet of the accepted size. Several files are already past their accepted size on the stamped candidate (the check says "split it rather than raise the ratchet"), so the ratchet is being outgrown, which is the opposite of the rule's intent; how the accepted sizes were raised over time is not measured here.
- **One module for everything.** The architecture map has five modules; `pipeline-core` owns the whole plugin, about 1,030 source files in `lib/`, `scripts/` and `hooks/`. A module of that size expresses no boundary, so the forbidden-dependency rule cannot see the real structure.
- **Layering inverted.** 38 files in `lib/` (the layer the others build on) import from `scripts/` (entry points), among them `onboarding-continuity.mjs`, `project-onboarding-v3.mjs`, `native-goldfish-host-state.mjs` and `feature-package-registration.mjs`. Nine pairs of folders import each other: `hooks`↔`lib`, `hooks`↔`scripts`, `lib`↔`scripts`, `lib`↔`lib/guard`, `harness/scripts`↔`plugins/pipeline-core/scripts`, plus two sub-folders of `scripts/`. The one finding the check reports today, `check-vendored-template-sync.mjs` importing `harness/`, is the visible tip.
- **God files with high fan-in.** `lib/worktree-lifecycle.mjs` (2,582 lines) is imported by 71 files, `lib/onboarding-continuity.mjs` (13,239 lines) by 42, `scripts/pipeline-state.mjs` (16,030 lines) by 29. A change there is not bounded to a module and cannot be given to a fresh agent as a small scope.
- **The Pipeline's own check.** On the stamped candidate 31c the check reports 181 findings (blocking); with the exemptions of candidate 32 for test files and generated output it still reports 125: 50 oversize files not covered by an exception, 74 unowned paths (the top-level `scripts/` folder has no module) and 1 forbidden dependency.

What is not measured: whether the size causes defects or slower agent work (the Pipeline's own Goldfish and Critic runs on these files are the evidence to collect), the number of functions or responsibilities per file, runtime coupling (dynamic imports, shared files on disk), and the line count of generated or vendored copies.

## Triggering situation

PO 2026-11-19 while preparing candidate 32: a suspicion that several of the Pipeline's own files break the module boundary, and that releasing a modular-architecture product with a non-modular own architecture would be embarrassing. The measurement above confirms it.

## Affected artifact

`architecture/map` and `architecture/boundary-policy.json` of this repository, the largest files named above, the `lib/`↔`scripts/`↔`hooks/` import structure, `scripts/` (unowned), `docs/product-capability-inventory.json` (module claims), the user documentation that states the 1000-line bound.

## The bounds themselves are not verified (PO 2026-11-19, first step before any optimisation)

The 1000-line bound and the five-module cut are inherited defaults, not the result of an analysis. This item measures the Pipeline against them, but whether they are the right bounds is open and must be settled first, otherwise the remediation optimises towards a possibly wrong target:

- **A hard 1000-line bound may be too low for an agent.** A very low bound multiplies the number of files, the imports between them and the amount of navigation an agent has to do, which can hurt an agent as much as a very large file does. What matters for an agent is the context cost of a unit (what it must read to change it safely), not a line count; the useful bound may be a range per kind of file (entry point, library, test, generated) or a context-budget measure rather than one number.
- **The Pipeline is not a large project.** Its 1,160 source files are many small and some huge files in one plugin, nothing like a business system such as a CRM with many bounded contexts. The rules must be shown to hold for projects of that size (module count, module size, allowed dependencies between modules, who owns a module, how an agent gets only one module as context), not only for this repository.
- **Evidence needed:** external research on module and file sizing for agent-assisted development and for large modular systems (modular monolith, bounded context, package-by-feature guidance, published context-window and file-size findings for coding agents, evidence on cohesion and coupling versus size), checked against what this product implements (the `over-line-bound` rule, the default `lineBound`, the module map, `allowedDependencies`, the size budgets of the fitness model, the one-module-per-dispatch write scope). The result is a recommended set of bounds and a statement of what the product should enforce by default and what it should only report, with the sources named and the unverified claims marked.
- **Until then** the shipped default (`lineBound` 1000, documented in the user documentation) stays as it is and is not presented as a validated figure; nothing in the remediation below starts before the bounds are decided.

## Proposal

Step 0 (new, first): the research and decision above. The staged answer below follows it and is to be re-cut against the decided bounds; it fits the release only in that sense, and it is not a rewrite of 374,000 lines:

1. **Make the map tell the truth (small, first).** Split the one `pipeline-core` module into real modules along the folders that already exist (for example `guard`, `onboarding`, `close-and-evidence`, `critic`, `dispatch`, `state`), give the top-level `scripts/` a module, declare the allowed dependencies each module really has, and let the check report the rest. The ratchet exceptions stay visible but must not be raised any more: a file past its accepted size is a finding, not a new ratchet.
2. **Restore the layering (medium).** No `lib/` file imports `scripts/`: move the shared pieces those 38 files take from `scripts/` down into `lib/`, then add a boundary rule (or a module dependency declaration) that forbids the direction, so it cannot come back. Remove the `harness/` import of `check-vendored-template-sync.mjs`.
3. **Split the files that matter most (large, ordered by fan-in times size).** At least the four files over 5000 lines and the oversized files with more than 20 importers: `pipeline-state.mjs`, `onboarding-continuity.mjs`, `worktree-lifecycle.mjs`, `project-onboarding-v3.mjs`, `human-guard-override.mjs`, `session-requester-bridge.mjs`, `plan-spec-state-v2.mjs`, `native-goldfish-host-state.mjs`, `session-authority-registry.mjs`. Each split is one bounded Goldfish scope on the clone-slice route with the existing suites as the behaviour pin (behaviour-preserving, no feature change), and several can run in parallel because their write scopes do not overlap.
4. **Decide what `0.7.0` promises** (after step 0). If steps 1 and 2 and the first splits of step 3 are in `0.7.0`, the release notes say what is done and name the rest by number and size. If not, the documentation must not present the Pipeline as an example of the architecture it requires: say plainly that its own source is being brought under the rules and where it stands (the measured numbers above, re-measured at release).
5. **Keep it measurable.** Record the numbers of this item (files over the bound, lines held by them, exception count, `lib`→`scripts` imports, mutually importing folder pairs) in the release evidence and fail the Pipeline's own check when one of them grows.

Protected and guard-owned files (guard, approval and lifecycle code) can only be split under the protected-source route, so the order and the signing steps need to be planned with the owner before the work starts.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
