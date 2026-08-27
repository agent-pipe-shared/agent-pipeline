---
schema: pipeline.backlog-item.v1
id: pipeline.path-bound-fingerprints-break-across-windows-wsl-access
type: defect
owner: pipeline
status: closed
created: 2026-08-27
sprint: nova
closed_at: 2026-08-27
closure_repository: self
closure_commit: 1858a21b276a2cf96247079b89ed69a3f68d42c6
closure_evidence: backlog/items/2026-08-27-path-bound-fingerprints-break-across-windows-wsl-access.md
source: "NVA-PATHBIND-AUDIT-1, scratch/PATHBIND-audit.md, 2026-08-27 — read-only audit of every path-derived identifier used in durable state"
---

# Path-bound fingerprints break when the same repository is accessed from both Windows and WSL

## Description

`derivePoGateRepositoryFingerprint` (`plugins/pipeline-core/lib/po-gate-
authority.mjs:365`) hashes `gitCommonDir` + `primaryRoot` as raw strings. The
same working copy is `/mnt/c/…` from WSL and `C:\…` from native Windows —
different strings, different fingerprint. `normalizeAbsolute`
(`po-gate-authority.mjs:253`), the only normalization step in the chain, is
`path.resolve()` gated by an `isAbsolute` and self-equality check: no case
folding, no separator translation, no drive-letter handling, no WSL mount
mapping. A second, independently-named mechanism —
`repositoryFingerprint(rootDir)` in
`plugins/pipeline-core/lib/codex-onboarding-runtime.mjs:421`, built from
`fs.realpathSync(resolve(rootDir))` — has the identical non-mitigation under
a different formula and a different function name.

The audit found no normalization anywhere in either mechanism for drive
letter, path separator, case, or WSL mount translation.

## Affected storage locations

Five durable-state locations derive from `derivePoGateRepositoryFingerprint`,
plus three consumers of `repositoryFingerprint(rootDir)`:

1. **`governance/events/registry.json`** (tracked) — already confirmed
   broken by a cross-machine mismatch (`GES-CROSS-REPOSITORY`); this is a
   distinct, already-known defect, out of this item's scope, tracked as
   `NVA-GESBIND-1` (Nova A).
2. PO-gate profile receipt (`<gitCommonDir>/agent-pipeline/po-gate/
   profile-receipt.json`) — untracked by construction.
3. External push ledger (`<homedir>/.pipeline/push-ledger/<fp>/…`) —
   untracked.
4. Local supervisor state root (platform home/AppData base + `<fp>`) —
   untracked.
5. Restricted governance store (`storeRoot` asserted absolute, outside the
   repository) — untracked by construction.
6. Restart barrier / current-readback / launch tickets
   (`prepareRuntimeRestartBinding`, `codex-onboarding-runtime.mjs:578–591`),
   bound via `repositoryFingerprint(rootDir)` under a private state
   directory resolved from the Git common directory — untracked.

All six locations above are correctly untracked by construction, so nothing
travels wrongly between machines or repositories. The failure is narrower and
quieter: whoever switches access path (Windows native vs. WSL) against the
*same physical checkout* gets a second, unrecognized fingerprint instead of
the existing one. Receipts and ledger history become unreachable from the
other access path — a silent state loss, not a loud error. For the
untracked/private-state branches this fails safe (a spurious "not bound"
forcing an unnecessary re-bind) rather than a false cross-repo match.

## Scope of a fix

A canonical normalization (case-insensitive, drive-letter/`/mnt/<drive>/…`
aware, or dropping path-derived identity in favor of something access-path
independent such as the repository's first-commit hash) plus, at each of the
storage locations above, a decision about what happens to existing state
recorded under the old fingerprint. The audit is explicit that the
state-migration question is the larger part of the work, not the
normalization function itself.

## Not part of this item

The tracked `governance/events/registry.json` cross-machine defect
(`NVA-GESBIND-1`) — a harder, already-confirmed-broken, separate defect
handled in Nova A.

## Not reached by the originating audit

`scripts/human-authority-grant.mjs` beyond an initial grep,
`scripts/governance-authority.mjs` beyond one grep,
`scripts/codex-onboarding-launch.mjs`, and
`plugins/pipeline-core/lib/guard-maintenance-window.mjs` beyond confirming it
calls the known mechanism — none of these were audited in depth; a fourth
storage branch or a fourth mechanism may still be hiding there.

## Triage

- **Decision:** open, unassigned. ADR-0057 already names Windows as a
  supported platform and holds a "native-Windows red-suite class" as a
  deliberately tracked, non-release-blocking defect class; this finding
  belongs in that same class.
- **Scope override:** the originating audit's own recommendation line named
  Nova B. The PO has since overridden that: **this item is Nova A scope.**

## Closed, 2026-08-27

The two mechanisms this item names — `derivePoGateRepositoryFingerprint`
(`plugins/pipeline-core/lib/po-gate-authority.mjs`) and
`repositoryFingerprint(rootDir)`
(`plugins/pipeline-core/lib/codex-onboarding-runtime.mjs`) — are resolved by
commit `1858a21b` ("fix(authority): fold the WSL and Windows spellings of
one checkout to one fingerprint", NVA-FINGERPRINT-1). Verified via
`git show --stat 1858a21b`: it adds `canonicalRepositoryPathIdentity`/
`windowsDriveLetterIdentity` to `po-gate-authority.mjs` and
`fingerprintIdentity`/`windowsDriveLetterFingerprintIdentity` to
`codex-onboarding-runtime.mjs`, plus
`derivePoGateRepositoryFingerprintLegacy` and
`poGateReceiptFingerprintMatches` so a receipt published under the
pre-fix formula still recognizes as bound. 70/70 po-gate-authority
(65 pre-existing + 5 new), 21/21 codex-onboarding-runtime, 9/9
consumer-safe-paths (commit message, confirmed via `git show`).

**Residual scope re-checked before closing, not assumed:** of the four
paths this item's own "Not reached by the originating audit" list named,
only one still carries an unaddressed instance of the same defect class.
`scripts/human-authority-grant.mjs` computes its fingerprint via
`readLocalRepositoryFingerprint` (the store-bound identity from
NVA-REPOID-3/`f7623bca`), not the legacy path-derived formula — its own
code comment says so explicitly, and it predates this item, so it is
already off the vulnerable mechanism. `scripts/governance-authority.mjs`
never computes a fingerprint itself; it only receives
`repositoryFingerprint` as a caller-supplied request field, so it is not
an independent source of the defect. `scripts/codex-onboarding-launch.mjs`
carries no fingerprint computation of its own (`rg` for
`repositoryFingerprint|fingerprint` returns nothing); it imports from the
now-fixed `codex-onboarding-runtime.mjs` but does not call a fingerprint
function directly. `plugins/pipeline-core/lib/guard-maintenance-window.mjs`
DOES carry a third, independently-named, still-unfixed instance:
`repoFingerprint(repo)` (line 438) computes
`sha({ physicalRoot: repo.root, physicalCommon: repo.common })` — the same
raw-path-hashing pattern this item describes, untouched by `1858a21b`.
Filed as its own item:
`backlog/items/2026-08-27-guard-maintenance-window-repofingerprint-shares-the-fixed-path-bound-defect.md`.

Nothing further to do here on the two mechanisms this item was actually
scoped to. Item closed.
