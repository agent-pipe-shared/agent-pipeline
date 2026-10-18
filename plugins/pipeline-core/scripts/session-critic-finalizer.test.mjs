#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isSafeTaskId } from "../lib/dispatch-record.mjs";
import { sha256Canonical } from "../lib/review-economy.mjs";
import { produceCriticDiagnostic } from "../lib/critic-diagnostic-producer.mjs";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { canonicalJson, consumeCandidatePacket, inspectClaimedSessionAdmission } from "./critic-packet-preflight.mjs";
import { isSuccessfulSpawn } from "../lib/successful-spawn.mjs";
import { readReservedGenericCriticBatchAdmission, registerGenericCriticBatch } from "../lib/critic-generic-batch.mjs";

import {
  SESSION_CRITIC_ASSURANCE,
  SESSION_CRITIC_CLI_ERROR_SCHEMA,
  SESSION_CRITIC_EVIDENCE_INDEX_SCHEMA,
  SESSION_CRITIC_EXPORT_REQUEST_SCHEMA,
  SESSION_CRITIC_EXPORT_RESULT_SCHEMA,
  SESSION_CRITIC_FINALIZE_REQUEST_SCHEMA,
  SESSION_CRITIC_FINALIZE_REQUEST_V3_SCHEMA,
  SESSION_CRITIC_RECEIPT_SCHEMA,
  SessionCriticFinalizerError,
  admitSessionCriticReview,
  exportSessionCriticEvidence,
  finalizeSessionCriticReview,
  runSessionCriticFinalizerCli,
  validateSessionCriticReceipt,
} from "./session-critic-finalizer.mjs";

function git(root, args, options = {}) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", ...options });
  assert.equal(isSuccessfulSpawn(result), true, result.stderr);
  return String(result.stdout ?? "").trim();
}
function commit(root, message) {
  git(root, ["add", "."]);
  git(root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", message]);
  return git(root, ["rev-parse", "HEAD"]);
}
function fixture({ rootCandidate = false, targetedExitCode = 0, taskId = "nova-b-lnd5" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "session-critic-finalizer-"));
  git(root, ["init", "-q", "-b", "main"]);
  mkdirSync(join(root, ".claude"));
  mkdirSync(join(root, "specs"));
  mkdirSync(join(root, "evidence"));
  writeFileSync(join(root, ".claude", "pipeline.yaml"), "schema: pipeline.manifest.v0\n");
  writeFileSync(join(root, "specs", "spec.md"), "# Spec\nAC-1 AC-2\n");
  // The review-unit purpose is committed with the base, before any work, and never touched again.
  writeFileSync(join(root, "specs", "review-unit.json"), JSON.stringify(reviewUnit()));
  const emptyTree = git(root, ["hash-object", "-t", "tree", "--stdin"], { input: "" });
  const base = rootCandidate ? emptyTree : commit(root, "base");
  if (!rootCandidate) writeFileSync(join(root, "specs", "spec.md"), "# Spec\n\nSource candidate.\n");
  const historicalCandidate = commit(root, rootCandidate ? "root source candidate" : "source candidate");
  const recordPath = `evidence/dispatch-record-${taskId}.json`;
  const record = {
    schema: "pipeline.dispatch-record.v3",
    taskId,
    agentType: "default",
    model: "gpt-5.6-luna",
    effort: "medium",
    rulesetSha: "b7797309cf6abe175fd52b0a8749d82b43714ea0",
    dispatcher: "elephant",
    outcome: "completed",
    commits: [historicalCandidate],
    candidateCommit: historicalCandidate,
    resultSha256: "a".repeat(64),
    log: [{ phase: "verify", toolUseCount: 1 }],
    report: { text: "done", changedFiles: ["specs/spec.md"] },
    criticRequired: {
      schema: "pipeline.critic-required-decision.v1",
      trigger: {
        schema: "pipeline.critic-trigger-input.v1",
        rigorLevel: 2,
        riskClass: "high",
        riskFlag: true,
        diff: { mechanical: false, architecture: false, guardrails: true, security: false },
      },
      appliedRow: "T1",
    },
  };
  const recordBytes = `${JSON.stringify(record, null, 2)}\n`;
  writeFileSync(join(root, recordPath), recordBytes);
  const recordCommit = commit(root, "persist authored dispatch record");
  writeFileSync(join(root, "specs", "spec.md"), "# Spec\n\nDescendant candidate.\n");
  const candidate = commit(root, "descendant candidate");
  const tree = git(root, ["rev-parse", `${candidate}^{tree}`]);
  writeFileSync(join(root, "evidence", "verify.json"), `${JSON.stringify(produceCriticDiagnostic({ root, candidate, specPath: "specs/spec.md", guardrailPaths: [".claude/pipeline.yaml"], command: [process.execPath, "-e", `console.log('fixture targeted result'); process.exit(${targetedExitCode})`], logPath: "evidence/targeted.log" }))}\n`);
  return { root, base, historicalCandidate, recordCommit, candidate, tree, taskId, recordPath, recordBytes };
}
function reviewUnit() {
  return {
    schema: "pipeline.critic-review-unit.v1", kind: "related-fixes",
    purpose: "Repair one delivery boundary across the affected consumers", specPath: "specs/spec.md",
    logicalWorkIds: ["AC-1", "AC-2"], criterionIds: ["AC-1", "AC-2"],
    deliveryBoundary: { mainRef: "refs/heads/main" }, singletonRationale: null,
  };
}
// A non-feature finalize needs a generic batch reservation. Register through the product's own
// producer, lazily and once per fixture: registration creates the control root, and the two
// tests that assert nothing was published must be able to run without it.
function batchFor(fx) {
  if (fx.batch === undefined) {
    const controlRoot = join(fx.root, ".git", "agent-pipeline", "critic-packets");
    mkdirSync(controlRoot, { recursive: true, mode: 0o700 });
    chmodSync(join(fx.root, ".git", "agent-pipeline"), 0o700);
    chmodSync(controlRoot, 0o700);
    const registered = registerGenericCriticBatch({ repoRoot: fx.root, controlRoot, declaration: {
      taskId: fx.taskId, baseCommit: fx.base, candidateCommit: fx.candidate,
      logicalWorkIds: ["AC-1", "AC-2"], specPath: "specs/spec.md", guardrailPaths: [".claude/pipeline.yaml"],
      signedQualityImportAnchor: null, reviewUnitPath: "specs/review-unit.json",
    } });
    fx.batch = { ...registered.batchRef, memberSha256: registered.memberSha256 };
  }
  return fx.batch;
}
function verdict(overrides = {}) {
  return {
    findings: [],
    deliberately_not_flagged: ["scope"],
    trajectory_verdict: "consistent",
    trajectory_evidence: "candidate evidence inspected",
    briefing_violations: [],
    pass: true,
    ...overrides,
  };
}
function options(fx, overrides = {}) {
  return {
    preflightInput: {
      root: fx.root,
      base: fx.base,
      candidate: fx.candidate,
      specPath: "specs/spec.md",
      guardrailPaths: [".claude/pipeline.yaml"],
      evidencePaths: ["evidence/verify.json"],
      priorCriticEvidencePath: null,
    },
    taskId: fx.taskId,
    projectId: "pipeline",
    sessionId: "session-lnd5-1",
    packetId: "1".repeat(32),
    route: {
      routeId: "session-critic",
      runner: "codex",
      adapter: "session-functional-equivalent",
      provider: "openai",
      modelTier: "higher-capability",
      effortTier: "xhigh",
    },
    verdict: verdict(),
    ...overrides,
  };
}
function registered(fx, overrides = {}) {
  return options(fx, { genericBatchRef: batchFor(fx), ...overrides });
}
function preadmitted(fx, overrides = {}) {
  const request = registered(fx, overrides);
  admitSessionCriticReview(request);
  return request;
}
function cleanup(fx) { rmSync(fx.root, { recursive: true, force: true }); }
function cliRequest(fx, overrides = {}) {
  return {
    schema: SESSION_CRITIC_FINALIZE_REQUEST_SCHEMA,
    taskId: fx.taskId,
    projectId: "pipeline",
    sessionId: "session-cli-1",
    packetId: "6".repeat(32),
    trigger: "T1",
    route: options(fx).route,
    review: {
      base: fx.base,
      candidate: fx.candidate,
      specPath: "specs/spec.md",
      guardrailPaths: [".claude/pipeline.yaml"],
      evidencePaths: ["evidence/verify.json"],
      priorCriticEvidencePath: null,
    },
    verdictPath: "evidence/critic-verdict.json",
    event: { eventOutPath: "evidence/review-action.json", featureId: "nova-b" },
    ...overrides,
  };
}
// The v3 request names the registered batch; the CLI refuses request files that are not physical scratch files.
function cliBatchRequest(fx, overrides = {}) {
  const base = cliRequest(fx);
  return { ...base, schema: SESSION_CRITIC_FINALIZE_REQUEST_V3_SCHEMA,
    review: { ...base.review, genericBatchRef: batchFor(fx) }, ...overrides };
}
function writeScratchRequest(fx, name, request) {
  mkdirSync(join(fx.root, "scratch"), { recursive: true });
  writeFileSync(join(fx.root, "scratch", name), `${JSON.stringify(request)}\n`);
  return `scratch/${name}`;
}

