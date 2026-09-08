# ADR-0067: Tri-runner (Claude Code + Codex + Antigravity CLI) development contract

**Governs:** setup.mjs, plugins/pipeline-core/install-agy.mjs, plugins/pipeline-core/hooks.json, plugins/pipeline-core/config/runner-mappings.json, plugins/pipeline-core/config/runner-profiles-v3.json, plugins/pipeline-core/lib/runner-profiles-v3.mjs, plugins/pipeline-core/lib/runner-profiles-v3.test.mjs, plugins/pipeline-core/lib/project-onboarding-v3.mjs, plugins/pipeline-core/lib/project-onboarding-v3.test.mjs, plugins/pipeline-core/hooks/antigravity-pretool-guard.mjs, plugins/pipeline-core/hooks/antigravity-pretool-guard.test.mjs, plugins/pipeline-core/lib/antigravity-execution-host.mjs, plugins/pipeline-core/lib/antigravity-execution-host.test.mjs, plugins/pipeline-core/lib/runner-usage-v1.mjs, plugins/pipeline-core/lib/runner-usage-v1.test.mjs, plugins/pipeline-core/scripts/pipeline-start-preflight.mjs, plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs, plugins/pipeline-core/scripts/pipeline-user-v3.schema.json

> Agent-Pipeline · Sprint Nova / Agy · as of 2026-08-22

**Status:** accepted · **Basis:** PO directive (Sprint Nova/Agy), #69, #92, #15 · **Extends and updates** [ADR-0051](0051-dual-runner-tri-platform-development-contract.md) and [ADR-0057](0057-runner-platform-support-is-an-implementation-obligation.md).

## Context

Agent-Pipeline originally established a dual-runner contract supporting Claude Code and OpenAI Codex. Google Antigravity CLI (`agy`) with Gemini models was previously represented solely by a fail-closed alpha adapter boundary (`antigravity-alpha-adapter.mjs`).

In accordance with Issue #69 and #15, Antigravity CLI (`agy`) is elevated to a first-class third runner across the entire Agent-Pipeline control and execution plane.

Crucially, in accordance with the Pipeline's core principle of technical enforcement (no prompt-only illusions) and Issue #92 (honest representation of native traits):
1. **Interactive Session Enforcement (Dimension A):** Antigravity sessions operate under hard client-side pre-tool guards and lifecycle hooks (`.agents/hooks.json` mapping to `antigravity-pretool-guard.mjs`), which block unapproved shell commands, chained commands, workspace escapes, and lifecycle violations with exit code 2 before execution.
2. **Headless Execution Plane (Dimension B):** Automated dispatches invoke `agy` via `antigravity-execution-host.mjs`, normalizing Gemini usage into canonical `pipeline.runner-usage.v1` schemas with exact provider (`google`) and model bindings.
3. **Runner Autarky (ADR-0057 Decision 2a):** Antigravity is completely independent. No runner may be a prerequisite for any other runner.

## Decision

### 1. Tri-Runner Support

Agent-Pipeline formally supports three runners: **Claude Code**, **Codex**, and **Antigravity CLI** (`agy`), across Windows, macOS, and Unix/WSL platforms.

### 2. Implementation Invariants

- **Runner Neutrality by Construction:** All lifecycle scripts, onboarding workflows (`project-onboarding-v3.mjs`), preflight checks, and routing registries support `"antigravity"` natively.
- **Hard Enforcement Layer:** Client-side `.agents/hooks.json` is generated during setup to enforce pipeline guardrails before tool execution.
- **Honest Profiles & Routing (v3):** Antigravity profiles map cleanly to Gemini models (`gemini-3.1-pro-high`, `gemini-3.7-flash-high`, `gemini-3.7-flash-low`). Uncertified duties default to `state: "unavailable"`.
- **Fail-Closed Security:** Tool execution outside authorized workspace containment or during unapproved lifecycle states is denied deterministically by the pre-tool guard.

## Consequences

- Antigravity can be selected as `runners.default: "antigravity"` or enabled alongside Claude and Codex in `runners.enabled`.
- All 385+ test suites in `harness/scripts/verify.mjs` pass across all supported runners.
- The alpha descriptor `antigravity-alpha-adapter.mjs` is retired in favor of full native execution.
