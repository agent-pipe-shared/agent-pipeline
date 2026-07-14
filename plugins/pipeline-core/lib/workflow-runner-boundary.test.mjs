import assert from "node:assert/strict";
import { runSyntheticWorkflowDispatch, WORKFLOW_RUNNER_CODES } from "./workflow-runner-boundary.mjs";

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
function dispatch(mode = "bounded-write") {
  return {
    request: {
      taskId: "P5B-01", mode,
      sideEffects: { filesystem: { "read-only": "none", "bounded-write": "bounded", "isolated-write": "isolated" }[mode], network: "none" },
      allowedPaths: ["plugins/pipeline-core/lib/workflow-runner-boundary.mjs"],
      isolation: { kind: calibration.isolationByMode[mode], verified: true },
      guard: { id: "git-guard", active: true, modes: [mode] },
      commandAllowlist: [{ id: "verify", taskId: "P5B-01", command: "node plugins/pipeline-core/lib/workflow-runner-boundary.test.mjs" }],
      verify: { entrypoint: "full-verify", exact: true }, escalationTarget: "PO",
    },
    calibration: structuredClone(calibration), capabilities: structuredClone(capabilities),
  };
}
function fakeAdapter() {
  let calls = 0;
  return {
    adapter: {
      capabilities: { noRemote: true, noCredentials: true, noFetch: true },
      invoke(request) { calls += 1; return { ignored: request.taskId }; },
    },
    calls: () => calls,
  };
}

for (const mode of ["read-only", "bounded-write", "isolated-write"]) {
  check(`${mode} reaches the fake adapter exactly once after P5`, () => {
    const fake = fakeAdapter();
    const result = runSyntheticWorkflowDispatch(dispatch(mode), fake.adapter);
    assert.deepEqual(result, { ok: true, code: "WR-ACCEPTED", mode, adapterInvocations: 1 });
    assert.equal(fake.calls(), 1);
  });
}
for (const [name, mutate, code] of [
  ["unknown top-level transport object", (d) => { d.transport = {}; }, "WR-SCHEMA"],
  ["nested remote field", (d) => { d.request.verify.remote_url = "x"; }, "WR-SCHEMA"],
  ["credential-shaped field", (d) => { d.request.token = "x"; }, "WR-SCHEMA"],
  ["provider-shaped field", (d) => { d.capabilities.provider = "x"; }, "WR-SCHEMA"],
  ["nested source reference", (d) => { d.request.verify.command = "curl https://example.test"; }, "WR-SCHEMA"],
  ["unknown nested object", (d) => { d.request.sideEffects.extra = {}; }, "WR-SCHEMA"],
  ["P5 reject", (d) => { d.capabilities.boundedWriteControls = { guard: true }; }, "WR-WF-BOUNDED-CAPABILITY"],
]) {
  check(`${name} rejects with no adapter invocation`, () => {
    const fake = fakeAdapter();
    const input = dispatch(); mutate(input);
    const result = runSyntheticWorkflowDispatch(input, fake.adapter);
    assert.equal(result.ok, false); assert.equal(result.code, code); assert.equal(result.adapterInvocations, 0); assert.equal(fake.calls(), 0);
  });
}
for (const [name, mutate] of [
  ["missing no-remote", (a) => { a.capabilities.noRemote = false; }],
  ["missing no-credentials", (a) => { a.capabilities.noCredentials = false; }],
  ["missing no-fetch", (a) => { a.capabilities.noFetch = false; }],
  ["unknown adapter capability", (a) => { a.capabilities.remote = false; }],
]) {
  check(`${name} rejects adapter before invocation`, () => {
    const fake = fakeAdapter(); mutate(fake.adapter);
    const result = runSyntheticWorkflowDispatch(dispatch(), fake.adapter);
    assert.equal(result.code, "WR-ADAPTER-CAPABILITY"); assert.equal(result.adapterInvocations, 0); assert.equal(fake.calls(), 0);
  });
}
check("runner code vocabulary is static and log-safe", () => {
  assert.equal(WORKFLOW_RUNNER_CODES.every((code) => /^WR-[A-Z0-9-]+$/.test(code)), true);
});
check("adapter exception is reduced to a log-safe single-call outcome", () => {
  const fake = fakeAdapter();
  fake.adapter.invoke = () => { throw new Error("secret-shaped adapter error"); };
  const result = runSyntheticWorkflowDispatch(dispatch(), fake.adapter);
  assert.deepEqual(result, { ok: false, code: "WR-ADAPTER-FAILED", mode: "bounded-write", adapterInvocations: 1 });
});
process.stdout.write(`1..${passed}\n# pass ${passed}\n`);