test("private task snapshot binds uppercase delivered-v3 bytes without exporting record prose", () => {
  const fx = fixture({ taskId: "ALF-HISTORICAL-01" });
  try {
    assert.equal(isSafeTaskId(fx.taskId), true);
    const request = registered(fx, { packetId: "8".repeat(32) });
    admitSessionCriticReview(request);
    const controlRoot = join(fx.root, git(fx.root, ["rev-parse", "--git-common-dir"]), "agent-pipeline", "critic-packets");
    const readback = inspectClaimedSessionAdmission({ controlRoot, packetId: request.packetId });
    assert.equal(readback.packet.candidate.commit, fx.candidate);
    assert.notEqual(readback.packet.candidate.commit, fx.historicalCandidate);
    assert.equal(readback.packet.references.some(({ path }) => path === fx.recordPath), false);
    const privateBinding = readback.packet.coordinatorOnly.localDispatchEvidence;
    const exactRecordBytes = readFileSync(join(fx.root, fx.recordPath));
    const recordSha256 = createHash("sha256").update(exactRecordBytes).digest("hex");
    assert.equal(createHash("sha256").update(fx.recordBytes).digest("hex"), recordSha256);
    assert.deepEqual(privateBinding, {
      schema: "pipeline.local-dispatch-evidence.v1",
      taskId: fx.taskId,
      recordPath: fx.recordPath,
      recordSha256,
      sourceCandidateCommit: fx.historicalCandidate,
      reviewCandidateCommit: fx.candidate,
      snapshotId: sha256Canonical({
        schema: "pipeline.local-dispatch-evidence.v1", taskId: fx.taskId,
        recordPath: fx.recordPath, recordSha256,
        sourceCandidateCommit: fx.historicalCandidate, reviewCandidateCommit: fx.candidate,
      }),
    });
    assert.equal(JSON.parse(exactRecordBytes).candidateCommit, fx.historicalCandidate);
    assert.deepEqual(request.preflightInput.evidencePaths, ["evidence/verify.json"]);
  } finally { cleanup(fx); }
});

