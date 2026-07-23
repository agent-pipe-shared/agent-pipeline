// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  computeWorkflowEnvironmentEvidenceSha256,
  computeWorkflowNarrowingContractSha256,
  computeWorkflowRouteRequestSha256,
  deriveWorkflowFailoverIds,
  preflightAndInvokeWorkflowWriterDispatch,
  validateWorkflowWriterDispatch,
  WORKFLOW_WRITER_ASSURANCE,
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
  const result = validateWorkflowWriterDispatch(input, calibration, capabilities);
  assert.equal(result.code, "WF-ESCALATION");
  assert.equal(Object.hasOwn(result, "escalationTarget"), false);
});
check("legacy path preserves unsorted paths, extensible command entries and non-SAFE task ids", () => {
  const input = request();
  input.taskId = "legacy task/id";
  input.allowedPaths = ["z/path", "a/path"];
  input.commandAllowlist[0] = {
    ...input.commandAllowlist[0], taskId: input.taskId, legacyMetadata: "retained",
  };
  assert.equal(validateWorkflowWriterDispatch(input, calibration, capabilities).ok, true);
});
check("unknown schema metadata does not auto-route a legacy envelope", () => {
  const input = { ...request(), schema: "legacy.extension.v1" };
  assert.equal(validateWorkflowWriterDispatch(input, calibration, capabilities).ok, true);
});
check("legacy isolation marker is projected only with the OS-isolation non-claim", () => {
  assert.equal(validateWorkflowWriterDispatch(request(), calibration, capabilities).assurance, WORKFLOW_WRITER_ASSURANCE);
});

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);
const E = "e".repeat(64);
const FEATURE = "v0.3-phase2.6-sdlc-throughput-hardening";
const phase26Calibration = {
  schema: "pipeline.workflow-preflight-calibration.v0",
  preflightOwnerDuty: "Coordinator",
  verifyEntrypoints: ["full-verify"],
};
const phase26Capabilities = {
  schema: "pipeline.workflow-preflight-capabilities.v0",
  contractualPathBoundary: true,
  noWriteEnforced: true,
  idempotentDispatchKeys: true,
  availableRecoverySlots: 1,
};

function phase26Request(overrides = {}) {
  return {
    schema: "pipeline.workflow-dispatch.v0",
    actorDuty: "Implementer",
    taskId: "P1-preflight",
    mode: "bounded-write",
    sideEffects: { filesystem: "bounded", network: "none" },
    pathAllowlist: {
      read: ["inputs/task.json", "specs/prd.md"],
      write: ["plugins/pipeline-core/lib/workflow-writer-preflight.mjs"],
    },
    commandAllowlist: [{
      id: "focused-test",
      taskId: "P1-preflight",
      command: "node plugins/pipeline-core/lib/workflow-writer-preflight.test.mjs",
    }],
    verify: { entrypoint: "full-verify", exact: true },
    escalationTarget: "PO",
    continuityBinding: {
      featureId: FEATURE,
      queueRevision: 7,
      packageId: "P1",
      actionId: "workflow-preflight",
      dispatchId: "dispatch-p1-preflight",
      attemptId: "attempt-01",
      authorityDigests: { prdSha256: A, specSha256: B, resultSha256: C },
      routeRequestSha256: D,
    },
    assurance: { statement: WORKFLOW_WRITER_ASSURANCE, osIsolationAsserted: false },
    failover: null,
    ...overrides,
  };
}

function bindRoute(input) {
  input.continuityBinding.routeRequestSha256 = computeWorkflowRouteRequestSha256(input);
  return input;
}

function phase26State(input, overrides = {}) {
  const identity = {
    featureId: FEATURE,
    queueRevision: 7,
    packageId: "P1",
    actionId: "workflow-preflight",
    dispatchId: input.continuityBinding.dispatchId,
    attemptId: input.continuityBinding.attemptId,
    authorityDigests: { prdSha256: A, specSha256: B, resultSha256: C },
    routeRequestSha256: input.continuityBinding.routeRequestSha256,
    mayDelegate: false,
  };
  return {
    schema: "pipeline.continuity.v0",
    featureId: FEATURE,
    revision: 7,
    runtime: { humanFacingLanguage: "en", activeDuty: input.actorDuty, sessionCleanup: null },
    authority: {
      prd: { path: "specs/prd.md", sha256: A },
      spec: { path: "specs/spec.md", sha256: B },
      result: { path: "specs/result.md", sha256: C },
    },
    queueHead: {
      packageId: "P1", actionId: "workflow-preflight", nextAction: "poll",
      productRetryCount: 0, environmentRerouteCount: 0, dispatch: identity,
    },
    blocker: null,
    acknowledgedFinal: null,
    resume: { mode: "immediate", sourceRevision: 7, reasonCode: "active-turn" },
    recovery: null,
    decisionTxn: null,
    capacity: {
      concurrencyLimit: 3, reservedCriticSlots: 1, reservedRecoverySlots: 1,
      fallbackPolicy: "defer",
    },
    ...overrides,
  };
}

