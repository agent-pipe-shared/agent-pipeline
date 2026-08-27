---
schema: pipeline.backlog-item.v1
id: pipeline.path-bound-fingerprints-break-across-windows-wsl-access
type: defect
owner: pipeline
status: open
created: 2026-08-27
sprint: nova
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
