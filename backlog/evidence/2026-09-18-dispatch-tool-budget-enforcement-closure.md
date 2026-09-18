# Dispatch Tool Budget Enforcement Closure Evidence

**Backlog Items:**
- `pipeline.tool-budget-stop-condition-cannot-fire`
- `pipeline.briefed-tool-budgets-are-estimated-too-low-and-nothing-enforces-them`  
**Date:** 2026-09-18  
**Author:** Antigravity (Elephant orchestrator)  
**Components:** `plugins/pipeline-core/lib/dispatch-budget-core.mjs`, `plugins/pipeline-core/lib/dispatch-budget-core.test.mjs`, `plugins/pipeline-core/hooks/guard-dispatch-budget.mjs`, `plugins/pipeline-core/hooks/guard-dispatch-budget.test.mjs`, `plugins/pipeline-core/lib/dispatch-budget-binding.mjs`, `plugins/pipeline-core/lib/dispatch-budget-binding.test.mjs`

## Problem & Background

Briefed Goldfish tool budgets sat below the harness turn limit (`maxTurns`), but agents had no counter to read and had to estimate tool calls from turn memory. When an agent overrun its budget, neither stop conditions fired nor was an observable counter enforced, leading to dispatches truncating abruptly at harness limits.

## Implementation Details

1. **Deterministic Dispatch Budget Policy Core (`dispatch-budget-core.mjs`):**
   - Side-effect-free decision core computing usable working cap (`dispatchWorkingCap(maxTurns)`), fixed closing allowance (`CLOSING_ALLOWANCE = 5`), and safety margin (`SAFETY_MARGIN = 10`).
   - Normalizes caller identity without trusting ambient properties (`classifyDispatchBudgetCaller`).
   - Denies non-closing working calls once the working cap is exceeded (`DISPATCH-BUDGET-EXHAUSTED`), while admitting exactly 5 post-cap closing calls.

2. **PreToolUse Budget Guard (`guard-dispatch-budget.mjs`):**
   - Counts tool invocations for authenticated subagents across all tool write/read lanes.
   - Enforces the cap, admits closing actions, and halts further non-closing actions.
   - Records bounded observations for unresolved callers and orchestrator sessions without unbounded accumulation.

3. **Tool Budget Binding Protocol (`dispatch-budget-binding.mjs`):**
   - Binds exact numeric caps to tier capacities and validates declared metadata lines.
   - Publishes race-safe tool-use bindings without leaking raw IDs.

## Verification Results

- `plugins/pipeline-core/lib/dispatch-budget-core.test.mjs`: 11/11 PASS (DBC01-DBC11).
- `plugins/pipeline-core/hooks/guard-dispatch-budget.test.mjs`: 49/49 PASS.
- `plugins/pipeline-core/lib/dispatch-budget-binding.test.mjs`: 8/8 PASS (DBB01-DBB08).
- Complete automated coverage across unit, integration, concurrency, and adversarial test suites.
