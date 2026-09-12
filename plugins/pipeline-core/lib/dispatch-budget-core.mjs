// SPDX-License-Identifier: SUL-1.0

/**
 * Runner-neutral, side-effect-free dispatch budget policy.
 *
 * Host adapters authenticate and normalize their own caller evidence, then
 * pass only the resulting field-presence facts and values here. They also
 * decide whether a concrete host call is one of that adapter's closing acts.
 * This module deliberately knows nothing about hook payloads, tool names,
 * paths, persistence, or a particular runner.
 */
export const DENIAL_CODE = "DISPATCH-BUDGET-EXHAUSTED";
export const INVALID_INPUT_CODE = "DISPATCH-BUDGET-INPUT-INVALID";
export const CLOSING_ALLOWANCE = 5;
export const SAFETY_MARGIN = 10;

/**
 * Classify normalized caller evidence without trusting runner-specific field
 * names. Presence is explicit because an omitted identity and a malformed
 * present identity have different, already-established policy outcomes.
 */
export function classifyDispatchBudgetCaller({
  agentIdPresent = false,
  agentId,
  agentTypePresent = false,
  agentType,
} = {}) {
  if (typeof agentId === "string" && agentId.trim() !== "") {
    return {
      kind: "subagent",
      agentId,
      agentType: typeof agentType === "string" ? agentType : undefined,
    };
  }
  if (agentIdPresent || agentTypePresent) {
    const reason = !agentIdPresent
      ? "agent-type-without-agent-id"
      : (typeof agentId === "string" && agentId.trim() === "")
        ? "agent-id-present-but-blank"
        : "agent-id-present-but-not-a-string";
    return { kind: "unresolved", reason, agentIdRaw: agentId, agentTypeRaw: agentType };
  }
  return { kind: "orchestrator" };
}

/** The usable work calls before the fixed closing and safety reserve. */
export function dispatchWorkingCap(maxTurns) {
  if (!Number.isSafeInteger(maxTurns) || maxTurns <= 0) return null;
  return Math.max(0, maxTurns - (CLOSING_ALLOWANCE + SAFETY_MARGIN));
}

/** Bind a declared work cap to the smaller capacity the selected tier can safely carry. */
export function effectiveDispatchBaseCap(baseCalls, maxTurns) {
  if (!Number.isSafeInteger(baseCalls) || baseCalls <= 0) return null;
  const workingCap = dispatchWorkingCap(maxTurns);
  if (workingCap === null) return null;
  return Math.min(baseCalls, workingCap);
}

function invalidBudgetInput(reason) {
  return {
    allowed: false,
    decision: "invalid-input",
    code: INVALID_INPUT_CODE,
    reason,
    nextCount: null,
    workingCap: null,
  };
}

/**
 * Advance one attributable dispatch call and decide its policy lane. The
 * caller persists `nextCount`, including denied attempts. After the working
 * cap, only closing acts within the next CLOSING_ALLOWANCE calls may proceed;
 * neither closing acts nor denied attempts can extend that fixed reserve.
 */
export function decideDispatchBudgetCall(input = {}) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return invalidBudgetInput("budget-call-input-must-be-an-object");
  const { maxTurns, baseCalls, currentCount, isClosingAct } = input;
  if (!Number.isSafeInteger(maxTurns) || maxTurns <= 0) return invalidBudgetInput("max-turns-must-be-a-positive-safe-integer");
  if (!Number.isSafeInteger(baseCalls) || baseCalls <= 0) return invalidBudgetInput("base-calls-must-be-a-positive-safe-integer");
  if (!Number.isSafeInteger(currentCount) || currentCount < 0) return invalidBudgetInput("current-count-must-be-a-nonnegative-safe-integer");
  if (currentCount === Number.MAX_SAFE_INTEGER) return invalidBudgetInput("current-count-cannot-be-incremented-safely");
  if (typeof isClosingAct !== "boolean") return invalidBudgetInput("is-closing-act-must-be-boolean");
  const workingCap = effectiveDispatchBaseCap(baseCalls, maxTurns);
  const nextCount = currentCount + 1;
  if (nextCount <= workingCap) {
    return { allowed: true, decision: "working", nextCount, workingCap };
  }
  if (isClosingAct === true && nextCount <= workingCap + CLOSING_ALLOWANCE) {
    return { allowed: true, decision: "closing", nextCount, workingCap };
  }
  return { allowed: false, decision: "exhausted", nextCount, workingCap };
}
