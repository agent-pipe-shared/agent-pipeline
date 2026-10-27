# D174 PF-81 held patch: Commit Verify prepares dependencies from a committed pnpm lockfile (INTERIM)

Status: patch written and applies (`git apply --check` exit 0 in a fresh clone of HEAD 66ecae3ed). The goldfish ran out of tool budget before reading the GREEN counts; the Coordinator re-measured them in a fresh shared clone of HEAD 66ecae3ed: `verify-evidence-producer.test.mjs` baseline 44 tests, 44 pass, 0 fail; with the patch applied 50 tests, 50 pass, 0 fail (the six D174 cases GREEN, nothing else changed); exit 0 both times. `guard-maintenance-window-kernel-closure.test.mjs` exit 0 before and after (exit code only, counts not recorded).

## Cause
`prepareCommitWorktreeDependencies` in `plugins/pipeline-core/lib/commit-worktree-dependencies.mjs` was npm-only: it demanded a committed `package-lock.json`, `packageManager: npm@x.y.z` and ran `npm ci`. A pnpm project was refused with VEP-DEPENDENCY-LOCK although `pnpm-lock.yaml` was committed.

## Changes (production, `commit-worktree-dependencies.mjs`)
- New exported `planCommitManagerInvocation(executable, prefixArgs, args, options)` delegating to the unchanged `planCommitNpmInvocation`.
- New `preparePnpm` (packageManager regex `^pnpm@X.Y.Z(+hash)?$`; version probe; `install --frozen-lockfile --ignore-scripts`; same timeouts, stdio, clean-worktree check). The pnpm lockfile is not parsed: pnpm refuses a mismatched lockfile itself (code comment).
- Lockfile detection after the "no dependencies" return, from committed ordinary files only: both -> VEP-DEPENDENCY-LOCK naming both; pnpm only -> pnpm path; neither -> VEP-DEPENDENCY-LOCK; npm only -> unchanged path and messages.
- Signature gains `pnpmExecutable = "pnpm"`, `pnpmPrefixArgs = []`.
- New messages: neither: "Commit package-lock.json (npm) or pnpm-lock.yaml (pnpm) for this candidate before --commit Verify." plus " yarn.lock is committed but not supported by --commit Verify." when yarn.lock is committed. Both: "Both package-lock.json (npm) and pnpm-lock.yaml (pnpm) are committed; keep only one lockfile for this candidate before --commit Verify." Manager mismatch: "package.json packageManager names <x> but the committed lockfile is pnpm-lock.yaml (pnpm); ...". Bad version: "Commit packageManager: pnpm@<exact-version> in package.json before --commit Verify." / "The available pnpm must be exactly <v>; install/select that version and retry."

## Tests (`verify-evidence-producer.test.mjs`, six new D174 cases, no closed case-count pin found)
RED at unchanged production: all six D174 cases failed (prepared; neither lockfile; both lockfiles; npm@ with pnpm lock; missing pnpm packageManager; different pnpm version). One additional red, "real product assertions stay fresh..." (VEP-DRIFT), was caused by my production edit landing while the RED run was in progress (declared inputs changed); it is not a D174 failure and passes in the baseline.
Baseline at HEAD (clone2): 44 tests, 44 pass, 0 fail; guard-maintenance-window-kernel-closure exit 0.
Not added: reverse case (pnpm@ with package-lock.json only) stays the unchanged npm message; the existing G22 case already asserts the exact `npm ci` arguments.

## Not done
- Kernel-closure suite counts (exit code only).
- yarn unsupported; no native Windows pnpm shim run (finding: `planEvidenceCommandLaunch` knows only npm shims and returns a non-npm name as a direct launch, so a bare `pnpm` resolving to `pnpm.cmd` is unexercised on Windows; capture-evidence.mjs untouched). The real pnpm install path is unexercised.

## Operator flow
apply-diff the patch, `git add -u` with a path limit, `--no-verify` commit with 'fix(verify): prepare commit Verify dependencies from a committed pnpm lockfile (D174 PF-81)', stamp, install. Verify evidence production is a gate component: an independent Critic review stays a parent-owned batch gate.
