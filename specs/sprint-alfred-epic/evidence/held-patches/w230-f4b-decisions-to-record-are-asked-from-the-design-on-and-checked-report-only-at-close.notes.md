# w230 — decisions to record are asked for from the design on and checked report-only at close (candidate 19, F4b)

Applies on top of the chain AFTER the held patch w225 to w228 (the patch is the delta from that state; apply w225 to w228 first, it does not apply to a checkout without it). Criterion binding: AC-108 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it changes

- `lib/design-authoring.mjs`: the skeleton's draft comment gains a rubric "decisions to record": for each decision that needs an ADR, name title, trigger and ADR path in the `adrReferences` of the module it concerns; classic triggers are module boundaries, data keeping, offline and error strategy, a security trade-off. The unfinished-draft detector keys on the unchanged comment prefix; `adrReferences` stays `[]` in the example.
- `agents/readiness-reviewer.md`: a paragraph "Decisions to record" asks the Elephant a question when a design choice has no named ADR path, and points to the `architecture-decision` skill. Question only, never a block.
- `lib/close-quality-readback.mjs`: the `adr-decision` row's evidence now lists every named ADR path with `exists` or `missing`, for the present and the missing outcome alike. Status logic unchanged: report-only, no outcome and no overall status changes.
- `lib/runbook-paths.mjs` + regenerated `runbooks/*.json` (through `generate-runbook.mjs`): plan path gets one step `record-decisions` before `submit-plan` that calls the architecture-decision skill.
- `skills/pipeline-start/references/happy-path.md`: Design step 2 says when to call the skill.
- Tests: new case DAU005 in `design-authoring.test.mjs` (skeleton rubric, reviewer text), one case in `close-quality-readback.test.mjs`, one in `generate-runbook.test.mjs`, one in the happy-path pin test. `harness/config/verify-case-completion-augmentations.v1.json` adds DAU005; `check-verify-case-completion.test.mjs` restates the design-authoring sites count 36 -> 45 (measured, only that number).

## Checks (run alone in the clone)

`design-authoring.test.mjs` 5/5, `close-quality-readback.test.mjs` 10/10, `generate-runbook.test.mjs` 21/21, `happy-path-guide-names-only-existing-scripts.test.mjs` 3/3, `check-verify-case-completion.test.mjs` 32/32. The new cases were red first.

## Not changed / not proven

- Nothing blocks and no schema changes; blocking at close comes only after a measurement and is not built here.
- Whether a model names its decisions in `adrReferences`, or the reviewer raises the question, is a greenfield measurement, not a test.
- The inventory file that lists the agent text (readiness-reviewer) and any other plugin-file digest pins were not refreshed or run; no full Verify run; no independent Critic review (suspended by the PO).
