// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { coordinateWorkflowRunnerReturn, normalizeWorkflowRunnerOutcome, runSyntheticWorkflowDispatch, runSyntheticWorkflowDispatchBatch, WORKFLOW_RUNNER_CODES } from "./workflow-runner-boundary.mjs";
import { gitDeps, verifyCommit } from "../scripts/dispatch-authorship-verify.mjs";
import { writeDispatchRecord } from "../scripts/dispatch-record-write.mjs";

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

function batchDispatch(mode, paths) {
  const input = dispatch(mode);
  input.request.allowedPaths = paths;
  return input;
}

check("the complete batch rejects normalized write overlap before any adapter invocation", () => {
  for (const [leftPath, rightPath] of [["src/a", "./src//a/"], ["src", "src\\a"], ["src/a", "src"]]) {
    const fake = fakeAdapter();
    const result = runSyntheticWorkflowDispatchBatch([
      batchDispatch("bounded-write", ["unrelated"]),
      batchDispatch("isolated-write", [leftPath]),
      batchDispatch("read-only", ["src"]),
      batchDispatch("bounded-write", [rightPath]),
    ], fake.adapter);
    assert.deepEqual(result, { ok: false, code: "WR-WF-SCOPE-OVERLAP", mode: "batch", adapterInvocations: 0 });
    assert.equal(fake.calls(), 0);
  }
});

check("a disjoint batch and overlapping read-only members invoke each adapter with normalized copied scopes", () => {
  const inputs = [
    batchDispatch("bounded-write", ["./src//a/", "src/a"]),
    batchDispatch("isolated-write", ["src\\ab"]),
    batchDispatch("read-only", ["src"]),
    batchDispatch("read-only", ["src"]),
  ];
  const before = structuredClone(inputs);
  const observed = [];
  const adapter = { capabilities: { noRemote: true, noCredentials: true, noFetch: true }, invoke(input) { observed.push(input); } };
  assert.deepEqual(runSyntheticWorkflowDispatchBatch(inputs, adapter), {
    ok: true, code: "WR-ACCEPTED", mode: "batch", adapterInvocations: 4,
  });
  assert.deepEqual(observed.map((input) => input.allowedPaths), [["src/a"], ["src/ab"], ["src"], ["src"]]);
  assert.deepEqual(inputs, before);
  assert.notEqual(observed[0], inputs[0].request);
});

check("batch schemas and every member capability are checked before the first adapter call", () => {
  for (const [name, mutate, code] of [
    ["unknown envelope key", (d) => { d.extra = true; }, "WR-SCHEMA"],
    ["unknown request key", (d) => { d.request.extra = true; }, "WR-SCHEMA"],
    ["unknown nested key", (d) => { d.request.guard.extra = true; }, "WR-SCHEMA"],
    ["unknown capability", (d) => { d.capabilities.extra = true; }, "WR-SCHEMA"],
    ["transport-bearing member", (d) => { d.request.verify.command = "curl https://example.test"; }, "WR-SCHEMA"],
    ["missing isolation capability", (d) => { d.capabilities.isolatedWorktree = false; }, "WR-WF-ISOLATED-CAPABILITY"],
    ["unsafe path", (d) => { d.request.allowedPaths = ["src/../tests"]; }, "WR-WF-PATHS"],
  ]) {
    const fake = fakeAdapter();
    const second = batchDispatch("isolated-write", ["tests"]);
    mutate(second);
    const result = runSyntheticWorkflowDispatchBatch([batchDispatch("bounded-write", ["src"]), second], fake.adapter);
    assert.equal(result.code, code, name);
    assert.equal(result.adapterInvocations, 0, name);
    assert.equal(fake.calls(), 0, name);
  }
  const fake = fakeAdapter();
  fake.adapter.capabilities.noRemote = false;
  assert.equal(runSyntheticWorkflowDispatchBatch([dispatch()], fake.adapter).code, "WR-ADAPTER-CAPABILITY");
  for (const malformed of [null, [], {}, [null], new Array(2)]) {
    assert.equal(runSyntheticWorkflowDispatchBatch(malformed, fake.adapter).ok, false);
  }
  assert.equal(fake.calls(), 0);
});