test("uppercase task ID is safe and wrong or traversal IDs cannot select a different record", () => {
  assert.equal(isSafeTaskId("ALF-HISTORICAL-01"), true);
  assert.equal(isSafeTaskId("../ALF-HISTORICAL-01"), false);
  const fx = fixture({ taskId: "ALF-HISTORICAL-01" });
  try {
    const wrong = registered(fx, { taskId: "ALF-WRONG-02", packetId: "9".repeat(32) });
    assert.throws(() => admitSessionCriticReview(wrong), (error) => error.code === "CPP-REVIEW-ADMISSION");
    const unsafe = registered(fx, { taskId: "../ALF-HISTORICAL-01", packetId: "a".repeat(32) });
    assert.throws(() => admitSessionCriticReview(unsafe),
      (error) => error instanceof SessionCriticFinalizerError && error.code === "SCF-TASK");
  } finally { cleanup(fx); }
});

test("empty-tree packet base rejects a non-root authored candidate", () => {
  const fx = fixture();
  try {
    const emptyTree = git(fx.root, ["hash-object", "-t", "tree", "--stdin"], { input: "" });
    const request = registered(fx, { packetId: "c".repeat(32) });
    request.preflightInput = { ...request.preflightInput, base: emptyTree };
    assert.throws(() => admitSessionCriticReview(request), (error) => error.code === "CPP-REF");
  } finally { cleanup(fx); }
});

test("prelaunch admission creates one claimed, digest-bound packet before the verdict exists", () => {
  const fx = fixture();
  try {
    const request = registered(fx, { packetId: "9".repeat(32) });
    const admitted = admitSessionCriticReview(request);
    assert.equal(admitted.status, "admitted");
    assert.equal(admitted.packetId, request.packetId);
    assert.match(admitted.admissionSha256, /^[a-f0-9]{64}$/u);
    const common = git(fx.root, ["rev-parse", "--git-common-dir"]);
    const controlRoot = join(fx.root, common, "agent-pipeline", "critic-packets");
    const readback = inspectClaimedSessionAdmission({ controlRoot, packetId: request.packetId });
    assert.equal(readback.admission.sessionId, request.sessionId);
    assert.equal(readback.packet.candidate.commit, fx.candidate);
    assert.equal(readback.packet.references.some(({ path }) => path === fx.recordPath), false);
    assert.equal(readback.packet.coordinatorOnly.localDispatchEvidence.recordSha256,
      createHash("sha256").update(readFileSync(join(fx.root, fx.recordPath))).digest("hex"));
    // An already-claimed packet is an idempotent replay of the same durable admission, not an overwrite.
    const replayed = admitSessionCriticReview(request);
    assert.equal(replayed.status, "already-admitted");
    assert.equal(replayed.replay, true);
    assert.equal(replayed.packetId, request.packetId);
    assert.equal(replayed.packetDigest, admitted.packetDigest);
    assert.equal(replayed.admissionSha256, admitted.admissionSha256);
  } finally { cleanup(fx); }
});

test("invalid optional Critic selection retains V3, while valid selection binds before packet creation", () => {
  const fx = fixture();
  // A second admission on one batch needs the first packet consumed; the valid selection gets its own fixture.
  const approvedFx = fixture();
  try {
    const request = registered(fx, { packetId: "8".repeat(32) });
    const env = { CODEX_SESSION_ID: "fixture-codex-session" };
    const select = ({ runner, taskRoute }) => {
      assert.equal(runner, "codex");
      assert.equal(taskRoute, "duty.critic_high_risk");
      return { ok: true, status: "ready", modelId: "wrong-model", effort: "xhigh" };
    };
    admitSessionCriticReview(request, {
      modelRoleEnvironment: env, selectModelRoleForTaskFn: select,
    });
    const common = git(fx.root, ["rev-parse", "--git-common-dir"]);
    const controlRoot = join(fx.root, common, "agent-pipeline", "critic-packets");
    const fallback = inspectClaimedSessionAdmission({ controlRoot, packetId: request.packetId });
    assert.equal(fallback.packet.route.modelTier, request.route.modelTier);
    assert.equal(Object.hasOwn(fallback.packet.request.sessionBinding, "modelRole"), false);
    const approvedRequest = registered(approvedFx, { packetId: "9".repeat(32) });
    const admitted = admitSessionCriticReview(approvedRequest, {
      modelRoleEnvironment: env,
      selectModelRoleForTaskFn: () => ({ ok: true, status: "ready",
        runner: "codex", taskRoute: "duty.critic_high_risk",
        modelId: "new-reviewed-model", effort: request.route.effortTier,
        readbackSha256: "a".repeat(64), receiptSha256: "b".repeat(64) }),
    });
    assert.equal(admitted.status, "admitted");
    const readback = inspectClaimedSessionAdmission({
      controlRoot: join(approvedFx.root, common, "agent-pipeline", "critic-packets"), packetId: approvedRequest.packetId,
    });
    assert.equal(readback.packet.route.modelTier, "new-reviewed-model");
    assert.deepEqual(readback.packet.request.sessionBinding.modelRole, {
      schema: "pipeline.session-critic-model-role.v1", runner: "codex",
      taskRoute: "duty.critic_high_risk", modelId: "new-reviewed-model",
      effort: request.route.effortTier, readbackSha256: "a".repeat(64), receiptSha256: "b".repeat(64),
    });
  } finally { cleanup(fx); cleanup(approvedFx); }
});