function validPhase26() {
  const input = bindRoute(phase26Request());
  return { input, state: phase26State(input) };
}

check("phase 2.6 dispatch defaults delegation false and binds exact duty/revision/head", () => {
  const { input, state } = validPhase26();
  delete input.mayDelegate;
  input.continuityBinding.routeRequestSha256 = computeWorkflowRouteRequestSha256(input);
  state.queueHead.dispatch.routeRequestSha256 = input.continuityBinding.routeRequestSha256;
  const result = validateWorkflowWriterDispatch(input, phase26Calibration, phase26Capabilities, state);
  assert.equal(result.ok, true);
  assert.equal(result.request.mayDelegate, false);
  assert.equal(result.assurance, WORKFLOW_WRITER_ASSURANCE);
});

for (const [name, mutate, code] of [
  ["malformed continuity", (_input, state) => { delete state.runtime; }, "WF-CONTINUITY-INVALID"],
  ["stale revision", (input) => { input.continuityBinding.queueRevision = 6; }, "WF-CONTINUITY-STALE"],
  ["different head", (input) => { input.continuityBinding.actionId = "other-action"; }, "WF-CONTINUITY-HEAD"],
  ["different authority", (input) => { input.continuityBinding.authorityDigests.prdSha256 = E; }, "WF-CONTINUITY-HEAD"],
  ["different active duty", (_input, state) => { state.runtime.activeDuty = "Critic"; }, "WF-CONTINUITY-HEAD"],
  ["delegation request", (input) => { input.mayDelegate = true; }, "WF-PHASE26-SCHEMA"],
  ["OS isolation assertion", (input) => { input.assurance.osIsolationAsserted = true; }, "WF-PHASE26-SCHEMA"],
]) {
  check(`phase 2.6 ${name} fails closed`, () => {
    const { input, state } = validPhase26(); mutate(input, state);
    assert.equal(validateWorkflowWriterDispatch(input, phase26Calibration, phase26Capabilities, state).code, code);
  });
}

for (const protectedPath of [
  ".claude/pipeline-state.json", ".claude", "docs/state.md", "specs/prd.md",
  "specs/spec.md", "specs/result.md",
]) {
  check(`non-Coordinator write allowlist rejects protected path ${protectedPath}`, () => {
    const { input, state } = validPhase26();
    input.pathAllowlist.write = [protectedPath];
    bindRoute(input);
    state.queueHead.dispatch.routeRequestSha256 = input.continuityBinding.routeRequestSha256;
    assert.equal(validateWorkflowWriterDispatch(input, phase26Calibration, phase26Capabilities, state).code, "WF-GLOBAL-STATE-PROHIBITED");
  });
}

