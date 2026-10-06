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