test("an admitted exact session model survives finalization without reselecting the V3 model", () => {
  for (const [runner, provider, env] of [
    ["codex", "openai", { CODEX_SESSION_ID: "fixture-codex-session" }],
    ["claude", "anthropic", { CLAUDE_CODE_SESSION_ID: "fixture-claude-session" }],
  ]) {
    const fx = fixture();
    try {
      const request = registered(fx, { packetId: "a".repeat(32),
        route: { ...options(fx).route, runner, provider } });
      let selections = 0;
      admitSessionCriticReview(request, {
        modelRoleEnvironment: env,
        selectModelRoleForTaskFn: ({ runner: selectedRunner, taskRoute }) => {
          selections += 1;
          assert.equal(selectedRunner, runner);
          assert.equal(taskRoute, "duty.critic_high_risk");
          return { ok: true, status: "ready", runner, taskRoute,
            modelId: "new-reviewed-model", effort: request.route.effortTier,
            readbackSha256: "a".repeat(64), receiptSha256: "b".repeat(64) };
        },
      });
      assert.throws(() => finalizeSessionCriticReview({ ...request,
        route: { ...request.route, effortTier: "medium" } }),
      (error) => error.code === "SCF-MODEL-ROLE");
      const finalized = finalizeSessionCriticReview(request, {
        selectModelRoleForTaskFn: () => { throw new Error("must not reselect after launch"); },
      });
      assert.equal(finalized.status, "completed");
      assert.equal(finalized.receipt.reviewPass, true);
      assert.equal(selections, 1);
    } finally { cleanup(fx); }
  }
});

test("missing optional model selection retains the independently admitted V3 Critic route", () => {
  const fx = fixture();
  // A second admission on one batch needs the first packet consumed; the throwing selector gets its own fixture.
  const throwingFx = fixture();
  try {
    const request = registered(fx, { packetId: "7".repeat(32) });
    admitSessionCriticReview(request, {
      modelRoleEnvironment: { CODEX_SESSION_ID: "fixture-codex-session" },
      selectModelRoleForTaskFn: () => ({ ok: true, status: "legacy-v3", runner: "codex",
        taskRoute: "duty.critic_high_risk", diagnostic: "MODEL-ROLE-SELECT-STORE-UNAVAILABLE" }),
    });
    const common = git(fx.root, ["rev-parse", "--git-common-dir"]);
    const readback = inspectClaimedSessionAdmission({
      controlRoot: join(fx.root, common, "agent-pipeline", "critic-packets"), packetId: request.packetId,
    });
    assert.equal(readback.packet.route.modelTier, request.route.modelTier);
    assert.equal(Object.hasOwn(readback.packet.request.sessionBinding, "modelRole"), false);
    const throwingRequest = registered(throwingFx, { packetId: "6".repeat(32) });
    admitSessionCriticReview(throwingRequest, {
      modelRoleEnvironment: { CODEX_SESSION_ID: "fixture-codex-session" },
      selectModelRoleForTaskFn: () => { throw new Error("optional selector unavailable"); },
    });
    const throwingReadback = inspectClaimedSessionAdmission({
      controlRoot: join(throwingFx.root, common, "agent-pipeline", "critic-packets"),
      packetId: throwingRequest.packetId,
    });
    assert.equal(throwingReadback.packet.route.modelTier, request.route.modelTier);
    assert.equal(Object.hasOwn(throwingReadback.packet.request.sessionBinding, "modelRole"), false);
  } finally { cleanup(fx); cleanup(throwingFx); }
});

test("high-risk T2 and normal T3 retain their V3 duties when optional selection is unavailable", () => {
  for (const [trigger, expected] of [["T2", "duty.critic_high_risk"],
    ["T3", "duty.critic_normal"]]) {
    const fx = fixture();
    try {
      const request = registered(fx, { trigger });
      admitSessionCriticReview(request, {
        modelRoleEnvironment: { CODEX_SESSION_ID: "fixture-codex-session" },
        selectModelRoleForTaskFn: ({ runner, taskRoute }) => {
          assert.equal(runner, "codex");
          assert.equal(taskRoute, expected);
          return { ok: false, status: "unavailable" };
        },
      });
      const common = git(fx.root, ["rev-parse", "--git-common-dir"]);
      const readback = inspectClaimedSessionAdmission({
        controlRoot: join(fx.root, common, "agent-pipeline", "critic-packets"), packetId: request.packetId,
      });
      assert.equal(readback.packet.route.modelTier, request.route.modelTier);
      assert.equal(Object.hasOwn(readback.packet.request.sessionBinding, "modelRole"), false);
    } finally { cleanup(fx); }
  }
});

test("normal fresh-session finalization consumes the prelaunch packet, reads back, and emits", () => {
  const fx = fixture({ targetedExitCode: 1 });
  try {
    let consumeCalls = 0;
    const result = finalizeSessionCriticReview(preadmitted(fx, { eventOutPath: "evidence/review-action.json", featureId: "nova-b" }), {
      consumeCandidatePacketFn: (...args) => { consumeCalls += 1; return consumeCandidatePacket(...args); },
    });
    assert.equal(result.status, "completed");
    assert.equal(result.receipt.schema, SESSION_CRITIC_RECEIPT_SCHEMA);
    assert.equal(result.receipt.assurance, SESSION_CRITIC_ASSURANCE);
    assert.equal(result.receipt.reviewPass, true);
    const packet = JSON.parse(readFileSync(join(fx.root, ".git", "agent-pipeline", "critic-packets", "1".repeat(32), "packet.json")));
    assert.equal(packet.diagnostics.items[0].status.fullVerify, "not-run");
    assert.equal(packet.diagnostics.items[0].status.targeted, "failed");
    assert.equal(result.event.reasonCode, "REVIEW_PASSED");
    assert.match(result.event.correlation.requestId, /^[a-f0-9]{64}$/u);
    assert.equal(consumeCalls, 2, "accepted means first durable consume plus identical replay readback");
    assert.equal(existsSync(join(fx.root, ".git", "agent-pipeline", "critic-packets", "1".repeat(32), "checkout")), false);
    assert.deepEqual(JSON.parse(readFileSync(join(fx.root, "evidence", "review-action.json"), "utf8")), result.event);
    const serialized = JSON.stringify({ receipt: result.receipt, event: result.event });
    for (const forbidden of ["runner", "provider", "modelTier", "effortTier", "routeId"]) assert.equal(serialized.includes(forbidden), false, forbidden);
  } finally { cleanup(fx); }
});

