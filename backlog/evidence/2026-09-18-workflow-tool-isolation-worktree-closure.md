# Workflow Tool Isolation Worktree Count Verification Closure Evidence

**Backlog Item:** `pipeline.workflow-tool-isolation-worktree-never-created-a-worktree-this-session`  
**Date:** 2026-09-18  
**Author:** Antigravity (Elephant orchestrator)  
**Components:** `plugins/pipeline-core/lib/worktree-count-check.mjs`, `plugins/pipeline-core/lib/worktree-count-check.test.mjs`, `plugins/pipeline-core/hooks/hooks.json`

## Problem & Background

When dispatches were launched in parallel with `isolation: "worktree"`, the proprietary workflow tool failed to provision separate git worktrees, causing multiple concurrent agents to edit the same shared checkout and produce git index races and detached-HEAD incidents.

## Implementation Details

1. **Worktree Count Baseline & Resolution (`worktree-count-check.mjs`):**
   - Implements baseline registration (`recordWorktreeCountBaseline`, `registerWorktreeCountBaseline`) before dispatch.
   - Measures actual `git worktree list` counts in the repository object database.
   - Evaluates whether the count genuinely increased (`isolated`), stayed unchanged (`not-isolated`), or partially increased (`partial`).
   - Generates and reads back atomic, relation-bound, sanitized terminal verdict receipts (`*.verdict.json`) in `<git-common-dir>/agent-pipeline/worktree-count-checks/`.
   - Distinguishes genuine isolation success from unobservable/unresolved hooks.

2. **Automated Verification:**
   - `plugins/pipeline-core/lib/worktree-count-check.test.mjs`: 45/45 PASS (WTC1 through WTC24c).
   - Hook wired in `plugins/pipeline-core/hooks/hooks.json`.

## Verification Results

- 45/45 direct unit and integration tests pass cleanly.
- Full fail-closed behavior verified for unobservable states, missing records, tampered receipts, and git count tracking.
