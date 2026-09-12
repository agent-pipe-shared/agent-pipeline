// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, openSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  bindDispatchBudget,
  consumePendingDispatchBudgetBinding,
  persistPendingDispatchBudgetBindings,
  resolvePendingDispatchBudgetBinding,
} from "./dispatch-budget-binding.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";

const cases = [];
const check = (name, run) => cases.push({ id: `DBB${String(cases.length + 1).padStart(2, "0")}`, name, run });
const line = (value) => `- **Tool budget (TB-09, hard cap, first-class field):** ${value} tool uses. Closing allowance follows.`;

check("binds exact numeric caps to the selected tier capacity", () => {
  assert.deepEqual(bindDispatchBudget({ prompt: line("≤40"), maxTurns: 50, applicable: true }), {
    schema: "pipeline.dispatch-budget-binding.v1", status: "prepared", code: "DBB-PREPARED",
    applicable: true, baseCalls: 40, maxTurns: 50, workingCap: 35, effectiveCap: 35, tierLimited: true,
  });
  assert.deepEqual(bindDispatchBudget({ prompt: line("45"), maxTurns: 80, applicable: true }), {
    schema: "pipeline.dispatch-budget-binding.v1", status: "prepared", code: "DBB-PREPARED",
    applicable: true, baseCalls: 45, maxTurns: 80, workingCap: 65, effectiveCap: 45, tierLimited: false,
  });
});

check("rejects a missing or duplicated mandatory metadata line", () => {
  assert.equal(bindDispatchBudget({ prompt: "No budget metadata.", maxTurns: 50, applicable: true }).code, "DBB-BASE-CAP-MISSING");
  assert.equal(bindDispatchBudget({ prompt: `${line("40")}\n${line("35")}`, maxTurns: 50, applicable: true }).code, "DBB-BASE-CAP-AMBIGUOUS");
});

check("rejects nonnumeric, fractional and range-shaped caps", () => {
  for (const value of ["forty", "40.5", "35-40", "~40"]) {
    assert.equal(bindDispatchBudget({ prompt: line(value), maxTurns: 50, applicable: true }).code, "DBB-BASE-CAP-NONNUMERIC", value);
  }
});

check("rejects zero and integers outside JavaScript's exact range", () => {
  assert.equal(bindDispatchBudget({ prompt: line("0"), maxTurns: 50, applicable: true }).code, "DBB-BASE-CAP-UNSAFE");
  assert.equal(bindDispatchBudget({ prompt: line("9007199254740992"), maxTurns: 50, applicable: true }).code, "DBB-BASE-CAP-UNSAFE");
});

check("rejects tiers that cannot carry the fixed reserve", () => {
  for (const maxTurns of [undefined, 0, 15, Infinity, "50"]) {
    assert.equal(bindDispatchBudget({ prompt: line("10"), maxTurns, applicable: true }).code, "DBB-TIER-INCOMPATIBLE");
  }
});

check("keeps roles without an adopted budget contract explicitly unchanged", () => {
  assert.deepEqual(bindDispatchBudget({ prompt: "", maxTurns: undefined, applicable: false }), {
    schema: "pipeline.dispatch-budget-binding.v1", status: "not-applicable", code: "DBB-NOT-APPLICABLE", applicable: false,
  });
});

check("publishes and resolves one race-safe tool-use binding without storing the raw tool-use id", () => {
  const commonDir = mkdtempSync(join(tmpdir(), "dispatch-budget-binding-"));
  try {
    const binding = { agentType: "pipeline-core:goldfish-implementor", baseCalls: 40, maxTurns: 50, effectiveCap: 35 };
    const written = persistPendingDispatchBudgetBindings({ commonDir, toolUseId: "toolu-private-1", bindings: [binding] });
    assert.equal(written.code, "DBB-PENDING-BINDING-WRITTEN");
    assert.equal(written.path.includes("toolu-private-1"), false);
    assert.deepEqual(resolvePendingDispatchBudgetBinding({ commonDir, toolUseId: "toolu-private-1", agentType: "pipeline-core:goldfish-implementor" }), {
      schema: "pipeline.dispatch-budget-binding.v1", status: "prepared", code: "DBB-PENDING-BINDING-RESOLVED",
      binding: { agentType: "goldfish-implementor", baseCalls: 40, maxTurns: 50, effectiveCap: 35 },
    });
    assert.equal(persistPendingDispatchBudgetBindings({ commonDir, toolUseId: "toolu-private-1", bindings: [binding] }).code, "DBB-PENDING-BINDING-EXISTS");
    assert.equal(consumePendingDispatchBudgetBinding({
      commonDir, toolUseId: "toolu-private-1", agentType: "pipeline-core:goldfish-implementor",
      binding: { agentType: "goldfish-implementor", baseCalls: 40, maxTurns: 50, effectiveCap: 35 },
    }).code, "DBB-PENDING-BINDING-CONSUMED");
    assert.equal(resolvePendingDispatchBudgetBinding({ commonDir, toolUseId: "toolu-private-1", agentType: "goldfish-implementor" }).code, "DBB-PENDING-BINDING-MISSING");
    assert.equal(resolvePendingDispatchBudgetBinding({ commonDir, toolUseId: "other", agentType: "goldfish-implementor" }).code, "DBB-PENDING-BINDING-MISSING");
  } finally { rmSync(commonDir, { recursive: true, force: true }); }
});

check("rejects conflicting role caps before publication", () => {
  const commonDir = mkdtempSync(join(tmpdir(), "dispatch-budget-binding-conflict-"));
  try {
    const bindings = [
      { agentType: "critic", baseCalls: 10, maxTurns: 30, effectiveCap: 10 },
      { agentType: "pipeline-core:critic", baseCalls: 12, maxTurns: 30, effectiveCap: 12 },
    ];
    assert.equal(persistPendingDispatchBudgetBindings({ commonDir, toolUseId: "toolu-conflict", bindings }).code, "DBB-PENDING-BINDING-INVALID");
  } finally { rmSync(commonDir, { recursive: true, force: true }); }
});

assert.equal(cases.length, 8, "the complete dispatch budget binding corpus must register before execution");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases, fd: completionFd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
