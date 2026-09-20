# Three-Runner Distribution and Freshness Check Closure Evidence

**Backlog Item:** `pipeline.all-three-runners-should-install-against-the-stable-branch`  
**Date:** 2026-09-18  
**Author:** Antigravity (Elephant orchestrator)  
**Components:** `plugins/pipeline-core/install-agy.mjs`, `plugins/pipeline-core/hooks/staleness-check.mjs`, `plugins/pipeline-core/hooks/staleness-check.test.mjs`, `docs/adr/0078-distribution-channels-on-main.md`

## Problem & Background

The PO required that all three runners (Claude Code, Codex, and Antigravity) install against released distribution by default, check freshness fail-open at SessionStart, and alert users plainly without disruptive silent updates.

## Implementation Details

1. **Distribution Channel Unification (ADR-0078):**
   - Retired the legacy `stable` branch in favor of `main` as the sole distribution line, with the `stable` update channel resolving to the highest published `vX.Y.Z` tag.
   - Claude Code and Codex install pins target `main`.

2. **Antigravity Installer (`install-agy.mjs`):**
   - Supports direct workspace-local (`.agents/plugins.json`) and global (`~/.gemini/config/plugins.json`) installation.
   - Verifies node PATH preflight and direct local marketplace root bindings.

3. **Fail-Open Freshness Verification (`staleness-check.mjs`):**
   - Runs synchronously at SessionStart without top-level await.
   - Distinguishes `current`, `update-available`, `local-ahead`, and `unknown` states fail-open across `alpha`, `beta`, and `stable` channels.
   - Never mutates repository files or blocks session startup.

4. **Automated Verification:**
   - `plugins/pipeline-core/hooks/staleness-check.test.mjs`: 17/17 PASS.

## Verification Results

- All 3 gaps (default branch alignment, Antigravity installer, and fail-open freshness check) are complete and verified.
