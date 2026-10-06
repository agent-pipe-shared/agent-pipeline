# S2 package 1 apply check (APPLYCHK, 2026-10-06) - PARTIAL (tool budget reached)

Evidence-only. Real targets untouched; copies live under the ignored `scratch/APPLYCHK/tree/`.
Copies made with `node -e` + `fs.copyFileSync` for five targets: `protected-baseline.json`, the lifecycle-ready hook,
`harness/scripts/verify.mjs`, `harness/config/verify-case-completion.v1.json`, `docs/product-capability-inventory.json`.

## Guard finding (not a patch defect)

`git apply --check --directory=scratch/APPLYCHK/tree <patch>` and `git apply --verbose --directory=...` were both
refused: `GUARD-TESTPATH-SHELL-FAULT: mutating git apply has unbound patch targets` (same cause twice, so that route was
stopped). Fallback used: `git apply --check <patch>` against the REAL tree (read-only) for each patch, plus GNU
`patch -p1 -d scratch/APPLYCHK/tree -i <patch>` on the copies (admitted by the guard). That is a deviation from the
briefed `git apply --directory` command.

## Per step (README order)

| # | Step | Command shape | Result |
|---|------|---------------|--------|
| 1 | protected-baseline.patch | `git apply --check` (real tree) / `patch -p1 -d scratch/APPLYCHK/tree` | applies: no output, exit 0 / `patching file plugins/pipeline-core/protected-baseline.json` |
| 2 | facade over the hook | copy into `tree/` | NOT performed: `GUARD-TESTPATH-SHELL: PB-GUARD-HOOKS` refused the copy; no override sought. Facade checked in place instead (below). |
| 3 | verify-registration.patch | same two forms | applies / `patching file harness/scripts/verify.mjs` |
| 4 | test-registrations.patch (after step 3 on the copy) | same two forms | applies on the copy after step 3: 13 hunks, all succeeded, each with "offset 1 line" (expected, step 3 adds one line). `git apply --check` alone on the real tree: applies. |
| 5 | case-completion-dispositions.patch | same two forms | applies / `patching file harness/config/verify-case-completion.v1.json` |
| 6 | inventory-surfaces.patch | same two forms | applies / `patching file docs/product-capability-inventory.json` |

So the README's "two verify.mjs patches one after the other is not yet checked" is now checked on a copy: it applies,
with a one-line offset.

## Facade

In-place (package file, not a copy): sha256 `9ce34acf85fa4f9b42a1609847cd70e5542fce7a71f09c76f71104201e38b552`
= README line 15 value: MATCH. 75 lines. `node --check` on the facade: exit 0.

## node --check

- patched `scratch/APPLYCHK/tree/harness/scripts/verify.mjs`: exit 0.
- facade: exit 0 (above). No facade copy exists in `tree/` (step 2).

## Not reached

- Registered-suite count versus README (25) and per-file `git ls-files` check: NOT DONE. A `node -e` comparison was
  refused (`GUARD-TESTPATH-SHELL`, TP-3, the script mentioned verify.mjs) and the tool budget ran out. README table lists 25.
- The two checkers (`check-verify-suite-registration.mjs`, `check-verify-case-completion.mjs`): argument parsing not read,
  NOT run. Not verifiable here.

## Other

`node --test harness/scripts/check-consumer-safe-paths.test.mjs`: exit 0, 9 of 9 pass.
