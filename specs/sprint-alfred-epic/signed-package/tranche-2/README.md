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

### guard-devplan-design-approval-v7.test.mjs (ADR-0085 row 3b; Ruling 77(c)): pending, fixture

- Target path: `plugins/pipeline-core/hooks/guard-devplan-design-approval-v7.test.mjs`. No post-image yet.
- Measured cause (WSL, `evidence/ADR0085-T0c-b-20261009/red.txt` and `enroll-diagnostic.txt`): the fixture no longer
  fails with `DWP2-CURRENT-CANDIDATE`. That refusal is cleared once the evidence commit stages exactly the package's
  bound paths, derived from the package object (the v2 reader admits HEAD only as an evidence-only descendant of the
  package candidate). The builder now stops one step later, in the governance enrollment: `applyDecision` returns scope
  state `declined` (provenance `explicit-local-decision` / `git-common-config`, `requiresEnforcement: false`) instead of
  `active`, so neither the control nor the target case runs.
- Unverified hypothesis: `governance-scope.mjs` writes `declined` when enrollment history is retained (the
  `plan.decision==='enroll'&&!retained` ternary in `applyDecision`), and this fixture enrolls after
  `coordinateInitialDesignAdvisory` has written under the git common dir, whereas draft A enrolls right after `git init`.
  Next step: enroll immediately after `advisorHostFixture` returns, then rerun. The working copy that carries the
  bound-path fix is `scratch/dispatch-wip/t0c-run/b.test.mjs` (untracked).
