# FX5B-W: gitleaks adapter retained findings on native Windows, and the staged `.gitleaksignore` repair

Dispatch FX5B-W (measurement + staged patch; diff-only, nothing applied, nothing committed).
Host of measurement: native Windows (`process.platform === "win32"`), real gitleaks binary on PATH, Node.
No secret value appears in this note or in the patch; only path, rule id, line and column metadata plus the
digest-bearing content-v1 lines the patch has to carry (a content-v1 line is a sha256 over
path+rule+line+column+secret, the same kind of line `.gitleaksignore` already tracks).

## 1. Measurement (measured)

Method: a throwaway driver imported the adapter's exported `run()` from
`plugins/pipeline-core/scripts/security-adapters/gitleaks.mjs` and called it the way
`plugins/pipeline-core/scripts/security-scan.mjs` does: on a detached `git worktree` snapshot of HEAD
(`--no-git` file-content scan of that tree, config resolved from the adapter module's own location,
`.gitleaksignore` read from the snapshot root). The security-scan CLI itself was not used: it refuses a dirty
working tree (`refuseMutableSource` after `observeCandidate`), and the shared tree carried an unrelated
uncommitted file. The snapshot was verified clean and at the expected HEAD, and removed after each run.

| Quantity | Value |
|---|---|
| HEAD of the baseline measurement | `079efb2cd808d73bbc192868a17f1ee7877361b9` |
| Retained (unsuppressed) findings recorded 2026-10-05 on native Windows (from the briefing, not re-measured here) | 49 |
| Retained findings now (adapter `run()` result, `findings.length`) | **2** |
| Raw gitleaks findings in the snapshot | 38 |
| Suppressed by content-v1 entries | 36 |
| content-v1 entries in `.gitleaksignore` | 87 |
| Independent re-derivation of the retained set (same key arithmetic) | 2, consistent with the adapter |

Evidence (ignored scratch, written by `capture-evidence.mjs`, wrapped exit code 0): `scratch/FX5B-W/scan.log`.

### Per-finding metadata (retained findings at HEAD)

| # | path | ruleId | line | column | near-miss diagnostic in the adapter message |
|---|---|---|---|---|---|
| 1 | `plugins/pipeline-core/hooks/guard-git.test.mjs` | `generic-api-key` | 1305 | 6 | yes: entry recorded at line 1287 |
| 2 | `plugins/pipeline-core/lib/model-family-host-store.test.mjs` | `generic-api-key` | 39 | 26 | no: no entry for this path+rule+column |

Inferred, not measured: the drop from 49 to 2 is consistent with commit `e92635db7`
(`fix(gitleaks): normalise nested finding paths to forward slashes on Windows`), which is the cause the
GLWIN-t diagnosis located. This dispatch did not re-run the adapter at that commit's parent.

HEAD moved by one commit during the dispatch (shared tree): the repaired-copy rescan below ran at
`5b3fb8358724db2b08f5863659d2e5fa8776171a`. The two HEADs differ by exactly one file
(`specs/sprint-alfred-epic/evidence/critic-2026-10-05/s2-registration-patches.md`, measured with
`git diff --name-only`), so `.gitleaksignore` and every scanned test file are identical across both.

## 2. Repair (staged, not applied)

