# w139 — the onboarding's own `.gitattributes` is admitted by the draft lifecycle (candidate 19, Q8, Claude Windows greenfield)

Applies on top of the chain at 2645e11c5. Elephant-built small item (PO exception for small items), built in a clone. Criterion binding: AC-108 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it changes

- `lib/guard-devplan-policy.mjs`: `ONBOARDING_SCAFFOLD_EXACT_PATHS` gains `.gitattributes`. The onboarding seeds that file (evidence line endings) in the first commit of a project that owns none, and the draft lifecycle refused it with `GUARD-DEVPLAN-LIFECYCLE` although `.gitignore`, `AGENTS.md` and `pipeline.user.yaml` from the same plan were admitted. The one shared predicate `isOnboardingScaffoldPath` serves the shell lane, the staged-commit check and the Edit/Write hook, so all three agree.
- `hooks/guard-devplan.test.mjs`: the predicate table gains `.gitattributes` (admitted) and `sub/.gitattributes` (not admitted; exact root path only).

## Checks

- `guard-devplan.test.mjs` run alone in the clone: 133 of 133 cases passed (including the two new table rows).

## Not changed / not proven

- No product path is newly admitted; `.gitattributes` can now be edited in the draft and approved lifecycle like `.gitignore`. It affects line endings of evidence files, not behaviour.
- The onboarding end-to-end suite (`project-onboarding-v3.test.mjs`) was not run for this change; the first-commit behaviour is proven by the predicate table, not by a real onboarding run.
- The full Verify run was not made; no independent Critic review (suspended by the PO until a working local candidate exists).