test("a schema-invalid or contradictory verdict fails before packet or event publication", () => {
  const fx = fixture();
  try {
    assert.throws(() => finalizeSessionCriticReview(options(fx, { verdict: { pass: true } })), (error) => error instanceof SessionCriticFinalizerError && error.code === "SCF-VERDICT-SCHEMA");
    assert.throws(() => finalizeSessionCriticReview(options(fx, {
      packetId: "2".repeat(32),
      verdict: verdict({ findings: [{ gap: "gap", risk: "risk", severity: "major", evidence: "a:1", spec_ref: "AC-1" }] }),
    })), (error) => error instanceof SessionCriticFinalizerError && error.code === "SCF-VERDICT-CONTRADICTION");
    assert.equal(existsSync(join(fx.root, "evidence", "review-action.json")), false);
    assert.equal(existsSync(join(fx.root, ".git", "agent-pipeline", "critic-packets")), false);
  } finally { cleanup(fx); }
});

test("an event write failure reports source-complete and a closed identical-only retry", () => {
  const fx = fixture();
  try {
    const result = finalizeSessionCriticReview(preadmitted(fx, { packetId: "3".repeat(32), eventOutPath: "evidence/review-action.json" }), {
      writeGovernanceReviewActionFn: () => { throw Object.assign(new Error("disk"), { code: "GRA-OUTPUT-WRITE" }); },
    });
    assert.equal(result.status, "source-complete/event-unavailable");
    assert.equal(result.receipt.reviewPass, true);
    assert.equal(result.retry.event.reasonCode, "REVIEW_PASSED");
    assert.equal(existsSync(join(fx.root, "evidence", "review-action.json")), false);
    const durable = JSON.parse(readFileSync(join(fx.root, ".git", "agent-pipeline", "critic-packets", "3".repeat(32), "receipt.json"), "utf8"));
    assert.deepEqual(durable.body, result.receipt);
  } finally { cleanup(fx); }
});

test("review action construction cannot occur before identical consume readback", () => {
  const fx = fixture();
  try {
    let consumes = 0;
    let builds = 0;
    assert.throws(() => finalizeSessionCriticReview(preadmitted(fx, {
      packetId: "7".repeat(32),
      eventOutPath: "evidence/review-action.json",
    }), {
      consumeCandidatePacketFn: (...args) => {
        consumes += 1;
        const result = consumeCandidatePacket(...args);
        return consumes === 2 ? { ...result, replay: false } : result;
      },
      buildGovernanceReviewActionFn: () => { builds += 1; throw new Error("must not run"); },
    }), (error) => error instanceof SessionCriticFinalizerError && error.code === "SCF-RECEIPT-READBACK");
    assert.equal(consumes, 2);
    assert.equal(builds, 0);
    assert.equal(existsSync(join(fx.root, "evidence", "review-action.json")), false);
  } finally { cleanup(fx); }
});

test("findings emit REVIEW_FINDINGS and a root-authored record keeps its real empty-tree range", () => {
  const fx = fixture({ rootCandidate: true });
  try {
    const finding = { gap: "missing edge", risk: "failure", severity: "minor", evidence: "specs/spec.md:1", spec_ref: "AC-1" };
    assert.equal(fx.base, git(fx.root, ["hash-object", "-t", "tree", "--stdin"], { input: "" }));
    const request = preadmitted(fx, {
      packetId: "4".repeat(32),
      verdict: verdict({ findings: [finding], pass: false }),
      eventOutPath: "evidence/review-action.json",
    });
    const controlRoot = join(fx.root, git(fx.root, ["rev-parse", "--git-common-dir"]), "agent-pipeline", "critic-packets");
    const readback = inspectClaimedSessionAdmission({ controlRoot, packetId: request.packetId });
    assert.equal(readback.packet.references.some(({ path }) => path === fx.recordPath), false);
    assert.equal(readback.packet.coordinatorOnly.localDispatchEvidence.recordSha256,
      createHash("sha256").update(readFileSync(join(fx.root, fx.recordPath))).digest("hex"));
    const result = finalizeSessionCriticReview(request);
    assert.equal(result.event.reasonCode, "REVIEW_FINDINGS");
    assert.equal(result.receipt.reviewRange.base, fx.base);
    assert.equal(result.receipt.candidate.commit, fx.candidate);
  } finally { cleanup(fx); }
});

