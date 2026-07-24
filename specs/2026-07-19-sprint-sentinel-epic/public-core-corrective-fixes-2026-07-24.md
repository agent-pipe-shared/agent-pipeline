# Public Core corrective fixes — 2026-07-24

**Status:** PO-authorized corrective package
**Scope:** Public Core only; no release or private-lock mutation

## Objective

Restore two documented Public Core contracts before the next consumer retest:
the preview-first V3 migration for legacy consumers without generated Claude
projections, and authenticated Codex private-overlay admission during the
versionless SHA phase.

## Work packages

### A. Legacy consumer migration

For V0/V1/V2 sources, plan and apply must tolerate any absent subset of
`.claude/settings.json`, `.claude/pipeline.json`, and
`.claude/pipeline.yaml`. The migration uses explicit in-memory legacy seeds;
it stays preview-first and transactional. It does not change the Slim Private
Overlay path or relaxedly accept missing V3 consumer baselines.

### B. Codex SHA-phase identity

The Codex activation route resolves the selected source root, and public
identity observation independently re-reads the fixed host plugin-list command
for its version. This avoids any exported version-bearing intermediate API.
Only that validated host-attested route may bind a versionless manifest. A
present manifest version must agree exactly. Generic callers and other runners
continue to require a manifest version; source/installed snapshot,
manifest-digest, content-digest, physical-root, candidate, and private-lock
checks remain fail-closed.

The host-list source may be the exact local marketplace repository root during
the SHA phase, but only when it is the canonical parent of the selected plugin
source. This does not permit arbitrary local marketplace paths.

## Acceptance criteria

- Regression tests cover all nonempty subsets of the three absent Claude
  targets for V0/V1/V2 plan and apply, with no writes before explicit apply.
- Regression tests accept a versionless equal Codex snapshot only with a valid
  selected host version, and reject absent/malformed/non-selected attestation,
  manifest-version mismatch, and snapshot/digest/content drift.
- Existing versioned Codex and non-Codex identity behavior is unchanged.
- No value from project input, private input, environment, or a CLI argument
  can serve as the host-attested plugin version.
- The exact final candidate passes focused regressions, Full Verify, and
  Security.

## Delivery constraints

Do not change `VERSION`, plugin release surfaces, tags, GitHub Releases,
publication, HAW-E, `SLIM_V3_RUNTIME_SEEDS`, or private-overlay lock validation.
The detailed package records are `v3-legacy-consumer-migration-repair.md` and
`codex-private-overlay-sha-phase-repair.md` in this directory.

## Rollback

If either repair misbehaves in production, revert this single corrective commit
as an ordinary new commit. Do not hand-edit plugin snapshots, a private lock,
or generated runtime projections to simulate a rollback. Re-run the focused
regressions, Full Verify, and Security on the revert candidate; a private
consumer then re-observes the reverted Public Core before any private-lock
change. No migration-down step or feature flag is required because the repair
adds no persistent schema or release state.
