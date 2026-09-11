// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CLOSING_ALLOWANCE,
  DENIAL_CODE,
  INVALID_INPUT_CODE,
  SAFETY_MARGIN,
  classifyDispatchBudgetCaller,
  decideDispatchBudgetCall,
  dispatchWorkingCap,
} from "./dispatch-budget-core.mjs";

test("classifyDispatchBudgetCaller keeps authenticated, absent, and malformed identities distinct", () => {
  assert.deepEqual(
    classifyDispatchBudgetCaller({ agentIdPresent: true, agentId: "agent-1", agentTypePresent: true, agentType: "worker" }),
    { kind: "subagent", agentId: "agent-1", agentType: "worker" },
  );
  assert.deepEqual(classifyDispatchBudgetCaller(), { kind: "orchestrator" });
  assert.deepEqual(
    classifyDispatchBudgetCaller({ agentTypePresent: true, agentType: "worker" }),
    { kind: "unresolved", reason: "agent-type-without-agent-id", agentIdRaw: undefined, agentTypeRaw: "worker" },
  );
  assert.deepEqual(
    classifyDispatchBudgetCaller({ agentIdPresent: true, agentId: "  " }),
    { kind: "unresolved", reason: "agent-id-present-but-blank", agentIdRaw: "  ", agentTypeRaw: undefined },
  );
  assert.deepEqual(
    classifyDispatchBudgetCaller({ agentIdPresent: true, agentId: null }),
    { kind: "unresolved", reason: "agent-id-present-but-not-a-string", agentIdRaw: null, agentTypeRaw: undefined },
  );
});

test("classifyDispatchBudgetCaller preserves the existing permissive agent-type normalization", () => {
  assert.deepEqual(
    classifyDispatchBudgetCaller({ agentIdPresent: true, agentId: "agent-1", agentTypePresent: true, agentType: 42 }),
    { kind: "subagent", agentId: "agent-1", agentType: undefined },
  );
});

test("dispatchWorkingCap reserves five closing and ten safety calls with a zero floor", () => {
  assert.equal(CLOSING_ALLOWANCE, 5);
  assert.equal(SAFETY_MARGIN, 10);
  assert.equal(DENIAL_CODE, "DISPATCH-BUDGET-EXHAUSTED");
  assert.equal(INVALID_INPUT_CODE, "DISPATCH-BUDGET-INPUT-INVALID");
  assert.equal(dispatchWorkingCap(50), 35);
  assert.equal(dispatchWorkingCap(15), 0);
  assert.equal(dispatchWorkingCap(8), 0);
  assert.equal(dispatchWorkingCap(Infinity), null);
  assert.equal(dispatchWorkingCap(-1), null);
});

test("decideDispatchBudgetCall counts and allows calls through the working cap", () => {
  assert.deepEqual(decideDispatchBudgetCall({ maxTurns: 20, currentCount: 4, isClosingAct: false }), {
    allowed: true, decision: "working", nextCount: 5, workingCap: 5,
  });
});

test("decideDispatchBudgetCall counts a post-cap closing call and blocks a post-cap working call", () => {
  assert.deepEqual(decideDispatchBudgetCall({ maxTurns: 20, currentCount: 5, isClosingAct: true }), {
    allowed: true, decision: "closing", nextCount: 6, workingCap: 5,
  });
  assert.deepEqual(decideDispatchBudgetCall({ maxTurns: 20, currentCount: 5, isClosingAct: false }), {
    allowed: false, decision: "exhausted", nextCount: 6, workingCap: 5,
  });
});

test("decideDispatchBudgetCall denies invalid numeric and closing inputs with a typed result", () => {
  for (const [input, reason] of [
    [{ maxTurns: Infinity, currentCount: 0, isClosingAct: false }, "max-turns-must-be-a-positive-safe-integer"],
    [{ maxTurns: -1, currentCount: 0, isClosingAct: false }, "max-turns-must-be-a-positive-safe-integer"],
    [{ maxTurns: 20, currentCount: -1, isClosingAct: false }, "current-count-must-be-a-nonnegative-safe-integer"],
    [{ maxTurns: 20, currentCount: Number.NaN, isClosingAct: false }, "current-count-must-be-a-nonnegative-safe-integer"],
    [{ maxTurns: 20, currentCount: "4", isClosingAct: false }, "current-count-must-be-a-nonnegative-safe-integer"],
    [{ maxTurns: 20, currentCount: 1.5, isClosingAct: false }, "current-count-must-be-a-nonnegative-safe-integer"],
    [{ maxTurns: 20, currentCount: Number.MAX_SAFE_INTEGER, isClosingAct: false }, "current-count-cannot-be-incremented-safely"],
    [{ maxTurns: 20, currentCount: 4, isClosingAct: "false" }, "is-closing-act-must-be-boolean"],
  ]) {
    assert.deepEqual(decideDispatchBudgetCall(input), {
      allowed: false,
      decision: "invalid-input",
      code: INVALID_INPUT_CODE,
      reason,
      nextCount: null,
      workingCap: null,
    });
  }
});