`specs/sprint-alfred-epic/design/fx5b-gitleaksignore/repair.patch` changes exactly one line of `.gitleaksignore`
(file line 91; 216 lines before and after; the real file's sha256 was unchanged by the dispatch).

| path | ruleId | column | old line | new line |
|---|---|---|---|---|
| `plugins/pipeline-core/hooks/guard-git.test.mjs` | `generic-api-key` | 6 | 1287 | 1305 |

Produced by calling the exported `repairStaleIgnoreEntry` (`plugins/pipeline-core/scripts/gitleaks-repair-ignore.mjs`)
with `rootDir` = the repository root and `ignoreFilePath` = a byte-identical scratch copy
(`scratch/FX5B-W/gitleaksignore.copy`), then `git diff --no-index` with the headers rewritten to
`a/.gitleaksignore` / `b/.gitleaksignore`. The repair CLI was not run; the real file was never written.

- `git apply --check specs/sprint-alfred-epic/design/fx5b-gitleaksignore/repair.patch`: exit 0
  (`scratch/FX5B-W/apply-check.log`). To apply later: `git apply specs/sprint-alfred-epic/design/fx5b-gitleaksignore/repair.patch`.
- Driver output: `scratch/FX5B-W/repair.log`.

Retained count with the repaired copy: **1** (finding 2 only). Measured, with a labelled deviation from the
briefing: the adapter has no ignore-file path option (`run()` reads `<rootDir>/.gitleaksignore` only), so the
briefing's literal condition was not met. The rescan was done instead by placing the scratch copy as the
`.gitleaksignore` of a disposable detached snapshot (scratch only; the real file untouched):
36 -> 37 suppressed, 2 -> 1 retained, 38 raw findings both times (`scratch/FX5B-W/scan-repaired.log`).

## 3. Retained findings that are NOT a near-miss: needs a decision (suppression with justification, or code change)

- `plugins/pipeline-core/lib/model-family-host-store.test.mjs`, rule `generic-api-key`, **line 39, column 26**.
  A finding at this path exists at HEAD (measured). `.gitleaksignore` has no line naming that path at all
  (measured with `git grep -c` on the file), so there is nothing to repair; the options are a reviewed new
  suppression with a justification, or a change to the test fixture. Nothing was computed about the value, and
  no suppression was added (out of scope).

## 4. Observation, not acted on (measured, then inferred)

51 of the 87 content-v1 entries matched no live finding at HEAD (50 after the staged repair). Measured: 45 of
the 51 are for `backlog/transitions.ndjson`, whose `sentry-access-token`/`generic-api-key` findings are already
dropped by the path-scoped allowlist in `.gitleaks.toml`; inferred (not tested): those entries are inert
because gitleaks never reports those findings to the adapter. The other 6 are `guard-git.test.mjs:1287:6`
(the stale entry repaired above) plus 5 that name a file and position with no current finding
(`specs/sprint-phoenix-epic/evidence/lifecycle/feature-package-phx-0a-r3-reconcile.json` 1:433,
`harness/scripts/pipeline-state.test.mjs` 2080:131 and 2204:477,
`specs/2026-07-24-sprint-cyborg-epic/briefing-gitleaks-in-tree-fixture-fp-fix.md` 59:13,
`plugins/pipeline-core/lib/resume-hint.test.mjs` 160:7). They block nothing; whether to prune them is a
separate hygiene decision and was not made here.

## 5. FX5B-2: justified suppression

Dispatch FX5B-2 (diff-only; nothing applied to the real `.gitleaksignore`, nothing committed, no secret value
copied anywhere). It closes the one finding section 3 left open and extends `repair.patch` so a single
`git apply` carries both changes.

### Justification (measured from the source and the scanner, no value quoted)

`plugins/pipeline-core/lib/model-family-host-store.test.mjs:39` is the trust-anchor fixture row of the test:
a `keyReference` label next to `publicKeySha256: sha(publicPem)`. Evidence, all read from the file:

- the string literal assigned as the label describes itself as a synthetic fixture (line 39), and the adapter's
  matched value is on that same line (driver: `secretFoundOnReportedLine: true`, length 20, reported as a number
  only). Inferred, not printed: the 20-character label literal is that value (the only candidate of that length);
- the public key beside it is hashed from a key pair generated in-process by `generateKeyPairSync("ed25519")`
  (line 37), so no pre-existing key material is involved;
- the neighbouring constants (lines 29-42) are a fixed timestamp, repeated-digit hex commit/tree values and
  `sha()` digests of short labels; a grep of the file for network modules, URLs and credential APIs finds none
  (its only `process.env` use hands fixture data to local `node` child processes, lines 845-852 and 959-969).

Conclusion: a deterministic test-fixture label, not a credential. The rule trips on the `key... : "<label>"`
assignment shape, not on any secret. The suppression is one exact content-v1 entry (digest over path, rule, line,
column and the recognised value), so a changed value, a moved line or a different file is not covered.

### Entry metadata

| path | ruleId | line | column |
|---|---|---|---|
| `plugins/pipeline-core/lib/model-family-host-store.test.mjs` | `generic-api-key` | 39 | 26 |

The entry line was produced by the adapter's own exported `gitleaksContentAuthorityLine()` from the normalised raw
finding (driver `scratch/FX5B-2/measure.mjs`, same approach as `scratch/FX5B-W/measure.mjs`: the adapter's `run()`
on a snapshot of HEAD), not hand-computed. It parses as `kind: "content"` and was not already in the file.

### Combined patch

`repair.patch` now applies BOTH changes in one hunk (`@@ -88,9 +88,18 @@`, 10 lines added, 1 removed): the
FX5B-W re-lining of the `guard-git.test.mjs` entry (taken verbatim from the previously staged patch; file line 91)
and the new entry. The new entry is inserted directly after the two `resume-hint.test.mjs` entries (the
neighbouring `plugins/pipeline-core` test-file entries; the file has no strict global order, only per-block
grouping), preceded by an 8-line `# FX5B-2 (2026-10-06): ...` justification comment, which is the file's own
convention for later entries (`# <ID> (<date>): ...`). The comment states the verdict and deliberately does not
quote the literal. The file had 215 newline-terminated lines before and has 224 after.

- `git apply --check specs/sprint-alfred-epic/design/fx5b-gitleaksignore/repair.patch`: exit 0
  (`scratch/FX5B-2/apply-check.log`). To apply later: `git apply specs/sprint-alfred-epic/design/fx5b-gitleaksignore/repair.patch`.
- The patch was applied to a scratch copy with `git apply --directory=scratch/FX5B-2/patched` (exit 0,
  `scratch/FX5B-2/apply-scratch.log`); the sha256 of the result equals the sha256 of the independently built
  intended file (both `8b8fd67e...`, `scratch/FX5B-2/build-patch.log` and `scratch/FX5B-2/patched-run.log`).
- The real `.gitleaksignore` was never written; its sha256 (`8883fa7f...`) was identical before and after every
  driver run.

### Retained count with the patched copy

| Run | HEAD | Raw findings | Suppressed | Retained |
|---|---|---|---|---|
| unpatched (`scratch/FX5B-2/entry.log`) | `bcdeab014db3...` | 38 | 36 | **2** (the two findings of section 1) |
| patched copy (`scratch/FX5B-2/patched-run.log`) | `64bf51049b2a...` | 38 | 38 | **0** (adapter status PASS, independent re-derivation 0, consistent) |

Raw count 38 in both runs, so the added comment block trips no rule of its own. HEAD moved by commits from the
shared tree between the two runs (each run saw `headUnchangedDuringRun: true`). The extracted `.gitleaksignore`
equals HEAD's blob at both HEADs (`ignoreFileMatchesHeadBlob: true` in both logs) and, at the first HEAD, has the same
sha256 as the working-tree file (`8883fa7f...`); the scanned fixture file equals the working tree at both HEADs
(`targetFileEqualsWorkingTree: true`).

Labelled deviation from FX5B-W's snapshot handling: the briefing forbids `git worktree`, and the adapter needs only
a directory, so the snapshot was materialised with `git archive <HEAD sha>` extracted by `tar` into
`scratch/FX5B-2/tree` (exact commit, no working-tree state), the adapter was run on it, and the directory was
removed afterwards (`snapshotCleanup: "removed"` in both logs). The `scratch/FX5B-2/*.log` files are ignored
scratch and not durable; the numbers above are the durable record.
