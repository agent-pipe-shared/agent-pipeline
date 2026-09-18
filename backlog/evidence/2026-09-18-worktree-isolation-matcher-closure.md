# Worktree Isolation Hook Matcher Closure Evidence

**Backlog Item:** `pipeline.worktree-isolation-hook-matcher-omits-the-agent-tool-name`  
**Date:** 2026-09-18  
**Author:** Antigravity (Elephant orchestrator)  
**Integrated in Commit:** `28ca87187ad96fc94d970fa20c178e954371fa25`  

## Verification

1. **Manifest Matcher Integration:**
   In `plugins/pipeline-core/hooks/hooks.json`, the `guard-worktree-isolation.mjs` hook stanza was updated:
   `"matcher": "Bash|Edit|Glob|Grep|NotebookEdit|Read|Task|Agent|TodoWrite|WebFetch|WebSearch|Write|Workflow"`
   `Agent` is explicitly included alongside `Task` and `Workflow`.

2. **Hook Manifest Shape Suite:**
   `plugins/pipeline-core/hooks/hooks-manifest-shape.test.mjs` ran and passed 14/14 tests:
   `ok 5 - Claude worktree-isolation hook explicitly matches every supported dispatch tool name`

3. **Worktree Count Comparison Suite:**
   `plugins/pipeline-core/lib/worktree-count-check.test.mjs` passed 45/45 tests, covering direct Agent call with `isolation: worktree`, multi-agent Workflow scripts, and baseline registration and resolution.

All acceptance criteria are met. Item closed.
