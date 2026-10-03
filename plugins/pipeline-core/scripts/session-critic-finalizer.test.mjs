#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isSafeTaskId } from "../lib/dispatch-record.mjs";
import { sha256Canonical } from "../lib/review-economy.mjs";
import { produceCriticDiagnostic } from "../lib/critic-diagnostic-producer.mjs";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { consumeCandidatePacket, inspectClaimedSessionAdmission } from "./critic-packet-preflight.mjs";
import { isSuccessfulSpawn } from "../lib/successful-spawn.mjs";

import {
  SESSION_CRITIC_ASSURANCE,
  SESSION_CRITIC_CLI_ERROR_SCHEMA,
  SESSION_CRITIC_FINALIZE_REQUEST_SCHEMA,
  SESSION_CRITIC_RECEIPT_SCHEMA,
  SessionCriticFinalizerError,
  admitSessionCriticReview,
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
  git(root, ["init", "-q"]);
  mkdirSync(join(root, ".claude"));
  mkdirSync(join(root, "specs"));
  mkdirSync(join(root, "evidence"));
  writeFileSync(join(root, ".claude", "pipeline.yaml"), "schema: pipeline.manifest.v0\n");
  writeFileSync(join(root, "specs", "spec.md"), "# Spec\n");
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
    log: [],
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
      guardrailPaths: [],
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
function preadmitted(fx, overrides = {}) {
  const request = options(fx, overrides);
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
      guardrailPaths: [],
      evidencePaths: ["evidence/verify.json"],
      priorCriticEvidencePath: null,
    },
    verdictPath: "evidence/critic-verdict.json",
    event: { eventOutPath: "evidence/review-action.json", featureId: "nova-b" },
    ...overrides,
  };
}

test("private task snapshot binds uppercase delivered-v3 bytes without exporting record prose", () => {
  const fx = fixture({ taskId: "ALF-HISTORICAL-01" });
  try {
    assert.equal(isSafeTaskId(fx.taskId), true);
    const request = options(fx, { packetId: "8".repeat(32) });
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
    const wrong = options(fx, { taskId: "ALF-WRONG-02", packetId: "9".repeat(32) });
    assert.throws(() => admitSessionCriticReview(wrong), (error) => error.code === "CPP-REVIEW-ADMISSION");
    const unsafe = options(fx, { taskId: "../ALF-HISTORICAL-01", packetId: "a".repeat(32) });
    assert.throws(() => admitSessionCriticReview(unsafe),
      (error) => error instanceof SessionCriticFinalizerError && error.code === "SCF-TASK");
  } finally { cleanup(fx); }
});

test("empty-tree packet base rejects a non-root authored candidate", () => {
  const fx = fixture();
  try {
    const emptyTree = git(fx.root, ["hash-object", "-t", "tree", "--stdin"], { input: "" });
    const request = options(fx, { packetId: "c".repeat(32) });
    request.preflightInput = { ...request.preflightInput, base: emptyTree };
    assert.throws(() => admitSessionCriticReview(request), (error) => error.code === "CPP-REF");
  } finally { cleanup(fx); }
});

test("prelaunch admission creates one claimed, digest-bound packet before the verdict exists", () => {
  const fx = fixture();
  try {
    const request = options(fx, { packetId: "9".repeat(32) });
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
    assert.throws(() => admitSessionCriticReview(request), (error) => error.code === "CPP-OVERWRITE");
  } finally { cleanup(fx); }
});

test("invalid optional Critic selection retains V3, while valid selection binds before packet creation", () => {
  const fx = fixture();
  try {
    const request = options(fx, { packetId: "8".repeat(32) });
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
    const approvedRequest = { ...request, packetId: "9".repeat(32) };
    const admitted = admitSessionCriticReview(approvedRequest, {
      modelRoleEnvironment: env,
      selectModelRoleForTaskFn: () => ({ ok: true, status: "ready",
        runner: "codex", taskRoute: "duty.critic_high_risk",
        modelId: "new-reviewed-model", effort: request.route.effortTier,
        readbackSha256: "a".repeat(64), receiptSha256: "b".repeat(64) }),
    });
    assert.equal(admitted.status, "admitted");
    const readback = inspectClaimedSessionAdmission({
      controlRoot, packetId: approvedRequest.packetId,
    });
    assert.equal(readback.packet.route.modelTier, "new-reviewed-model");
    assert.deepEqual(readback.packet.request.sessionBinding.modelRole, {
      schema: "pipeline.session-critic-model-role.v1", runner: "codex",
      taskRoute: "duty.critic_high_risk", modelId: "new-reviewed-model",
      effort: request.route.effortTier, readbackSha256: "a".repeat(64), receiptSha256: "b".repeat(64),
    });
  } finally { cleanup(fx); }
});

