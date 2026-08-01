// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";

import { classifyStackRunOutcome, evaluateStackRunRequirement } from "./stack-run-outcome.mjs";

const complete = { ruleCount: 1, targetReachable: true, coverage: { scanned: 2, eligible: 2 }, truncated: false };
let pass = 0;
function check(name, fn) { fn(); pass++; console.log(`PASS ${name}`); }

check("empty rule set is typed, never a pass", () => {
  assert.deepEqual(classifyStackRunOutcome({ ...complete, ruleCount: 0 }), { outcome: "empty-rule-set", code: "STACK-RUN-EMPTY-RULE-SET" });
});
check("unreachable target is typed, never a pass", () => {
  assert.deepEqual(classifyStackRunOutcome({ ...complete, targetReachable: false }), { outcome: "target-unreachable", code: "STACK-RUN-TARGET-UNREACHABLE" });
});
check("partial coverage is typed, never a pass", () => {
  assert.deepEqual(classifyStackRunOutcome({ ...complete, coverage: { scanned: 1, eligible: 2 } }), { outcome: "partial-coverage", code: "STACK-RUN-PARTIAL-COVERAGE" });
});
check("truncated run is typed ahead of partial coverage", () => {
  assert.deepEqual(classifyStackRunOutcome({ ...complete, coverage: { scanned: 1, eligible: 2 }, truncated: true }), { outcome: "truncated-run", code: "STACK-RUN-TRUNCATED" });
});
check("only complete input passes and required degraded input blocks", () => {
  assert.deepEqual(classifyStackRunOutcome(complete), { outcome: "pass", code: "STACK-RUN-PASS" });
  assert.deepEqual(evaluateStackRunRequirement({ required: true, outcome: "partial-coverage" }), { allowed: false, code: "STACK-RUN-REQUIRED-DEGRADED", outcome: "partial-coverage" });
  assert.deepEqual(evaluateStackRunRequirement({ required: false, outcome: "partial-coverage" }), { allowed: true, code: "STACK-RUN-ALLOWED" });
});
check("malformed input remains typed invalid", () => {
  assert.deepEqual(classifyStackRunOutcome({}), { outcome: "invalid", code: "STACK-RUN-INVALID" });
});

console.log(`${pass} stack run outcome checks passed`);