check("earlier adapter calls cannot change the admitted later scopes through caller-owned references", () => {
  const first = batchDispatch("bounded-write", ["src/a"]);
  const second = batchDispatch("bounded-write", ["src/b"]);
  first.request.guard = second.request.guard;
  let calls = 0;
  const adapter = {
    capabilities: { noRemote: true, noCredentials: true, noFetch: true },
    invoke(input) {
      calls += 1;
      if (calls === 1) {
        second.request.allowedPaths = ["src/a"];
        input.guard.active = false;
        adapter.invoke = () => { throw new Error("replacement invoke must not run"); };
      } else {
        assert.deepEqual(input.allowedPaths, ["src/b"]);
        assert.equal(input.guard.active, true);
      }
    },
  };
  assert.equal(runSyntheticWorkflowDispatchBatch([first, second], adapter).ok, true);
  assert.equal(calls, 2);
});

check("batch adapter failure stops the remainder and reports actual calls without leaking the error", () => {
  let calls = 0;
  const adapter = {
    capabilities: { noRemote: true, noCredentials: true, noFetch: true },
    invoke() { calls += 1; if (calls === 2) throw new Error("private adapter failure"); },
  };
  const result = runSyntheticWorkflowDispatchBatch([
    batchDispatch("bounded-write", ["a"]), batchDispatch("bounded-write", ["b"]), batchDispatch("bounded-write", ["c"]),
  ], adapter);
  assert.deepEqual(result, { ok: false, code: "WR-ADAPTER-FAILED", mode: "batch", adapterInvocations: 2 });
  assert.equal(calls, 2);
});

const identity = { dispatchId: "P5B-RETURN-1", attemptId: "attempt-01" };
const expected = { identity, acknowledgedResultSha256: null };
const recordExpected = { ...expected, taskId: "P5B-RETURN-1", candidateCommit: "c".repeat(40) };
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

