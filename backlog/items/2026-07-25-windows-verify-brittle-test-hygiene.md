---
schema: pipeline.backlog-item.v1
id: pipeline.windows-verify-brittle-test-hygiene
type: defect
owner: pipeline
status: closed
created: 2026-07-25
source: "Decision-D native-Windows verify baseline investigation, 2026-07-24 (docs/state.md \"Root-cause classification of the 11 reds\"); corrected 2026-07-25 after direct reproduction — see \"Correction\" below."
closed_at: 2026-08-06
closure_repository: self
closure_commit: 79da4a76c985ea512764dde2894865a5c7ccf816
closure_evidence: backlog/evidence/2026-08-06-third-reconciliation-pass.md
---

# pipeline.windows-verify-brittle-test-hygiene

## Correction (2026-07-25) — both original diagnoses were wrong

This item originally claimed two suites failed from stale/brittle test
assertions ("hard-coded JS-source count", "sensitive to legacy
`sprint-sentinel-epic` specs"). Direct reproduction (`node --test` against
each failing suite, then reading the exact assertion each one throws) shows
**both are real, narrow, confirmed native-Windows portability bugs, not test
staleness** — and they are two DIFFERENT root-cause classes, so they no
longer belong together as one "hygiene" bundle:

1. **`feature-package-topology` — genuine `node:path` normalize() bug, stays
   in THIS item.** `canonicalRelative()` in
   `plugins/pipeline-core/lib/feature-package-topology.mjs` (around line 26)
   does `const cleaned = normalize(value); if (cleaned !== value ...)`. The
   plain `import { normalize } from "node:path"` resolves to `path.win32` on
   native Windows, which **rewrites forward slashes to backslashes**
   (confirmed: `path.normalize("specs/safe-feature/prd.md")` →
   `"specs\\safe-feature\\prd.md"` on this host). Every legitimately-safe
   forward-slash-relative artifact path therefore fails the `cleaned !==
   value` check and gets rejected as `"unsafe path"`, so
   `validateFeatureTopology(root).ok` is `false` even for a fixture with no
   defect at all — reproduced with an isolated `mkdtempSync` fixture
   containing only one clean feature package, no legacy specs involved. The
   original "legacy `sprint-sentinel-epic` specs" theory is **wrong** — the
   test fixture that fails is fully isolated from the real repo tree.
   Same defect CLASS as
   `pipeline.po-gate-authority-path-canonicalization` (a POSIX-separator/
   Windows-path assumption breaking silently), but a different function in a
   different file — kept as its own item per that item's own note not to
   silently merge distinct root causes in the same area.
2. **`license-contract`'s private-receipt file-mode assertion — REMOVED from
   this item, folds into `pipeline.windows-private-state-assurance` (#35)
   instead.** The failing assertion (`check-license-contract.test.mjs` line
   101, `assert.equal(statSync(stored.path).mode & 0o777, 0o600)`) has
   nothing to do with a source-file count — `0o600` and `0o666` happen to be
   `384` and `438` in decimal, which is what produced the original
   misdiagnosis. Confirmed by direct reproduction: writing a file on this
   host with `{ mode: 0o600 }` still reads back `statSync().mode & 0o777 ===
   0o666` — native Windows does not honor POSIX owner/group/other
   permission bits via `fs.writeFileSync`'s `mode` option at all. This is
   the SAME underlying private-state/DACL-assurance gap already scoped
   under #35 (Windows cannot express owner-only protection via chmod-style
   bits; achieving the equivalent property needs a DACL/ACL-based
   mechanism), not an independent finding — the fix path is #35's, and its
   test should assert the Windows-appropriate equivalent (or reuse whatever
   DACL check #35 introduces) instead of a POSIX mode-bit comparison. The
   file already has precedent for this exact pattern:
   `check-license-contract.test.mjs` lines 110-118 already guard several
   other permission/symlink assertions with
   `if (process.platform !== "win32")` for the identical reason.

Net: this item now covers ONLY `feature-package-topology`'s path-normalization
bug — still a small, isolated, well-understood fix, so it stays viable as a
"quick win, no dependency on the DACL/durability work" as originally
sequenced. `license-contract`'s finding moves to #35's scope; see
`specs/2026-07-24-sprint-cyborg-epic/windows-sandbox-assurance-slice-scope.md`
for the corrected sequencing table.

## Triggering situation

Found during the decision-D native-Windows verify-baseline root-cause
classification (`docs/state.md`, entries around "Root-cause classification of
the 11 reds"), 2026-07-24; corrected 2026-07-25 by directly running
`node --test` against each failing suite file and reading the exact thrown
assertion rather than inferring the cause from the suite name alone.

## Affected artifact

`plugins/pipeline-core/lib/feature-package-topology.mjs` (`canonicalRelative`,
~line 26) and its test `plugins/pipeline-core/lib/feature-package-topology.test.mjs`.

## Proposal

Fix `canonicalRelative` to canonicalize forward-slash relative paths without
going through a platform-default `normalize()` that silently changes the
separator convention — e.g. validate the path is already in normalized
POSIX form directly (reject `..`/`.`/empty segments and backslashes, which
the function already partially does via the `value.includes("\\")` guard
earlier in the same function) instead of round-tripping through
`node:path`'s platform-dependent `normalize`, or explicitly use
`path.posix.normalize` for the comparison. Add a Windows-specific fixture
(or run the existing fixture under a forced win32 code path) asserting a
clean forward-slash artifact path still validates OK. No fix applied yet.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, delivered, closed.
- **Rationale:** fixed by `79da4a7` ("fix(pipeline-core): use posix.normalize
  in canonicalRelative for native Windows"), dated the same day this item
  was filed. Current code imports `posix` explicitly and uses
  `posix.normalize(value)`, exactly the fix this item's Proposal names.
  Independently re-verified 2026-08-06:
  `node --test plugins/pipeline-core/lib/feature-package-topology.test.mjs`
  → the forward-slash regression fixture passes, 1/1. Full evidence:
  `backlog/evidence/2026-08-06-third-reconciliation-pass.md`.
- **Assignment (if accepted):** delivered, `79da4a7`, Sprint Nova session,
  2026-07-25.
- **Date:** 2026-08-06
