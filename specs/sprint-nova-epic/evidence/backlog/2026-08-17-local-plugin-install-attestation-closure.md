# `local-plugin-install-attestation-does-not-bind-external-marketplace-root` closure evidence

Backlog item: `pipeline.local-plugin-install-attestation-does-not-bind-external-marketplace-root`
Closure commit: `64654077003d35a133a942883d2da146c982dfda` (latest state of the implementing lineage)

## What was implemented, matching the Proposal exactly

The item's Proposal asked for `localPluginInstallSourceObservation` to
"locate and hash the external `agent-pipeline-local` marketplace root:
resolve where Codex's plugin registry believes that marketplace root
lives, read its own `marketplace.json`, and verify that its
`plugins/pipeline-core` entry resolves (following any symlink/junction)
back to this exact checkout's `plugins/pipeline-core` tree — folding that
into `statusSha256`."

This is exactly what `externalLocalMarketplaceObservation()`
(`plugins/pipeline-core/lib/human-guard-override.mjs`, added by NVA-BL-20,
2026-08-07/later, and extended by this session's `NVA-MKTHASH-1`/
`NVA-MKTHASH-2`) now does:

- Locates the external root via the real Codex plugin registry
  (`codexMarketplaceRegistry()`, `codex plugin marketplace list --json`).
- Reads and validates the external root's own `.claude-plugin/marketplace.json`.
- Resolves its `plugins/pipeline-core` entry and requires it to either (a)
  be a symlink/junction resolving back to this exact checkout's
  `plugins/pipeline-core` (the original ADR-0052 shape), or (b), since
  `NVA-MKTHASH-1`/`NVA-MKTHASH-2`, be a real directory whose full content
  hash — computed by the same walker used for the checkout's own
  attestation, bounded against a hostile/oversized copy — exactly equals
  this checkout's own hash.
- Folds the result (`rootSha256`/`manifestSha256`/`entryKind`) into
  `statusSha256` via `localPluginInstallSourceObservation()`
  (`:583-589`), exactly as the Proposal asked — any repointing, mutation,
  or content divergence of the external root invalidates the attestation.

## Evidence

- `plugins/pipeline-core/lib/human-guard-override.test.mjs`: `NVA-BL-20`
  test block (6 tests, symlink-shape coverage) and `NVA-MKTHASH-1`/
  `NVA-MKTHASH-2` test block (7 tests, directory-copy-shape coverage,
  bounded-walk coverage) all pass.
- Live, real-environment confirmation (2026-08-17, this session, after the
  PO resynced this host's local marketplace copy): `F1 (dispatch
  CRITIC-REMEDY-09): the local-plugin-install attestation succeeds against
  THIS repository's own, real marketplace manifest and plugin source
  tree` — a test that exercises the REAL host environment's actual
  registered `agent-pipeline-local` marketplace root, not a synthetic
  fixture — now passes, independently confirming the attestation genuinely
  binds the external root in a live, non-mocked environment, not only in
  unit tests.

## Review disposition

Reviewed as part of the consolidated Critic review covering
`NVA-MKTHASH-1` (`scratch/critic-nva-94027c4e/critic-notes.md`, opus at
max) — PASS/FAIL findings for that commit are already tracked against
`NVA-MKTHASH-1`/`NVA-MKTHASH-2`, not repeated here. This closure note only
reconciles this older (2026-08-06) backlog item against work already
landed and reviewed under those task IDs.