check("final native return writes canonical v3 evidence and passes authorship verification", () => {
  const root = mkdtempSync(join(tmpdir(), "workflow-return-record-"));
  try {
    mkdirSync(join(root, "evidence")); mkdirSync(join(root, "requests")); mkdirSync(join(root, "src"));
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Workflow Test"], { cwd: root });
    execFileSync("git", ["config", "user.email", "workflow@example.test"], { cwd: root });
    writeFileSync(join(root, "src", "x.mjs"), "export const x = 1;\n");
    execFileSync("git", ["add", "src/x.mjs"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "feat(test): workflow result\n\nDispatch: P5B-RETURN-1 (goldfish)\nAI-Assisted: true"], { cwd: root });
    const candidateCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    const requestPath = "requests/dispatch-return.json";
    const record = {
      schema: "pipeline.dispatch-record.v3", taskId: "P5B-RETURN-1",
      agentType: "goldfish-implementor", model: "claude-sonnet-5", effort: "medium",
      rulesetSha: "0.6.2+local", dispatcher: "Elephant", candidateCommit, resultSha256: A,
      outcome: "completed", commits: [candidateCommit], log: [{ phase: "done", toolUseCount: 4 }],
      report: { text: "Workflow dispatch completed.", changedFiles: ["src/x.mjs"] },
      criticSkip: {
        schema: "pipeline.critic-skip-decision.v1",
        trigger: {
          schema: "pipeline.critic-trigger-input.v1",
          rigorLevel: 0,
          riskClass: "low",
          riskFlag: false,
          diff: { mechanical: false, architecture: false, guardrails: false, security: false },
        },
        appliedRow: "T5",
        reason: "fixture exercises the no-Critic disposition",
      },
    };
    writeFileSync(join(root, requestPath), `${JSON.stringify({
      schema: "pipeline.dispatch-record-write-request.v1",
      target: "evidence/dispatch-record-P5B-RETURN-1.json",
      record,
    })}\n`);
    const finalObservation = observation("completed", { schemaValid: true, outcome: "succeeded", resultSha256: A });
    const result = coordinateWorkflowRunnerReturn({ ...recordExpected, candidateCommit }, finalObservation, {
      identity, taskId: "P5B-RETURN-1", resultSha256: A, candidateCommit, requestPath,
    }, {
      writeDispatchRecord: ({ requestPath: path }) => writeDispatchRecord({ repoRoot: root, requestPath: path }),
      verifyCommit: (sha) => verifyCommit(sha, gitDeps({ repoRoot: root, evidenceDir: join(root, "evidence") })),
    });
    assert.equal(result.ok, true); assert.equal(result.code, "WR-OUTCOME-FINAL-RECORDED");
    assert.equal(result.record.authorship, "bound"); assert.equal(result.adapterInvocations, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("return coordinator rejects stale bindings before record I/O", () => {
  let calls = 0;
  const result = coordinateWorkflowRunnerReturn(recordExpected,
    observation("completed", { schemaValid: true, outcome: "succeeded", resultSha256: A }), {
      identity, taskId: "P5B-RETURN-1", resultSha256: B, candidateCommit: "c".repeat(40), requestPath: "requests/write.json",
    }, { writeDispatchRecord() { calls += 1; }, verifyCommit() { calls += 1; } });
  assert.equal(result.code, "WR-RECORD-BINDING"); assert.equal(result.adapterInvocations, 0); assert.equal(calls, 0);
});

check("task and candidate mismatches against dispatch-time authority fail before record I/O", () => {
  const finalObservation = observation("completed", { schemaValid: true, outcome: "succeeded", resultSha256: A });
  for (const completion of [
    { identity, taskId: "FOREIGN-TASK", resultSha256: A, candidateCommit: "c".repeat(40), requestPath: "requests/write.json" },
    { identity, taskId: "P5B-RETURN-1", resultSha256: A, candidateCommit: "e".repeat(40), requestPath: "requests/write.json" },
  ]) {
    let calls = 0;
    const result = coordinateWorkflowRunnerReturn(recordExpected, finalObservation, completion, {
      writeDispatchRecord() { calls += 1; }, verifyCommit() { calls += 1; },
    });
    assert.equal(result.code, "WR-RECORD-BINDING"); assert.equal(result.adapterInvocations, 0); assert.equal(calls, 0);
  }
});

check("written task, candidate and result digest must exactly match the validated return", () => {
  const finalObservation = observation("completed", { schemaValid: true, outcome: "succeeded", resultSha256: A });
  const completion = { identity, taskId: "P5B-RETURN-1", resultSha256: A, candidateCommit: "c".repeat(40), requestPath: "requests/write.json" };
  const baseReceipt = {
    schema: "pipeline.dispatch-record-write-receipt.v1", target: "evidence/dispatch-record-P5B-RETURN-1.json",
    sha256: B, bytes: 300, taskId: completion.taskId, candidateCommit: completion.candidateCommit, resultSha256: A,
  };
  const authorship = {
    sha: completion.candidateCommit, verdict: "PASS", classification: "bound", reason: "bound",
    taskId: completion.taskId, modelCheck: { classification: "model-matches", reason: "matches" },
  };
  for (const receipt of [
    { ...baseReceipt, taskId: "FOREIGN-TASK", target: "evidence/dispatch-record-FOREIGN-TASK.json" },
    { ...baseReceipt, candidateCommit: "e".repeat(40) },
    { ...baseReceipt, resultSha256: "f".repeat(64) },
    { ...baseReceipt, target: "other/evidence/dispatch-record-P5B-RETURN-1.json" },
  ]) {
    const result = coordinateWorkflowRunnerReturn(recordExpected, finalObservation, completion, {
      writeDispatchRecord: () => receipt, verifyCommit: () => authorship,
    });
    assert.equal(result.ok, false); assert.equal(result.code, "WR-RECORD-UNVERIFIED");
  }
});

check("non-final and duplicate native returns never invoke record I/O", () => {
  let calls = 0;
  const adapter = { writeDispatchRecord() { calls += 1; }, verifyCommit() { calls += 1; } };
  const completion = { identity, taskId: "P5B-RETURN-1", resultSha256: A, candidateCommit: "c".repeat(40), requestPath: "requests/write.json" };
  const running = coordinateWorkflowRunnerReturn(recordExpected, observation("running"), completion, adapter);
  assert.equal(running.code, "WR-OUTCOME-RUNNING"); assert.equal(running.adapterInvocations, 0);
  const duplicate = coordinateWorkflowRunnerReturn({ ...recordExpected, acknowledgedResultSha256: A },
    observation("completed", { schemaValid: true, outcome: "succeeded", resultSha256: A }), completion, adapter);
  assert.equal(duplicate.code, "WR-OUTCOME-DUPLICATE"); assert.equal(duplicate.adapterInvocations, 0);
  assert.equal(calls, 0);
});

check("return coordinator never reports success when post-write authorship is not bound", () => {
  const finalObservation = observation("completed", { schemaValid: true, outcome: "succeeded", resultSha256: A });
  const result = coordinateWorkflowRunnerReturn(recordExpected, finalObservation, {
    identity, taskId: "P5B-RETURN-1", resultSha256: A, candidateCommit: "c".repeat(40), requestPath: "requests/write.json",
  }, {
    writeDispatchRecord: () => ({ schema: "pipeline.dispatch-record-write-receipt.v1", target: "evidence/dispatch-record-P5B-RETURN-1.json", sha256: B, bytes: 300, taskId: "P5B-RETURN-1", candidateCommit: "c".repeat(40), resultSha256: A }),
    verifyCommit: (sha) => ({ sha, verdict: "FAIL", classification: "record-paths-do-not-cover", reason: "not bound", taskId: "P5B-RETURN-1" }),
  });
  assert.equal(result.ok, false); assert.equal(result.code, "WR-RECORD-UNVERIFIED");
  assert.equal(result.record.authorship, "unverified"); assert.equal(result.adapterInvocations, 2);
});

check("authorship result admits absent or valid optional orchestrator paths and rejects malformed presence", () => {
  const finalObservation = observation("completed", { schemaValid: true, outcome: "succeeded", resultSha256: A });
  const completion = { identity, taskId: "P5B-RETURN-1", resultSha256: A, candidateCommit: "c".repeat(40), requestPath: "requests/write.json" };
  const receipt = { schema: "pipeline.dispatch-record-write-receipt.v1", target: "evidence/dispatch-record-P5B-RETURN-1.json", sha256: B, bytes: 300, taskId: "P5B-RETURN-1", candidateCommit: completion.candidateCommit, resultSha256: A };
  const authorship = {
    sha: completion.candidateCommit, verdict: "PASS", classification: "bound", reason: "bound",
    taskId: "P5B-RETURN-1", modelCheck: { classification: "model-matches", reason: "matches" },
  };
  const run = (override) => coordinateWorkflowRunnerReturn(recordExpected, finalObservation, completion, {
    writeDispatchRecord: () => receipt,
    verifyCommit: () => ({ ...authorship, ...override }),
  });
  assert.equal(run({}).code, "WR-OUTCOME-FINAL-RECORDED", "optional field absent");
  assert.equal(run({ orchestratorAddedFiles: ["docs/note.md"] }).code, "WR-OUTCOME-FINAL-RECORDED", "valid optional field present");
  assert.equal(run({ orchestratorAddedFiles: ["docs/note.md", "docs/note.md"] }).code, "WR-RECORD-UNVERIFIED", "duplicates rejected");
  assert.equal(run({ orchestratorAddedFiles: ["../private.txt"] }).code, "WR-RECORD-UNVERIFIED", "non-repository path rejected");
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
