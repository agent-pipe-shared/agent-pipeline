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

## 3. Hard Technical Enforcement Layer (`plugins/pipeline-core/hooks.json`)

Antigravity executes hooks configured in `plugins/pipeline-core/hooks.json`
(the standalone `.agents/hooks.json` projection was retired in commit
`ffa55f78`; Antigravity now discovers this plugin via `.agents/plugins.json`
and reads its hook wiring from this file directly).

```json
{
  "pipeline-core": {
    "enabled": true,
    "PreToolUse": [
      {
        "matcher": "run_command|write_to_file|replace_file_content|invoke_subagent",
        "hooks": [
          {
            "type": "command",
            "command": "node hooks/antigravity-pretool-guard.mjs",
            "timeout": 30
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node hooks/antigravity-stop-hook.mjs",
            "timeout": 15
          }
        ]
      }
    ],
    "PreInvocation": [
      {
        "type": "command",
        "command": "node hooks/antigravity-start-hint.mjs",
        "timeout": 5
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

---

## 6. Rollback Path & Incident Recovery

### 6.1 Pre-Push Rollback
Before pushing changes to remote origin, rollback is an ordinary local git reset or branch discard (`git reset --hard` / `git checkout`). No remote state or persistent external storage is altered.

### 6.2 Post-Push / Production Rollback
Since this integration delivers local runner profiles, adapter libraries, and schema additions without destructive migrations:
1. **Revert Strategy:** Forward git revert commit of the runner integration commits (`git revert`).
2. **State & Database Impact:** None. No remote database migrations, cloud state modifications, or external schema breaks exist.
3. **Consumer Recovery:** Reverting removes `antigravity` from `runners.enabled` / `runner-profiles-v3.json`, returning the system fail-closed to the dual-runner baseline (`claude` and `codex`).

---

## 7. Backward-Compatibility & Consumer Protection

### 7.1 Existing Runner Contracts
All existing `claude` and `codex` routes, profile schemas, duties, and tool bindings remain 100% byte-compatible and functionally identical:
- Existing `claude` and `codex` selectors in `runner-profiles-v3.json` are unchanged.
- `pipeline.user.schema.json` and `pipeline-manifest.schema.json` maintain full backward-compatibility; `antigravity` is an additive runner option.
- Runner conformance test suite `p3b-runner-conformance.test.mjs` explicitly verifies that Claude and Codex routing projections are preserved.

### 7.2 Consumer Protection During Rollout
Consumers who do not enable `antigravity` experience zero configuration changes. For uncertified duties, Antigravity defaults to `state: "unavailable"` in the frozen V3 profiles, preventing accidental dispatch until explicit certification is established.

---

## 8. Threat Model & Trust Boundary References

1. **Authorization Boundaries:** Documented in `docs/nova-execution-plane-threat-model.md`.
2. **Sandbox & Egress Restrictions:** The execution host enforces `--sandbox` isolation and validates provider identity (`google` / Gemini models) before command execution.
3. **PreToolUse Guardrails:** Native Antigravity hooks (`antigravity-pretool-guard.mjs`) enforce command grammar restrictions, workspace containment, and lifecycle phase gating before tool execution.

---

## 9. Governance & Policy Checklist Conformance

| Checklist Item | Status | Verification & Evidence |
|---|---|---|
| 1. Data-privacy review | MET | No PII or personal data collected or transmitted. Only local configuration and local execution. |
| 2. Threat model current & bound | MET | `docs/nova-execution-plane-threat-model.md` updated with Antigravity boundaries and residual controls. |
| 3. License headers | MET | All new source files carry `// SPDX-License-Identifier: SUL-1.0` license headers (verified in `plugins/pipeline-core/hooks/guard-push.mjs`, `plugins/pipeline-core/scripts/pipeline-state.mjs`, `install-agy.mjs`). |
| 4. Rollback path documented | MET | Documented in Section 6 above. |
| 5. Third-party licenses | MET | Zero new third-party npm dependencies added; conforms to `license-allowlist.json`. |
| 6. Secrets handling | MET | No credentials committed; local `agy` authentication context used. |
| 7. Backward compatibility | MET | Documented in Section 7 above; verified by conformance suite. |
| 8. Owner assigned for deferred risk | MET | PO owns future live runner certification and external broker integrations. |

