---
schema: pipeline.backlog-item.v1
id: pipeline.guard-maintenance-window-repofingerprint-shares-the-fixed-path-bound-defect
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-29
closure_repository: self
closure_commit: d96e14c5efa51d4f4a0b1e9060a158077cfdd007
closure_evidence: plugins/pipeline-core/lib/guard-maintenance-window.test.mjs
created: 2026-08-27
sprint: nova
source: "NVA-BLRECONCILE-1, 2026-08-27 — residual-scope re-check while closing backlog/items/2026-08-27-path-bound-fingerprints-break-across-windows-wsl-access.md"
done_when: contains plugins/pipeline-core/lib/guard-maintenance-window.mjs NVA-GMWFINGERPRINT-1
---

# `guard-maintenance-window.mjs`'s own `repoFingerprint()` carries the same path-bound defect that `1858a21b` already fixed elsewhere

## Description

`backlog/items/2026-08-27-path-bound-fingerprints-break-across-windows-wsl-access.md`
found two independently-named mechanisms hashing raw path strings without
WSL/Windows normalization
(`derivePoGateRepositoryFingerprint`/`repositoryFingerprint(rootDir)`) and
listed four further files not reached by the originating audit. Commit
`1858a21b` fixed the two named mechanisms and their consumers.

Re-checking the four unreached files while closing that item found a THIRD,
independently-named instance of the identical pattern, not touched by
`1858a21b`: `repoFingerprint(repo)` in
`plugins/pipeline-core/lib/guard-maintenance-window.mjs:438` —

```js
function repoFingerprint(repo) {
  return sha({ physicalRoot: repo.root, physicalCommon: repo.common });
}
```

This hashes `repo.root`/`repo.common` (raw path strings) directly, exactly
the same shape of defect: the same physical checkout reached via `/mnt/c/...`
from WSL and `C:\...` from native Windows would hash to two different
fingerprints. It is used to bind maintenance-window request/authorization
records to a repository (`guard-maintenance-window.mjs:679, 692, 706, 959,
960, 1106, 1142, 1180-1182`).

## The other three files named in the originating item's residual list are NOT affected — checked, not assumed

- `scripts/human-authority-grant.mjs` — computes its fingerprint via
  `readLocalRepositoryFingerprint` (the store-bound identity minted by
  NVA-REPOID-3/`f7623bca`), not the legacy path-derived formula; its own
  code comment says so explicitly. Already off the vulnerable mechanism.
- `scripts/governance-authority.mjs` — never computes a fingerprint itself;
  it only receives `repositoryFingerprint` as a caller-supplied request
  field (`schema`, `repositoryFingerprint`, `decisionId`, ... — see
  `requireAuthorityRequestShape`/`requireReadbackRequestShape`). Not an
  independent source of the defect.
- `scripts/codex-onboarding-launch.mjs` — carries no fingerprint
  computation of its own (`rg -n "repositoryFingerprint|fingerprint"`
  returns no hits); it imports from the now-fixed
  `codex-onboarding-runtime.mjs` but never calls a fingerprint function
  directly.

## Proposal

Fold `guard-maintenance-window.mjs`'s `repoFingerprint()` into the same
canonical, mount-aware identity `1858a21b` introduced
(`canonicalRepositoryPathIdentity`/`windowsDriveLetterIdentity` in
`po-gate-authority.mjs`, or the equivalent `fingerprintIdentity` in
`codex-onboarding-runtime.mjs`) rather than fixing this a third time under
a fourth name. As with the original item, existing maintenance-window
records computed under the old formula need a legacy-recognition path
(matching `derivePoGateRepositoryFingerprintLegacy`/
`poGateReceiptFingerprintMatches`'s pattern) so this does not invalidate
state already on disk.

## Triage

- **Decision:** open, unassigned.
