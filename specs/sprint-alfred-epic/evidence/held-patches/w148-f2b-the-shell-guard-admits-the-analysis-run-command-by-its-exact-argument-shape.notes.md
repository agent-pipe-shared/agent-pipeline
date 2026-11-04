# w148 — the shell guard admits the analysis-run command by its exact argument shape (candidate 19, F2b)

Chain order: this patch is a delta on top of w147 (it edits the same guard files) and does NOT apply to the real checkout until w147 is applied first. Apply after w147.
Criterion binding: AC-108 is the closest existing accepted criterion (fresh bounded attempt under its unchanged Spec text). The PRD and the Spec are unchanged.
Basis: ADR draft `analysis-lane-runs-tests-in-a-scratch-clone-while-a-feature-is-approved`, point 2 (the guard admits exactly that command; every other script run stays refused; no lifecycle state or signature involved).

## What it changes

- `lib/guard/constants.mjs`: new `ANALYSIS_RUN_SCRIPT` (the plugin's `scripts/analysis-run.mjs`), same pattern as `AUDIT_PACK_SCRIPT`. `canonicalSanctionedScript` enumerates every `*_SCRIPT` export, so no further registration is needed.
- `lib/guard/command-catalogue.mjs`: `sanctionedAnalysisRunArgs(args, root)`, wired into `sanctionedLifecycleScriptArgs`. Admitted shape: `--root` once (value `.` or the exact absolute root), optionally `--commit` once (`HEAD` or 7 to 40 lowercase hex characters) and `--timeout-seconds` once (digits only, 1 to 1800), in any order. Unknown flags, repeated flags, `=` spellings, a dash/slash/`..`/colon in the commit value, a relative root other than `.`, an odd token count and any trailing token are refused.
- `lib/guard/analysis-run-command-admission.test.mjs` (new, 3 cases): the constant, the admitted and refused argument shapes (including `node --test x.test.mjs`, a copy of the script outside the plugin and another plugin script), and the Dev-Plan lane showing that the admitted shape yields no opaque-script write candidate while every refused variant still yields one with `forceLifecycleGate`.

## Why the Dev-Plan lane file is unchanged

`devplan-shell-lane.mjs` already skips the opaque-script candidate when `resolveSanctionedScriptInvocation` finds a script and `isSanctionedLifecycleCommand` accepts it (the `audit-pack` precedent). Admitting the shape in the catalogue is therefore sufficient; the lane's semantics for every other command are untouched.

## Checks

- New admission test: RED before the change (missing export), 3 of 3 green after.
- `audit-pack-command-admission.test.mjs`: 3 of 3 green. `devplan-shell-lane-recovery.test.mjs`: 13 of 13 green.

## Not changed / not proven

- The new test file is not registered in `harness/verify-suites.json` or the inventory (out of scope; the coordinator registers it).
- `analysis-run.mjs` itself and the real-tree Dev-Plan gate are unchanged. The full Verify and an end-to-end hook run against a live session were not made.
