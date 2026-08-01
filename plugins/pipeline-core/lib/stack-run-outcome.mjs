// SPDX-License-Identifier: SUL-1.0
/** CYB-6 typed completion outcomes; a clean-looking status never hides lost coverage. */
const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

export const STACK_RUN_OUTCOMES = Object.freeze(["pass", "empty-rule-set", "target-unreachable", "partial-coverage", "truncated-run", "invalid"]);

/**
 * Classifies the four named degraded completion states in priority order.
 * This is pure policy: an adapter reports observations, never a pass/fail
 * string that can erase an incomplete run.
 */
export function classifyStackRunOutcome(input) {
  if (!own(input, ["ruleCount", "targetReachable", "coverage", "truncated"])
    || !Number.isInteger(input.ruleCount) || input.ruleCount < 0
    || typeof input.targetReachable !== "boolean"
    || !own(input.coverage, ["scanned", "eligible"])
    || !Number.isInteger(input.coverage.scanned) || input.coverage.scanned < 0
    || !Number.isInteger(input.coverage.eligible) || input.coverage.eligible < 0
    || input.coverage.scanned > input.coverage.eligible
    || typeof input.truncated !== "boolean") return { outcome: "invalid", code: "STACK-RUN-INVALID" };
  if (input.ruleCount === 0) return { outcome: "empty-rule-set", code: "STACK-RUN-EMPTY-RULE-SET" };
  if (!input.targetReachable) return { outcome: "target-unreachable", code: "STACK-RUN-TARGET-UNREACHABLE" };
  if (input.truncated) return { outcome: "truncated-run", code: "STACK-RUN-TRUNCATED" };
  if (input.coverage.scanned !== input.coverage.eligible) return { outcome: "partial-coverage", code: "STACK-RUN-PARTIAL-COVERAGE" };
  return { outcome: "pass", code: "STACK-RUN-PASS" };
}

/** A terminal admission projection: only complete coverage can satisfy a required plan. */
export function evaluateStackRunRequirement({ required, outcome } = {}) {
  if (typeof required !== "boolean" || !STACK_RUN_OUTCOMES.includes(outcome)) return { allowed: false, code: "STACK-RUN-INVALID" };
  if (!required || outcome === "pass") return { allowed: true, code: "STACK-RUN-ALLOWED" };
  return { allowed: false, code: "STACK-RUN-REQUIRED-DEGRADED", outcome };
}
