# Technical Specification — Antigravity CLI Runner Integration

**Feature ID:** `sprint-agy-runner`  
**PRD Reference:** [`prd_agy-runner.md`](prd_agy-runner.md)  
**Profile:** Epic / Rigor 2 / Tri-Runner Architecture  

---

## 1. System Architecture & Component Interactions

```
+-----------------------------------------------------------------------------------+
|                            Pipeline Control Plane                                 |
|                                                                                   |
|  +--------------------+   +-----------------------+   +------------------------+  |
|  | routing-authority  |   | runner-profiles-v3    |   | project-onboarding-v3  |  |
|  | ("antigravity")    |   | ("antigravity")       |   | (runner: antigravity)  |  |
|  +--------------------+   +-----------------------+   +------------------------+  |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                        Antigravity Integration Boundary                           |
|                                                                                   |
|  [Dimension A: Interactive Session]       [Dimension B: Headless Dispatch]        |
|  - Workspace Rules: GEMINI.md / AGENTS.md - Lib: antigravity-execution-host.mjs   |
|  - Hooks: .agents/hooks.json              - Process: agy --prompt --output-format |
|    * PreToolUse (run_command)             - Parser: Output & Token-Usage Parser   |
|      -> guard-git.mjs                     - Host Adapter: critic-antigravity-host |
|      -> guard-push.mjs                    - Receipt: critic-antigravity-receipt   |
|      -> guard-lifecycle-ready.mjs                                                 |
+-----------------------------------------------------------------------------------+
```

---

## 2. Model & Selector Catalog

The canonical runner identifier is `"antigravity"`.

### 2.1 Direct Selectors (`runner-mappings.json`)
- `design`: `{ "kind": "model-id", "value": "gemini-3.1-pro-high", "resolutionStatus": "observed-model-id" }`
- `review`: `{ "kind": "model-id", "value": "gemini-3.1-pro-high", "resolutionStatus": "observed-model-id" }`
- `implement`: `{ "kind": "model-id", "value": "gemini-3.7-flash-high", "resolutionStatus": "observed-model-id" }`
- `mechanic`: `{ "kind": "model-id", "value": "gemini-3.7-flash-low", "resolutionStatus": "observed-model-id" }`
- `deep`: `{ "kind": "model-id", "value": "gemini-3.7-flash-high", "resolutionStatus": "observed-model-id" }`

### 2.2 Aliases
- `flash-high` -> `gemini-3.7-flash-high`
- `flash-medium` -> `gemini-3.7-flash-medium`
- `flash-low` -> `gemini-3.7-flash-low`
- `pro-high` -> `gemini-3.1-pro-high`
- `pro-low` -> `gemini-3.1-pro-low`

---

## 3. Hard Technical Enforcement Layer (`.agents/hooks.json`)

Antigravity executes hooks configured in `.agents/hooks.json`.

```json
{
  "pipeline-pretool-guard": {
    "enabled": true,
    "PreToolUse": [
      {
        "matcher": "run_command",
        "hooks": [
          {
            "type": "command",
            "command": "node plugins/pipeline-core/hooks/guard-git.mjs"
          },
          {
            "type": "command",
            "command": "node plugins/pipeline-core/hooks/guard-push.mjs"
          },
          {
            "type": "command",
            "command": "node plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs"
          }
        ]
      }
    ]
  },
  "pipeline-session-start": {
    "enabled": true,
    "PreInvocation": [
      {
        "type": "command",
        "command": "node plugins/pipeline-core/scripts/pipeline-start-preflight.mjs --runner antigravity"
      }
    ]
  }
}
```

If any hook command exits with non-zero code, Antigravity cancels tool execution and feeds the stderr error back to the agent session.

---

## 4. Headless Execution Contract (`agy`)

### 4.1 Invocation Shape
```bash
agy --prompt "<task-instruction>" \
    --output-format json \
    --model "<gemini-model-id>" \
    --effort "<low|medium|high>" \
    --dangerously-skip-permissions
```

### 4.2 Error Taxonomy
- `AGY-NOT-INSTALLED`: Binary `agy` not found on `PATH` or configured location.
- `AGY-AUTH-REQUIRED`: CLI reports unauthenticated state.
- `AGY-TIMEOUT`: Execution exceeded `--print-timeout` or host timeout.
- `AGY-NONZERO-EXIT`: Subprocess exited with non-zero code.
- `AGY-OUTPUT-MALFORMED`: Result payload cannot be parsed as valid JSON/NDJSON.

### 4.3 Token Usage Normalization
Gemini token counts (`input_tokens`, `output_tokens`, `cached_tokens`) mapped into `pipeline.runner-usage.v1` schema.

---

## 5. Wave Implementation Plan

1. **Wave 1: Foundation, Schemas & Mappings**
   - Update `runner-mappings.json`, `routing-authority.json`, `runner-profiles-v3.json`, `pipeline.user.schema.json`.
   - Unit tests in `plugins/pipeline-core/lib/runner-profiles-v3.test.mjs` and `runner-mappings.test.mjs`.

2. **Wave 2: Execution Plane Wrapper**
   - Create `plugins/pipeline-core/lib/antigravity-execution-host.mjs`.
   - Unit tests for discovery, argument building, output parsing, token usage extraction, and error taxonomy.

3. **Wave 3: Hard Hook Enforcement & Setup Integration**
   - Create `.agents/hooks.json` generator in `setup.mjs` / `setup-check.mjs`.
   - Test hook execution with synthetic PreToolUse block scenarios.

4. **Wave 4: Lifecycle & Onboarding Integration**
   - Thread `runner: "antigravity"` into `project-onboarding-v3.mjs`, `project-onboarding-ready-gate.mjs`, `pipeline-start-preflight.mjs`.
   - Multi-runner independence tests (Antigravity running full onboarding cycle alone).

5. **Wave 5: Independent Review (Critic) & Advisory**
   - Create `plugins/pipeline-core/scripts/critic-antigravity-host.mjs` and receipt schema `pipeline.critic-antigravity-receipt.v1`.
   - Test full critic review dispatch with mocked and live receipts.

6. **Wave 6: Tri-Runner Conformance, Documentation & ADR**
   - Full runner conformance suite passing for all 3 runners (`claude`, `codex`, `antigravity`).
   - Draft and accept `docs/adr/0067-tri-runner-antigravity-integration.md`.
   - Full Verify pass.
