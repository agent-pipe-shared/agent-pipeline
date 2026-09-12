// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { openSync } from "node:fs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";

import {
  CLOSING_ALLOWANCE,
  DENIAL_CODE,
  INVALID_INPUT_CODE,
  SAFETY_MARGIN,
  classifyDispatchBudgetCaller,
  decideDispatchBudgetCall,
  dispatchWorkingCap,
  effectiveDispatchBaseCap,
} from "./dispatch-budget-core.mjs";

const cases = [];
function check(name, run) {
  cases.push({ id: `DBC${String(cases.length + 1).padStart(2, "0")}`, name, run });
}
const decide = (input) => input !== null && typeof input === "object" && !Array.isArray(input)
  ? decideDispatchBudgetCall({ ...input, baseCalls: input.baseCalls ?? dispatchWorkingCap(input.maxTurns) })
  : decideDispatchBudgetCall(input);

check("classifyDispatchBudgetCaller keeps authenticated, absent, and malformed identities distinct", () => {
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

check("classifyDispatchBudgetCaller preserves the existing permissive agent-type normalization", () => {
  assert.deepEqual(
    classifyDispatchBudgetCaller({ agentIdPresent: true, agentId: "agent-1", agentTypePresent: true, agentType: 42 }),
    { kind: "subagent", agentId: "agent-1", agentType: undefined },
  );
});

check("dispatchWorkingCap reserves five closing and ten safety calls with a zero floor", () => {
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

check("effectiveDispatchBaseCap cannot exceed either the declared base or the tier working cap", () => {
  assert.equal(effectiveDispatchBaseCap(24, 30), 15);
  assert.equal(effectiveDispatchBaseCap(35, 50), 35);
  assert.equal(effectiveDispatchBaseCap(40, 50), 35);
  assert.equal(effectiveDispatchBaseCap(45, 80), 45);
  assert.equal(effectiveDispatchBaseCap(1, 15), 0);
  assert.equal(effectiveDispatchBaseCap(0, 50), null);
  assert.equal(effectiveDispatchBaseCap(Number.MAX_SAFE_INTEGER + 1, 50), null);
  assert.equal(effectiveDispatchBaseCap(20, Infinity), null);
});

check("decideDispatchBudgetCall distinguishes before, at, and after the working cap", () => {
  for (const isClosingAct of [false, true]) {
    for (const currentCount of [3, 4]) {
      assert.deepEqual(decide({ maxTurns: 20, currentCount, isClosingAct }), {
        allowed: true, decision: "working", nextCount: currentCount + 1, workingCap: 5,
      });
    }
    assert.deepEqual(decide({ maxTurns: 20, currentCount: 5, isClosingAct }), {
      allowed: isClosingAct, decision: isClosingAct ? "closing" : "exhausted", nextCount: 6, workingCap: 5,
    });
  }
});

check("a declared base cap of 20 denies the twenty-first work call before the tier cliff", () => {
  assert.deepEqual(decideDispatchBudgetCall({ maxTurns: 50, baseCalls: 20, currentCount: 19, isClosingAct: false }), {
    allowed: true, decision: "working", nextCount: 20, workingCap: 20,
  });
  assert.deepEqual(decideDispatchBudgetCall({ maxTurns: 50, baseCalls: 20, currentCount: 20, isClosingAct: false }), {
    allowed: false, decision: "exhausted", nextCount: 21, workingCap: 20,
  });
});

check("decideDispatchBudgetCall allows exactly five closing calls then returns exhausted", () => {
  let currentCount = 5;
  for (let ordinal = 1; ordinal <= 5; ordinal += 1) {
    const result = decide({ maxTurns: 20, currentCount, isClosingAct: true });
    assert.deepEqual(result, {
      allowed: true, decision: "closing", nextCount: 5 + ordinal, workingCap: 5,
    });
    currentCount = result.nextCount;
  }
  for (const isClosingAct of [true, false, true]) {
    const result = decide({ maxTurns: 20, currentCount, isClosingAct });
    assert.deepEqual(result, {
      allowed: false, decision: "exhausted", nextCount: currentCount + 1, workingCap: 5,
    });
    currentCount = result.nextCount;
  }
});

check("decideDispatchBudgetCall denied work attempts consume the fixed closing reserve", () => {
  let currentCount = 5;
  for (const isClosingAct of [false, true, false, true, true, true]) {
    const result = decide({ maxTurns: 20, currentCount, isClosingAct });
    const allowed = isClosingAct && currentCount < 10;
    assert.deepEqual(result, {
      allowed, decision: allowed ? "closing" : "exhausted", nextCount: currentCount + 1, workingCap: 5,
    });
    currentCount = result.nextCount;
  }
});

check("decideDispatchBudgetCall zero-floor work caps still have only five closing slots", () => {
  for (const maxTurns of [1, 8, 15]) {
    assert.deepEqual(decide({ maxTurns, baseCalls: 1, currentCount: 0, isClosingAct: false }), {
      allowed: false, decision: "exhausted", nextCount: 1, workingCap: 0,
    });
    for (const currentCount of [0, 1, 2, 3, 4, 5, 6]) {
      assert.deepEqual(decide({ maxTurns, baseCalls: 1, currentCount, isClosingAct: true }), {
        allowed: currentCount < 5,
        decision: currentCount < 5 ? "closing" : "exhausted",
        nextCount: currentCount + 1,
        workingCap: 0,
      });
    }
  }
});

check("decideDispatchBudgetCall closing arithmetic remains bounded at safe integer limits", () => {
  const maxTurns = Number.MAX_SAFE_INTEGER;
  const workingCap = maxTurns - 15;
  for (const currentCount of [workingCap + 3, workingCap + 4, workingCap + 5, maxTurns - 1]) {
    const allowed = currentCount < workingCap + 5;
    assert.deepEqual(decide({ maxTurns, currentCount, isClosingAct: true }), {
      allowed, decision: allowed ? "closing" : "exhausted", nextCount: currentCount + 1, workingCap,
    });
  }
});

check("decideDispatchBudgetCall denies invalid numeric and closing inputs with a typed result", () => {
  for (const [input, reason] of [
    [undefined, "max-turns-must-be-a-positive-safe-integer"],
    [{}, "max-turns-must-be-a-positive-safe-integer"],
    [null, "budget-call-input-must-be-an-object"],
    [[], "budget-call-input-must-be-an-object"],
    ["20", "budget-call-input-must-be-an-object"],
    [{ maxTurns: Infinity, currentCount: 0, isClosingAct: false }, "max-turns-must-be-a-positive-safe-integer"],
    [{ maxTurns: -1, currentCount: 0, isClosingAct: false }, "max-turns-must-be-a-positive-safe-integer"],
    [{ maxTurns: 0, currentCount: 0, isClosingAct: false }, "max-turns-must-be-a-positive-safe-integer"],
    [{ maxTurns: 20, isClosingAct: true }, "current-count-must-be-a-nonnegative-safe-integer"],
    [{ maxTurns: 20, currentCount: null, isClosingAct: true }, "current-count-must-be-a-nonnegative-safe-integer"],
    [{ maxTurns: 20, currentCount: Infinity, isClosingAct: true }, "current-count-must-be-a-nonnegative-safe-integer"],
    [{ maxTurns: 20, currentCount: Number.MAX_SAFE_INTEGER + 1, isClosingAct: true }, "current-count-must-be-a-nonnegative-safe-integer"],
    [{ maxTurns: 20, currentCount: -1, isClosingAct: false }, "current-count-must-be-a-nonnegative-safe-integer"],
    [{ maxTurns: 20, currentCount: Number.NaN, isClosingAct: false }, "current-count-must-be-a-nonnegative-safe-integer"],
    [{ maxTurns: 20, currentCount: "4", isClosingAct: false }, "current-count-must-be-a-nonnegative-safe-integer"],
    [{ maxTurns: 20, currentCount: 1.5, isClosingAct: false }, "current-count-must-be-a-nonnegative-safe-integer"],
    [{ maxTurns: 20, currentCount: Number.MAX_SAFE_INTEGER, isClosingAct: false }, "current-count-cannot-be-incremented-safely"],
    [{ maxTurns: 20, currentCount: 4, isClosingAct: "false" }, "is-closing-act-must-be-boolean"],
    [{ maxTurns: 20, currentCount: 4 }, "is-closing-act-must-be-boolean"],
  ]) {
    assert.deepEqual(decide(input), {
      allowed: false,
      decision: "invalid-input",
      code: INVALID_INPUT_CODE,
      reason,
      nextCount: null,
      workingCap: null,
    });
  }
  assert.equal(decideDispatchBudgetCall({ maxTurns: 20, currentCount: 0, isClosingAct: false }).reason, "base-calls-must-be-a-positive-safe-integer");
  assert.equal(decideDispatchBudgetCall({ maxTurns: 20, baseCalls: 0, currentCount: 0, isClosingAct: false }).reason, "base-calls-must-be-a-positive-safe-integer");
});

assert.equal(cases.length, 11, "the complete dispatch-budget corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({
  cases: cases,
  fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536"),
});
