# D180b held patch: the finalizer writes its stop-failure diagnostic outside the inventoried native Goldfish namespace

Dispatches W6-D180B-DIAGNOSTIC-OUTSIDE-NAMESPACE-C1-20261027 (budget, cancelled) and ...-C2-20261027 (this). Candidate
ca498174277c1075e6da23b7a02e13dd870d7dfc. Patch: `d180b-stop-failure-diagnostic-lives-outside-the-authority-namespace.patch`
(`git diff --binary` of the scratch clone against the candidate, written from Node; `git apply --check` in a pristine clone at the
candidate: exit 0). Targeted delivery: green (see "Not done" for what stays open).

## Directory choice (rg evidence from C1)

Namespace roots naming `native-goldfish-host-commit`: `native-managed-authority-support.mjs:55` (exact directory, not `run/` as a whole),
`session-authority-registry.mjs:36`, `session-authority-repair.mjs:134` (reads that exact directory). No scan covering `agent-pipeline/run/`
as a whole or a `native-goldfish-host-diagnostics` sibling was found. A follow-up should repeat one `rg -n "readAuthorityNamespace"`.

## Production changes (patch; only these two files)

- `plugins/pipeline-core/lib/native-goldfish-host-finalizer.mjs`: stop-failure written to `<git common dir>/agent-pipeline/run/native-goldfish-host-diagnostics/`.
- `plugins/pipeline-core/scripts/dispatch-briefing.mjs`: `defaultStopFailures` scans the diagnostics directory, then the legacy
  `native-goldfish-host-commit` directory, de-duplicated by file name, 20-entry cap kept; each entry carries `directory`, and the warning
  `path` is built from it (so a legacy record reports its legacy path).

## Test results (whole files, run in the clone; baseline = pristine clone2 at the candidate)

| File | Baseline (unchanged) | Patched |
|---|---|---|
| `plugins/pipeline-core/scripts/dispatch-briefing.test.mjs` | tests 94, pass 93, fail 1 | tests 97, pass 96, fail 1 |
| `plugins/pipeline-core/lib/pins/claude-background-goldfish-is-host-committed-at-subagent-stop.test.mjs` | tests 12, pass 12, fail 0 | tests 13, pass 13, fail 0 |
| `plugins/pipeline-core/scripts/session-authority-repair.test.mjs` | tests 15, pass 15, fail 0 | tests 16, pass 16, fail 0 |

- The one failing case in both baseline and patched is `public --help and -h work before setup without private reads, processes or filesystem effects`
  (identical assertion, actual 1 expected 0): PRE-EXISTING, not caused by this patch, not investigated.
- RED against unchanged production (C1, measured): dispatch-briefing 3 failing (--help, updated default-reader case, new D180b new-directory case);
  host-commit pin 4 failing ((x), D180b (xi), two transcript cases using the helper); SAR16 was red only through a test fault, since fixed.
  Now GREEN: the D180b cases ("(xi) D180b ..." in the pin; three "D180b PF-61 reader ..." cases; SAR16 after registry init).
- SAR16 is a pin: green also against unchanged production, because the new directory is not inventoried.
- Logs: `scratch/agent-out/wd180b/{green,base,green2,base2}.*.log` (untracked). The first `session-authority-repair` run used a wrong path
  (`lib/`) and was repeated with `scripts/`.

## Existing cases changed (and why)

- Host-commit pin: helper `stopFailureFiles` and `assertRefusedAtStop` (case (x)) follow the diagnostics directory because the diagnostic moved; they also assert the host-commit directory holds none.
- dispatch-briefing.test.mjs: `STOP_DIR` follows the new directory (existing case "PF-61 reader the default reader lists real files ..."); `LEGACY_STOP_DIR` added.
- No case weakened, skipped or deleted.

## NOT done

- Records already in the legacy directory still make the inventory unreadable until heal retires them (slice D181).
- The checkpoint outcome of the budget item; the move-aside text (Wanted 3); no consumer-run proof.
- The unindexed-registry-entry finding of 2026-10-27 is unexplained.
- Independent Critic review, full Verify and PO acceptance remain parent-owned and pending. Native Goldfish authority is a gate component.

## Proposed commit message

fix(authority): the finalizer writes its stop-failure diagnostic outside the inventoried native Goldfish namespace (D180b)

## Operator flow

apply-diff (`git apply` the patch), `git add -u` with a path limit, `--no-verify` commit, stamp, install.
