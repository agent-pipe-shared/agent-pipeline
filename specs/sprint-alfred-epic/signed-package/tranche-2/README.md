# Tranche 2 -- signed-package members

Tranche 2 carries the changes that cannot be written to a protected path by shell tooling. This README covers the
`pipeline-state.mjs` member; further members are added in the same folder as they land. Everything below is
repo-relative.

## PS-R6F2b-R75

Patch of `plugins/pipeline-core/scripts/pipeline-state.mjs` (Ruling 76(b)): `pipeline-state-R6F2b-R75.patch`, a unified
diff `a/plugins/pipeline-core/scripts/pipeline-state.mjs` -> `b/...`, LF line endings (the file is `eol=lf`).
HEAD blob of the original: `7964fd426f71ccefa5be656a69aa1cf4525f02e2`. Post-image blob: `7ed3351e9` (abbreviated, from
the patch's `index` line). Six hunks, everything else byte-identical (git emits them as five textual hunks because
hunks 2, 3 and 6 are adjacent):

R6-F2b, the `inspect` continuity-authority drift projection:
1. Import `projectContinuityAuthorityDrift` from `../lib/continuity-authority-drift.mjs` (this is the import line that is
   uncommitted in today's working tree at `:423`; see the apply prerequisite below). In `case "inspect"`, before
   `const payload = {`, add
   `const drift = base.continuity == null ? null : projectContinuityAuthorityDrift(base.continuity, (p) => physicalRebindFile(dir, p)?.sha256 ?? null);`.
2. `nextAction` becomes `buildInspectNextAction(dir, base, lifecycle, deps) ?? drift?.recovery ?? null`.
3. `continuityAuthorityDrift: drift,` is added as the LAST payload key, after `nextActionText`.

R7-5, the `rebind-approval` verb (Ruling 58):
4. Import `rebindApproval` from `../lib/rebind-approval.mjs` (committed in `cfeb1ceea`), placed after the
   `architecture-design.mjs` import, double-quote style like its neighbour.
5. `"rebind-approval"` is added to `PIPELINE_STATE_COMMANDS`, next to `"inspect"`.
6. A new `case "rebind-approval"` directly after the `inspect` case, after `readState`: it calls
   `rebindApproval({ dir, now, deps })`, prints the payload once as JSON, and returns the library's exit code. `deps` is
   the RAW `run()` parameter, with no defaulted `gitCandidate`: the pins exercise real git ancestry.

Known and deliberately left: `DWP-REBIND-ARGS` ("rebind-approval accepts no arguments") sits in the library's REPAIR
table but is unreachable from this verb (`refuse()` is not exported, and the case spec carries no argv check). It is
recorded as a follow-up, not fixed here.

### Apply prerequisite (read this before the ceremony)

The patch applies to the file at blob `7964fd4`. Today's working tree does NOT equal that blob: it carries the
uncommitted `:423` import of `projectContinuityAuthorityDrift`, so hunk 1 would fail on a context mismatch. The ceremony
therefore restores the file to the HEAD blob first (`git checkout HEAD -- plugins/pipeline-core/scripts/pipeline-state.mjs`);
hunk 1 then re-adds exactly that import line, so the patch subsumes the uncommitted line. Confirm the pre-image with
`git hash-object plugins/pipeline-core/scripts/pipeline-state.mjs` (must print `7964fd426f71ccefa5be656a69aa1cf4525f02e2`)
before applying.

### Apply, inside the ceremony

```
git apply --check specs/sprint-alfred-epic/signed-package/tranche-2/pipeline-state-R6F2b-R75.patch
git apply specs/sprint-alfred-epic/signed-package/tranche-2/pipeline-state-R6F2b-R75.patch
```

The patch was never applied to the repository working tree or index by the dispatch that produced it; its content gate
was a `git diff --no-index` between a clean copy at blob `7964fd4` and the patched copy (12 insertions, 2 deletions,
import plus hunks 1-6 only), and the patched copy passed `node --check`. The first real `git apply --check` is the
ceremony's.

### Pins to run between apply and `authorize-commit`

Run the targeted files only; run the plugin regression suite under WSL, not on Windows.

- `node --test plugins/pipeline-core/scripts/pipeline-state-inspect-continuity-drift.test.mjs`: 0 fail. Baseline
  9 tests / 1 pass / 8 fail in `evidence/R6-F2b-20261009/before-target.txt`.
- `node --test plugins/pipeline-core/scripts/rebind-approval.test.mjs`: 3 pass + 1 todo.
- `node --test plugins/pipeline-core/scripts/pipeline-state.test.mjs` (plugin regression suite): no new failure
  against the baseline `evidence/R6-F2b-20261009/before-plugin-suite.txt`.

### Same-tranche obligations

- TP-13: `rebind-approval.test.mjs` and `pipeline-state-inspect-continuity-drift.test.mjs` both need registration in
  `verify-suites.json` in this same tranche.
- The TESTFIX-A regions of `harness/scripts/pipeline-state.test.mjs` are tranche members too: Region A (already
  staged), Region B (in PS06), and the AR03h and HL blocks. The list is in
  `specs/sprint-alfred-epic/plans/po-list-2026-10-08.md`.

## KERNEL-LIST-R86a

Patch of `plugins/pipeline-core/lib/guard-maintenance-window.mjs` (Ruling 86a; a kernel file, so the ceremony applies it, no
shell tool does): `guard-maintenance-window.kernel-list.patch`, a unified diff `a/plugins/pipeline-core/lib/guard-maintenance-window.mjs`
-> `b/...`, LF line endings, default 3 lines of context, ONE hunk. It was produced from a scratch copy with
`git diff --no-index` and never applied to the working tree or index.

- **Base blob:** `9943c943867064995c8164aeb25735875311527c` (`git rev-parse HEAD:plugins/pipeline-core/lib/guard-maintenance-window.mjs`
  at candidate `f9007f38f`; the working file is clean against it). Post-image blob `913fae338ddb9cddc000a66215109dd6104f5f6d`
  (the patch's `index` line; the patched copy passes `node --check`).
- **Patch sha256:** `d3d281214d9ac470eac0568e13c595b896b99ff983f798ee04f61d9945bf2e89` (2358 bytes).
- **Content:** adds exactly 15 paths to `NEVER_LIFTABLE_KERNEL_PATHS` (21 added lines: 15 paths and 6 comment lines), removes
  nothing, reorders nothing. They are ONE new commented group appended after the last entry (`lib/guard/write-scope.mjs`), sorted
  by path, which is the list's existing shape (chronological groups, each with a header comment). `lib/guard/env-dump-lane.mjs`
  sits in that group, not in the older S2-70 `lib/guard/` block, whose comment says "the 22 modules extracted from
  hooks/guard-lifecycle-ready.mjs" and would turn false. The 15 are `lib/agy-central-refresh`, `agy-central-snapshot`,
  `agy-start-hint`, `checkpoint-push-approval`, `continuity-authority-drift`, `critical-action-authorization`, `fs-durability`,
  `git-null-device`, `guard/env-dump-lane`, `hardened-private-directory`, `hook-currentness`, then `scripts/toolchain-preflight`
  and its three `scripts/security-readiness/{gitleaks,osv-scanner,semgrep}-readiness` (all `.mjs`, all under `plugins/pipeline-core/`).
- **Expected effect:** the kernel list goes 372 -> 387. GMWKC01 goes from RED to GREEN: in-tree it fails on exactly 26 edge lines
  into these 15 paths and nothing else (`evidence/CLOSURE-REPAIR-P-20261009/in-tree.txt`); against a scratch-patched module it
  passes (`evidence/CLOSURE-REPAIR-P-20261009/patched.txt`, 9 of 10 closure cases green).
- **Two reds that applying this patch alone does NOT clear:**
  1. GMWKC03 goes RED on apply: the 15 paths are not in `docs/guard-maintenance-window-threat-model.md`'s "Protected assets"
     prose. The doc sync belongs in the SAME tranche (a doc edit, not covered by this patch).
  2. `lib/guard/guard-split-contract.test.mjs` GSC01 and GSC02 are red in BOTH states (red before this patch, still red after):
     `harness/guard-split-map.json` has no `env-dump-lane` module. GSC05 only walks the map's modules, so it is green either
     way and does not see the gap. Fixing it needs a map entry with a layer assignment, a separate design call in `harness/`.
- **Apply prerequisite:** confirm with `git hash-object plugins/pipeline-core/lib/guard-maintenance-window.mjs` that the file is
  the base blob above before applying. Then, inside the ceremony: `git apply --check <patch>`, `git apply <patch>`.
- **Pins to run between apply and `authorize-commit`:** `node plugins/pipeline-core/lib/guard-maintenance-window-kernel-closure.test.mjs`
  (GMWKC01 must pass; GMWKC03 passes only once the threat-model doc is synced) and
  `node --test plugins/pipeline-core/lib/guard/guard-split-contract.test.mjs` (GSC03-GSC05 green; GSC01/GSC02 per item 2 above).
- **Same-tranche obligations:** the threat-model doc sync (GMWKC03). `clone-hook-readiness.mjs` and `refresh-mandatory-hooks.mjs`
  (HOOKREFRESH-F2) are in neither the list nor today's walk; if F2 makes a kernel file import them, GMWKC01 goes red again and
  the delta is measured then (Ruling 86a).

## New contract test files

A contract test whose target path is under `plugins/pipeline-core/hooks/` cannot be written by an agent session
(Ruling 80), so it is held here as a post-image that the ceremony copies into place. Digests are over the committed LF
bytes.

### guard-devplan-design-approval.test.mjs (ADR-0085 row 3a; Rulings 73 and 77)

- Target path: `plugins/pipeline-core/hooks/guard-devplan-design-approval.test.mjs`
- Post-image: `specs/sprint-alfred-epic/signed-package/tranche-2/hooks/guard-devplan-design-approval.test.mjs`
- sha256: `dba4f1459637951f458c088410e10e8e61f0d73200da7f9cf9543b9424269726`
- Install: copy the post-image to the target path unchanged. It resolves `HOOKS_DIR` from its own location, so it runs
  only at the target path, not in place here.
- WSL command (hook tests run under WSL only):
  `wsl.exe -e bash -lc "cd <repo-root-in-wsl>; node --test plugins/pipeline-core/hooks/guard-devplan-design-approval.test.mjs"`
- State before the F slice: 9 tests, 7 red (C1-C7) and 2 green (FX1, FX2). RED reason for C1-C7: v8 is not yet a
  current plan-approval schema (`CURRENT_APPROVAL_SCHEMA` is `pipeline.plan-approval.v7`), so the lifecycle layer
  rejects every v8 record as awaiting-approval before the boundary's own checks run. A v7-shaped approval in the same
  fixture is admitted (mini) or passes the lifecycle layer (feature, DWP-PACKAGE-PHYSICAL), so the fixture is sound and
  the DAA codes become reachable with the F slice.
- Evidence (machine-written captures of a scratch run copy that differs from the post-image only in the `HOOKS_DIR`
  line and the header comment): `evidence/ADR0085-T0c-a-20261009/red.txt` and
  `evidence/ADR0085-T0c-a-20261009/red-run3.txt`; the probe that cleared the fixture is in
  `evidence/ADR0085-T0c-run2-20261009/`.

### guard-devplan-design-approval-v7.test.mjs (ADR-0085 row 3b; Ruling 77(c))

- Target path: `plugins/pipeline-core/hooks/guard-devplan-design-approval-v7.test.mjs`
- Post-image: `specs/sprint-alfred-epic/signed-package/tranche-2/hooks/guard-devplan-design-approval-v7.test.mjs`
- sha256: `e11f1a405b59bed85a7b712860548c0c4a6888529af541a9636ac54b7e64973d`
- Install: copy the post-image to the target path unchanged. It imports `../lib/`, `../scripts/` and `./` and resolves
  the guard from `./guard-devplan.mjs`, so it runs only at the target path, not in place here.
- WSL command (hook tests run under WSL only; on win32 the case skips with its reason):
  `wsl.exe -e bash -lc "cd <repo-root-in-wsl>; node --test plugins/pipeline-core/hooks/guard-devplan-design-approval-v7.test.mjs"`
- State before the F slice: control green, target red (the run reports 3 tests: the control passes, the target fails and
  the parent test fails with it). RED reason: with the private course store removed (a fresh clone) the v7 package re-read
  refuses with `DWP2-DURABLE-FAILURE` (`design-workflow-package-v2.mjs:97`) and the Edit lane exits 2 with that code,
  whereas the contract (design note section 17) is that the boundary admits without the store. Only the Edit-lane
  assertion is reached today; the Bash lane's own refusal is not measured.
- Fixture: the disposable repository is enrolled right after `advisorHostFixture` returns, before any state file is
  written, because `governance-scope.mjs` `enrollmentHistory()` counts `.claude/pipeline-state.json` and an enrollment
  made after it is recorded as `declined`. The evidence commit stages exactly the package's bound paths (the v2 reader
  admits HEAD only as an evidence-only descendant of the package candidate).
- Evidence (machine-written capture of a scratch run copy that differs from the post-image only in the 14 import lines
  and the `GUARD` line): `evidence/ADR0085-T0c-b-20261009/red-run4.txt`. The two earlier failing states of the same
  fixture are in `red.txt` (`DWP2-CURRENT-CANDIDATE`, then the declined enrollment) and `enroll-diagnostic.txt`.

### SF22b: stop-fanout.test.mjs (steady-state Stop spawns 0; Ruling 87)

Unlike the two files above, the target already exists: this member REPLACES a committed test file.

- Target path: `plugins/pipeline-core/hooks/stop-fanout.test.mjs`
- Base blob: `e738862997b90adc22f9527e648e61c81484d8cd` (`git rev-parse HEAD:plugins/pipeline-core/hooks/stop-fanout.test.mjs`;
  the working-tree copy hashes identically with `git hash-object`)
- Post-image: `specs/sprint-alfred-epic/signed-package/tranche-2/hooks/stop-fanout.test.mjs`
- sha256: `4f4e069ef0e904af6d28b944cdd7f92f86160fc7b8094c5ecc7b83b2f6d064b6` (over the LF bytes; `file` reports no CRLF)
- Change against the base blob (76 insertions, 16 deletions): the new case SF22b, registered with the explicit id `SF22b`
  (`check()` gains an optional third `id` parameter and numbers only the auto-id cases, so SF23 keeps its id; the ids stay in
  the strict ascending order `test-case-completion.mjs` requires: SF22 < SF22b < SF23); the case-count pin 23 -> 24; and the
  reworded comment blocks above `TRIPWIRE_SOURCE` and above `LEDGER_POWERSHELL_SPAWN_BOUND_WIN32`. SF22's bound stays 4 and
  the other 23 cases are byte-identical.
- Contract: SF22b runs a first ledger-writing Stop against a fresh common dir and then a second Stop against the same common
  dir and session, each as its own hook process with its own tripwire. The second Stop must spawn exactly 0 children of any
  executable on every platform, decide `block` like the first, and append to the ledger (`stop-eval, block` twice). A control
  spawn through the second Stop's own preload and log proves its empty log is measured.
- Install: copy the post-image to the target path unchanged, after confirming `git hash-object` of the target prints the
  base blob above. It resolves its imports and `HOOK` from its own location, so it runs only at the target path.
- Run commands. WSL (hook tests run under WSL):
  `wsl.exe -e bash -lc "cd <repo-root-in-wsl>; node --test plugins/pipeline-core/hooks/stop-fanout.test.mjs"`.
  Native win32 (this one file only, never the full suite): `node --test plugins/pipeline-core/hooks/stop-fanout.test.mjs`.
- State: a contract pin, not a RED. All 24 cases are green on native win32 (SF22: 4 PowerShell spawns; SF22b: first Stop 4,
  second Stop 0) and under WSL (SF22 and SF22b: 0 and 0). With the ledger directory removed between the two Stops, SF22b
  goes red natively ("the second Stop ... spawned 2 child process(es) on win32"), so the zero is not vacuous.
- Evidence (machine-written captures of a scratch run copy that differs from the post-image only in its 3 import lines and
  the `HOOK` constant, 4 lines; `git diff --no-index --stat` between the two reports 4 insertions and 4 deletions):
  `evidence/SF22b-20261009/native.txt`, `evidence/SF22b-20261009/wsl.txt` and the mutation run
  `evidence/SF22b-20261009/mutation-native.txt`. Basis: `evidence/FANOUT-WIN-M-20261009/spawns.txt`.
- Left unchanged on purpose (outside the briefed comment blocks): SF22's case name ("... bound 4, must drop to 0"), the
  inline comment above its `ledgerSide` equality and that assertion's failure message still say that a reduction means the
  tracked fix landed and the constant must become 0. Ruling 87 re-scoped the backlog item, so those three strings are now
  stale; they are the next tranche-2 touch-up.
- Same-tranche obligation: the case set grows from 23 to 24 ids. If `verify-suites` pins a case count or case-set digest
  for this file, it needs the matching refresh (not checked here).

### guard-split-contract.test.mjs (KERNEL-DOCS-c/d; Ruling 105)

- Target path: `plugins/pipeline-core/lib/guard/guard-split-contract.test.mjs`
- Post-image: `specs/sprint-alfred-epic/signed-package/tranche-2/lib/guard/guard-split-contract.test.mjs`
- sha256: `db53e308443a24becd1f7ba3fe07bcd92e7e240a22915ba1fe37038d89ede5d2`
- Base blob: `609eb759d5c21339ddb220ad84d6723787962bcf` (`HEAD:plugins/pipeline-core/lib/guard/guard-split-contract.test.mjs`)
- Diff (line 142, one insertion and one deletion):
  - `-  assert.equal(moduleNames.length, 22, "the map names 22 modules besides the facade");`
  - `+  assert.equal(moduleNames.length, 23, "the map names 23 modules besides the facade");`
- Install: copy the post-image to the target path unchanged.
- GSC05 additionally needs the KERNEL-LIST-R86a patch (adds `lib/guard/env-dump-lane.mjs`). GSC01 is green only with this
  post-image placed; map entry landed in `0e7c39b65`.
