// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DISPATCH_BUDGET_CALIBRATION_RULE_SCHEMA,
  DISPATCH_BUDGET_CALIBRATION_SAMPLE_SCHEMA,
  DispatchBudgetCalibrationError,
  evaluateDispatchBudgetCalibration,
} from "./dispatch-budget-calibration.mjs";

const rule = (overrides = {}) => ({
  schema: DISPATCH_BUDGET_CALIBRATION_RULE_SCHEMA,
  fixedCalls: 10,
  callsPerFile: { correction: 6, documentation: 8, implementation: 5, investigation: 3, review: 4 },
  maxTurnsByTier: { mechanic: 50, implementor: 50, deep: 80 },
  ...overrides,
});
const sample = (overrides = {}) => ({
  schema: DISPATCH_BUDGET_CALIBRATION_SAMPLE_SCHEMA,
  tier: "deep",
  taskClass: "documentation",
  fileCount: 6,
  observedCalls: 50,
  outcome: "terminal",
  ...overrides,
});

test("a terminal observation includes the fixed closing allowance in its lower bound", () => {
  const result = evaluateDispatchBudgetCalibration({ rule: rule(), samples: [sample()] });
  assert.equal(result.status, "meets-observed-terminal-bounds");
  assert.deepEqual(result.evaluations[0], {
    tier: "deep", taskClass: "documentation", fileCount: 6, observedCalls: 50, outcome: "terminal",
    proposedBaseCalls: 58, workingCap: 65, effectiveBaseCalls: 58, requiredBaseCalls: 55,
    undercutsObservedBound: false, tierLimited: false, classification: "meets-terminal-bound",
  });
  assert.equal(result.closingAllowance, 5);
});

test("the evaluator exposes both a weak formula and a tier cap that truncates a stronger formula", () => {
  const weak = evaluateDispatchBudgetCalibration({
    rule: rule(),
    samples: [sample({ observedCalls: 66 })],
  });
  assert.equal(weak.status, "undercut");
  assert.equal(weak.evaluations[0].classification, "undercut-terminal-bound");
  assert.equal(weak.evaluations[0].requiredBaseCalls, 71);

  const capped = evaluateDispatchBudgetCalibration({
    rule: rule({ fixedCalls: 60 }),
    samples: [sample({ tier: "implementor", fileCount: 1, observedCalls: 40 })],
  });
  assert.equal(capped.evaluations[0].proposedBaseCalls, 68);
  assert.equal(capped.evaluations[0].workingCap, 35);
  assert.equal(capped.evaluations[0].effectiveBaseCalls, 35);
  assert.equal(capped.evaluations[0].tierLimited, true);
  assert.equal(capped.evaluations[0].undercutsObservedBound, true);
});

test("a truncated run is only a strict lower bound and can never validate sufficiency", () => {
  const result = evaluateDispatchBudgetCalibration({
    rule: rule({ fixedCalls: 70, maxTurnsByTier: { mechanic: 100, implementor: 100, deep: 100 } }),
    samples: [sample({ tier: "implementor", taskClass: "correction", fileCount: 1, observedCalls: 50, outcome: "truncated" })],
  });
  assert.equal(result.status, "inconclusive-truncated");
  assert.equal(result.evaluations[0].requiredBaseCalls, 56);
  assert.equal(result.evaluations[0].classification, "clears-truncated-lower-bound");
});

test("mixed samples summarize every undercut without leaking identifiers or prose", () => {
  const result = evaluateDispatchBudgetCalibration({
    rule: rule(),
    samples: [
      sample(),
      sample({ tier: "mechanic", taskClass: "investigation", fileCount: 0, observedCalls: 20, outcome: "truncated" }),
    ],
  });
  assert.equal(result.status, "undercut");
  assert.deepEqual({ sampleCount: result.sampleCount, undercutCount: result.undercutCount, truncatedCount: result.truncatedCount },
    { sampleCount: 2, undercutCount: 1, truncatedCount: 1 });
  assert.deepEqual(Object.keys(result.evaluations[1]).sort(), [
    "classification", "effectiveBaseCalls", "fileCount", "observedCalls", "outcome", "proposedBaseCalls",
    "requiredBaseCalls", "taskClass", "tier", "tierLimited", "undercutsObservedBound", "workingCap",
  ].sort());
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.evaluations), true);
  assert.equal(Object.isFrozen(result.evaluations[0]), true);
});

test("the sample and rule contracts are exact and reject invalid or unsafe arithmetic", () => {
  for (const input of [
    {},
    { rule: rule(), samples: [] },
    { rule: { ...rule(), extra: true }, samples: [sample()] },
    { rule: rule({ callsPerFile: { documentation: 4 } }), samples: [sample()] },
    { rule: rule({ maxTurnsByTier: { mechanic: 50, implementor: 50, deep: 0 } }), samples: [sample()] },
    { rule: rule(), samples: [{ ...sample(), extra: "private" }] },
    { rule: rule(), samples: [sample({ tier: "critic" })] },
    { rule: rule(), samples: [sample({ taskClass: "other" })] },
    { rule: rule(), samples: [sample({ fileCount: -1 })] },
    { rule: rule(), samples: [sample({ observedCalls: 0 })] },
    { rule: rule(), samples: [sample({ outcome: "failed" })] },
    { rule: rule({ fixedCalls: Number.MAX_SAFE_INTEGER }), samples: [sample()] },
  ]) {
    assert.throws(() => evaluateDispatchBudgetCalibration(input), DispatchBudgetCalibrationError);
  }
});