function validFailover() {
  const input = phase26Request();
  const classifier = {
    faultDomain: "execution-environment",
    code: "host-sandbox-bootstrap-rejected",
    emittedBy: "continuity-host-adapter",
    environmentEvidenceSha256: E,
    productStartMarkerObserved: false,
    validProductVerdict: false,
    evidence: { exitCode: 1, signal: null, observedBytes: 128, boundedTailSha256: D },
  };
  classifier.environmentEvidenceSha256 = computeWorkflowEnvironmentEvidenceSha256(classifier);
  input.failover = {
    schema: "pipeline.workflow-failover.v0",
    createdByDuty: "Coordinator",
    classifier,
    origin: {
      laneId: "origin-sandbox", dispatchId: "origin-dispatch", attemptId: "origin-attempt",
      productRetryCount: 0, sameLaneRetryAttempted: false,
    },
    frozen: {
      taskSha256: A, inputSha256: B, commitSha256: C, treeSha256: D,
      pathAllowlistSha256: "0".repeat(64), toolAllowlistSha256: "0".repeat(64),
      budgetSha256: "0".repeat(64), outputSchemaSha256: E,
      narrowingContractSha256: "0".repeat(64),
    },
    budget: {
      wallTimeMs: 60_000, tokens: 8_000, costUsdMicros: 500_000,
      turns: 2, commands: 8, outputBytes: 16_384, finals: 1,
    },
    fallback: {
      laneId: "placeholder", dispatchId: "placeholder", hostIdempotencyKey: "placeholder",
      environmentRerouteCount: 1, productRetryCount: 0, childOrdinal: 1, childMayRetry: false,
    },
    recoverySlot: { reserved: 1, available: 1 },
    requestedRouteSha256: A,
    effectiveRouteSha256: B,
  };
  input.failover.frozen.pathAllowlistSha256 = createFixtureDigest(input.pathAllowlist);
  input.failover.frozen.toolAllowlistSha256 = createFixtureDigest(input.commandAllowlist);
  input.failover.frozen.budgetSha256 = createFixtureDigest(input.failover.budget);
  input.failover.frozen.narrowingContractSha256 = computeWorkflowNarrowingContractSha256(input, input.failover);
  const ids = deriveWorkflowFailoverIds({
    originLaneId: input.failover.origin.laneId,
    originDispatchId: input.failover.origin.dispatchId,
    queueRevision: 7,
    environmentEvidenceSha256: input.failover.classifier.environmentEvidenceSha256,
    narrowingContractSha256: input.failover.frozen.narrowingContractSha256,
  });
  input.failover.fallback.laneId = ids.laneId;
  input.failover.fallback.dispatchId = ids.dispatchId;
  input.failover.fallback.hostIdempotencyKey = ids.dispatchId;
  input.continuityBinding.dispatchId = ids.dispatchId;
  input.continuityBinding.attemptId = "fallback-attempt-01";
  bindRoute(input);
  const recovery = {
    originLaneId: input.failover.origin.laneId,
    originDispatchId: input.failover.origin.dispatchId,
    originAttemptId: input.failover.origin.attemptId,
    environmentEvidenceSha256: classifier.environmentEvidenceSha256,
    sameLaneRetryProhibited: true,
    fallbackStatus: "fallback-pending",
    fallbackLaneId: ids.laneId,
    fallbackDispatchId: ids.dispatchId,
    narrowingContractSha256: input.failover.frozen.narrowingContractSha256,
    originProductRetryCount: 0,
    resultDigest: null,
    count: 1,
  };
  const state = phase26State(input, { recovery });
  state.queueHead.environmentRerouteCount = 1;
  const trustedCoordinatorContext = {
    schema: "pipeline.workflow-failover-trust.v0",
    creator: {
      duty: "Coordinator",
      authorityDigests: { prdSha256: A, specSha256: B, resultSha256: C },
    },
    classifier: structuredClone(classifier),
    origin: structuredClone(input.failover.origin),
    frozen: {
      taskSha256: A, inputSha256: B, commitSha256: C, treeSha256: D,
      outputSchemaSha256: E,
    },
    original: {
      pathAllowlist: {
        read: ["inputs", "specs"],
        write: ["plugins/pipeline-core/lib"],
      },
      commandAllowlist: [
        structuredClone(input.commandAllowlist[0]),
        { id: "full-verify", taskId: "P1-preflight", command: "node harness/scripts/verify.mjs" },
      ].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
      budget: {
        wallTimeMs: 120_000, tokens: 16_000, costUsdMicros: 1_000_000,
        turns: 4, commands: 16, outputBytes: 32_768, finals: 1,
      },
      routeMaxima: { environmentRerouteCount: 1, productRetryCount: 1, childOrdinal: 1 },
      requestedRouteSha256: A,
      effectiveRouteSha256: B,
    },
  };
  return { input, state, trustedCoordinatorContext };
}

function createFixtureDigest(value) {
  const canonical = (entry) => Array.isArray(entry)
    ? `[${entry.map(canonical).join(",")}]`
    : entry !== null && typeof entry === "object"
      ? `{${Object.keys(entry).sort().map((key) => `${JSON.stringify(key)}:${canonical(entry[key])}`).join(",")}}`
      : JSON.stringify(entry);
  return createHash("sha256").update(canonical(value), "utf8").digest("hex");
}

check("one exact Coordinator-created failover is admitted with preserved retry budget", () => {
  const { input, state, trustedCoordinatorContext } = validFailover();
  const result = validateWorkflowWriterDispatch(
    input, phase26Calibration, phase26Capabilities, state, trustedCoordinatorContext,
  );
  assert.equal(result.ok, true);
  assert.equal(input.failover.fallback.productRetryCount, state.queueHead.productRetryCount);
  assert.notEqual(input.failover.fallback.laneId, input.failover.origin.laneId);
  assert.equal(input.failover.fallback.hostIdempotencyKey, input.failover.fallback.dispatchId);
});

