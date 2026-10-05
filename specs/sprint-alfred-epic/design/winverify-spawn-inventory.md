<!-- SPDX-License-Identifier: SUL-1.0 -->
# WINVERIFY -- spawn inventory for a full Verify on native Windows

Briefing WINVERIFY, 2026-10-05, candidate commit `a14e90888`. Numbers come from the scanner in
`plugins/pipeline-core/lib/windows-hide-scan.mjs` (the same one the guard test runs) over `harness/` and
`plugins/` (1495 `.mjs/.cjs/.js` files; `node_modules`, `.git`, `scratch`, `evidence` skipped).
It is a line-and-parenthesis heuristic, not a parser; the runtime tests pin what it assumes.
Whether a console window actually appears is **not observable by the agent**: every statement below is about code paths and recorded spawn options.

**Full per-site listing (every site, file:line, class)** is produced on demand, read-only and deterministic:
`node plugins/pipeline-core/lib/windows-hide-scan.mjs --sites` (PowerShell: append `> specs/sprint-alfred-epic/design/winverify-spawn-sites.md` to keep it);
without `--sites` it prints the summary and exits 1 when the guard would fail. It is not embedded here because the generator script
that would write it into this file was refused by the guard union (`GUARD-DEVPLAN-SHELL`, opaque-script-execution lane) and no override was sought.

## 1. Result in numbers

| | before | after |
|---|---|---|
| spawn-family call sites reachable from a full Verify (all files) | 1914 | 1914 |
| ...explicit `windowsHide: true` | 33 | 33 |
| ...no statement, supplied by the preload wrapper | 1880 | 1880 |
| ...explicit `windowsHide: false` (wrapper respects it, so UNCOVERED) | 1 (a test fixture, allowlisted); 0 elsewhere | same, and now guarded |
| scanner findings (opt-out, ChildProcess constructor, internal binding, `--allow-child-process`, non-builtin spawner, `process.env.NODE_OPTIONS` rewrite) | 0 | 0, now a failing test if one appears |
| call sites that hand-build the child's `env` without NODE_OPTIONS | 321 (159 start a Node child) | 321, all covered by the wrapper |
| **uncovered: Node children started without the preload (their own spawns open windows)** | **159 call sites (14 outside test files)** | **0** |

Non-test files alone: 454 sites (24 explicit, 430 preload, 112 hand-built env of which 14 start a Node child).
"Before" for the last row is derived by reading the pre-change wrapper (it only set `windowsHide`; an explicit `env` without NODE_OPTIONS passed through untouched) plus the scan; it was not measured on a screen.
"After" is pinned by tests, including a real grandchild probe that is true only on win32.

## 2. Who is covered, and how

1. **Verify root process** (`node harness/scripts/verify.mjs`, no `--import`): covered by an implicit edge. `verify.mjs` statically imports `verify-journal.mjs`, which imports `windows-hide-preload.mjs`;
   that module wraps `child_process` at load time and calls `syncBuiltinESMExports()`, so the ESM named import `spawnSync` in `verify.mjs` (lines 91, 92, 93, 101, 112 -- protected TP-3, no `windowsHide`) and in
   `self-verify-selection.mjs` sees the wrapper. Class: covered by the preload (import side effect). The guard test now pins verify.mjs -> verify-journal.mjs -> windows-hide-preload.mjs.
2. **Suite children** (`verify-journal.mjs:636`, `spawnAsync`): explicit `windowsHide: true`, and the child env gets the gated NODE_OPTIONS `--import` entry (`resolveSuiteChildEnvironment`, win32 only).
   `verify-evidence-producer.mjs:130` is explicit `windowsHide: true`. (`verify-journal.mjs:989` calls the injected `spawn`, i.e. site 636 in production.)
