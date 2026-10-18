// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { mkdtempSync, openSync, rmSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
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

// ALF-G2B2: the optional per-row `commitMode` ("native-host" is the only admitted value; absent is the ordinary mode).
const { createHash } = process.getBuiltinModule("node:crypto");
const { mkdirSync, writeFileSync } = process.getBuiltinModule("node:fs");
const MODE_ROW = { agentType: "pipeline-core:goldfish-deep", baseCalls: 40, maxTurns: 50, effectiveCap: 35 };
const sha = (toolUseId) => createHash("sha256").update(toolUseId).digest("hex");
const writePendingFile = (commonDir, toolUseId, record) => {
  const dir = join(commonDir, "agent-pipeline", "dispatch-budget", "pending");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${sha(toolUseId)}.json`), `${JSON.stringify(record)}\n`, "utf8");
};

check("round-trips the optional native-host commit mode through publish, resolve and consume", () => {
  const commonDir = mkdtempSync(join(tmpdir(), "dispatch-budget-binding-mode-"));
  try {
    const nativeRow = { ...MODE_ROW, commitMode: "native-host" };
    assert.equal(persistPendingDispatchBudgetBindings({ commonDir, toolUseId: "toolu-mode-1", bindings: [nativeRow] }).code, "DBB-PENDING-BINDING-WRITTEN");
    const resolved = resolvePendingDispatchBudgetBinding({ commonDir, toolUseId: "toolu-mode-1", agentType: "pipeline-core:goldfish-deep" });
    assert.equal(resolved.code, "DBB-PENDING-BINDING-RESOLVED");
    assert.deepEqual(resolved.binding, { agentType: "goldfish-deep", baseCalls: 40, maxTurns: 50, effectiveCap: 35, commitMode: "native-host" });
    assert.equal(persistPendingDispatchBudgetBindings({ commonDir, toolUseId: "toolu-mode-1", bindings: [MODE_ROW] }).code, "DBB-PENDING-BINDING-CONFLICT");
    const { commitMode: dropped, ...withoutMode } = resolved.binding;
    assert.equal(dropped, "native-host");
    assert.equal(consumePendingDispatchBudgetBinding({ commonDir, toolUseId: "toolu-mode-1", agentType: "goldfish-deep", binding: withoutMode }).code, "DBB-PENDING-BINDING-CONFLICT");
    assert.equal(consumePendingDispatchBudgetBinding({ commonDir, toolUseId: "toolu-mode-1", agentType: "goldfish-deep", binding: resolved.binding }).code, "DBB-PENDING-BINDING-CONSUMED");

    assert.equal(persistPendingDispatchBudgetBindings({ commonDir, toolUseId: "toolu-mode-2", bindings: [MODE_ROW] }).code, "DBB-PENDING-BINDING-WRITTEN");
    const plain = resolvePendingDispatchBudgetBinding({ commonDir, toolUseId: "toolu-mode-2", agentType: "goldfish-deep" });
    assert.equal(plain.code, "DBB-PENDING-BINDING-RESOLVED");
    assert.equal(Object.hasOwn(plain.binding, "commitMode"), false);
    assert.equal(consumePendingDispatchBudgetBinding({ commonDir, toolUseId: "toolu-mode-2", agentType: "goldfish-deep", binding: { ...plain.binding, commitMode: "native-host" } }).code, "DBB-PENDING-BINDING-CONFLICT");
    assert.equal(consumePendingDispatchBudgetBinding({ commonDir, toolUseId: "toolu-mode-2", agentType: "goldfish-deep", binding: plain.binding }).code, "DBB-PENDING-BINDING-CONSUMED");
  } finally { rmSync(commonDir, { recursive: true, force: true }); }
});

check("refuses any commit mode other than native-host, before publication and as a stored row", () => {
  const commonDir = mkdtempSync(join(tmpdir(), "dispatch-budget-binding-foreign-"));
  try {
    for (const commitMode of ["host", "", null, true, 1, "Native-Host", "native-host ", {}]) {
      assert.equal(persistPendingDispatchBudgetBindings({ commonDir, toolUseId: "toolu-foreign", bindings: [{ ...MODE_ROW, commitMode }] }).code, "DBB-PENDING-BINDING-INVALID", String(commitMode));
    }
    writePendingFile(commonDir, "toolu-stored", {
      schema: "pipeline.pending-dispatch-budget-binding.v1", toolUseIdSha256: sha("toolu-stored"),
      bindings: [{ agentType: "goldfish-deep", baseCalls: 40, maxTurns: 50, effectiveCap: 35, commitMode: "other" }],
    });
    assert.equal(resolvePendingDispatchBudgetBinding({ commonDir, toolUseId: "toolu-stored", agentType: "goldfish-deep" }).code, "DBB-PENDING-BINDING-MALFORMED");
    assert.equal(consumePendingDispatchBudgetBinding({
      commonDir, toolUseId: "toolu-stored", agentType: "goldfish-deep", binding: { agentType: "goldfish-deep", baseCalls: 40, maxTurns: 50, effectiveCap: 35 },
    }).code, "DBB-PENDING-BINDING-MALFORMED");
  } finally { rmSync(commonDir, { recursive: true, force: true }); }
});

check("keeps a pending record written before the commit mode existed valid and unchanged", () => {
  const commonDir = mkdtempSync(join(tmpdir(), "dispatch-budget-binding-legacy-"));
  try {
    writePendingFile(commonDir, "toolu-legacy", {
      schema: "pipeline.pending-dispatch-budget-binding.v1", toolUseIdSha256: sha("toolu-legacy"),
      bindings: [{ agentType: "goldfish-implementor", baseCalls: 40, maxTurns: 50, effectiveCap: 35 }],
    });
    const resolved = resolvePendingDispatchBudgetBinding({ commonDir, toolUseId: "toolu-legacy", agentType: "goldfish-implementor" });
    assert.equal(resolved.code, "DBB-PENDING-BINDING-RESOLVED");
    assert.deepEqual(resolved.binding, { agentType: "goldfish-implementor", baseCalls: 40, maxTurns: 50, effectiveCap: 35 });
    assert.equal(consumePendingDispatchBudgetBinding({ commonDir, toolUseId: "toolu-legacy", agentType: "goldfish-implementor", binding: resolved.binding }).code, "DBB-PENDING-BINDING-CONSUMED");
    assert.equal(resolvePendingDispatchBudgetBinding({ commonDir, toolUseId: "toolu-legacy", agentType: "goldfish-implementor" }).code, "DBB-PENDING-BINDING-MISSING");
  } finally { rmSync(commonDir, { recursive: true, force: true }); }
});

assert.equal(cases.length, 11, "the complete dispatch budget binding corpus must register before execution");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd, maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
