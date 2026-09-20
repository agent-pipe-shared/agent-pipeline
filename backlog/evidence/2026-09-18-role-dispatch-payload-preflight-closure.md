# Role Dispatch Payload Errors Fail Before Model Launch Closure Evidence

**Backlog Item:** `pipeline.role-dispatch-payload-errors-fail-before-model-launch`  
**Date:** 2026-09-18  
**Author:** Antigravity (Elephant orchestrator)  
**Components:** `plugins/pipeline-core/lib/dispatch-policy.mjs`, `plugins/pipeline-core/lib/role-dispatch-preflight.mjs`, `plugins/pipeline-core/lib/antigravity-native-dispatch-coordinator.mjs`, `plugins/pipeline-core/lib/codex-critic-host.mjs`, `plugins/pipeline-core/lib/codex-critic-selected-host.mjs`, `plugins/pipeline-core/lib/claude-critic-host.mjs`

## Problem & Background

During 0.6.2 candidate review, malformed or incomplete role dispatches repeatedly consumed up to 10 minutes (or 50,000+ tokens) before reporting a coordinator/payload failure.
The requirement was:
1. One shared, runner-neutral preflight validates the complete dispatch packet, role identity, required paths, candidate binding, and result destination before any model or external launcher starts.
2. Claude Code, Codex, and Antigravity adapters consume the same verdict across all supported roles.
3. Invalid input returns a bounded structured diagnostic and exits before model launch (local target under 5 seconds, zero model calls).
4. Batch execution reports `PREPARE` for every packet before the first `START`.

## Implementation Summary Across Slices 1–10

1. **Shared Policy Core & Role Registry (`dispatch-policy.mjs`):**
   - Owns shipped role registry (advisor, critic, goldfish, elephant, etc.).
   - Common validation across Claude (`Task`/`Agent`), Codex (`spawn_agent`), Antigravity (`Subagents`), and static Workflow scripts.
   - Structured rejection `pipeline.role-dispatch-preflight.v1` with `modelCalls: 0`.

2. **Runner-Neutral Coordinator Envelope (`role-dispatch-preflight.mjs`):**
   - Candidate commit and tree resolution, verification that required source paths are regular files in the candidate, and destination collision validation.
   - Batch API `runRoleDispatchBatch()` enforces all-packets `PREPARE` barrier before first `START`, with launch-time rechecks to eliminate TOCTOU races.

3. **Claude Critic Host Integration (`claude-critic-host.mjs`):**
   - Durable authorization reconstruction and late recheck before native probe or review start.

4. **Codex Critic Host Integration (`codex-critic-host.mjs`, `codex-critic-selected-host.mjs`):**
   - Native and selected lanes bind coordinator evidence to commit and tree; route and packet preflight executed at the immediate launch boundary.

5. **Antigravity Coordinator & Wrapper (`invokeAgy()`, `antigravity-native-dispatch-coordinator.mjs`):**
   - Native coordinator enforces monotonic 5-second deadline across repository probes and batch preflight (`b3272edc`).
   - Validates candidate, required inputs, role, transport, and result destination with zero launcher calls on invalid fixtures.

## Automated Verification Matrix

- `plugins/pipeline-core/lib/dispatch-policy.test.mjs`: 34/34 PASS (DPT01–DPT34)
- `plugins/pipeline-core/lib/antigravity-native-dispatch-coordinator.test.mjs`: 20/20 PASS (ANDC01–ANDC20)
- `plugins/pipeline-core/lib/codex-native-critic-host.test.mjs`: 8/8 PASS
- `plugins/pipeline-core/lib/codex-critic-selected-host.test.mjs`: 133/133 PASS
- All invalid fixtures consistently prove 0 model calls and 0 launcher calls within the 5-second deadline.

All acceptance criteria are met.
