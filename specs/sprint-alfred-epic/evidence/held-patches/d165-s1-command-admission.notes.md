# D165-S1 command admission (held patch notes)

Candidate HEAD: 29540db4de76a1fad7d2c65278c37d5c37e92614. Patch: `d165-s1-command-admission.patch` (git diff --binary, 3 files).

## Cause
The preflight publishes `node architecture-adoption.mjs propose|status|check --root <root> --json` as a non-mutating action, but
`sanctionedLifecycleScriptArgs` (lib/guard/command-catalogue.mjs) had no entry for architecture-adoption/measure/fitness, so the
draft/approved shell lane refused them as opaque-script-execution (GUARD-DEVPLAN-SHELL).

## Changes
- lib/guard/constants.mjs: after ARCHITECTURE_BASELINE_SCRIPT, add ARCHITECTURE_ADOPTION_SCRIPT, ARCHITECTURE_MEASURE_SCRIPT, ARCHITECTURE_FITNESS_SCRIPT.
- lib/guard/command-catalogue.mjs: import the three constants; add helpers `adoptionScope`, `adoptionPhysicalOut`, `sanctionedArchitectureAdoptionToolArgs`
  (inserted directly above `sanctionedLifecycleScriptArgs`) and a first-line dispatch in `sanctionedLifecycleScriptArgs`.
  Admitted: adoption propose|status|check `--root <root>` [`--json`]; adoption prepare (`--root`, `--decision approved-scoped|partial` required;
  optional `--expires --review-date --decision-ref --decided-at --rationale --json`, `--out` only physically under scratch/; `--scope` repeatable up to 8,
  repo-relative, no dot segment, no leading slash, via a pre-pass); measure `--root` [`--apply`]; fitness `--root` [`--check`] [`--json`].
  Refused: adoption apply, `--request/--proof/--chat-approval/--by`, unknown flags, extra positionals, foreign root, any other repeated flag.
- hooks/guard-lifecycle-ready.test.mjs: six D165-S1 cases (draft and approved: admitted shapes, refused shapes, other script unchanged). No existing case changed.
- Not needed: devplan-shell-lane.mjs unchanged; guard-split-contract.test.mjs unchanged (does not enumerate the new constants); no antigravity pin mentions these scripts.

## Preimage SHA-256 (at HEAD)
- plugins/pipeline-core/lib/guard/constants.mjs 08002510f0ba2dbb3d01c3f02e74368c39dc2426e8080a77f182c18b9be6c0ce
- plugins/pipeline-core/lib/guard/command-catalogue.mjs 586ed58246f39a76b452dd573dad6605d0248dd48362b44a9f4cda8c381920e4
- plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs 0283d23449f1e743a041e182fee2bae53460a31b56396813219e90943352dae5

## Counts
- RED at HEAD plus new tests: D165-S1 6 tests, 2 failing (both "admitted" cases, draft and approved), 4 passing (the refusal cases pass before the change, because everything was refused).
- GREEN: D165-S1 6/6. guard-lifecycle-ready.test.mjs full: 402 tests, 399 pass, 0 fail (rest skipped). guard-split-contract 6/6. kernel-closure 11/11.
- The refusal cases gained four extra shapes after the GREEN run of the six (leading-slash and dot-segment scope, nine scopes, repeated decision-ref); the full 402-test run included them.
- Baseline of the untouched files at HEAD was not run separately (no case was known red).

## Proposed commit message
fix(guard): admit the architecture adoption, measure and fitness scripts in draft and approved (D165 D3)

## Operator flow (kernel paths)
Apply the diff (`git apply d165-s1-command-admission.patch`), `git add -u`, commit with `--no-verify`, stamp, install.
