#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * SubagentStart hook: records the dispatch's bootstrap receipt at the moment the host starts the
 * subagent, so the subagent's FIRST Edit/Write/NotebookEdit is admitted without the detour
 * (backlog item pipeline.every-dispatch-pays-a-bootstrap-receipt-detour, AC-169; PO decision
 * 2026-10-17: implement the zero-cost SubagentStart receipt).
 *
 * WHAT IT DOES. Nothing but delegation. The receipt format, the private directory, its hardening and
 * the reader (`evaluateBootstrapReceiptGate`) all stay owned by `lib/guard/bootstrap-receipt.mjs`;
 * this hook feeds the native SubagentStart payload (`agent_id`, `agent_type`) to the same exported
 * writer the guard itself calls when a subagent runs the sanctioned preflight. There is no second
 * receipt format to drift: a receipt written here is byte-for-byte the receipt the step-0 route
 * writes, and the unmodified reader cannot tell the two routes apart.
 *
 * WHAT IT CHANGES. The receipt used to mean "this agent's own process ran the preflight". Recorded at
 * SubagentStart it means "the host started this dispatch inside a governed project". That is the
 * design tension the backlog item names, and the PO accepted it. What the receipt never proved is
 * unchanged: it does not show that the agent read or understood the preflight result. The template's
 * step 0 (`templates/prompts/goldfish-task.md`, the plain `pipeline-start-preflight.mjs` route) STAYS
 * as the fallback and as the agent's own obligation; this hook only removes the refusal-then-retry
 * cost when the host fires the event.
 *
 * WHAT IT NEVER DOES. It never blocks (SubagentStart cannot, and this exits 0 on every path), never
 * prints (stdout would be injected into the subagent's context), never records for an unresolved or
 * malformed identity, and never writes outside a project that requires enforcement. A receipt that
 * cannot be written leaves the guard's existing refusal in place, which names the step-0 route.
 */
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { observeGovernanceScope } from "../lib/governance-scope.mjs";
import { lifecycleSubagentIdentity, recordBootstrapPreflightReceipt } from "../lib/guard/bootstrap-receipt.mjs";

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

/**
 * Record the dispatch receipt for one native SubagentStart payload.
 *
 * Returns `{status: "delegated", agentId, agentType}` once the guard's writer was handed a resolved
 * dispatch identity, or `{status: "skipped", code}` otherwise. "delegated" is deliberately not
 * "recorded": the writer fails open and silent on a missing git common dir or a write error, so the
 * filesystem, not this return value, is the evidence that a receipt exists.
 */
export function recordSubagentStartReceipt(input, dependencies = {}) {
  if (!plainObject(input) || input.hook_event_name !== "SubagentStart") {
    return { status: "skipped", code: "SSR-NOT-SUBAGENT-START" };
  }
  try {
    const identity = lifecycleSubagentIdentity(input, dependencies);
    if (identity.kind !== "subagent") {
      return { status: "skipped", code: "SSR-NO-DISPATCH-IDENTITY", identityKind: identity.kind };
    }
    // Same project-directory precedence the guard uses, with the event's own cwd before the process cwd.
    const requested = dependencies.projectDir ?? process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
    if (!(dependencies.observeGovernanceScopeFn ?? observeGovernanceScope)({ rootDir: requested }).requiresEnforcement) {
      return { status: "skipped", code: "SSR-OUT-OF-GOVERNANCE" };
    }
    const root = (dependencies.realpathSyncFn ?? realpathSync)(resolve(requested));
    recordBootstrapPreflightReceipt(input, root, dependencies);
    return { status: "delegated", agentId: identity.agentId, agentType: identity.agentType };
  } catch {
    return { status: "skipped", code: "SSR-FAULT" };
  }
}

if (isDirectInvocation(import.meta.url)) {
  let input;
  try { input = JSON.parse(readFileSync(0, "utf8")); }
  catch { process.exit(0); }
  try { recordSubagentStartReceipt(input); }
  catch { /* SubagentStart is non-blocking; no receipt just means the step-0 fallback applies. */ }
}