test("dispatch record drift after admission blocks finalization", () => {
  const fx = fixture({ taskId: "ALF-HISTORICAL-01" });
  try {
    const request = preadmitted(fx, { packetId: "b".repeat(32) });
    writeFileSync(join(fx.root, fx.recordPath), "{\n  \"schema\": \"pipeline.dispatch-record.v3\"\n}\n");
    const driftCandidate = commit(fx.root, "dispatch record drift");
    writeFileSync(join(fx.root, "evidence", "verify.json"), `${JSON.stringify(produceCriticDiagnostic({ root: fx.root, candidate: driftCandidate, specPath: "specs/spec.md", guardrailPaths: [".claude/pipeline.yaml"], command: [process.execPath, "-e", "console.log('record drift candidate')"], logPath: "evidence/record-drift-targeted.log" }))}\n`);
    const driftedRequest = { ...request, preflightInput: { ...request.preflightInput, candidate: driftCandidate } };
    assert.throws(() => finalizeSessionCriticReview(driftedRequest),
      (error) => error instanceof SessionCriticFinalizerError && error.code === "SCF-PRELAUNCH-BINDING");
  } finally { cleanup(fx); }
});

test("receipt validation is closed and refuses provider metadata", () => {
  const fx = fixture();
  try {
    const receipt = finalizeSessionCriticReview(preadmitted(fx, { packetId: "5".repeat(32) })).receipt;
    assert.throws(() => validateSessionCriticReceipt({ ...receipt, provider: "openai" }), (error) => error instanceof SessionCriticFinalizerError && error.code === "SCF-RECEIPT");
  } finally { cleanup(fx); }
});

test("closed CLI admits before verdict and finalizes only that durable packet", () => {
  const fx = fixture({ taskId: "ALF-CLI-HISTORY-01" });
  try {
    // The CLI only reads physical scratch request files, and a non-feature review names its registered batch (v3).
    const requestPath = writeScratchRequest(fx, "finalize-request.json", cliBatchRequest(fx));
    const admission = runSessionCriticFinalizerCli(["admit", "--root", fx.root, "--request", requestPath]);
    assert.equal(admission.exitCode, 0);
    assert.equal(admission.output.schema, "pipeline.session-critic-prelaunch-admission.v1");
    assert.equal(admission.output.packetId, "6".repeat(32));
    writeFileSync(join(fx.root, "evidence", "critic-verdict.json"), `${JSON.stringify(verdict())}\n`);
    const result = runSessionCriticFinalizerCli(["finalize", "--root", fx.root, "--request", requestPath]);
    assert.equal(result.exitCode, 0);
    assert.equal(result.output.status, "completed");
    assert.equal(result.output.receipt.session.id, "session-cli-1");
  } finally { cleanup(fx); }
});

test("CLI refuses a valid returned verdict when no prelaunch admission exists", () => {
  const fx = fixture();
  try {
    writeFileSync(join(fx.root, "evidence", "critic-verdict.json"), `${JSON.stringify(verdict())}\n`);
    // A physical scratch request gets past the request-file check; admission is looked up before any batch is consulted.
    const requestPath = writeScratchRequest(fx, "finalize-request.json", cliRequest(fx));
    const result = runSessionCriticFinalizerCli(["finalize", "--root", fx.root, "--request", requestPath]);
    assert.equal(result.exitCode, 2);
    assert.equal(result.output.code, "SCF-PRELAUNCH-ADMISSION");
    assert.equal(existsSync(join(fx.root, ".git", "agent-pipeline", "critic-packets", "6".repeat(32))), false);
  } finally { cleanup(fx); }
});

test("CLI closes argv/request vocabulary and reports typed exit-2 errors", () => {
  const fx = fixture();
  try {
    writeFileSync(join(fx.root, "evidence", "critic-verdict.json"), `${JSON.stringify(verdict())}\n`);
    // The bad request must be a physical scratch file: anywhere else it is refused as a request file, not as a vocabulary violation.
    const badRequest = writeScratchRequest(fx, "bad-request.json", { ...cliRequest(fx), command: "extra" });
    for (const [result, code] of [
      [runSessionCriticFinalizerCli(["finalize", "--root", fx.root]), "SCF-USAGE"],
      [runSessionCriticFinalizerCli(["finalize", "--root", fx.root, "--request", badRequest]), "SCF-REQUEST"],
      [runSessionCriticFinalizerCli(["finalize", "--root", fx.root, "--request", "../outside.json"]), "SCF-REQUEST-FILE"],
    ]) {
      assert.equal(result.exitCode, 2);
      assert.equal(result.output.schema, SESSION_CRITIC_CLI_ERROR_SCHEMA);
      assert.equal(result.output.status, "rejected");
      assert.equal(result.output.code, code);
    }
    assert.equal(existsSync(join(fx.root, ".git", "agent-pipeline", "critic-packets")), false);
  } finally { cleanup(fx); }
});

