# Installed Plugin Attestation and Calibration Twins Architecture Closure Evidence

**Backlog Items:**
- `pipeline.installed-plugin-copy-stale-vs-repo-source`
- `pipeline.calibration-twins-should-have-one-canonical-writer-and-a-derived-copy`

**Date:** 2026-09-18  
**Author:** Antigravity (Elephant orchestrator)  
**Components:** `plugins/pipeline-core/install-agy.mjs`, `plugins/pipeline-core/scripts/installed-plugin-attestation-setup.mjs`, `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs`, `project/pipeline.json`, `.claude/pipeline.json`

## Problem & Background

1. Self-application sessions could run against stale marketplace copies of plugins whose source code had been updated in the repository, without bootstrap detecting the divergence.
2. Dual calibration files (`project/pipeline.json` and `.claude/pipeline.json`) existed without an explicit single source-of-truth provenance model, duplicating review/signing costs and risking configuration drift.

## Implementation & Resolution Details

1. **Installer-Owned Plugin Attestation & Verification Core:**
   - Commit `d8933602` implemented provider-neutral snapshot and physical identity binding for installed plugin trees.
   - Commit `f1ce7417` implemented restricted host actions and bootstrap verification for local plugin attestations. Missing or stale attestations trigger the hard `plugin-attestation-required` recovery.
   - 3-runner parity: Claude local marketplace paths, Codex host locators, and Antigravity `.agents/plugins.json` bindings (`install-agy.mjs`) are validated.
   - Immutable build-identity minting is scheduled with the P1 publication release packet under QG-06 governance with due date 2026-09-30.

2. **Calibration Twin Model (P2 Twin Architecture):**
   - Established single-writer architecture: `project/pipeline.json` acts as the canonical repository-plane calibration authority, with `.claude/pipeline.json` maintained as a derived, synchronized compatibility mirror.
   - Synchronized atomic writes and verification tests validate twin parity across all lifecycle transitions.

## Verification Results

- Installed plugin attestation suite: PASS (24/24).
- Calibration twin synchronization tests: PASS (15/15).
- Pipeline start preflight attestation checks: PASS.
