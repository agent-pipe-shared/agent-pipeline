# Full Verify measurement of c1771bc98 (2026-10-20)

A measurement run, not a gate: `node harness/scripts/verify.mjs --mode candidate --no-reuse` in a
fresh clone at `c1771bc98` (tree `ec353d71f`). It ran 18817 s and exited 1; 1057 steps completed,
138 non-zero. The clone root is written as `<clone>` in these files.

| File | Content |
|---|---|
| `fv-c1771bc98-red.json` | The 138 non-zero steps of the run record (name, exit code, duration). |
| `fv-c1771bc98-classified.json` | First classification: each red suite found inline in `verify.mjs` rerun alone with `node --test` in the clone. |
| `fv-c1771bc98-groups.md` | The same, grouped by class and first error code. |

Classes: `test-red` (a case fails when run alone), `case-drift` (green alone, but the executed case
ids differ from the registered `caseIds`), `green-direct` (green alone with no drift: the cause is
Verify-only, for example load or a shared lock), `skipped-long` (not rerun, ran over 300 s in
Verify), `no-file` (not resolved by the first pass).

**Not classified yet in this first pass:** the 56 `no-file` suites, which are registered in
`harness/verify-suites.json` and are being rerun; the `*-check` steps, which are checkers reporting
violations rather than test files (their `node --test` rerun is not meaningful); and the eight
suites that ran 4.4 to 5.0 h each in Verify (onboarding-continuity, design-workflow-package-v2,
agy-session-dispatch, native-goldfish-host-state, native-goldfish-host-finalizer,
project-reset-git-hooks, model-family-host-store, model-family-invocation), which point at one
shared hang rather than eight defects. A `fail 1/1` whose failing line is the file itself crashed
before its first case.