function refreshFailoverDerived(input, state) {
  input.pathAllowlist.read.sort();
  input.pathAllowlist.write.sort();
  input.commandAllowlist.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  input.failover.frozen.pathAllowlistSha256 = createFixtureDigest(input.pathAllowlist);
  input.failover.frozen.toolAllowlistSha256 = createFixtureDigest(input.commandAllowlist);
  input.failover.frozen.budgetSha256 = createFixtureDigest(input.failover.budget);
  input.failover.frozen.narrowingContractSha256 = computeWorkflowNarrowingContractSha256(input, input.failover);
  const ids = deriveWorkflowFailoverIds({
    originLaneId: input.failover.origin.laneId,
    originDispatchId: input.failover.origin.dispatchId,
    queueRevision: state.revision,
    environmentEvidenceSha256: input.failover.classifier.environmentEvidenceSha256,
    narrowingContractSha256: input.failover.frozen.narrowingContractSha256,
  });
  input.failover.fallback.laneId = ids.laneId;
  input.failover.fallback.dispatchId = ids.dispatchId;
  input.failover.fallback.hostIdempotencyKey = ids.dispatchId;
  input.continuityBinding.dispatchId = ids.dispatchId;
  bindRoute(input);
  state.queueHead.dispatch.dispatchId = ids.dispatchId;
  state.queueHead.dispatch.routeRequestSha256 = input.continuityBinding.routeRequestSha256;
  state.recovery.fallbackLaneId = ids.laneId;
  state.recovery.fallbackDispatchId = ids.dispatchId;
  state.recovery.narrowingContractSha256 = input.failover.frozen.narrowingContractSha256;
}

for (const [name, mutate, code] of [
  ["free-text/unknown classifier", (input) => { input.failover.classifier.code = "stderr-said-sandbox"; }, "WF-FAILOVER-SCHEMA"],
  ["product verdict present", (input) => { input.failover.classifier.validProductVerdict = true; }, "WF-FAILOVER-SCHEMA"],
  ["origin retry attempted", (input) => { input.failover.origin.sameLaneRetryAttempted = true; }, "WF-FAILOVER-SCHEMA"],
  ["second child", (input) => { input.failover.fallback.childOrdinal = 2; }, "WF-FAILOVER-SCHEMA"],
  ["child retry", (input) => { input.failover.fallback.childMayRetry = true; }, "WF-FAILOVER-SCHEMA"],
  ["recomputed widened path list", (input, state) => {
    input.pathAllowlist.write.push("plugins/untrusted");
    refreshFailoverDerived(input, state);
  }, "WF-FAILOVER-NARROWING"],
  ["changed product retry count", (input) => { input.failover.fallback.productRetryCount = 1; }, "WF-FAILOVER-STATE"],
  ["non-idempotent host key", (input) => { input.failover.fallback.hostIdempotencyKey = "other-key"; }, "WF-FAILOVER-IDENTITY"],
  ["unavailable recovery slot", (_input, state, caps) => { caps.availableRecoverySlots = 0; }, "WF-FAILOVER-STATE"],
]) {
  check(`failover rejects ${name}`, () => {
    const { input, state, trustedCoordinatorContext } = validFailover();
    const caps = structuredClone(phase26Capabilities);
    mutate(input, state, caps, trustedCoordinatorContext);
    bindRoute(input);
    state.queueHead.dispatch.routeRequestSha256 = input.continuityBinding.routeRequestSha256;
    assert.equal(validateWorkflowWriterDispatch(
      input, phase26Calibration, caps, state, trustedCoordinatorContext,
    ).code, code);
  });
}

check("failover rejects missing separately injected Coordinator trust", () => {
  const { input, state } = validFailover();
  assert.equal(
    validateWorkflowWriterDispatch(input, phase26Calibration, phase26Capabilities, state).code,
    "WF-FAILOVER-TRUST",
  );
});

