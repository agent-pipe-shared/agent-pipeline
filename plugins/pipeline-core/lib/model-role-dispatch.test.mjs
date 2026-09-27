// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { openSync } from "node:fs";
import { bindModelRoleTaskDispatch } from "./model-role-dispatch.mjs";
import { resolveModelRoleSession } from "./model-role-session.mjs";
import { registeredFunctionalTaskRoutes } from "./model-role-route-source.mjs";
import { registerTestCaseCompletion } from "./test-case-completion.mjs";

const cases = [];
function test(name, run) { cases.push({ id: `MRD${String(cases.length + 1).padStart(2, "0")}`, name, run }); }

const source = registeredFunctionalTaskRoutes();
const route = source.taskRoutes.find((entry) => entry.taskRoute === "duty.implement" && entry.runner === "codex");
const selected = resolveModelRoleSession({
  runner: "codex", role: route.role, effort: route.effort,
  sessionId: "host-session-1", candidateCommit: "a".repeat(40),
  observedAt: "2026-09-26T00:00:00.000Z",
  policy: { schema: "pipeline.model-role-policy.v1", runner: "codex", role: route.role,
    approved: [{ modelId: "gpt-6-luna", rank: 1, efforts: [route.effort],
      compatibilityEvidenceSha256: "b".repeat(64) }] },
  availableModelIds: ["gpt-6-luna"],
});
const admitted = { ok: true, code: "MODEL-ROLE-BOOTSTRAP-ADMITTED",
  readbackSha256: "c".repeat(64), receiptSha256s: [selected.receipt.receiptSha256] };
const base = { taskRoute: "duty.implement", runner: "codex", sessionId: "host-session-1",
  requestedModel: "gpt-6-luna", admission: admitted, receipt: selected.receipt, routeSource: source };

test("governed task dispatch binds the exact selected model and receipt", () => {
  assert.equal(source.ok, true);
  assert.equal(selected.ok, true);
  const result = bindModelRoleTaskDispatch(base);
  assert.equal(result.ok, true);
  assert.equal(result.modelId, "gpt-6-luna");
  assert.equal(result.role, "worker");
  assert.equal(result.receiptSha256, selected.receipt.receiptSha256);
});

test("unadmitted, different-session and different-model dispatches fail closed", () => {
  assert.equal(bindModelRoleTaskDispatch({ ...base, admission: null }).code, "MODEL-ROLE-DISPATCH-NOT-ADMITTED");
  assert.equal(bindModelRoleTaskDispatch({ ...base, requestedModel: "gpt-6-sol" }).code, "MODEL-ROLE-DISPATCH-MISMATCH");
  assert.equal(bindModelRoleTaskDispatch({ ...base, sessionId: "other" }).code, "MODEL-ROLE-DISPATCH-MISMATCH");
  assert.equal(bindModelRoleTaskDispatch({ ...base, admission: { ...admitted,
    receiptSha256s: [] } }).code, "MODEL-ROLE-DISPATCH-NOT-ADMITTED");
});

test("unknown and unavailable task routes fail before a model launch", () => {
  assert.equal(bindModelRoleTaskDispatch({ ...base, taskRoute: "duty.unknown" }).code,
    "MODEL-ROLE-DISPATCH-ROUTE-UNKNOWN");
  const unavailable = structuredClone(source);
  unavailable.taskRoutes.find((entry) => entry.taskRoute === "duty.implement" && entry.runner === "codex").state = "unavailable";
  assert.equal(bindModelRoleTaskDispatch({ ...base, routeSource: unavailable }).code,
    "MODEL-ROLE-DISPATCH-ROUTE-UNAVAILABLE");
});

assert.equal(cases.length, 3);
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: cases, fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536") });
