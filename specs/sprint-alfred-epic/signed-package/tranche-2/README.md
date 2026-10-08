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
