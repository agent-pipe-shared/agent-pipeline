# WSL Full Verify observation, 2026-10-17

Closing step 1 of the [WSL handover](../../plans/HANDOVER-2026-10-17-wsl.md), first attempt.
This is an observation, not a passing Verify and not release evidence.

## Run

- Candidate: commit `76a2c02b56a432b5988b292301c7373a1d2e6717`, tree
  `88177f0d7e87399ebd91538d6352608d49bd3642` (the 0.7.0 stamp `902f029c3` plus two
  state commits).
- Command: `node harness/scripts/verify.mjs --mode candidate`, WSL2 Ubuntu, Node 24.19.0,
  git 2.53.0, clone on the Linux filesystem.
- Run id `verify-1792267703818-71b4075cb922aa0d`. Start 20:08 UTC, end 20:46 UTC (wall time
  about 38 minutes, of which about 10 minutes were a hang, see below). Exit code 1.
- Result: 1042 suites, 192 red.
- `VERIFY-CANDIDATE-DRIFT`: tests left an untracked `pkey` at the repository root and an
  untracked `plugins/tmp/hf11-mode-*` fixture repository during the run. The same two
  residues reappeared after the isolated rerun. Neither was read; both were moved into
  `scratch/`.

## The hang

Six suites never finished on their own: `codex-advisor-execution`,
`design-advisory-coordinator-v2`, `design-workflow-package-v2`,
`design-workflow-package-builder`, `pin-codex-advisor-evidence-fails-after-host-update`,
`pin-revised-native-design-cannot-reach-a-new-advisor-course`. Each waited on a fixture
Codex host child (`app-server --stdio`) started by `lib/codex-host-process-launcher.mjs`.
The launcher only runs on Linux and macOS, and after the startup phase no timeout applies.
The PO ended the 14 fixture child processes after about 25 minutes; the suites then
finished red and Verify completed. Native Windows never executes this path, which is why
the Windows sample did not show it.

## Isolated rerun

Every red suite with a test-file input was rerun alone and sequentially with
`node --test <file>` and a 240 s timeout.

| Class | Suites | Meaning |
|---|---:|---|
| fail-alone | 157 | Fails without concurrent suites: a genuine red on Linux. |
| timeout-alone | 9 | Does not finish within 240 s alone. |
| pass-alone | 14 | Green alone, red only inside the concurrent Verify run. |
| check-not-rerun | 12 | A check without a test-file input; not rerun. |

Per-suite table: [red-suites-table.md](red-suites-table.md). Machine form:
[red-suites.json](red-suites.json). Host paths are replaced by `<repo>`, `<home>` and `<tmp>`.

## Answers to the handover questions

- `session-cleanup-power` is red on Linux too, so its defect is not Windows-specific.
- `verify-evidence-producer` is red on Linux too; commit `0b06f4092` stays unverified.
