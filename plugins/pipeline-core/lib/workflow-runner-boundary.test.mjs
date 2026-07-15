import assert from "node:assert/strict";
import { normalizeWorkflowRunnerOutcome, runSyntheticWorkflowDispatch, WORKFLOW_RUNNER_CODES } from "./workflow-runner-boundary.mjs";

let passed = 0;
const A = "a".repeat(64);
const B = "b".repeat(64);
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

const identity = { dispatchId: "dispatch-01", attemptId: "attempt-01" };
const expected = { identity, acknowledgedResultSha256: null };
const hostDiagnostic = { exitCode: 1, signal: null, stdoutBytes: 12, stderrBytes: 20, stdoutOverflow: false, stderrOverflow: false, tailSha256: A, capturedTailBytes: 32 };
const trustedHost = { structured: true, code: "host-sandbox-bootstrap-rejected", beforeProductStart: true, evidenceSha256: B, diagnostic: hostDiagnostic, calibration: null };
function observation(state, productVerdict = null, host = null) {
  return { identity: structuredClone(identity), state, productVerdict, host };
}
check("bounded running observation stays non-final", () => {
  const result = normalizeWorkflowRunnerOutcome(expected, observation("running"));
  assert.equal(result.code, "WR-OUTCOME-RUNNING"); assert.equal(result.faultDomain, "unknown");
});
check("completed without a delivered final remains retrievable", () => {
  assert.equal(normalizeWorkflowRunnerOutcome(expected, observation("completed")).code, "WR-OUTCOME-COMPLETED-UNDELIVERED");
  assert.equal(normalizeWorkflowRunnerOutcome(expected, observation("completed-but-undelivered")).code, "WR-OUTCOME-COMPLETED-UNDELIVERED");
});
check("schema-valid succeeded final exposes only its digest", () => {
  const result = normalizeWorkflowRunnerOutcome(expected, observation("completed", { schemaValid: true, outcome: "succeeded", resultSha256: A }));
  assert.equal(result.code, "WR-OUTCOME-FINAL"); assert.equal(result.resultSha256, A); assert.equal(result.faultDomain, "unknown");
});
check("already acknowledged digest is a duplicate", () => {
  const result = normalizeWorkflowRunnerOutcome({ ...expected, acknowledgedResultSha256: A }, observation("completed", { schemaValid: true, outcome: "succeeded", resultSha256: A }));
  assert.equal(result.code, "WR-OUTCOME-DUPLICATE");
});
check("different digest after acknowledgement is a null-final conflict", () => {
  const result = normalizeWorkflowRunnerOutcome({ ...expected, acknowledgedResultSha256: B }, observation("completed", { schemaValid: true, outcome: "succeeded", resultSha256: A }));
  assert.equal(result.ok, false); assert.equal(result.code, "WR-OUTCOME-CONFLICT"); assert.equal(result.resultSha256, null);
});
check("mismatched dispatch identity is stale and null-final", () => {
  const input = observation("completed", { schemaValid: true, outcome: "succeeded", resultSha256: A });
  input.identity.dispatchId = "dispatch-old";
  const result = normalizeWorkflowRunnerOutcome(expected, input);
  assert.equal(result.code, "WR-OUTCOME-STALE"); assert.equal(result.resultSha256, null);
});
check("schema-valid failed product result wins over trusted host evidence", () => {
  const result = normalizeWorkflowRunnerOutcome(expected, observation("failed", { schemaValid: true, outcome: "failed", resultSha256: A }, trustedHost));
  assert.equal(result.code, "WR-OUTCOME-PRODUCT-FAILED"); assert.equal(result.faultDomain, "product");
  assert.equal(result.environmentCapture, null);
});
check("trusted pre-start host evidence classifies environment", () => {
  const result = normalizeWorkflowRunnerOutcome(expected, observation("failed", null, trustedHost));
  assert.equal(result.code, "WR-OUTCOME-ENVIRONMENT-FAILED"); assert.equal(result.faultDomain, "execution-environment");
  assert.deepEqual(result.environmentCapture, {
    code: "host-sandbox-bootstrap-rejected",
    evidenceSha256: B,
    diagnostic: {
      exitCode: 1, signal: null, observedBytes: 32, boundedTailSha256: A,
      capturedTailBytes: 32, tailOverflow: false,
    },
  });
});
check("environment capture retains bounded overflow evidence but no raw host text", () => {
  const overflowed = structuredClone(trustedHost);
  overflowed.diagnostic.stdoutOverflow = true;
  overflowed.diagnostic.stderrBytes = 21;
  const result = normalizeWorkflowRunnerOutcome(expected, observation("failed", null, overflowed));
  assert.equal(result.environmentCapture.diagnostic.observedBytes, 33);
  assert.equal(result.environmentCapture.diagnostic.tailOverflow, true);
  assert.equal(JSON.stringify(result.environmentCapture).includes("stderr"), false);
  assert.equal(JSON.stringify(result.environmentCapture).includes("sandbox failed"), false);
});
check("unsafe aggregate host byte counts fail closed without a recovery capture", () => {
  const oversized = structuredClone(trustedHost);
  oversized.diagnostic.stdoutBytes = Number.MAX_SAFE_INTEGER;
  oversized.diagnostic.stderrBytes = 1;
  const result = normalizeWorkflowRunnerOutcome(expected, observation("failed", null, oversized));
  assert.equal(result.ok, false);
  assert.equal(result.code, "WR-OUTCOME-SCHEMA");
  assert.equal(result.faultDomain, "unknown");
  assert.equal(result.environmentCapture, null);
});
check("timeout and free-text-like host data remain unknown", () => {
  const result = normalizeWorkflowRunnerOutcome(expected, observation("failed", null, { timeout: true, exitCode: 1, stderr: "sandbox failed" }));
  assert.equal(result.code, "WR-OUTCOME-UNKNOWN-FAILED"); assert.equal(result.faultDomain, "unknown");
  assert.equal(result.environmentCapture, null);
});
check("trusted code without bounded diagnostic remains unknown", () => {
  const result = normalizeWorkflowRunnerOutcome(expected, observation("failed", null, { ...trustedHost, diagnostic: null }));
  assert.equal(result.code, "WR-OUTCOME-UNKNOWN-FAILED");
});
check("schema-valid successful result can never become environment failure", () => {
  const result = normalizeWorkflowRunnerOutcome(expected, observation("completed", { schemaValid: true, outcome: "succeeded", resultSha256: A }, trustedHost));
  assert.equal(result.code, "WR-OUTCOME-FINAL"); assert.notEqual(result.faultDomain, "execution-environment");
  assert.equal(result.environmentCapture, null);
});
check("calibrated transport evidence requires its complete fresh predicate", () => {
  const calibrated = {
    ...trustedHost,
    code: "host-sandbox-calibrated-transport-failure",
    calibration: { fresh: false, exactHostCliVersionPrimitive: true, identicalControlDigests: true, liveSignatureMatched: true, receiptSha256: A },
  };
  assert.equal(normalizeWorkflowRunnerOutcome(expected, observation("failed", null, calibrated)).code, "WR-OUTCOME-UNKNOWN-FAILED");
  calibrated.calibration.fresh = true;
  assert.equal(normalizeWorkflowRunnerOutcome(expected, observation("failed", null, calibrated)).code, "WR-OUTCOME-ENVIRONMENT-FAILED");
});
check("raw result fields and malformed final combinations fail closed", () => {
  const raw = observation("completed", { schemaValid: true, outcome: "succeeded", resultSha256: A });
  raw.productVerdict.raw = "forbidden";
  assert.equal(normalizeWorkflowRunnerOutcome(expected, raw).code, "WR-OUTCOME-SCHEMA");
  assert.equal(normalizeWorkflowRunnerOutcome(expected, observation("running", { schemaValid: true, outcome: "succeeded", resultSha256: A })).code, "WR-OUTCOME-SCHEMA");
  const runningWithHostEvidence = normalizeWorkflowRunnerOutcome(expected, observation("running", null, trustedHost));
  assert.equal(runningWithHostEvidence.ok, false); assert.equal(runningWithHostEvidence.code, "WR-OUTCOME-SCHEMA");
  assert.equal(runningWithHostEvidence.faultDomain, "unknown"); assert.equal(runningWithHostEvidence.resultSha256, null);
  assert.equal(runningWithHostEvidence.environmentCapture, null);
});
process.stdout.write(`1..${passed}\n# pass ${passed}\n`);
