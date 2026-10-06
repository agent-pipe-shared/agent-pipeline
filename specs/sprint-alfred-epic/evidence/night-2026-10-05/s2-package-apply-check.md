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

## APPLYCHK2 (2026-10-06): registered-suite count, test-file existence, checker options

Method note: suite entries in `verify.mjs` are one-line objects (`{ name: "x", file: ...`). Artifacts under
`scratch/APPLYCHK2/` (ignored): `patched-names.log`, `patched-suites.log` (capture-evidence, `grep -n -o -E`, exit 0).
`grep -c` through capture-evidence was refused (`GUARD-DEVPLAN-SHELL`, probably reading `-c` as a code flag); the
Grep tool was used for counts instead. Reading the real `verify.mjs` via capture-evidence was refused
(`GUARD-TESTPATH-SHELL`, TP-3); the Grep tool on that exact file worked.

### (a) Registered suites: patched copy vs real
- Entry regex `^\s+\{ name: "[^"]+", (file|caseCompletion)...`: real `harness/scripts/verify.mjs` 608, patched copy 634.
  Difference 26 (measured by count, Grep tool).
- Name probe (README's 25 table names plus `guard-split-contract-tests`, plus the dropped `private-tmp-tests`) on the
  patched copy: 26 hits (`guard-split-contract-tests` and all 25 table suites, from `checkpoint-push-approval-tests` to
  `hook-currentness-digest-once-tests`); `private-tmp-tests` is absent. The same probe on the real file: no match.
  So the 26 added suites are those 26 names (inferred: set equality follows from the count difference 26 = 26 probed
  hits, assuming the patch removes no entry; no full list diff was made).
- README: "twenty-five new suites" in `test-registrations.patch` (table has 25 rows) plus `guard-split-contract-tests`
  from `verify-registration.patch` = 26. MATCH (26 = 25 + 1). The README's own text "23+2 entries" in "Registration
  location" is an older figure (stale wording, not changed).

### (b) Test files at HEAD (`git ls-files -- <25 table paths>`, exit 0)
- 24 of the 25 table paths are listed.
- MISSING from the HEAD index: the row-25 file, `hook-currentness.digest-once.test.mjs`. The README names only the file
  name; the probed path `plugins/pipeline-core/lib/hook-currentness.digest-once.test.mjs` is a guess (inferred, the
  directory was not read from the patch), so "missing" means "not at that path", not "absent from the repo".
- Not checked: the test file of `guard-split-contract-tests` (suite 26; its path is in `verify-registration.patch`, not read).

### (c) Checker options
Argument parsing read: `check-verify-suite-registration.mjs` accepts `--root <dir>` (lines 597-599);
`check-verify-case-completion.mjs` `parseArgs` accepts `--root --registry --schema --verify --base --candidate` (line 634).
Both accept a root, so both were run against `scratch/APPLYCHK/tree`:
- `node harness/scripts/check-verify-suite-registration.mjs --root scratch/APPLYCHK/tree`: exit 2; output is
  `MISSING-FILE TEST_SUITES "<suite>" names <path>, which does not exist` for the suites, because the scratch tree
  holds only five copied targets and no test files. Output truncated in the tool view (about 20k characters); an
  artefact of the sparse tree, NOT evidence about the patches. The expected-end-state claim (0 `UNCATEGORIZED-VERIFY-SURFACE`)
  is NOT verified here.
- `node harness/scripts/check-verify-case-completion.mjs --root scratch/APPLYCHK/tree`: exit 2;
  `REGISTRY-SCHEMA-READ ENOENT` for `harness/config/verify-case-completion.v1.schema.json` under the scratch tree
  (the schema file was not copied) followed by "registry invalid: 1 finding(s)". Artefact of the sparse tree; the
  expected "exactly rows 17 and 19" is NOT verified here.
- Next step if wanted: copy the missing schema and the test files into `tree/` (or point `--schema`/`--registry`
  at the real files), then rerun; not done (tool budget).

This section's own re-run of `node --test harness/scripts/check-consumer-safe-paths.test.mjs`: not run in APPLYCHK2
(budget); the exit 0 line above is from APPLYCHK.
