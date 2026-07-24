# Codex private-overlay SHA-phase repair

**Status:** PO-authorized corrective package, 2026-07-24
**Scope:** Public Core Codex activation identity observation only

## Problem

During the public SHA phase, the source Codex plugin manifest may intentionally
omit `version`. The Codex host already observes the selected installed plugin
root and version through its validated `codex plugin list --json` result, but
the activation adapter previously forwarded only the root. Public identity
observation consequently required a source-manifest version and stopped with
`SNT-A-CODEX-SOURCE-UNAVAILABLE` before private-lock admission.

## Decision

The Codex activation route resolves the selected host source root, while the
identity observer independently re-reads the same fixed, closed-schema Codex
plugin-list command to obtain the version. This deliberately avoids exporting
any version-bearing intermediate API: a missing manifest version is accepted
only on that observer's host-attested Codex route. If a manifest version is
present, it must exactly equal the fresh host observation. Ordinary callers and
every other runner keep the existing version requirement.

## Acceptance criteria

- A versionless source manifest with an equal installed snapshot and a valid
  selected Codex host plugin-list version reaches public identity observation.
- A versionless manifest without that typed host attestation is rejected.
- A malformed, ambiguous, or non-selected Codex plugin-list entry is rejected.
- A present manifest version that differs from the host-attested version is
  rejected.
- Source/installed manifest-digest and content drift remain rejected even with
  a valid host version.
- Existing versioned-manifest behavior is unchanged; the host version is never
  read from project input, a private lock, environment, or overlay CLI input.
- Focused regression tests, Full Verify, and Security pass for the final
  candidate.

## Non-goals

- Changing `VERSION`, release metadata, plugin publication, tags, GitHub
  Releases, or HAW-E.
- Weakening private-overlay lock admission or its exact
  commit/tree/plugin-version/manifest-digest binding.
- Accepting unversioned manifests outside the authenticated Codex host route.