test("an admitted exact session model survives finalization without reselecting the V3 model", () => {
  for (const [runner, provider, env] of [
    ["codex", "openai", { CODEX_SESSION_ID: "fixture-codex-session" }],
    ["claude", "anthropic", { CLAUDE_CODE_SESSION_ID: "fixture-claude-session" }],
  ]) {
    const fx = fixture();
    try {
      const request = options(fx, { packetId: "a".repeat(32),
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
  try {
    const request = options(fx, { packetId: "7".repeat(32) });
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
    const throwingRequest = { ...request, packetId: "6".repeat(32) };
    admitSessionCriticReview(throwingRequest, {
      modelRoleEnvironment: { CODEX_SESSION_ID: "fixture-codex-session" },
      selectModelRoleForTaskFn: () => { throw new Error("optional selector unavailable"); },
    });
    const throwingReadback = inspectClaimedSessionAdmission({
      controlRoot: join(fx.root, common, "agent-pipeline", "critic-packets"),
      packetId: throwingRequest.packetId,
    });
    assert.equal(throwingReadback.packet.route.modelTier, request.route.modelTier);
    assert.equal(Object.hasOwn(throwingReadback.packet.request.sessionBinding, "modelRole"), false);
  } finally { cleanup(fx); }
});

test("high-risk T2 and normal T3 retain their V3 duties when optional selection is unavailable", () => {
  for (const [trigger, expected] of [["T2", "duty.critic_high_risk"],
    ["T3", "duty.critic_normal"]]) {
    const fx = fixture();
    try {
      const request = options(fx, { trigger });
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
    writeFileSync(join(fx.root, "evidence", "finalize-request.json"), `${JSON.stringify(cliRequest(fx))}\n`);
    const admission = runSessionCriticFinalizerCli(["admit", "--root", fx.root, "--request", "evidence/finalize-request.json"]);
    assert.equal(admission.exitCode, 0);
    assert.equal(admission.output.schema, "pipeline.session-critic-prelaunch-admission.v1");
    assert.equal(admission.output.packetId, "6".repeat(32));
    writeFileSync(join(fx.root, "evidence", "critic-verdict.json"), `${JSON.stringify(verdict())}\n`);
    const result = runSessionCriticFinalizerCli(["finalize", "--root", fx.root, "--request", "evidence/finalize-request.json"]);
    assert.equal(result.exitCode, 0);
    assert.equal(result.output.status, "completed");
    assert.equal(result.output.receipt.session.id, "session-cli-1");
  } finally { cleanup(fx); }
});

test("CLI refuses a valid returned verdict when no prelaunch admission exists", () => {
  const fx = fixture();
  try {
    writeFileSync(join(fx.root, "evidence", "critic-verdict.json"), `${JSON.stringify(verdict())}\n`);
    writeFileSync(join(fx.root, "evidence", "finalize-request.json"), `${JSON.stringify(cliRequest(fx))}\n`);
    const result = runSessionCriticFinalizerCli(["finalize", "--root", fx.root, "--request", "evidence/finalize-request.json"]);
    assert.equal(result.exitCode, 2);
    assert.equal(result.output.code, "SCF-PRELAUNCH-ADMISSION");
    assert.equal(existsSync(join(fx.root, ".git", "agent-pipeline", "critic-packets", "6".repeat(32))), false);
  } finally { cleanup(fx); }
});

test("CLI closes argv/request vocabulary and reports typed exit-2 errors", () => {
  const fx = fixture();
  try {
    writeFileSync(join(fx.root, "evidence", "critic-verdict.json"), `${JSON.stringify(verdict())}\n`);
    writeFileSync(join(fx.root, "evidence", "bad-request.json"), `${JSON.stringify({ ...cliRequest(fx), command: "extra" })}\n`);
    for (const result of [
      runSessionCriticFinalizerCli(["finalize", "--root", fx.root]),
      runSessionCriticFinalizerCli(["finalize", "--root", fx.root, "--request", "evidence/bad-request.json"]),
      runSessionCriticFinalizerCli(["finalize", "--root", fx.root, "--request", "../outside.json"]),
    ]) {
      assert.equal(result.exitCode, 2);
      assert.equal(result.output.schema, SESSION_CRITIC_CLI_ERROR_SCHEMA);
      assert.equal(result.output.status, "rejected");
    }
    assert.equal(existsSync(join(fx.root, ".git", "agent-pipeline", "critic-packets")), false);
  } finally { cleanup(fx); }
});