for (const [name, mutate, code] of [
  ["fake structured environment evidence", (input, state, trusted) => {
    input.failover.classifier.evidence.observedBytes += 1;
    trusted.classifier.evidence.observedBytes += 1;
    bindRoute(input);
    state.queueHead.dispatch.routeRequestSha256 = input.continuityBinding.routeRequestSha256;
  }, "WF-FAILOVER-TRUST"],
  ["creator authority mismatch", (_input, _state, trusted) => {
    trusted.creator.authorityDigests.prdSha256 = E;
  }, "WF-FAILOVER-TRUST"],
  ["frozen output mismatch", (_input, _state, trusted) => {
    trusted.frozen.outputSchemaSha256 = D;
  }, "WF-FAILOVER-TRUST"],
  ["requested route anchor mismatch", (_input, _state, trusted) => {
    trusted.original.requestedRouteSha256 = E;
  }, "WF-FAILOVER-TRUST"],
  ["budget wider than Coordinator maximum", (input, state, trusted) => {
    input.failover.budget.wallTimeMs = trusted.original.budget.wallTimeMs + 1;
    refreshFailoverDerived(input, state);
  }, "WF-FAILOVER-NARROWING"],
  ["second final budget", (input) => {
    input.failover.budget.finals = 2;
  }, "WF-FAILOVER-SCHEMA"],
]) {
  check(`trusted failover rejects ${name}`, () => {
    const { input, state, trustedCoordinatorContext } = validFailover();
    mutate(input, state, trustedCoordinatorContext);
    bindRoute(input);
    state.queueHead.dispatch.routeRequestSha256 = input.continuityBinding.routeRequestSha256;
    assert.equal(validateWorkflowWriterDispatch(
      input, phase26Calibration, phase26Capabilities, state, trustedCoordinatorContext,
    ).code, code);
  });
}

check("preflight reads valid state before invoking the adapter once", () => {
  const { input, state } = validPhase26();
  const events = [];
  const result = preflightAndInvokeWorkflowWriterDispatch(input, phase26Calibration, phase26Capabilities, {
    readContinuityState() { events.push("read"); return state; },
    invokeAdapter(effective) {
      events.push("invoke");
      assert.equal(effective.mayDelegate, false);
      assert.deepEqual(effective.continuityBinding.authorityDigests, {
        prdSha256: A, specSha256: B, resultSha256: C,
      });
    },
  });
  assert.deepEqual(events, ["read", "invoke"]);
  assert.equal(result.adapterInvocations, 1);
});

check("malformed state prevents adapter invocation", () => {
  const { input, state } = validPhase26();
  delete state.runtime;
  let calls = 0;
  const result = preflightAndInvokeWorkflowWriterDispatch(input, phase26Calibration, phase26Capabilities, {
    readContinuityState() { return state; },
    invokeAdapter() { calls += 1; },
  });
  assert.equal(result.code, "WF-CONTINUITY-INVALID");
  assert.equal(result.adapterInvocations, 0);
  assert.equal(calls, 0);
});
check("failover preflight reads trusted Coordinator context before one adapter invocation", () => {
  const { input, state, trustedCoordinatorContext } = validFailover();
  const events = [];
  const result = preflightAndInvokeWorkflowWriterDispatch(
    input,
    phase26Calibration,
    phase26Capabilities,
    {
      readContinuityState() { events.push("state"); return state; },
      readTrustedCoordinatorContext() { events.push("trust"); return trustedCoordinatorContext; },
      invokeAdapter() { events.push("invoke"); },
    },
  );
  assert.deepEqual(events, ["state", "trust", "invoke"]);
  assert.equal(result.stateReads, 1);
  assert.equal(result.trustedContextReads, 1);
  assert.equal(result.adapterInvocations, 1);
});
check("missing trusted Coordinator context blocks failover after one trust read", () => {
  const { input, state } = validFailover();
  let calls = 0;
  const result = preflightAndInvokeWorkflowWriterDispatch(
    input,
    phase26Calibration,
    phase26Capabilities,
    {
      readContinuityState() { return state; },
      readTrustedCoordinatorContext() { return undefined; },
      invokeAdapter() { calls += 1; },
    },
  );
  assert.equal(result.code, "WF-FAILOVER-TRUST");
  assert.equal(result.stateReads, 1);
  assert.equal(result.trustedContextReads, 1);
  assert.equal(result.adapterInvocations, 0);
  assert.equal(calls, 0);
});
check("safe code vocabulary has no dynamic values", () => {
  assert.equal(WORKFLOW_WRITER_PREFLIGHT_CODES.every((code) => /^WF-[A-Z0-9-]+$/.test(code)), true);
});
process.stdout.write(`1..${passed}\n# pass ${passed}\n`);
