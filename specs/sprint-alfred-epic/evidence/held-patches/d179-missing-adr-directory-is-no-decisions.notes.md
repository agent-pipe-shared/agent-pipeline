# D179 held patch: a project without docs/adr has no decisions

Candidate: be5f8db539428b18cb7fa36867d77647b979addf. Patch: `d179-missing-adr-directory-is-no-decisions.patch` (git diff --binary, applies cleanly to a fresh clone of the candidate; `git apply --check` exit 0). Backlog item: `backlog/items/2026-10-26-missing-docs-adr-directory-blocks-implementation-entry.md`.

## Cause

`inspectStructuralArchitectureDecisions` in `plugins/pipeline-core/lib/architecture-effective-decisions.mjs` ran `lstatSync(docs/adr)` inside one try block. A missing directory threw ENOENT and the catch returned `blocked` / `ARCH-DECISION-SOURCE-UNAVAILABLE`, so a project that has no decisions yet could never pass the architecture gate.

## Change (production, try block ~lines 84-100)

- `realpathSync(root) !== root` still throws, so the root check keeps blocking.
- `lstatSync(docs/adr)` is tried first. Code ENOENT or ENOTDIR sets `absent`; any other error is rethrown into the unchanged blocked return.
- If absent, `entries = []`, so the result equals that of an empty docs/adr.
- Otherwise the previous unsafe checks run unchanged (symlink, not a directory, realpath mismatch, then read).

## Tests (in the patch, architecture-effective-decisions.test.mjs, 3 cases appended)

1. D179 a project without docs/adr has the same inspection result as one with an empty docs/adr (new behaviour).
2. D179 docs/adr as a regular file still blocks and names docs/adr (regression pin).
3. D179 docs/adr as a symlink to a directory still blocks and names docs/adr (regression pin).

RED against unchanged production: tests 16, pass 15, fail 1; the failing one is case 1 (log red.architecture-effective-decisions.test.mjs.log, kept in the scratch dir, not committed).
GREEN with patch: tests 16, pass 16, fail 0.

## Baseline versus patched (node test runner, exit 0 in all, reporter is not TAP)

| suite | baseline | patched |
|---|---|---|
| architecture-effective-decisions | 13/13 pass, fail 0 | 16/16 pass, fail 0 |
| architecture-entry-readiness | 38/38 pass, fail 0 | 38/38 pass, fail 0 |
| architecture-map-scaffold | 4/4 pass, fail 0 | 4/4 pass, fail 0 |
| architecture-decision-waiver-store | 1/1 pass, fail 0 | 1/1 pass, fail 0 |

Failing-name sets: empty at baseline and empty when patched (identical).

## Callers (established, not re-derived)

- architecture-entry-readiness.mjs line 238 maps only a THROWN error from inspectDecisions to ARCH-DECISION-SOURCE-UNAVAILABLE; it does not depend on the absent-directory behaviour.
- architecture-map-scaffold.mjs line 40 and its test line 39 only mention the code in a comment (D80 scaffolds docs/adr for fresh projects).
- architecture-decision-waiver-store.mjs uses the unrelated code ARCH-WAIVER-SOURCE-UNAVAILABLE.
- project-onboarding-e2e.test.mjs line 1352 holds a COMMENT that an absent docs/adr is blocked and that docs/adr/.gitkeep is created; a workaround, not an assertion, stays valid.
- architecture-entry-readiness.test.mjs line 441 only mocks a blocked inspectDecisions.
- pipeline-start-preflight.mjs does not mention docs/adr.
- No existing test asserts an absent docs/adr is blocked; the test file has no closed case-count pin.
- The finding helper carries only a code and a path, so the finding for the unsafe case is unchanged.

## NOT done

- The preflight orientation and the adoption surface still do not mention docs/adr.
- No consumer-run proof.
- Whether an absent directory should also be mentioned before the plan signature is the open second half of the Wanted list of the backlog item.
- Full Verify not run.
- Decision applicability is a gate component, so an independent Critic review stays a parent-owned batch gate.

## Proposed commit message

`fix(architecture): a project without docs/adr has no decisions instead of an unavailable source (D179)`

## Operator flow

1. `git apply specs/sprint-alfred-epic/evidence/held-patches/d179-missing-adr-directory-is-no-decisions.patch`
2. `git add -u -- plugins/pipeline-core/lib/architecture-effective-decisions.mjs plugins/pipeline-core/lib/architecture-effective-decisions.test.mjs`
3. Commit with the message above (`--no-verify` as the host flow for held patches requires).
4. Stamp, then install.
