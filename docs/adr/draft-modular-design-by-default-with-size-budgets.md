# ADR: Modular design by default, with size budgets that keep modules and files small

Status: Proposed (draft for an independent review and the PO's decision; nothing here is built)

Date: 2026-11-03

## Context

Agents work inside a bounded context, so a large module or file costs every later turn: it is read again and again, it cannot be sliced for parallel dispatch, and a review has to hold all of it. The architecture gate should therefore produce small, separable modules from the first design and keep them small while the project grows.

Measured in the candidate 18 greenfield runs (PO report 2026-11-03):

- The draft skeleton the pipeline hands the agent (`renderArchitectureDesignSkeleton` in `lib/design-authoring.mjs`) holds exactly one module, `application`, owning `src/**` and `tests/**`, one implementation file `src/application.mjs`, and one test entry. Its only hint is a comment, "Split modules as needed".
- The Antigravity run kept that module unchanged (`profileId: greenfield-single-module-web-app`, one module, `src/**`) and then wrote a single file of about 2600 lines for five functional areas. No slice could run in parallel (zero parallel dispatches). The Claude run planned one module as well. The Codex run split on its own into domain, storage, ui and offline modules with explicit owned paths.
- Nothing in the validator (`validateArchitectureDesign` requires at least one module), the readiness review, the guardrails or the skills states a decomposition rule or a size bound. The skeleton also sets `antiFragmentationPolicy.rejectTrivialFacades: true` with no opposing anti-monolith counterweight.

So the module count is the agent's unguided choice and the default is the worst case.

## Decision (proposed)

1. **The skeleton shows a split.** The draft skeleton carries two or three example modules with disjoint, explicit owned paths (no `src/**` wildcard over everything), each with its own contract document and test entry, and a short rule text instead of the bare hint.
2. **A cut rule in the design guidance and a criterion in the readiness review.** Cut by cohesive responsibility named in the PRD (user-story groups, domain nouns); every module owns its files exclusively; a design with a single module states in its disposition why the PRD has no separable responsibility. The readiness reviewer checks this like any other criterion.
3. **Size budgets in the fitness model.** The fitness model gains `sizeBudgets` (a maximum number of lines per source file and per module; defaults to be set from measurement, proposed starting point 500 and 2500). The architecture fitness check reports a file or module above its budget. A new file above its budget blocks; an existing one is reported, so a growing project is told to split before a file becomes a context sink. Generated and vendored paths are exempt by declaration.
4. **Slices follow modules.** Dispatch planning derives its write scopes from the module ownership, so disjoint modules can be dispatched in parallel.

## Consequences

- New designs start modular; an unchanged one-module design no longer passes silently.
- The budgets turn "keep modules small after long development" into a measured check instead of advice.
- Existing projects keep their designs; the budgets apply when their design is next revised.
- Test surface: the skeleton snapshot tests, the design validator, the fitness check and the readiness criterion list.
- Risk: line counts are a crude proxy and language-dependent; a budget that is too tight produces needless splits (the anti-fragmentation policy stays as the counterweight).

## Alternatives considered

- Guidance text only (point 1 and 2 without budgets): cheapest, but it does not stop growth after the design.
- A hard refusal of every single-module design: too blunt for a genuinely small feature.

## Open questions for the review

1. The numbers: measure on the three greenfield results (the 2600-line file is one data point) before fixing defaults.
2. Blocking for new files, report-only for existing ones: acceptable, or report-only everywhere at first?
3. Where does the single-module rationale live (disposition field) and who checks it beyond non-emptiness?
4. Should the Elephant's slice planner refuse a slice whose write scope spans more than one module without a stated reason?

## Not decided

This draft makes no change to the skeleton, the validator, the fitness model or any guard. It needs an independent review (fresh context, ADR-0014 contract) and the PO's decision before any build (EL-04).
