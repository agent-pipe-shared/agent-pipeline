# Runner-Native Subagent Tool Identity Closure Evidence

**Backlog Item:** `pipeline.runner-native-subagent-tool-identity-is-not-portable`  
**Date:** 2026-09-18  
**Author:** Antigravity (Elephant orchestrator)  
**Components:** `plugins/pipeline-core/hooks/guard-dispatch.mjs`, `plugins/pipeline-core/hooks/guard-dispatch.test.mjs`

## Problem & Background

During Greenfield evaluation of the Antigravity runner (`evidence/pipeline-analysis-agy-062-103.md`), ordinary dispatched roles failed closed with `DBB-PARENT-TOOL-USE-ID-MISSING`. The guard expected a parent tool-use ID (`toolUseId` / `tool_use_id`) on the dispatch envelope, a property native to Claude Code but not emitted by Antigravity's native `invoke_subagent` payload schema.

Simply dropping or ignoring the check would have weakened dispatch accounting on runners where the parent binding is authoritative. The required behavior was to preserve fail-closed binding for binding-capable runners while properly admitting sanitized native Antigravity payloads without false rejection.

## Implementation Details

1. **Tool Capability Separation (`bindingCapableTool`):**
   In `plugins/pipeline-core/hooks/guard-dispatch.mjs`:
   ```javascript
   const toolUseId = input?.tool_use_id ?? input?.toolUseId;
   const bindingCapableTool = ["Task", "Agent", "Workflow"].includes(input?.tool_name);
   ```
   Prohibition preparation and tool budget persistence are evaluated through `bindingCapableTool`:
   - Claude Code (`Task`, `Agent`) and static Workflow tools require the host tool-use ID and persist pending bindings in `.git/agent-pipeline/` before child launch.
   - Non-binding tools (such as Antigravity's native `invoke_subagent`) evaluate `advisorBinding` as `not-applicable` and bypass the Claude-specific tool-use ID requirement.

2. **Native Payload Validation:**
   Antigravity payloads (`Subagents: [{ TypeName, Prompt }]`) continue to be strictly validated via `extractAntigravityDispatches()` and `dispatchFindings(dispatch)`:
   - Shipped role verification, clean prompts (no claims lists, no expectation-conclusions), required ruleset SHA, and payload schema completeness remain fully enforced before launch.
   - Ad-hoc, invalid, or empty subagent batches are rejected with zero model calls.

3. **Automated Verification:**
   In `plugins/pipeline-core/hooks/guard-dispatch.test.mjs`:
   - `GD24`: Block Antigravity `Subagents` array dispatch carrying a claims list (`DISPATCH-CONTAMINATION-CLAIMS-LIST`).
   - `GD25`: Allow Antigravity `Subagents` array dispatch with clean references-only prompt.
   - `GD26`: Block freehand prose Antigravity Critic dispatch (`DISPATCH-NO-RULESET-SHA`).
   - `GD27`: Allow Antigravity dispatch of unrelated subagent type.
   - `GD32`: Block malformed Antigravity entries before launch (`DISPATCH-ROLE-REQUIRED`, `modelCalls: 0`).
   - `GD33`: Block empty Antigravity batch before launch (`DISPATCH-ROLE-REQUIRED`, `modelCalls: 0`).
   - `GD41`: Block budget-bearing Claude dispatch without parent tool-use id before launch.
   - `GD43`: `extractAntigravityDispatches` is directly importable and callable.

## Verification Results

- `node plugins/pipeline-core/hooks/guard-dispatch.test.mjs`: 43/43 PASS (100%)
- All acceptance criteria are satisfied:
  - Standard Antigravity roles receive correctly validated dispatches.
  - Missing or contaminated dispatches remain denied with zero model calls.
  - Antigravity fixtures match native payload schema.
