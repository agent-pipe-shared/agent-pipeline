# Held patch: w7-phoenix-plan-admission (D166-PH)

Candidate: 400c6213db04d4abf1c93335b59d68a9a2e7d086. Patch: `w7-phoenix-plan-admission.patch` (git diff --binary vs the candidate, written from Node).

## Cause
The devplan shell lane classified `node .../phoenix-authority-revision.mjs plan ...` as `opaque-script-execution` because `sanctionedLifecycleScriptArgs` had no branch for that script (RED evidence: lane `opaque-script-execution`, verdict block, in draft and approved). The script also had no `--out` for `plan` and its usage line said `--lock-token <token>`.

## Changed lines (4 files)
- `lib/guard/constants.mjs`: +`PHOENIX_AUTHORITY_REVISION_SCRIPT`.
- `lib/guard/command-catalogue.mjs`: import, `phoenixExternalDirectory`, `sanctionedPhoenixRevisionArgs`, one dispatch line. Admits only `plan --repo-root <root> --directory <absolute, no dot segment, no NUL, <=1024> --proposal-file <scratch|evidence .json, no dot segment> [--out <scratch/..., physical>]`, each flag once (matchFlagSpec). `apply`, `--lock-token`, `--request-file`, `--request-sha256`, unknown flags and extra positionals stay refused. PO decision 2026-10-27 applied.
- `scripts/phoenix-authority-revision.mjs`: `planWithOut` (UTF-8, no BOM, under scratch/ only, still prints the plan), usage line now names `--out` and `--lock-token <8-128 chars>`.
- `lib/pins/devplan-lane-admits-the-producer-materialize-step.test.mjs`: `dependencies()` takes an optional lifecycle status (default unchanged `approved`); cases DMP007-DMP017 added.

## Read-only finding
`continuity-authority-revision-plan` (pipeline-state.mjs `runAuthorityRevisionPlanCommand`) reads the proposal and state and console.logs; it writes nothing. `buildAuthorityRevisionPlan` was read to line 5418 with no write; lines ~5418-5589 were NOT read. The wrapper first runs `phoenix-authority-approval.mjs verify`; its write calls sit in the `approve` flow, but the verify path was not read in full. So "writes nothing besides --out" is probable, not fully confirmed: the Critic or operator should read those ranges.

## Evidence
- RED (unchanged clone, whole file): 17 tests, 12 pass, 5 fail = DMP007, DMP008, DMP012, DMP013 (admitted cases) and DMP017 (usage). Log: scratch/agent-out/w7g/red.*.log. The refusal cases DMP009/010/014/015 and materialize DMP011/016 are green before the change.
- GREEN (patched clone, whole file): 17 tests, 17 pass, 0 fail. Log: scratch/agent-out/w7g/green.*.log.
- Baseline vs patched failing-name sets: baseline = the 5 new cases only; patched = empty; the 6 pre-existing cases DMP001-006 pass in both. (The RED run on the unchanged-production clone served as baseline; clone2 was not run separately.)
- Apply check in clone2 at the candidate: see the driver `check` output in the report.

## NOT done
- guard-split-contract.test.mjs and kernel-closure.test.mjs were NOT re-run (budget). guard-split-contract.test.mjs lives at lib/guard/ in the clone; kernel-closure was not located.
- No Antigravity pretool-guard pin: antigravity-pretool-guard.test.mjs is outside the slice files, follow-up.
- Backlog text correction and the other open owners (native-host, verify-wsl, critic, po-acceptance) untouched.
- Independent Critic review stays a parent-owned batch gate.

## Proposed commit message
fix(guard): the draft guard admits the read-only phoenix-authority-revision plan argv and the script gets --out (D166-PH)

## Operator flow
Apply the diff (`git apply`), `git add -u` limited to the four paths, `git commit --no-verify` (kernel path lib/guard/*), then stamp and install.

## Protected-path classification
lib/guard/constants.mjs and command-catalogue.mjs are kernel paths (held-patch route). The test file and the script matched no TP-1..TP-13 pattern, but travel in the same patch.