3. **Grandchildren with inherited env**: carry NODE_OPTIONS, load the preload. Covered.
4. **Grandchildren with a hand-built `env`** (`env: { PATH, ... }`, `delete env.NODE_OPTIONS`): the uncovered class before this change. Fixed in the wrapper: `withWindowsHideEnv` copies an explicit `env` lacking the entry
   and extends it (existing NODE_OPTIONS preserved, key casing folded, the caller's object never mutated). An explicit `windowsHide: false` is still respected, and is now a guard finding.
5. **`shell: true`, `exec`, `execSync`, `cmd /c`**: the wrapper hides the shell process; its children inherit that hidden console. Covered by reasoning, not screen-observed.
6. **`detached: true`** (the Verify spawner when a signal is given): carries `windowsHide: true`; how libuv combines DETACHED_PROCESS with the hide flag is not observable by the agent.
7. **Tier-B suites under `--permission`**: the entry is a `data:` URL that imports the preload only when no permission model is active; such suites are never given `--allow-child-process`
   (ADR-0065), so they have no spawn sites to cover. A new `--allow-child-process` is a guard finding.
8. **Absent per the scan, and guarded**: `new ChildProcess(`, `process.binding(`, `internalBinding(`, execa/cross-spawn/node-pty/shelljs/zx, rewriting `process.env.NODE_OPTIONS`.
   Residual theoretical gap: code that captures a spawn function into a variable before the preload loads in the ROOT process (children are safe: `--import` runs first). Not found among the root graph's spawn sites.
   A test that mutates `process.env.NODE_OPTIONS` itself would be flagged by the same rule.

## 3. Fixes

- `plugins/pipeline-core/lib/windows-hide-preload.mjs`: `withWindowsHideEnv` wired into the wrapper; `WINDOWS_VERIFY_CONCURRENCY_DEFAULT = 4`, `WINDOWS_VERIFY_CONCURRENCY_CAP = 5`, `clampWindowsVerifyConcurrency`.
- `plugins/pipeline-core/scripts/verify-journal.mjs`: win32 default 4 (was 2); hard maximum 5 applied to env var, calibration and explicit argument; comment pins the import edge.
- `plugins/pipeline-core/lib/windows-hide-scan.mjs` (new): scanner, guard rules, site renderer, read-only CLI.
- `plugins/pipeline-core/scripts/verify-journal.test.mjs`: guard tests (RED on a fixture, GREEN on the tree), env-injection tests, concurrency tests. Three existing win32 expectations (cap 2, `resolveWindowsVerifyConcurrency`
  fallback 2, pool width 2) were changed to 4/5 because the briefing changes that contract; no assertion was weakened or removed.
- No protected path (`verify.mjs` TP-3, `harness/verify-suites.json` TP-13) was touched; no `.patch` is needed.

## 4. Concurrency (one source)

The operator knob is the environment variable `PIPELINE_VERIFY_CONCURRENCY` (positive integer); the calibration field `verifyConcurrency` in `project/pipeline.json` is the repo-level equivalent that already existed.
Precedence: programmatic argument > env var > calibration > win32 default 4 > literal 8 elsewhere; on win32 every result is then clamped to 5; other platforms are never clamped.
There is **no CLI flag**: `verify.mjs` (TP-3) has no argument for it and no `--help`, so a flag or help text needs a protected-file change. It is documented here and in the comment above `resolveDefaultConcurrency`.

## 5. Attended measurement (for the PO; NOT executed by the agent)

PowerShell, repository root, clean committed tree (`candidate` is the full-registry mode):

```powershell
$env:PIPELINE_VERIFY_CONCURRENCY='4'; $sw=[Diagnostics.Stopwatch]::StartNew(); node harness/scripts/verify.mjs --mode candidate; $code=$LASTEXITCODE; $sw.Stop(); New-Item -ItemType Directory -Force scratch/WINVERIFY | Out-Null; $steps=(Get-Content evidence/verify-latest.json -Raw | ConvertFrom-Json).steps; $steps | Sort-Object durationMs -Descending | Select-Object name,exitCode,durationMs | Format-Table -AutoSize | Out-File scratch/WINVERIFY/suite-durations.txt; "exit=$code wallSeconds=$([int]$sw.Elapsed.TotalSeconds) suites=$($steps.Count) width=$env:PIPELINE_VERIFY_CONCURRENCY" | Out-File -Append scratch/WINVERIFY/wall.txt
```

Writes `scratch/WINVERIFY/suite-durations.txt` (per-suite durations, slowest first) and appends one wall-clock line to `scratch/WINVERIFY/wall.txt`. The journal records `durationMs` per step; that the final
evidence file keeps `steps[].durationMs` was not verified by the agent. Unset the variable to measure the default (4). Watch the screen for console windows while it runs.

## 6. Runner / platform / repo matrix

| | Windows native | WSL | macOS | own repo | consumer repo |
|---|---|---|---|---|---|
| Claude | affected (env fix, default 4, max 5) | unchanged | unchanged | affected on Windows | affected on Windows (plugin script) |
| Codex | same | unchanged | unchanged | same | same |
| Antigravity | same | unchanged | unchanged | same | same |

Non-win32 is unchanged by construction: `installWindowsHide` returns before wrapping when `platform !== "win32"`; `clampWindowsVerifyConcurrency` is the identity and `resolveWindowsVerifyConcurrency` returns `undefined` there.
The tests assert this with an injected `platform` (linux/darwin/freebsd) and "this host" cases that assert the inert contract. They ran on the Windows host only; no Linux/macOS/WSL run was made (forbidden by the briefing).