test("a foreign failure inside the generic batch keeps CGB-PHYSICAL and surfaces its original cause", () => {
  const root = mkdtempSync(join(tmpdir(), "session-critic-finalizer-cause-"));
  try {
    const input = { controlRoot: join(root, "missing", "critic-packets"), packetId: "6".repeat(32),
      batchRef: { batchId: "7".repeat(32), registrationSha256: "8".repeat(64) },
      memberSha256: "9".repeat(64), preflightSha256: "a".repeat(64) };
    // A control root whose parent does not exist makes the filesystem, not the batch, fail.
    assert.throws(() => readReservedGenericCriticBatchAdmission(input),
      (error) => error.name === "GenericCriticBatchError" && error.code === "CGB-PHYSICAL" && error.cause === "ENOENT");
    // A refusal the batch itself raises is passed through untouched and carries no cause.
    assert.throws(() => readReservedGenericCriticBatchAdmission({ controlRoot: input.controlRoot }),
      (error) => error.name === "GenericCriticBatchError" && error.code === "CGB-SHAPE" && !Object.hasOwn(error, "cause"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// Evidence export. The Critic's notes live in ignored scratch/ and its receipt in the git-private journal, so
// neither outlives the session; `export` publishes both as tracked project evidence. Every case below reaches
// its consumed packet through the product's own admit -> finalize route.
const EXPORT_FILES = Object.freeze(["receipt.json", "report.md", "index.json"]);
function sha(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function criticNotes(fx, text = "# Critic notes\n\nNo findings.\n", name = "critic-notes.md") {
  mkdirSync(join(fx.root, "scratch"), { recursive: true });
  writeFileSync(join(fx.root, "scratch", name), text);
  return `scratch/${name}`;
}
function exportOptions(fx, packetId, overrides = {}) {
  return { root: fx.root, packetId, reportPath: "scratch/critic-notes.md", outDir: `specs/alpha/evidence/critic/${packetId}`, ...overrides };
}
function refused(action, code) {
  assert.throws(action, (error) => error instanceof SessionCriticFinalizerError && error.code === code, code);
}
function journalReceiptBody(fx, packetId) {
  return JSON.parse(readFileSync(join(fx.root, ".git", "agent-pipeline", "critic-packets", packetId, "receipt.json"), "utf8")).body;
}

test("export publishes a consumed review as receipt, report and index with matching hashes", () => {
  const fx = fixture();
  try {
    const packetId = "1".repeat(32);
    assert.equal(finalizeSessionCriticReview(preadmitted(fx, { packetId })).status, "completed");
    const notes = "# Critic notes\n\nNo findings.\n";
    criticNotes(fx, notes);
    const options = exportOptions(fx, packetId);
    const result = exportSessionCriticEvidence(options);
    assert.equal(result.schema, SESSION_CRITIC_EXPORT_RESULT_SCHEMA);
    assert.equal(result.status, "exported");
    assert.equal(result.outDir, options.outDir);
    assert.deepEqual(result.paths, EXPORT_FILES.map((name) => `${options.outDir}/${name}`));
    assert.deepEqual(readdirSync(join(fx.root, options.outDir)).sort(), [...EXPORT_FILES].sort());
    const receiptBytes = readFileSync(join(fx.root, options.outDir, "receipt.json"), "utf8");
    assert.equal(receiptBytes, canonicalJson(journalReceiptBody(fx, packetId)), "the receipt is the journal record body, byte for byte");
    assert.equal(validateSessionCriticReceipt(JSON.parse(receiptBytes)).packetId, packetId);
    const reportBytes = readFileSync(join(fx.root, options.outDir, "report.md"));
    assert.equal(reportBytes.toString("utf8"), notes);
    const indexBytes = readFileSync(join(fx.root, options.outDir, "index.json"));
    const index = JSON.parse(indexBytes.toString("utf8"));
    assert.deepEqual(Object.keys(index).sort(), ["candidate", "findingCount", "packetId", "receiptSha256", "reportSha256", "reviewPass", "schema"]);
    assert.deepEqual(index, {
      schema: SESSION_CRITIC_EVIDENCE_INDEX_SCHEMA, packetId, candidate: { commit: fx.candidate, tree: fx.tree },
      receiptSha256: sha(receiptBytes), reportSha256: sha(reportBytes), reviewPass: true, findingCount: 0,
    });
    assert.equal(result.receiptSha256, index.receiptSha256);
    assert.equal(result.reportSha256, index.reportSha256);
    assert.equal(result.indexSha256, sha(indexBytes));
    // The journal is only read, and a second export of the same review is refused instead of overwriting.
    assert.equal(canonicalJson(journalReceiptBody(fx, packetId)), receiptBytes);
    refused(() => exportSessionCriticEvidence(options), "SCF-EXPORT-EXISTS");
    assert.equal(readFileSync(join(fx.root, options.outDir, "report.md"), "utf8"), notes);
  } finally { cleanup(fx); }
});

test("a failing review exports too, with reviewPass false and its finding count", () => {
  const fx = fixture();
  try {
    const packetId = "2".repeat(32);
    const finding = { gap: "missing edge", risk: "failure", severity: "minor", evidence: "specs/spec.md:1", spec_ref: "AC-1" };
    const done = finalizeSessionCriticReview(preadmitted(fx, { packetId, verdict: verdict({ findings: [finding], pass: false }) }));
    assert.equal(done.status, "completed");
    assert.equal(done.receipt.reviewPass, false);
    criticNotes(fx, "# Critic notes\n\nOne minor finding.\n");
    const options = exportOptions(fx, packetId);
    exportSessionCriticEvidence(options);
    const index = JSON.parse(readFileSync(join(fx.root, options.outDir, "index.json"), "utf8"));
    assert.equal(index.reviewPass, false);
    assert.equal(index.findingCount, 1);
    const receipt = JSON.parse(readFileSync(join(fx.root, options.outDir, "receipt.json"), "utf8"));
    assert.equal(receipt.reviewPass, false);
    assert.equal(sha(readFileSync(join(fx.root, options.outDir, "receipt.json"))), index.receiptSha256);
  } finally { cleanup(fx); }
});

test("export refuses an unconsumed packet, an unsafe destination and an unusable report without publishing", () => {
  const fx = fixture();
  try {
    const packetId = "3".repeat(32);
    const request = preadmitted(fx, { packetId });
    criticNotes(fx);
    // Claimed but never finalized, and a packet that was never admitted: neither has a consumed receipt.
    refused(() => exportSessionCriticEvidence(exportOptions(fx, packetId)), "SCF-EXPORT-UNCONSUMED");
    refused(() => exportSessionCriticEvidence(exportOptions(fx, "9".repeat(32))), "SCF-EXPORT-UNCONSUMED");
    assert.equal(finalizeSessionCriticReview(request).status, "completed");
    for (const outDir of [
      `evidence/critic/${packetId}`, `specs/alpha/evidence/critic/${"4".repeat(32)}`, "specs/alpha/evidence/critic",
      `specs/alpha/evidence/critic/${packetId}/`, `specs/../evidence/critic/${packetId}`,
      `specs/a b/evidence/critic/${packetId}`, `/tmp/specs/alpha/evidence/critic/${packetId}`,
    ]) refused(() => exportSessionCriticEvidence(exportOptions(fx, packetId, { outDir })), "SCF-EXPORT-PATH");
    for (const reportPath of ["../notes.md", "scratch/../notes.md", "/etc/hostname", ".git/HEAD", "scratch/", "./scratch/critic-notes.md"]) {
      refused(() => exportSessionCriticEvidence(exportOptions(fx, packetId, { reportPath })), "SCF-EXPORT-PATH");
    }
    refused(() => exportSessionCriticEvidence(exportOptions(fx, packetId, { reportPath: "scratch/absent.md" })), "SCF-EXPORT-REPORT-MISSING");
    refused(() => exportSessionCriticEvidence(exportOptions(fx, packetId, { reportPath: criticNotes(fx, "", "empty.md") })), "SCF-EXPORT-REPORT-MISSING");
    let linked = false;
    try {
      symlinkSync(join(fx.root, "scratch", "critic-notes.md"), join(fx.root, "scratch", "link.md"));
      symlinkSync(join(fx.root, "evidence"), join(fx.root, "specs", "linked"));
      linked = true;
    } catch { /* a host that may not create symlinks cannot create the hazard either */ }
    if (linked) {
      refused(() => exportSessionCriticEvidence(exportOptions(fx, packetId, { reportPath: "scratch/link.md" })), "SCF-EXPORT-PATH");
      refused(() => exportSessionCriticEvidence(exportOptions(fx, packetId, { outDir: `specs/linked/evidence/critic/${packetId}` })), "SCF-EXPORT-PATH");
    }
    assert.equal(existsSync(join(fx.root, "specs", "alpha")), false);
    assert.equal(existsSync(join(fx.root, "evidence", "critic")), false);
    const options = exportOptions(fx, packetId);
    mkdirSync(join(fx.root, options.outDir), { recursive: true });
    refused(() => exportSessionCriticEvidence(options), "SCF-EXPORT-EXISTS");
    assert.deepEqual(readdirSync(join(fx.root, options.outDir)), []);
  } finally { cleanup(fx); }
});

test("the export verb runs from a scratch request with no git on PATH and closes its request vocabulary", () => {
  const fx = fixture();
  try {
    const packetId = "5".repeat(32);
    assert.equal(finalizeSessionCriticReview(preadmitted(fx, { packetId })).status, "completed");
    const reportPath = criticNotes(fx);
    const outDir = `specs/beta/evidence/critic/${packetId}`;
    const good = { schema: SESSION_CRITIC_EXPORT_REQUEST_SCHEMA, packetId, reportPath, outDir };
    const requestPath = writeScratchRequest(fx, "export-request.json", good);
    // A child with an empty PATH: any git invocation on the export route would fail it rather than pass unnoticed.
    const script = fileURLToPath(new URL("./session-critic-finalizer.mjs", import.meta.url));
    const child = spawnSync(process.execPath, [script, "export", "--root", fx.root, "--request", requestPath],
      { encoding: "utf8", env: { ...process.env, PATH: "" } });
    assert.equal(child.status, 0, `${child.stdout}${child.stderr}`);
    const output = JSON.parse(child.stdout);
    assert.equal(output.schema, SESSION_CRITIC_EXPORT_RESULT_SCHEMA);
    assert.equal(output.status, "exported");
    assert.equal(output.packetId, packetId);
    assert.deepEqual(readdirSync(join(fx.root, outDir)).sort(), [...EXPORT_FILES].sort());
    assert.equal(readFileSync(join(fx.root, outDir, "receipt.json"), "utf8"), canonicalJson(journalReceiptBody(fx, packetId)));
    const unwritten = `specs/beta/evidence/critic/${"6".repeat(32)}`;
    for (const [request, code] of [
      [{ ...good, extra: 1 }, "SCF-EXPORT-REQUEST"],
      [{ schema: good.schema, packetId, reportPath }, "SCF-EXPORT-REQUEST"],
      [{ ...good, schema: "pipeline.session-critic-export-request.v2" }, "SCF-EXPORT-REQUEST"],
      [{ ...good, packetId: "NOT-A-PACKET" }, "SCF-EXPORT-REQUEST"],
      [{ ...good, reportPath: 7 }, "SCF-EXPORT-REQUEST"],
      [{ ...good, outDir: unwritten }, "SCF-EXPORT-PATH"],
      [good, "SCF-EXPORT-EXISTS"],
    ]) {
      const path = writeScratchRequest(fx, "bad-export-request.json", request);
      const result = runSessionCriticFinalizerCli(["export", "--root", fx.root, "--request", path]);
      assert.equal(result.exitCode, 2, code);
      assert.equal(result.output.schema, SESSION_CRITIC_CLI_ERROR_SCHEMA);
      assert.equal(result.output.status, "rejected");
      assert.equal(result.output.code, code);
    }
    for (const [argv, code] of [
      [["export", "--root", fx.root], "SCF-EXPORT-USAGE"],
      [["export", "--root", fx.root, "--request", "../outside.json"], "SCF-EXPORT-REQUEST-FILE"],
      [["exportx", "--root", fx.root, "--request", requestPath], "SCF-USAGE"],
    ]) assert.equal(runSessionCriticFinalizerCli(argv).output.code, code);
    assert.equal(existsSync(join(fx.root, unwritten)), false);
  } finally { cleanup(fx); }
});
