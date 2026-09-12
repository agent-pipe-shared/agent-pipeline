// SPDX-License-Identifier: SUL-1.0

import { CLOSING_ALLOWANCE, dispatchWorkingCap } from "./dispatch-budget-core.mjs";

export const DISPATCH_BUDGET_CALIBRATION_RULE_SCHEMA = "pipeline.dispatch-budget-calibration-rule.v1";
export const DISPATCH_BUDGET_CALIBRATION_SAMPLE_SCHEMA = "pipeline.dispatch-budget-calibration-sample.v1";
export const DISPATCH_BUDGET_CALIBRATION_RESULT_SCHEMA = "pipeline.dispatch-budget-calibration-result.v1";

export const DISPATCH_BUDGET_TIERS = Object.freeze(["mechanic", "implementor", "deep"]);
export const DISPATCH_BUDGET_TASK_CLASSES = Object.freeze([
  "correction",
  "documentation",
  "implementation",
  "investigation",
  "review",
]);

const OUTCOMES = new Set(["terminal", "truncated"]);

export class DispatchBudgetCalibrationError extends Error {
  constructor(code) {
    super("Dispatch budget calibration input is invalid.");
    this.name = "DispatchBudgetCalibrationError";
    this.code = code;
  }
}

function fail(code) { throw new DispatchBudgetCalibrationError(code); }
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) {
  return record(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
function nonnegative(value) { return Number.isSafeInteger(value) && value >= 0; }
function positive(value) { return Number.isSafeInteger(value) && value > 0; }
function exactNumericMap(value, keys, predicate) {
  return exact(value, keys) && keys.every((key) => predicate(value[key]));
}
function checkedAdd(left, right) {
  const result = left + right;
  if (!Number.isSafeInteger(result)) fail("DBC-ARITHMETIC");
  return result;
}
function checkedMultiply(left, right) {
  const result = left * right;
  if (!Number.isSafeInteger(result)) fail("DBC-ARITHMETIC");
  return result;
}

function validateRule(rule) {
  if (!exact(rule, ["schema", "fixedCalls", "callsPerFile", "maxTurnsByTier"])
    || rule.schema !== DISPATCH_BUDGET_CALIBRATION_RULE_SCHEMA
    || !nonnegative(rule.fixedCalls)
    || !exactNumericMap(rule.callsPerFile, DISPATCH_BUDGET_TASK_CLASSES, nonnegative)
    || !exactNumericMap(rule.maxTurnsByTier, DISPATCH_BUDGET_TIERS, positive)) fail("DBC-RULE");
}

function validateSample(sample) {
  if (!exact(sample, ["schema", "tier", "taskClass", "fileCount", "observedCalls", "outcome"])
    || sample.schema !== DISPATCH_BUDGET_CALIBRATION_SAMPLE_SCHEMA
    || !DISPATCH_BUDGET_TIERS.includes(sample.tier)
    || !DISPATCH_BUDGET_TASK_CLASSES.includes(sample.taskClass)
    || !nonnegative(sample.fileCount)
    || !positive(sample.observedCalls)
    || !OUTCOMES.has(sample.outcome)) fail("DBC-SAMPLE");
}

/**
 * Evaluate a proposed base-budget rule against sanitized observations.
 *
 * `observedCalls` is deliberately only a count. A naturally terminal sample
 * proves that many calls were needed; a truncated sample proves only that more
 * than that many were needed. Both retain the policy core's fixed closing
 * allowance after the observed work. The tier's actual working cap limits the
 * usable estimate, so an unrealistically high formula cannot conceal a tier
 * that would still truncate the dispatch.
 */
export function evaluateDispatchBudgetCalibration({ rule, samples } = {}) {
  validateRule(rule);
  if (!Array.isArray(samples) || samples.length === 0) fail("DBC-SAMPLES");
  samples.forEach(validateSample);

  const evaluations = samples.map((sample) => {
    const perFile = checkedMultiply(rule.callsPerFile[sample.taskClass], sample.fileCount);
    const proposedBaseCalls = checkedAdd(rule.fixedCalls, perFile);
    const workingCap = dispatchWorkingCap(rule.maxTurnsByTier[sample.tier]);
    const effectiveBaseCalls = Math.min(proposedBaseCalls, workingCap);
    const observedCompletionBound = checkedAdd(sample.observedCalls, sample.outcome === "truncated" ? 1 : 0);
    const requiredBaseCalls = checkedAdd(observedCompletionBound, CLOSING_ALLOWANCE);
    const undercutsObservedBound = effectiveBaseCalls < requiredBaseCalls;
    const classification = undercutsObservedBound
      ? (sample.outcome === "truncated" ? "undercut-truncated-lower-bound" : "undercut-terminal-bound")
      : (sample.outcome === "truncated" ? "clears-truncated-lower-bound" : "meets-terminal-bound");
    return Object.freeze({
      tier: sample.tier,
      taskClass: sample.taskClass,
      fileCount: sample.fileCount,
      observedCalls: sample.observedCalls,
      outcome: sample.outcome,
      proposedBaseCalls,
      workingCap,
      effectiveBaseCalls,
      requiredBaseCalls,
      undercutsObservedBound,
      tierLimited: effectiveBaseCalls < proposedBaseCalls,
      classification,
    });
  });

  const undercutCount = evaluations.filter((entry) => entry.undercutsObservedBound).length;
  const truncatedCount = evaluations.filter((entry) => entry.outcome === "truncated").length;
  const status = undercutCount > 0
    ? "undercut"
    : truncatedCount > 0
      ? "inconclusive-truncated"
      : "meets-observed-terminal-bounds";
  return Object.freeze({
    schema: DISPATCH_BUDGET_CALIBRATION_RESULT_SCHEMA,
    status,
    sampleCount: evaluations.length,
    undercutCount,
    truncatedCount,
    closingAllowance: CLOSING_ALLOWANCE,
    evaluations: Object.freeze(evaluations),
  });
}
