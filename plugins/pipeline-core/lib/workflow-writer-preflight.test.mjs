import assert from "node:assert/strict";
import {
  validateWorkflowWriterDispatch,
  WORKFLOW_WRITER_PREFLIGHT_CODES,
} from "./workflow-writer-preflight.mjs";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`ok ${passed} - ${name}\n`);
}

const calibration = {
  isolationByMode: { "read-only": "sandbox", "bounded-write": "project-boundary", "isolated-write": "worktree" },
  boundedWriteAllowed: true,
  boundedWriteControls: ["guard", "path-boundary", "adapter-enforced"],
  verifyEntrypoints: ["full-verify"],
};
const capabilities = {
  isolation: { sandbox: true, "project-boundary": true, worktree: true },
  guards: { "git-guard": true }, hooks: { "git-guard": true },
  noWriteEnforced: true, isolatedWorktree: true,
  boundedWriteControls: { guard: true, "path-boundary": true, "adapter-enforced": true },
};
function request(mode = "bounded-write") {
  return {
    taskId: "P5-01", mode,
    sideEffects: { filesystem: { "read-only": "none", "bounded-write": "bounded", "isolated-write": "isolated" }[mode], network: "none" },
    allowedPaths: ["plugins/pipeline-core/lib/workflow-writer-preflight.mjs"],
    isolation: { kind: calibration.isolationByMode[mode], verified: true },
    guard: { id: "git-guard", active: true, modes: [mode] },
    commandAllowlist: [{ id: "verify", taskId: "P5-01", command: "node plugins/pipeline-core/lib/workflow-writer-preflight.test.mjs" }],
    verify: { entrypoint: "full-verify", exact: true }, escalationTarget: "PO",
  };
}

for (const mode of ["read-only", "bounded-write", "isolated-write"]) {
  check(`${mode} accepts complete matching capability evidence`, () => assert.equal(validateWorkflowWriterDispatch(request(mode), calibration, capabilities).ok, true));
}
check("read-only rejects intent without enforced no-write capability", () => {
  assert.equal(validateWorkflowWriterDispatch(request("read-only"), calibration, { ...capabilities, noWriteEnforced: false }).code, "WF-NO-WRITE");
});
check("bounded-write rejects when PO/calibration does not permit it", () => {
  assert.equal(validateWorkflowWriterDispatch(request(), { ...calibration, boundedWriteAllowed: false }, capabilities).code, "WF-BOUNDED-CAPABILITY");
});
check("bounded-write rejects incomplete calibrated controls", () => {
  assert.equal(validateWorkflowWriterDispatch(request(), calibration, { ...capabilities, boundedWriteControls: { guard: true } }).code, "WF-BOUNDED-CAPABILITY");
});
check("isolated-write requires hook as well as worktree", () => {
  assert.equal(validateWorkflowWriterDispatch(request("isolated-write"), calibration, { ...capabilities, hooks: {} }).code, "WF-ISOLATED-CAPABILITY");
});
for (const [name, mutate, code] of [
  ["unknown mode", (r) => { r.mode = "write"; }, "WF-MODE"],
  ["missing side effects", (r) => { r.sideEffects = {}; }, "WF-SIDE-EFFECTS"],
  ["absolute path", (r) => { r.allowedPaths = ["/tmp/x"]; }, "WF-PATHS"],
  ["traversal path", (r) => { r.allowedPaths = ["a/../b"]; }, "WF-PATHS"],
  ["duplicate path", (r) => { r.allowedPaths.push(r.allowedPaths[0]); }, "WF-PATHS"],
  ["unverified isolation", (r) => { r.isolation.verified = false; }, "WF-ISOLATION"],
  ["inactive guard", (r) => { r.guard.active = false; }, "WF-GUARD"],
  ["broad allowlist", (r) => { r.commandAllowlist[0].command = "node *"; }, "WF-ALLOWLIST"],
  ["inexact verify", (r) => { r.verify.exact = false; }, "WF-VERIFY"],
  ["missing escalation", (r) => { r.escalationTarget = ""; }, "WF-ESCALATION"],
]) {
  check(`${name} rejects`, () => {
    const input = request(); mutate(input);
    assert.equal(validateWorkflowWriterDispatch(input, calibration, capabilities).code, code);
  });
}
check("arbitrary escalation target rejects as non-log-safe", () => {
  const input = request(); input.escalationTarget = "operator@example.test";
  assert.equal(validateWorkflowWriterDispatch(input, calibration, capabilities).code, "WF-ESCALATION");
});
check("safe code vocabulary has no dynamic values", () => {
  assert.equal(WORKFLOW_WRITER_PREFLIGHT_CODES.every((code) => /^WF-[A-Z0-9-]+$/.test(code)), true);
});
process.stdout.write(`1..${passed}\n# pass ${passed}\n`);
