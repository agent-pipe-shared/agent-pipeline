#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isSafeTaskId } from "../lib/dispatch-record.mjs";
import { sha256Canonical } from "../lib/review-economy.mjs";
import { produceCriticDiagnostic } from "../lib/critic-diagnostic-producer.mjs";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, realpathSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { canonicalJson, consumeCandidatePacket, inspectClaimedCandidatePacket, inspectClaimedSessionAdmission,
  readConsumedCandidateReceipt, readConsumedCandidateResult, readConsumedSessionAdmission,
  recordCandidateExport, blockCandidatePacket } from "./critic-packet-preflight.mjs";
import { createLocalDispatchEvidenceBinding, evaluateRepositoryCriticSkipCoverage } from "./check-critic-skip-coverage.mjs";
import { CRITIC_REQUIRED_SCHEMA, CRITIC_TRIGGER_INPUT_SCHEMA } from "../lib/critic-skip-decision.mjs";
import { CRITIC_DISPOSITION_ADDENDUM_SCHEMA, criticDispositionAddendumPath } from "../lib/critic-disposition-addendum.mjs";
import { execFileSync } from "node:child_process";
import { isSuccessfulSpawn } from "../lib/successful-spawn.mjs";
import { readReservedGenericCriticBatchAdmission, registerGenericCriticBatch } from "../lib/critic-generic-batch.mjs";
import * as CGB from "../lib/critic-generic-batch.mjs";
import * as CCA from "../lib/critic-course-admission.mjs";
import { readBoundConsumedCriticReceipt, readConsumedCriticCourseResult } from "../lib/critic-verify-lifecycle.mjs";
import { preflightCriticDispatch } from "./critic-dispatch-preflight.mjs";

import {
  SESSION_CRITIC_ASSURANCE,
  SESSION_CRITIC_CLI_ERROR_SCHEMA,
  SESSION_CRITIC_EVIDENCE_INDEX_SCHEMA,
  SESSION_CRITIC_EXPORT_REQUEST_SCHEMA,
  SESSION_CRITIC_EXPORT_RESULT_SCHEMA,
  SESSION_CRITIC_FINALIZE_REQUEST_SCHEMA,
  SESSION_CRITIC_FINALIZE_REQUEST_V2_SCHEMA,
  SESSION_CRITIC_FINALIZE_REQUEST_V3_SCHEMA,
  SESSION_CRITIC_RECEIPT_SCHEMA,
  SessionCriticFinalizerError,
  admitSessionCriticReview,
  describeCliError,
  exportSessionCriticEvidence,
  finalizeSessionCriticReview as finalizeRaw,
  runSessionCriticFinalizerCli,
  validateSessionCriticReceipt,
  validateSessionCriticResult,
} from "./session-critic-finalizer.mjs";

// Cut A: finalization needs a Source-issued origin record. The pre-existing cases exercise everything
// except the origin gate, so they get a bound stub through deps; the origin cases below call finalizeRaw.
const ORIGIN_SCHEMA = "pipeline.session-critic-source-return.v1";
function originStub(overrides = {}) {
  return (query) => ({
    schema: ORIGIN_SCHEMA, issuer: "source", packetId: query.packetId, packetDigest: query.packetDigest,
    claimant: query.claimant, sessionId: query.sessionId, verdictSha256: query.verdictSha256,
    issuedAtMs: Date.now() - 1000, expiresAtMs: Date.now() + 60000, ...overrides,
  });
}
function finalizeSessionCriticReview(options, deps = {}) {
  return finalizeRaw(options, { readOriginalSourceReturnFn: originStub(), ...deps });
}

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
function fixture({ rootCandidate = false, targetedExitCode = 0, taskId = "nova-b-lnd5", handover = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "session-critic-finalizer-"));
  git(root, ["init", "-q", "-b", "main"]);
  mkdirSync(join(root, ".claude"));
  mkdirSync(join(root, "specs"));
  mkdirSync(join(root, "evidence"));
  if (handover) {
    // D1: a calibration naming a handover file, committed with the base so it is readable at every later commit.
    mkdirSync(join(root, "project"));
    mkdirSync(join(root, "docs"));
    writeFileSync(join(root, "project", "pipeline.json"), `${JSON.stringify({ handover: "docs/state.md" })}\n`);
    writeFileSync(join(root, "docs", "state.md"), "# State\nbase\n");
  }
  writeFileSync(join(root, ".claude", "pipeline.yaml"), "schema: pipeline.manifest.v0\n");
  writeFileSync(join(root, "specs", "spec.md"), "# Spec\nAC-1 AC-2\n");
  // The review-unit purpose is committed with the base, before any work, and never touched again.
  writeFileSync(join(root, "specs", "review-unit.json"), JSON.stringify(reviewUnit()));
  const emptyTree = git(root, ["hash-object", "-t", "tree", "--stdin"], { input: "" });
  const base = rootCandidate ? emptyTree : commit(root, "base");
  if (!rootCandidate) writeFileSync(join(root, "specs", "spec.md"), "# Spec\n\nSource candidate.\n");
  if (handover && !rootCandidate) writeFileSync(join(root, "docs", "state.md"), "# State\nchanged inside the reviewed range\n");
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
      assurance: null,
      snapshotId: sha256Canonical({
        schema: "pipeline.local-dispatch-evidence.v1", taskId: fx.taskId,
        recordPath: fx.recordPath, recordSha256,
        sourceCandidateCommit: fx.historicalCandidate, reviewCandidateCommit: fx.candidate,
        assurance: null,
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

test("D60 (a) a first admit that fails after the claim is completed by the second admit without manual deletion", () => {
  const fx = fixture();
  try {
    const request = registered(fx, { packetId: "8".repeat(32) });
    assert.throws(() => admitSessionCriticReview(request, {
      publishClaimedSessionAdmissionFn() { throw new Error("simulated failure after claim"); },
    }));
    const second = admitSessionCriticReview(request);
    assert.ok(["admitted", "already-admitted"].includes(second.status));
    assert.equal(second.packetId, request.packetId);
    assert.equal(admitSessionCriticReview(request).status, "already-admitted");
  } finally { cleanup(fx); }
});

test("D60 (b) a registration blocked by a held packet is refused with CGB-HELD naming the packet and the release verb", () => {
  const fx = fixture();
  try {
    const request = registered(fx, { packetId: "7".repeat(32) });
    admitSessionCriticReview(request);
    const controlRoot = join(fx.root, ".git", "agent-pipeline", "critic-packets");
    rmSync(join(controlRoot, "generic-batches"), { recursive: true, force: true });
    assert.throws(() => registerGenericCriticBatch({ repoRoot: fx.root, controlRoot, declaration: {
      taskId: fx.taskId, baseCommit: fx.base, candidateCommit: fx.candidate,
      logicalWorkIds: ["AC-1", "AC-2"], specPath: "specs/spec.md", guardrailPaths: [".claude/pipeline.yaml"],
      signedQualityImportAnchor: null, reviewUnitPath: "specs/review-unit.json",
    } }), (error) => error.code === "CGB-HELD" && error.message.includes("7".repeat(32)) && error.message.includes("release"));
  } finally { cleanup(fx); }
});

function lostIndexDeclaration(fx) {
  return { taskId: fx.taskId, baseCommit: fx.base, candidateCommit: fx.candidate,
    logicalWorkIds: ["AC-1", "AC-2"], specPath: "specs/spec.md", guardrailPaths: [".claude/pipeline.yaml"],
    signedQualityImportAnchor: null, reviewUnitPath: "specs/review-unit.json" };
}

test("D60 c3 (a) the exact reported state: a claimed packet of task T and candidate C with no batch index hit is refused CGB-HELD at registration and is resumed by the second admit", () => {
  const fx = fixture();
  try {
    const request = registered(fx, { packetId: "6".repeat(32) });
    assert.throws(() => admitSessionCriticReview(request, {
      publishClaimedSessionAdmissionFn() { throw new Error("simulated failure after claim"); },
    }));
    const controlRoot = join(fx.root, ".git", "agent-pipeline", "critic-packets");
    // The state the Toolbox reported: the claimed packet exists, the logical and origins index entries do not.
    rmSync(join(controlRoot, "generic-batches", "logical"), { recursive: true, force: true });
    rmSync(join(controlRoot, "generic-batches", "origins"), { recursive: true, force: true });
    assert.throws(() => registerGenericCriticBatch({ repoRoot: fx.root, controlRoot, declaration: lostIndexDeclaration(fx) }),
      (error) => error.code === "CGB-HELD" && error.message.includes("6".repeat(32)));
    const second = admitSessionCriticReview(request);
    assert.ok(["admitted", "already-admitted"].includes(second.status), `second admit status ${second.status}`);
    assert.equal(second.packetId, request.packetId);
  } finally { cleanup(fx); }
});

test("D60 c3 (b) the release verb end to end through its real CLI entry frees a held review unit and is idempotent", () => {
  const fx = fixture();
  try {
    const request = registered(fx, { packetId: "5".repeat(32) });
    admitSessionCriticReview(request);
    const controlRoot = join(fx.root, ".git", "agent-pipeline", "critic-packets");
    rmSync(join(controlRoot, "generic-batches"), { recursive: true, force: true });
    const declaration = lostIndexDeclaration(fx);
    assert.throws(() => registerGenericCriticBatch({ repoRoot: fx.root, controlRoot, declaration }), (error) => error.code === "CGB-HELD");
    const requestPath = writeScratchRequest(fx, "release-request.json", {
      schema: "pipeline.session-critic-release-request.v1", packetId: request.packetId, reason: "toolbox held packet closure" });
    const script = fileURLToPath(new URL("./session-critic-finalizer.mjs", import.meta.url));
    const run = () => spawnSync(process.execPath, [script, "release", "--root", fx.root, "--request", requestPath], { encoding: "utf8" });
    const first = run();
    assert.equal(first.status, 0, `${first.stdout}${first.stderr}`);
    const receipt = JSON.parse(first.stdout);
    assert.equal(receipt.status, "released");
    assert.equal(receipt.packetId, request.packetId);
    const audit = readFileSync(join(controlRoot, "released", "audit.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(audit.length, 1);
    assert.equal(audit[0].packetId, request.packetId);
    assert.equal(audit[0].reason, "toolbox held packet closure");
    assert.equal(existsSync(join(controlRoot, request.packetId)), false);
    // The same candidate no longer meets CGB-HELD.
    const again = registerGenericCriticBatch({ repoRoot: fx.root, controlRoot, declaration });
    assert.match(again.memberSha256, /^[a-f0-9]{64}$/u);
    const second = run();
    assert.equal(second.status, 0, `${second.stdout}${second.stderr}`);
    assert.equal(JSON.parse(second.stdout).status, "already-released");
    assert.equal(readFileSync(join(controlRoot, "released", "audit.jsonl"), "utf8").trim().split("\n").length, 1);
  } finally { cleanup(fx); }
});

function failedAdmitWithLostIndex(fx, packetId) {
  const request = registered(fx, { packetId });
  assert.throws(() => admitSessionCriticReview(request, {
    publishClaimedSessionAdmissionFn() { throw new Error("simulated failure after claim"); },
  }));
  const controlRoot = join(fx.root, ".git", "agent-pipeline", "critic-packets");
  rmSync(join(controlRoot, "generic-batches", "logical"), { recursive: true, force: true });
  rmSync(join(controlRoot, "generic-batches", "origins"), { recursive: true, force: true });
  return { request, controlRoot };
}

test("D60 c4 (a) a held packet of a DIFFERENT candidate is refused CGB-HELD naming the packet and the release verb", () => {
  const fx = fixture();
  try {
    const { request, controlRoot } = failedAdmitWithLostIndex(fx, "4".repeat(32));
    writeFileSync(join(fx.root, "specs", "spec.md"), "# Spec\n\nOther candidate.\n");
    const other = commit(fx.root, "other candidate");
    assert.notEqual(other, fx.candidate);
    assert.throws(() => registerGenericCriticBatch({ repoRoot: fx.root, controlRoot, declaration: { ...lostIndexDeclaration(fx), candidateCommit: other } }),
      (error) => error.code === "CGB-HELD" && error.message.includes("4".repeat(32)) && error.message.includes("release"),
      "D60 c4 (a): registration of another candidate must name the held packet and the release verb");
    assert.throws(() => admitSessionCriticReview({ ...request, preflightInput: { ...request.preflightInput, candidate: other } }),
      undefined, "D60 c4 (a): admit of another candidate must not resume the held packet");
  } finally { cleanup(fx); }
});

test("D60 c4 (c) a republished index that conflicts with another batch fails closed with CGB-CONFLICT and keeps the foreign entry", () => {
  const fx = fixture();
  try {
    const { request, controlRoot } = failedAdmitWithLostIndex(fx, "3".repeat(32));
    const logicalDir = join(controlRoot, "generic-batches", "logical");
    mkdirSync(logicalDir, { recursive: true, mode: 0o700 });
    const foreignPath = join(logicalDir, `${sha256Canonical("AC-1")}.json`);
    const foreign = { schema: "pipeline.critic-generic-index.v1", kind: "logical", identity: "AC-1",
      batchRef: { batchId: "f".repeat(32), registrationSha256: "e".repeat(64) } };
    writeFileSync(foreignPath, canonicalJson(foreign), { mode: 0o600 });
    const before = readFileSync(foreignPath, "utf8");
    assert.throws(() => admitSessionCriticReview(request), (error) => error.code === "CGB-CONFLICT",
      "D60 c4 (c): the second admit must surface CGB-CONFLICT");
    assert.equal(readFileSync(foreignPath, "utf8"), before, "D60 c4 (c): the foreign entry is not overwritten");
  } finally { cleanup(fx); }
});

test("D60 path: failed admit after the claim, lost index, resume, finalize, export write and read, consumed reads", () => {
  const fx = fixture();
  try {
    const packetId = "2".repeat(32);
    const controlRoot = controlRootOf(fx);
    const { request } = e2eStep("first admit fails after the claim; batch index lost", () => failedAdmitWithLostIndex(fx, packetId));
    e2eStep("second admit resumes the same candidate", () => {
      const second = admitSessionCriticReview(request);
      assert.ok(["admitted", "already-admitted"].includes(second.status), `status ${second.status}`);
    });
    e2eStep("finalize", () => { assert.equal(finalizeSessionCriticReview(request).status, "completed"); });
    e2eStep("consumed receipt read", () => { assert.equal(readConsumedCandidateReceipt({ controlRoot, packetId }).receipt.packetId, packetId); });
    e2eStep("consumed session admission read (the review lineage input)", () => {
      assert.equal(readConsumedSessionAdmission({ controlRoot, packetId }).admission.packetId, packetId);
    });
    e2eStep("export write", () => {
      criticNotes(fx);
      assert.equal(exportSessionCriticEvidence(exportOptions(fx, packetId)).status, "exported");
    });
    e2eStep("export read back", () => {
      const dir = join(fx.root, `specs/alpha/evidence/critic/${packetId}`);
      assert.deepEqual(readdirSync(dir).sort(), [...EXPORT_FILES].sort());
      assert.equal(JSON.parse(readFileSync(join(dir, "index.json"), "utf8")).packetId, packetId);
    });
  } finally { cleanup(fx); }
});

test("D60 path release: a held packet blocking another candidate is released through the real CLI and the admitted candidate then succeeds", () => {
  const fx = fixture();
  try {
    const heldId = "1a".repeat(16);
    const { controlRoot } = e2eStep("held packet", () => failedAdmitWithLostIndex(fx, heldId));
    e2eStep("other candidate blocked", () => {
      writeFileSync(join(fx.root, "specs", "spec.md"), "# Spec\n\nOther candidate.\n");
      const other = commit(fx.root, "other candidate");
      assert.throws(() => registerGenericCriticBatch({ repoRoot: fx.root, controlRoot, declaration: { ...lostIndexDeclaration(fx), candidateCommit: other } }),
        (error) => error.code === "CGB-HELD");
    });
    e2eStep("release through the CLI", () => {
      const requestPath = writeScratchRequest(fx, "release-request.json", {
        schema: "pipeline.session-critic-release-request.v1", packetId: heldId, reason: "path verification" });
      const script = fileURLToPath(new URL("./session-critic-finalizer.mjs", import.meta.url));
      const run = spawnSync(process.execPath, [script, "release", "--root", fx.root, "--request", requestPath], { encoding: "utf8" });
      assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
      assert.equal(JSON.parse(run.stdout).status, "released");
    });
    e2eStep("next admit of the admitted candidate", () => {
      rmSync(join(controlRoot, "generic-batches"), { recursive: true, force: true });
      delete fx.batch;
      assert.equal(admitSessionCriticReview(registered(fx, { packetId: "1b".repeat(16) })).status, "admitted");
    });
  } finally { cleanup(fx); }
});

test("D60 c7 pin: a held packet of declaration task A does not hold a second declaration of another task, because the delivery target embeds that task's own record", () => {
  const fx = fixture();
  try {
    const { controlRoot } = failedAdmitWithLostIndex(fx, "9b".repeat(16));
    const record = JSON.parse(fx.recordBytes);
    const otherTask = "nova-b-other";
    writeFileSync(join(fx.root, `evidence/dispatch-record-${otherTask}.json`), `${JSON.stringify({ ...record, taskId: otherTask }, null, 2)}\n`);
    const other = commit(fx.root, "second delivery record, same source candidate");
    const declaration = { ...lostIndexDeclaration(fx), taskId: otherTask, candidateCommit: other };
    // declarationSource builds the target from the binding of declaration.taskId, so the target task IS the declaration task.
    assert.match(registerGenericCriticBatch({ repoRoot: fx.root, controlRoot, declaration }).memberSha256, /^[a-f0-9]{64}$/u,
      "D60 c7 pin: a different declaration task is registered, not refused");
    assert.equal(existsSync(join(controlRoot, "9b".repeat(16))), true, "the held packet of task A is untouched");
  } finally { cleanup(fx); }
});

// D60 c7: a real feature-course fixture (the shape of critic-dispatch-preflight.test.mjs prepareIndexedFeature).
function featureCourseFixture(featureId = "held-feature", logicalWorkIds = ["scope-one", "scope-two"], taskId = "feature-held-task") {
  const root = mkdtempSync(join(tmpdir(), "session-critic-feature-"));
  git(root, ["init", "-q", "-b", "main"]);
  mkdirSync(join(root, ".claude"), { recursive: true });
  mkdirSync(join(root, "governance", "guidelines"), { recursive: true });
  mkdirSync(join(root, "governance", "policies"), { recursive: true });
  writeFileSync(join(root, ".claude", "pipeline.yaml"), "schema: pipeline.manifest.v0\ngovernance:\n  guidelines_path: governance/guidelines\n  policies_path: governance/policies\n");
  writeFileSync(join(root, "governance", "guidelines", "review.md"), "Review changed code.\n");
  writeFileSync(join(root, "governance", "policies", "checklist.md"), "- verify\n");
  writeFileSync(join(root, ".gitignore"), "/evidence/\n");
  commit(root, "base");
  const prefix = `specs/${featureId}`;
  const specPath = `${prefix}/spec.md`, manifestPath = `${prefix}/lifecycle.json`, unitPath = `${prefix}/design/critic-review-unit.json`;
  mkdirSync(join(root, prefix, "design"), { recursive: true });
  mkdirSync(join(root, prefix, "evidence"), { recursive: true });
  writeFileSync(join(root, specPath), "# Complete behavior\nAC-1: deliver complete behavior\n");
  const unit = { schema: "pipeline.critic-review-unit.v1", kind: "feature-section", purpose: "Deliver one complete behavior", specPath, logicalWorkIds, criterionIds: ["AC-1"], deliveryBoundary: { mainRef: git(root, ["symbolic-ref", "HEAD"]) }, singletonRationale: null };
  writeFileSync(join(root, unitPath), JSON.stringify(unit));
  const manifest = { schema: "pipeline.feature-package.v1", feature: { id: featureId, rigor: 2 }, state: "approved", artifacts: [
    { class: "spec", path: specPath, sha256: sha(readFileSync(join(root, specPath))), authority: true, mutability: "mutable", retention: "active" },
    { class: "design", path: unitPath, sha256: sha(readFileSync(join(root, unitPath))), authority: false, mutability: "immutable", retention: "retain" }] };
  writeFileSync(join(root, manifestPath), JSON.stringify(manifest));
  const base = commit(root, "declare feature review unit");
  writeFileSync(join(root, specPath), "# Complete behavior\nAC-1: deliver complete behavior\nImplemented behavior.\n");
  manifest.artifacts[0].sha256 = sha(readFileSync(join(root, specPath)));
  writeFileSync(join(root, manifestPath), JSON.stringify(manifest));
  const candidate = commit(root, "integrate feature behavior");
  const record = { schema: "pipeline.dispatch-record.v3", taskId, agentType: "default", model: "gpt-5.6-luna", effort: "medium", rulesetSha: "b7797309cf6abe175fd52b0a8749d82b43714ea0", dispatcher: "elephant", outcome: "completed", commits: [candidate], candidateCommit: candidate, resultSha256: "a".repeat(64), log: [{ phase: "implement", toolUseCount: 1 }], report: { text: "done", changedFiles: [specPath] }, criticRequired: { schema: "pipeline.critic-required-decision.v1", trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 2, riskClass: "high", riskFlag: true, diff: { mechanical: false, architecture: false, guardrails: true, security: false } }, appliedRow: "T1" } };
  mkdirSync(join(root, "evidence"), { recursive: true });
  writeFileSync(join(root, `evidence/dispatch-record-${taskId}.json`), JSON.stringify(record));
  const logPath = `${prefix}/evidence/targeted.log`, diagnosticPath = `${prefix}/evidence/diagnostic.json`, capturedPath = `evidence/${featureId}-targeted.log`;
  const diagnostic = produceCriticDiagnostic({ root, candidate, specPath, guardrailPaths: [".claude/pipeline.yaml", "governance/guidelines/review.md", "governance/policies/checklist.md"], command: [process.execPath, "-e", "process.exit(0)"], logPath: capturedPath });
  writeFileSync(join(root, logPath), readFileSync(join(root, capturedPath)));
  diagnostic.targeted.log.path = logPath;
  writeFileSync(join(root, diagnosticPath), JSON.stringify(diagnostic));
  for (const path of [logPath, diagnosticPath]) manifest.artifacts.push({ class: "candidate-evidence", path, sha256: sha(readFileSync(join(root, path))), authority: false, mutability: "immutable", retention: "retain" });
  writeFileSync(join(root, manifestPath), JSON.stringify(manifest));
  const registrationCommit = commit(root, "register captured feature diagnostics");
  const preflightInput = { root, base, candidate, specPath, guardrailPaths: [], evidencePaths: [diagnosticPath], priorCriticEvidencePath: null, courseContext: { featureId, registrationCommit, acceptedReference: null, criterionLocator: null, deltaRequestPath: null } };
  return { root, candidate, request: { preflightInput, taskId, projectId: "pipeline", sessionId: "feature-held-review", packetId: "9a".repeat(16), route: options({ taskId }).route } };
}

test("D60 c7 (a) the feature-request path: a packet left claimed without admission by a failed first admit is completed by the second admit", () => {
  const fx = featureCourseFixture();
  try {
    assert.throws(() => admitSessionCriticReview(fx.request, { publishClaimedSessionAdmissionFn() { throw new Error("simulated failure after claim"); } }));
    assert.equal(existsSync(join(controlRootOf(fx), fx.request.packetId)), true, "a claimed packet is held");
    let second;
    try { second = admitSessionCriticReview(fx.request); } catch (error) { second = { thrown: error.code ?? error.constructor.name, text: String(error.message).split("\n")[0] }; }
    assert.ok(["admitted", "already-admitted"].includes(second.status), `D60 c7 (a): second admit ended ${JSON.stringify(second)}`);
    assert.equal(second.packetId, fx.request.packetId);
  } finally { cleanup(fx); }
});

test("D60 c7 (a) pin: the feature-request completion is only for the same task; another task on the same packet id keeps the admission refusal", () => {
  const fx = featureCourseFixture();
  try {
    assert.throws(() => admitSessionCriticReview(fx.request, { publishClaimedSessionAdmissionFn() { throw new Error("simulated failure after claim"); } }));
    assert.throws(() => admitSessionCriticReview({ ...fx.request, taskId: "feature-other-task" }), (error) => error.code === "CPP-SESSION-ADMISSION");
    assert.equal(admitSessionCriticReview(fx.request).status, "admitted");
    assert.equal(admitSessionCriticReview(fx.request).status, "already-admitted");
  } finally { cleanup(fx); }
});

test("D60 c8 pin: the feature-request path refuses another candidate on its exact-candidate evidence binding, leaves the held packet alone, and the original request still completes", () => {
  const fx = featureCourseFixture();
  try {
    assert.throws(() => admitSessionCriticReview(fx.request, { publishClaimedSessionAdmissionFn() { throw new Error("simulated failure after claim"); } }));
    const heldDir = join(controlRootOf(fx), fx.request.packetId);
    assert.equal(existsSync(heldDir), true, "a claimed packet is held");
    const heldNames = readdirSync(heldDir).sort();
    writeFileSync(join(fx.root, "specs", "other-candidate.md"), "other\n");
    const other = commit(fx.root, "other candidate");
    assert.notEqual(other, fx.candidate);
    assert.throws(() => admitSessionCriticReview({ ...fx.request, packetId: "9b".repeat(16), preflightInput: { ...fx.request.preflightInput, candidate: other } }),
      (error) => error.code === "CDP-EVIDENCE-BINDING", "D60 c8: another candidate is refused by the exact-candidate evidence binding, not resumed");
    assert.deepEqual(readdirSync(heldDir).sort(), heldNames, "D60 c8: the held packet is untouched");
    assert.equal(existsSync(join(controlRootOf(fx), "9b".repeat(16))), false, "D60 c8: the refused request claims no packet of its own");
    assert.equal(admitSessionCriticReview(fx.request).status, "admitted", "D60 c8: the original request completes the held packet");
  } finally { cleanup(fx); }
});

// D61: a REAL second process runs the real registration, is parked inside the transaction right after the
// transaction itself wrote owner.json (before any index entry), and is then SIGKILLed: the lock it leaves is
// the lock a consumer holds after an aborted registration.
async function abandonedRegistrationHolder(fx, moduleUrl = new URL("../lib/critic-generic-batch.mjs", import.meta.url).href) {
  const controlRoot = join(fx.root, ".git", "agent-pipeline", "critic-packets");
  mkdirSync(controlRoot, { recursive: true, mode: 0o700 });
  chmodSync(join(fx.root, ".git", "agent-pipeline"), 0o700);
  chmodSync(controlRoot, 0o700);
  const store = join(controlRoot, "generic-batches");
  const lock = join(store, "transaction.lock");
  const ownerFile = join(lock, "owner.json");
  const payload = JSON.stringify({ repoRoot: fx.root, controlRoot, declaration: {
    taskId: fx.taskId, baseCommit: fx.base, candidateCommit: fx.candidate,
    logicalWorkIds: ["AC-1", "AC-2"], specPath: "specs/spec.md", guardrailPaths: [".claude/pipeline.yaml"],
    signedQualityImportAnchor: null, reviewUnitPath: "specs/review-unit.json" } });
  const child = spawn(process.execPath, ["--input-type=module", "-e",
    "import crypto from 'node:crypto';import {syncBuiltinESMExports} from 'node:module';import {existsSync,writeSync} from 'node:fs';"
    + "const [,moduleUrl,ownerPath,input]=process.argv.slice(1);const real=crypto.randomBytes;"
    + "crypto.randomBytes=(...a)=>{if(existsSync(ownerPath)){writeSync(1,'held\\n');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);}return real(...a);};"
    + "syncBuiltinESMExports();const m=await import(moduleUrl);m.registerGenericCriticBatch(JSON.parse(input));",
    fx.root, moduleUrl, ownerFile, payload], { stdio: ["ignore", "pipe", "pipe"] });
  let errors = ""; child.stderr.on("data", (b) => { errors += b; });
  await new Promise((resolve, reject) => {
    child.stdout.on("data", (b) => { if (String(b).includes("held")) resolve(); });
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`the owner ended (${code}) without holding a lock owner record: ${errors.slice(0, 400)}`)));
  });
  const kill = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const gone = new Promise((done) => child.once("exit", done)); child.kill("SIGKILL"); await gone;
  };
  return { child, kill, controlRoot, store, lock, ownerFile };
}
const FINALIZER_SCRIPT = fileURLToPath(new URL("./session-critic-finalizer.mjs", import.meta.url));
function runBatchRecoveryVerb(fx, verb, request) {
  const args = [FINALIZER_SCRIPT, verb, "--root", fx.root];
  if (request !== undefined) args.push("--request", writeScratchRequest(fx, `${verb}.json`, request));
  const run = spawnSync(process.execPath, args, { encoding: "utf8" });
  return { status: run.status, out: JSON.parse(run.stdout) };
}
const RECOVER_SCHEMA = "pipeline.session-critic-batch-recovery-request.v1";

test("D61 the real killed-child lock is inspected and recovered through the verbs, then admit succeeds", async () => {
  const fx = fixture(); let holder = null;
  try {
    holder = await abandonedRegistrationHolder(fx);
    await holder.kill();
    const held = (() => { try { batchFor(fx); } catch (error) { return error; } return null; })();
    assert.equal(held?.code, "CGB-HELD", "D61: the registration over the abandoned lock is refused CGB-HELD");
    assert.ok(held.message.includes("inspect-batch-recovery") && held.message.includes("recover-batch"), `D61: the CGB-HELD text names both verbs: ${held.message}`);
    const inspected = runBatchRecoveryVerb(fx, "inspect-batch-recovery");
    assert.equal(inspected.status, 0); assert.equal(inspected.out.status, "empty-store-held");
    const recovered = runBatchRecoveryVerb(fx, "recover-batch", { schema: RECOVER_SCHEMA, digestSha256: inspected.out.digestSha256 });
    assert.equal(recovered.status, 0); assert.equal(recovered.out.status, "released");
    assert.equal(existsSync(holder.lock), false);
    assert.equal(admitSessionCriticReview(registered(fx, { packetId: "d6".repeat(16) })).status, "admitted");
  } finally { if (holder) await holder.kill(); cleanup(fx); }
});

async function recoveredStore(fx) {
  const holder = await abandonedRegistrationHolder(fx);
  await holder.kill();
  const inspected = runBatchRecoveryVerb(fx, "inspect-batch-recovery").out;
  assert.equal(runBatchRecoveryVerb(fx, "recover-batch", { schema: RECOVER_SCHEMA, digestSha256: inspected.digestSha256 }).out.status, "released");
  return holder;
}

test("D61 path after recovery: admit, finalize, consumed receipt read, export write and read back over the recovered store", async () => {
  const fx = fixture(); let holder = null;
  try {
    holder = await recoveredStore(fx);
    const packetId = "d7".repeat(16);
    const controlRoot = controlRootOf(fx);
    const request = registered(fx, { packetId });
    e2eStep("admit", () => { assert.equal(admitSessionCriticReview(request).status, "admitted"); });
    e2eStep("finalize", () => { assert.equal(finalizeSessionCriticReview(request).status, "completed"); });
    e2eStep("consumed receipt read", () => { assert.equal(readConsumedCandidateReceipt({ controlRoot, packetId }).receipt.packetId, packetId); });
    e2eStep("export write and read back", () => {
      criticNotes(fx);
      assert.equal(exportSessionCriticEvidence(exportOptions(fx, packetId)).status, "exported");
      const dir = join(fx.root, `specs/alpha/evidence/critic/${packetId}`);
      assert.deepEqual(readdirSync(dir).sort(), [...EXPORT_FILES].sort());
    });
  } finally { if (holder) await holder.kill(); cleanup(fx); }
});

test("D61 path after recovery: an admitted packet over the recovered store can be blocked", async () => {
  const fx = fixture(); let holder = null;
  try {
    holder = await recoveredStore(fx);
    const request = registered(fx, { packetId: "d8".repeat(16) });
    admitSessionCriticReview(request);
    const blocked = blockCandidatePacket({ controlRoot: controlRootOf(fx), packetId: request.packetId, code: "CPP-TEST-BLOCK" });
    assert.equal(blocked.state.phase, "blocked");
  } finally { if (holder) await holder.kill(); cleanup(fx); }
});

test("D61 a live owner, a stale digest, a non-empty store and an ownerless lock are all refused typed; nothing is released", async () => {
  const fx = fixture(); let holder = null;
  try {
    holder = await abandonedRegistrationHolder(fx);
    const inspected = runBatchRecoveryVerb(fx, "inspect-batch-recovery").out;
    const recover = (digestSha256) => runBatchRecoveryVerb(fx, "recover-batch", { schema: RECOVER_SCHEMA, digestSha256 });
    let r = recover(inspected.digestSha256);
    assert.equal(r.status, 2); assert.equal(r.out.code, "CGB-RECOVERY-OWNER-LIVE");
    r = recover("0".repeat(64)); assert.equal(r.out.code, "CGB-RECOVERY-STALE");
    await holder.kill();
    writeFileSync(join(holder.store, "logical", "foreign.json"), "{}");
    const partial = runBatchRecoveryVerb(fx, "inspect-batch-recovery").out;
    assert.equal(partial.status, "partial-held");
    r = recover(partial.digestSha256); assert.equal(r.out.code, "CGB-RECOVERY-PARTIAL");
    rmSync(join(holder.store, "logical", "foreign.json"));
    rmSync(holder.ownerFile);
    const ownerless = runBatchRecoveryVerb(fx, "inspect-batch-recovery").out;
    assert.equal(ownerless.status, "empty-store-held");
    r = recover(ownerless.digestSha256); assert.equal(r.out.code, "CGB-RECOVERY-OWNER-UNPROVEN");
    assert.equal(existsSync(holder.lock), true);
  } finally { if (holder) await holder.kill(); cleanup(fx); }
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

// A root-authored candidate has an empty-tree base, which is a bare tree OID with no commit: it cannot hold the
// review-unit declaration the generic Critic batch reads at its base (critic-generic-batch.mjs reviewUnitSource;
// skills/critic-review/SKILL.md: "the Coordinator commits the meaningful review-unit declaration at the batch base").
// 096033a2f recorded this; d02409a8a made the generic batch the product contract. This case pins that contract.
test("a root-authored candidate keeps its empty-tree base but cannot register a generic batch review unit", () => {
  const fx = fixture({ rootCandidate: true });
  try {
    assert.equal(fx.base, git(fx.root, ["hash-object", "-t", "tree", "--stdin"], { input: "" }));
    assert.throws(() => batchFor(fx), (error) => error.code === "CGB-REVIEW-UNIT-BINDING");
  } finally { cleanup(fx); }
});

test("findings emit REVIEW_FINDINGS", () => {
  const fx = fixture();
  try {
    const finding = { gap: "missing edge", risk: "failure", severity: "minor", evidence: "specs/spec.md:1", spec_ref: "AC-1" };
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
    const result = runSessionCriticFinalizerCli(["finalize", "--root", fx.root, "--request", requestPath],
      { readOriginalSourceReturnFn: originStub() });
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

const ORIGIN_UNAVAILABLE = "SCF-ORIGINAL-SOURCE-UNAVAILABLE";
const ORIGIN_BINDING = "SCF-ORIGINAL-SOURCE-BINDING";
function codeIs(code) { return (error) => error instanceof SessionCriticFinalizerError && error.code === code; }

// PF-93: a packet claimed before the binding carried an assurance field holds the OLD key set and the OLD digest on disk.
// Rewrite a freshly admitted packet into that stored form (or a tampered variant of it) and re-seal the digest chain
// (packet bindings, state, claim, admission) exactly as the old creator would have sealed it.
function legacyBindingVariant(kind, body) {
  const legacyId = sha256Canonical(body);
  switch (kind) {
    case "legacy": return { ...body, snapshotId: legacyId };
    case "extra-key": return { ...body, snapshotId: legacyId, extra: "x" };
    case "wrong-snapshot": return { ...body, snapshotId: "0".repeat(64) };
    case "assurance-null-old-digest": return { ...body, assurance: null, snapshotId: legacyId };
    case "attested-old-digest": return { ...body, assurance: "orchestrator-attested", snapshotId: legacyId };
    default: throw new Error(kind);
  }
}
function rewriteAsLegacyPacket(fx, packetId, kind) {
  const dir = join(fx.root, ".git", "agent-pipeline", "critic-packets", packetId);
  const read = (name) => JSON.parse(readFileSync(join(dir, name), "utf8"));
  const write = (name, value) => { rmSync(join(dir, name), { force: true }); writeFileSync(join(dir, name), canonicalJson(value), { mode: 0o600 }); };
  const packet = read("packet.json");
  const { assurance, snapshotId, ...body } = packet.coordinatorOnly.localDispatchEvidence;
  packet.coordinatorOnly = { localDispatchEvidence: legacyBindingVariant(kind, body) };
  packet.bindings.coordinatorOnlySha256 = sha(canonicalJson(packet.coordinatorOnly));
  const digest = sha(canonicalJson(packet));
  // The old creator sealed the claim over the prepared state of ITS packet digest: re-chain claim.priorStateDigest to the
  // prepared record of the rewritten packet (readConsumedSessionAdmission recomputes exactly this record).
  const preparedState = { ...read("state.json"), packetDigest: digest, revision: 1, priorStateDigest: null, phase: "prepared", body: { code: "CPP-PREPARED" }, timestamp: packet.createdAt };
  const state = read("state.json"); state.packetDigest = digest;
  const claim = read("claim.json"); claim.packetDigest = digest;
  claim.priorStateDigest = sha(canonicalJson(preparedState)); state.priorStateDigest = claim.priorStateDigest;
  const admission = read("session-admission.json"); admission.packetDigest = digest; admission.claimSha256 = sha(canonicalJson(claim));
  write("packet.json", packet); write("state.json", state); write("claim.json", claim); write("session-admission.json", admission);
  return { dir, body };
}
// The pre-assurance creator: the current binding minus the assurance key, snapshotId over the old key set.
function legacyBindingFn(args) {
  const { assurance, snapshotId, ...body } = createLocalDispatchEvidenceBinding(args);
  return { ...body, snapshotId: sha256Canonical(body) };
}
function controlRootOf(fx) { return join(fx.root, ".git", "agent-pipeline", "critic-packets"); }
// The batch reservation written at admit pins the packet digest, the claim digest and a source digest that embeds the
// packet digest. Re-seal it the way the old creator would have sealed it for the legacy packet (same chain, mode 0o600).
function resealReservationForLegacyPacket(fx, request) {
  const packetDir = join(controlRootOf(fx), request.packetId);
  const batchDir = join(controlRootOf(fx), "generic-batches", request.genericBatchRef.batchId);
  const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
  const reservationPath = join(batchDir, "full-admission.json");
  const reservation = readJson(reservationPath);
  const packetDigest = sha(canonicalJson(readJson(join(packetDir, "packet.json"))));
  const claimSha256 = sha(canonicalJson(readJson(join(packetDir, "claim.json"))));
  const registration = readJson(join(batchDir, "registration.json"));
  const member = readJson(join(batchDir, "members", `${request.genericBatchRef.memberSha256}.json`));
  reservation.packetDigest = packetDigest;
  reservation.claimSha256 = claimSha256;
  reservation.sourceSha256 = sha256Canonical({ registration, member, full: null, parent: null, packetDigest });
  rmSync(reservationPath, { force: true });
  writeFileSync(reservationPath, canonicalJson(reservation), { mode: 0o600 });
  // The old creator published the session admission with the same course source digest as the reservation (both derive
  // from the legacy packet digest), so the admission record carries the re-sealed digest too.
  const admissionPath = join(packetDir, "session-admission.json");
  const admission = readJson(admissionPath);
  admission.courseSourceSha256 = reservation.sourceSha256;
  rmSync(admissionPath, { force: true });
  writeFileSync(admissionPath, canonicalJson(admission), { mode: 0o600 });
}

test("PF-93 (1) the stored pre-assurance binding normalizes to assurance null with the current snapshot formula", () => {
  const fx = fixture();
  try {
    const request = preadmitted(fx, { packetId: "a1".repeat(16) });
    const { body } = rewriteAsLegacyPacket(fx, request.packetId, "legacy");
    const readback = inspectClaimedSessionAdmission({ controlRoot: controlRootOf(fx), packetId: request.packetId });
    assert.deepEqual(readback.packet.coordinatorOnly.localDispatchEvidence,
      { ...body, assurance: null, snapshotId: sha256Canonical({ ...body, assurance: null }) });
  } finally { cleanup(fx); }
});

test("PF-93 (2)+(7) a packet claimed in the pre-assurance form finalizes through the generic batch to the verdict", () => {
  const fx = fixture();
  try {
    // The legacy packet is produced by the real writer (packet, state, claim, admission, batch reservation stay consistent).
    const request = registered(fx, { packetId: "a2".repeat(16) });
    // The current writer normalizes a pre-assurance binding to the current form, so the on-disk legacy form is re-sealed after admission.
    admitSessionCriticReview(request);
    rewriteAsLegacyPacket(fx, request.packetId, "legacy");
    resealReservationForLegacyPacket(fx, request);
    const stored =JSON.parse(readFileSync(join(controlRootOf(fx), request.packetId, "packet.json"), "utf8"));
    assert.equal(Object.hasOwn(stored.coordinatorOnly.localDispatchEvidence, "assurance"), false);
    const result = finalizeSessionCriticReview(request);
    assert.equal(result.status, "completed");
    assert.equal(result.receipt.reviewPass, true);
  } finally { cleanup(fx); }
});

// PF-93 follow-up: a legacy-form packet that finalization consumed must stay readable by every read-back path.
function finalizedLegacyPacket(fx, packetId) {
  const request = registered(fx, { packetId });
  admitSessionCriticReview(request);
  rewriteAsLegacyPacket(fx, request.packetId, "legacy");
  resealReservationForLegacyPacket(fx, request);
  assert.equal(finalizeSessionCriticReview(request).status, "completed");
  const stored = JSON.parse(readFileSync(join(controlRootOf(fx), packetId, "packet.json"), "utf8"));
  assert.equal(Object.hasOwn(stored.coordinatorOnly.localDispatchEvidence, "assurance"), false);
  return request;
}

test("PF-93 follow-up (a) export publishes a finalized pre-assurance packet", () => {
  const fx = fixture();
  try {
    const packetId = "a3".repeat(16);
    finalizedLegacyPacket(fx, packetId);
    criticNotes(fx);
    const result = exportSessionCriticEvidence(exportOptions(fx, packetId));
    assert.equal(result.status, "exported");
    assert.deepEqual(readdirSync(join(fx.root, `specs/alpha/evidence/critic/${packetId}`)).sort(), [...EXPORT_FILES].sort());
  } finally { cleanup(fx); }
});

test("PF-93 follow-up (b) receipt and result reads (delta round and Verify binding) accept a consumed pre-assurance packet", () => {
  const fx = fixture();
  try {
    const packetId = "a4".repeat(16);
    finalizedLegacyPacket(fx, packetId);
    const input = { controlRoot: controlRootOf(fx), packetId };
    const read = readConsumedCandidateReceipt(input);
    assert.equal(read.packet.packetId, packetId);
    assert.equal(read.receipt.packetId, packetId);
    const result = readConsumedCandidateResult(input);
    assert.equal(result.packet.packetId, packetId);
    assert.deepEqual(result.receipt, read.receipt);
  } finally { cleanup(fx); }
});

test("PF-93 follow-up (c) the consumed session admission read accepts a consumed pre-assurance packet", () => {
  const fx = fixture();
  try {
    const packetId = "a5".repeat(16);
    finalizedLegacyPacket(fx, packetId);
    const read = readConsumedSessionAdmission({ controlRoot: controlRootOf(fx), packetId });
    assert.equal(read.packet.packetId, packetId);
    assert.equal(read.admission.packetId, packetId);
  } finally { cleanup(fx); }
});

test("PF-93 follow-up (d) a claimed pre-assurance packet can be blocked", () => {
  const fx = fixture();
  try {
    const request = registered(fx, { packetId: "a6".repeat(16) });
    admitSessionCriticReview(request);
    rewriteAsLegacyPacket(fx, request.packetId, "legacy");
    const blocked = blockCandidatePacket({ controlRoot: controlRootOf(fx), packetId: request.packetId, code: "CPP-TEST-BLOCK" });
    assert.equal(blocked.code, "CPP-TEST-BLOCK");
    assert.equal(blocked.state.phase, "blocked");
  } finally { cleanup(fx); }
});

test("PF-93 follow-up (e) the export write on a claimed pre-assurance packet reaches the authorization check, not the binding refusal", () => {
  const fx = fixture();
  try {
    const request = registered(fx, { packetId: "a7".repeat(16) });
    admitSessionCriticReview(request);
    rewriteAsLegacyPacket(fx, request.packetId, "legacy");
    assert.throws(() => recordCandidateExport({ controlRoot: controlRootOf(fx), packetId: request.packetId, receipt: {}, exportView: {}, policy: {} }),
      (error) => error.code === "CPP-EXPORT");
  } finally { cleanup(fx); }
});

// One lifecycle walk of a legacy packet; a failing step names itself in the error message.
function e2eStep(name, fn) {
  try { return fn(); } catch (error) {
    error.message = `PF-93 e2e step "${name}" failed: ${error.message}`;
    throw error;
  }
}

test("PF-93 e2e a pre-assurance packet survives the whole lifecycle, and a blocked one reads back", () => {
  const fx = fixture();
  try {
    const packetId = "a8".repeat(16);
    const controlRoot = controlRootOf(fx);
    const request = e2eStep("claimed in the pre-assurance form", () => {
      const r = registered(fx, { packetId });
      admitSessionCriticReview(r);
      rewriteAsLegacyPacket(fx, packetId, "legacy");
      resealReservationForLegacyPacket(fx, r);
      const stored = JSON.parse(readFileSync(join(controlRoot, packetId, "packet.json"), "utf8"));
      assert.equal(Object.hasOwn(stored.coordinatorOnly.localDispatchEvidence, "assurance"), false);
      assert.equal(inspectClaimedCandidatePacket({ controlRoot, packetId }, { allowLegacyPreAssurance: true }).ok, true);
      return r;
    });
    e2eStep("session admission read (claimed)", () => {
      assert.equal(inspectClaimedSessionAdmission({ controlRoot, packetId }).admission.packetId, packetId);
    });
    e2eStep("finalize", () => { assert.equal(finalizeSessionCriticReview(request).status, "completed"); });
    e2eStep("consumed receipt read", () => { assert.equal(readConsumedCandidateReceipt({ controlRoot, packetId }).receipt.packetId, packetId); });
    e2eStep("consumed result read (also the only preflight read the review lineage and Verify lifecycle call)", () => {
      assert.equal(readConsumedCandidateResult({ controlRoot, packetId }).packet.packetId, packetId);
    });
    e2eStep("consumed session admission read", () => {
      assert.equal(readConsumedSessionAdmission({ controlRoot, packetId }).admission.packetId, packetId);
    });
    e2eStep("export write", () => {
      criticNotes(fx);
      assert.equal(exportSessionCriticEvidence(exportOptions(fx, packetId)).status, "exported");
    });
    e2eStep("export read back", () => {
      const dir = join(fx.root, `specs/alpha/evidence/critic/${packetId}`);
      assert.deepEqual(readdirSync(dir).sort(), [...EXPORT_FILES].sort());
      assert.equal(JSON.parse(readFileSync(join(dir, "index.json"), "utf8")).packetId, packetId);
    });
    // Second leg: a claimed legacy packet that is blocked, then read back from the durable state.
    // A registered generic batch stops after its first pass, so the second leg runs in its own fixture.
    const fx2 = fixture();
    try {
      const blockedId = "a9".repeat(16);
      const controlRoot2 = controlRootOf(fx2);
      e2eStep("blocked leg: claim legacy and block", () => {
        const r = registered(fx2, { packetId: blockedId });
        admitSessionCriticReview(r);
        rewriteAsLegacyPacket(fx2, blockedId, "legacy");
        assert.equal(blockCandidatePacket({ controlRoot: controlRoot2, packetId: blockedId, code: "CPP-TEST-BLOCK" }).state.phase, "blocked");
      });
      e2eStep("blocked leg: read back", () => {
        const state = JSON.parse(readFileSync(join(controlRoot2, blockedId, "state.json"), "utf8"));
        assert.equal(state.phase, "blocked");
        assert.equal(state.body.code, "CPP-TEST-BLOCK");
      });
    } finally { cleanup(fx2); }
  } finally { cleanup(fx); }
});

// PF-93 upgrade state: the previous build digested the NORMALIZED view of a legacy packet into the receipt and result, while the
// journal and every reader recompute the digest of the packet as it lies on disk. The state below is written by the real
// finalize, real journal, real consume; only the digest the finalizer binds is the previous build's (the admission it reads
// is handed back with the view digest, which is where the previous build took it from).
function finalizedByPreviousBuild(fx, packetId, digestOf = (current) => sha(canonicalJson(current.packet))) {
  const request = registered(fx, { packetId });
  admitSessionCriticReview(request);
  rewriteAsLegacyPacket(fx, packetId, "legacy");
  resealReservationForLegacyPacket(fx, request);
  const deps = { inspectClaimedSessionAdmissionFn: (input, packetDeps) => {
    const current = inspectClaimedSessionAdmission(input, packetDeps);
    return { ...current, admission: { ...current.admission, packetDigest: digestOf(current) } };
  } };
  assert.equal(finalizeSessionCriticReview(request, deps).status, "completed");
  const controlRoot = controlRootOf(fx);
  const raw = sha(canonicalJson(JSON.parse(readFileSync(join(controlRoot, packetId, "packet.json"), "utf8"))));
  const receipt = readConsumedCandidateReceipt({ controlRoot, packetId });
  return { request, raw, receipt: receipt.receipt, packet: receipt.packet };
}

test("PF-93 upgrade state: a packet finalized by the previous build exports, binds to Verify and reads in the lineage", () => {
  const fx = fixture();
  try {
    const packetId = "b1".repeat(16);
    const old = finalizedByPreviousBuild(fx, packetId);
    assert.notEqual(old.receipt.packetDigest, old.raw, "the previous build's receipt digest differs from the raw digest");
    // export write and read back
    criticNotes(fx);
    assert.equal(exportSessionCriticEvidence(exportOptions(fx, packetId)).status, "exported");
    const dir = join(fx.root, `specs/alpha/evidence/critic/${packetId}`);
    assert.deepEqual(readdirSync(dir).sort(), [...EXPORT_FILES].sort());
    assert.equal(JSON.parse(readFileSync(join(dir, "index.json"), "utf8")).packetId, packetId);
    // Verify binding reader
    const bound = readBoundConsumedCriticReceipt({ gitCommonDir: join(fx.root, ".git"), criticPacketId: packetId,
      candidate: { commit: old.packet.candidate.commit, tree: old.packet.candidate.tree } });
    assert.equal(bound.critic.packetDigest, old.receipt.packetDigest);
    // lineage / delta reader: the consumed result read the review lineage calls
    assert.equal(readConsumedCandidateResult({ controlRoot: controlRootOf(fx), packetId }).receipt.packetDigest, old.receipt.packetDigest);
  } finally { cleanup(fx); }
});

test("PF-93 upgrade state pin: a receipt digest that is neither the raw nor the normalized digest is still refused", () => {
  const fx = fixture();
  try {
    const packetId = "b2".repeat(16);
    finalizedByPreviousBuild(fx, packetId, () => "f".repeat(64));
    criticNotes(fx);
    assert.throws(() => exportSessionCriticEvidence(exportOptions(fx, packetId)), codeIs("SCF-EXPORT-UNCONSUMED"));
    assert.throws(() => readBoundConsumedCriticReceipt({ gitCommonDir: join(fx.root, ".git"), criticPacketId: packetId,
      candidate: { commit: readConsumedCandidateReceipt({ controlRoot: controlRootOf(fx), packetId }).packet.candidate.commit,
        tree: readConsumedCandidateReceipt({ controlRoot: controlRootOf(fx), packetId }).packet.candidate.tree } }),
    (error) => error.code === "CVL-CRITIC-PACKET-MISMATCH");
  } finally { cleanup(fx); }
});

test("PF-93 upgrade state pin: a packet whose content changed after finalize is refused", () => {
  const fx = fixture();
  try {
    const packetId = "b3".repeat(16);
    finalizedByPreviousBuild(fx, packetId);
    const path = join(controlRootOf(fx), packetId, "packet.json");
    const packet = JSON.parse(readFileSync(path, "utf8"));
    packet.createdAt = "2001-01-01T00:00:00.000Z";
    rmSync(path, { force: true });
    writeFileSync(path, canonicalJson(packet), { mode: 0o600 });
    criticNotes(fx);
    assert.throws(() => exportSessionCriticEvidence(exportOptions(fx, packetId)), codeIs("SCF-EXPORT-UNCONSUMED"));
  } finally { cleanup(fx); }
});

// The review lineage compile reads the consumed result through readConsumedCriticCourseResult, which re-validates the result against
// the packet. The previous build's result carries the normalized-view digest, so that re-validation must accept it too.
function courseInputFor(fx, packet, result) {
  const common = join(fx.root, ".git");
  return { resolvedRepository: { repoRoot: realpathSync(fx.root), gitCommonDir: realpathSync(common),
      controlRoot: join(realpathSync(common), "agent-pipeline", "critic-packets"), registrationCommit: packet.candidate.commit },
    packetId: packet.packetId, expectedCandidate: { commit: packet.candidate.commit, tree: packet.candidate.tree },
    expectedRange: result.reviewRange, expectedRecord: null };
}
test("PF-93 upgrade state: the consumed course result reader (review lineage compile) accepts a packet finalized by the previous build", () => {
  const fx = fixture();
  try {
    const packetId = "b4".repeat(16);
    finalizedByPreviousBuild(fx, packetId);
    const consumed = readConsumedCandidateResult({ controlRoot: controlRootOf(fx), packetId });
    const read = readConsumedCriticCourseResult(courseInputFor(fx, consumed.packet, consumed.result));
    assert.equal(read.ok, true, JSON.stringify(read));
    assert.equal(read.value.receipt.packetDigest, consumed.receipt.packetDigest);
  } finally { cleanup(fx); }
});

test("PF-93 upgrade state: the consumed session admission read accepts a packet finalized by the previous build", () => {
  const fx = fixture();
  try {
    const packetId = "b5".repeat(16);
    finalizedByPreviousBuild(fx, packetId);
    const read = readConsumedSessionAdmission({ controlRoot: controlRootOf(fx), packetId });
    assert.equal(read.admission.packetId, packetId);
  } finally { cleanup(fx); }
});

test("PF-93 upgrade state pin: the consumed course result reader still refuses a foreign result digest and a changed packet", () => {
  const fx = fixture();
  try {
    const packetId = "b6".repeat(16);
    finalizedByPreviousBuild(fx, packetId);
    const consumed = readConsumedCandidateResult({ controlRoot: controlRootOf(fx), packetId });
    const input = courseInputFor(fx, consumed.packet, consumed.result);
    assert.throws(() => validateSessionCriticResult({ ...consumed.result, packetDigest: "f".repeat(64) }, consumed.packet), codeIs("SCF-RESULT-BINDING"));
    assert.equal(validateSessionCriticResult(consumed.result, consumed.packet), consumed.result);
    const path = join(controlRootOf(fx), packetId, "packet.json");
    const packet = JSON.parse(readFileSync(path, "utf8"));
    packet.createdAt = "2001-01-01T00:00:00.000Z";
    rmSync(path, { force: true });
    writeFileSync(path, canonicalJson(packet), { mode: 0o600 });
    assert.equal(readConsumedCriticCourseResult(input).ok, false);
  } finally { cleanup(fx); }
});

test("PF-93 (6) skip coverage accepts the pre-assurance binding exactly and refuses a tampered one", () => {
  const taskId = "HISTORICAL-AUTHORED";
  const root = mkdtempSync(join(tmpdir(), "pf93-skip-"));
  try {
    const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    mkdirSync(join(root, "evidence"), { recursive: true });
    writeFileSync(join(root, ".gitignore"), "/evidence/\n");
    writeFileSync(join(root, "source.txt"), "reviewed source\n");
    git("init", "-q");
    git("add", ".gitignore", "source.txt");
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "historical candidate");
    const candidateCommit = git("rev-parse", "HEAD");
    const trigger = { schema: CRITIC_TRIGGER_INPUT_SCHEMA, rigorLevel: 2, riskClass: "low", riskFlag: false, diff: { mechanical: false, architecture: false, guardrails: false, security: false } };
    const record = { schema: "pipeline.dispatch-record.v3", taskId, agentType: "goldfish-implementor", model: "claude-sonnet-5", effort: "medium",
      rulesetSha: "0.6.2+local", dispatcher: "Elephant", candidateCommit, resultSha256: sha("Done."), outcome: "completed", commits: [candidateCommit],
      log: [], report: { text: "Private prose.", changedFiles: ["source.txt"] }, criticRequired: { schema: CRITIC_REQUIRED_SCHEMA, trigger, appliedRow: "T3" } };
    const recordBytes = `${JSON.stringify(record, null, 2)}\n`;
    const criticBytes = "Independent Critic review of the historical source range.\n";
    writeFileSync(join(root, `evidence/dispatch-record-${taskId}.json`), recordBytes);
    writeFileSync(join(root, `evidence/critic-${taskId}.md`), criticBytes);
    const entry = { schema: CRITIC_DISPOSITION_ADDENDUM_SCHEMA, recordPath: `evidence/dispatch-record-${taskId}.json`, recordSha256: sha(recordBytes),
      taskId, candidateCommit, reviewCandidateCommit: candidateCommit, criticPacketId: "d".repeat(32), criticReceiptSha256: "c".repeat(64),
      criticEvidence: { schema: "pipeline.critic-evidence-reference.v1", taskId, candidateCommit, path: `evidence/critic-${taskId}.md`, sha256: sha(criticBytes) } };
    // The binding is created before the addendum exists, exactly as the existing historical-authored case does.
    const legacy = legacyBindingFn({ root, taskId, reviewCandidateCommit: candidateCommit });
    writeFileSync(join(root, criticDispositionAddendumPath(taskId)), `${JSON.stringify(entry, null, 2)}\n`);
    const evaluate = (binding) => evaluateRepositoryCriticSkipCoverage({ root, readChangedPaths: () => ["source.txt"],
      gitRead: (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(),
      readBoundCriticReceipt: () => ({ packet: { request: { taskId }, candidate: { commit: candidateCommit }, references: [], coordinatorOnly: { localDispatchEvidence: binding } },
        critic: { reviewPass: true, candidate: { commit: candidateCommit } }, criticReceiptSha256: "c".repeat(64) }) });
    assert.equal(Object.hasOwn(legacy, "assurance"), false);
    const valid = evaluate(legacy);
    assert.equal(valid.ok, true, valid.readFindings.join("\n"));
    const { snapshotId, ...body } = legacy;
    for (const tampered of [
      { ...legacy, extra: "x" },
      { ...legacy, snapshotId: "f".repeat(64) },
      { ...legacy, recordSha256: "f".repeat(64) },
      { ...body, sourceCandidateCommit: "f".repeat(40), snapshotId: sha256Canonical({ ...body, sourceCandidateCommit: "f".repeat(40) }) },
    ]) assert.match(evaluate(tampered).readFindings.join("\n"), /private local dispatch snapshot does not bind/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("PF-93 (3) tampered pre-assurance forms stay refused as CPP-COORDINATOR-BINDING", () => {
  for (const kind of ["extra-key", "wrong-snapshot", "assurance-null-old-digest"]) {
    const fx = fixture();
    try {
      const request = preadmitted(fx, { packetId: "a3".repeat(16) });
      rewriteAsLegacyPacket(fx, request.packetId, kind);
      assert.throws(() => inspectClaimedSessionAdmission({ controlRoot: controlRootOf(fx), packetId: request.packetId }),
        (error) => error.code === "CPP-COORDINATOR-BINDING", kind);
    } finally { cleanup(fx); }
  }
});

test("PF-93 (4) an orchestrator-attested claim without the full current form is refused", () => {
  const fx = fixture();
  try {
    const request = preadmitted(fx, { packetId: "a4".repeat(16) });
    rewriteAsLegacyPacket(fx, request.packetId, "attested-old-digest");
    assert.throws(() => inspectClaimedSessionAdmission({ controlRoot: controlRootOf(fx), packetId: request.packetId }),
      (error) => error.code === "CPP-COORDINATOR-BINDING");
  } finally { cleanup(fx); }
});

test("PF-93 (5) SCF-PRELAUNCH-ADMISSION names the underlying admission cause", () => {
  const fx = fixture();
  try {
    const request = preadmitted(fx, { packetId: "a5".repeat(16) });
    rewriteAsLegacyPacket(fx, request.packetId, "wrong-snapshot");
    assert.throws(() => finalizeSessionCriticReview(request), (error) => error instanceof SessionCriticFinalizerError
      && error.code === "SCF-PRELAUNCH-ADMISSION" && error.cause === "CPP-COORDINATOR-BINDING"
      && error.message.includes("CPP-COORDINATOR-BINDING"));
  } finally { cleanup(fx); }
});

test("PF-93 (8) the strict claimed-packet read refuses the pre-assurance form with CPP-COORDINATOR-BINDING", () => {
  const fx = fixture();
  try {
    const request = preadmitted(fx, { packetId: "a8".repeat(16) });
    rewriteAsLegacyPacket(fx, request.packetId, "legacy");
    assert.throws(() => inspectClaimedCandidatePacket({ controlRoot: controlRootOf(fx), packetId: request.packetId }),
      (error) => error.code === "CPP-COORDINATOR-BINDING");
  } finally { cleanup(fx); }
});

test("PF-93 (9) the explicit legacy option accepts exactly the old key set and digest and refuses every other drift", () => {
  const fx = fixture();
  try {
    const request = preadmitted(fx, { packetId: "a9".repeat(16) });
    const { body } = rewriteAsLegacyPacket(fx, request.packetId, "legacy");
    const read = () => inspectClaimedCandidatePacket({ controlRoot: controlRootOf(fx), packetId: request.packetId }, { allowLegacyPreAssurance: true });
    // The plain claimed-packet read returns the stored form (only the session-admission view re-reads it with assurance null).
    assert.deepEqual(read().packet.coordinatorOnly.localDispatchEvidence, { ...body, snapshotId: sha256Canonical(body) });
    for (const kind of ["extra-key", "wrong-snapshot", "assurance-null-old-digest", "attested-old-digest"]) {
      rewriteAsLegacyPacket(fx, request.packetId, kind);
      assert.throws(read, (error) => error.code === "CPP-COORDINATOR-BINDING", kind);
    }
  } finally { cleanup(fx); }
});

test("Cut A (1) a caller-authored verdict with no Source origin is refused typed, and the packet stays unconsumed", () => {
  const fx = fixture();
  try {
    const request = preadmitted(fx, { packetId: "7".repeat(32) });
    assert.throws(() => finalizeRaw(request), codeIs(ORIGIN_UNAVAILABLE));
    assert.throws(() => finalizeRaw(request, { readOriginalSourceReturnFn: () => { throw new Error("no producer"); } }), codeIs(ORIGIN_UNAVAILABLE));
    // Nothing was recorded or consumed, so the same admitted packet still finalizes once an origin exists.
    const done = finalizeRaw(request, { readOriginalSourceReturnFn: originStub() });
    assert.equal(done.status, "completed");
  } finally { cleanup(fx); }
});

test("Cut A (2) an origin record offered by the caller is never accepted", () => {
  const fx = fixture();
  try {
    const request = preadmitted(fx, { packetId: "8".repeat(32) });
    const query = { packetId: request.packetId };
    // A record smuggled through the finalize options is ignored; only the injected reader counts.
    const forged = { ...request, originalSourceReturn: originStub()({ ...query, packetDigest: "a".repeat(64), claimant: {}, sessionId: request.sessionId, verdictSha256: "b".repeat(64) }) };
    assert.throws(() => finalizeRaw(forged), codeIs(ORIGIN_UNAVAILABLE));
    // A record smuggled into the verdict is not a verdict key.
    assert.throws(() => finalizeRaw({ ...request, verdict: verdict({ sourceReturn: { issuer: "source" } }) }),
      (error) => error instanceof SessionCriticFinalizerError && (error.code === "SCF-VERDICT-SCHEMA" || error.code === ORIGIN_UNAVAILABLE));
    // A record smuggled into the closed CLI request file is a request violation.
    writeFileSync(join(fx.root, "evidence", "critic-verdict.json"), `${JSON.stringify(verdict())}\n`);
    const path = writeScratchRequest(fx, "origin-request.json", { ...cliBatchRequest(fx), origin: { issuer: "source" } });
    const cli = runSessionCriticFinalizerCli(["finalize", "--root", fx.root, "--request", path]);
    assert.equal(cli.exitCode, 2);
    assert.equal(cli.output.code, "SCF-REQUEST");
  } finally { cleanup(fx); }
});

test("Cut A (3) a record bound to anything else, an expired record, and a replay are refused", () => {
  const fx = fixture();
  try {
    const request = preadmitted(fx, { packetId: "9".repeat(32) });
    for (const overrides of [
      { packetDigest: "c".repeat(64) },
      { sessionId: "another-session-1" },
      { claimant: { runner: "claude", adapter: "other-adapter" } },
      { verdictSha256: "d".repeat(64) },
      { packetId: "f".repeat(32) },
      { issuer: "caller" },
      { schema: "pipeline.something-else.v1" },
      { expiresAtMs: Date.now() - 1 },
      { extra: true },
    ]) {
      assert.throws(() => finalizeRaw(request, { readOriginalSourceReturnFn: originStub(overrides) }), codeIs(ORIGIN_BINDING), JSON.stringify(overrides));
    }
    assert.throws(() => finalizeRaw(request, { readOriginalSourceReturnFn: () => null }), codeIs(ORIGIN_UNAVAILABLE));
    assert.equal(finalizeRaw(request, { readOriginalSourceReturnFn: originStub() }).status, "completed");
    // Replay: the packet is consumed, so the same record cannot finalize a second time.
    assert.throws(() => finalizeRaw(request, { readOriginalSourceReturnFn: originStub() }), (error) => error instanceof SessionCriticFinalizerError);
  } finally { cleanup(fx); }
});

test("Cut A (4) a bound Source record completes with the receipt unchanged and states origin source, not native attestation", () => {
  const fx = fixture();
  try {
    const result = finalizeRaw(preadmitted(fx, { packetId: "a1".repeat(16) }), { readOriginalSourceReturnFn: originStub() });
    assert.equal(result.status, "completed");
    assert.equal(result.independence, "source-issued-origin");
    assert.equal(result.origin, "source");
    assert.equal(result.nativeAttestation, false);
    assert.equal(validateSessionCriticReceipt(result.receipt), result.receipt);
    assert.equal(Object.hasOwn(result.receipt, "independence"), false);
  } finally { cleanup(fx); }
});

// PF-94: the Glossover shape. Round 1 ran OUTSIDE the feature course (generic batch, caller-authored fallback), so the
// feature course owns no history but the old batch owns the review unit's logical work ids.
const TAKEOVER_INSPECT_SCHEMA = "pipeline.session-critic-course-takeover-inspect-request.v1";
const TAKEOVER_SUPERSEDE_SCHEMA = "pipeline.session-critic-course-takeover-supersede-request.v1";
function takeoverFixture({ consume = true } = {}) {
  const fx = fixture();
  const id = "held-feature", prefix = `specs/${id}`;
  mkdirSync(join(fx.root, prefix, "design"), { recursive: true });
  const specPath = `${prefix}/spec.md`, unitPath = `${prefix}/design/critic-review-unit.json`;
  writeFileSync(join(fx.root, specPath), "# Feature\nAC-1 AC-2\n");
  writeFileSync(join(fx.root, unitPath), JSON.stringify({ ...reviewUnit(), specPath }));
  const manifest = { schema: "pipeline.feature-package.v1", feature: { id, rigor: 2 }, state: "approved", artifacts: [
    { class: "spec", path: specPath, sha256: sha(readFileSync(join(fx.root, specPath))), authority: true, mutability: "mutable", retention: "active" },
    { class: "design", path: unitPath, sha256: sha(readFileSync(join(fx.root, unitPath))), authority: false, mutability: "immutable", retention: "retain" }] };
  writeFileSync(join(fx.root, `${prefix}/lifecycle.json`), JSON.stringify(manifest));
  git(fx.root, ["add", prefix]);
  git(fx.root, ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "declare feature review unit"]);
  fx.featureId = id;
  if (consume) {
    fx.packetId = "e1".repeat(16);
    fx.consumed = finalizeRaw(preadmitted(fx, { packetId: fx.packetId, allowCallerAuthoredFallback: true }));
  } else batchFor(fx);
  return fx;
}
function takeoverVerb(fx, verb, request) {
  const run = spawnSync(process.execPath, [FINALIZER_SCRIPT, verb, "--root", fx.root, "--request", writeScratchRequest(fx, `${verb}.json`, request)], { encoding: "utf8" });
  return { status: run.status, out: JSON.parse(run.stdout) };
}
function featureCourseKey(fx) {
  const manifestPath = `specs/${fx.featureId}/lifecycle.json`;
  const base = git(fx.root, ["rev-list", "--reverse", "HEAD", "--", manifestPath]).split("\n")[0], head = git(fx.root, ["rev-parse", "HEAD"]);
  const resolved = CCA.resolveRegisteredCriticCourseIdentity({ repoRoot: fx.root, featureId: fx.featureId, baseCommit: base, candidateCommit: head, registrationCommit: head, acceptedReference: null });
  assert.equal(resolved.ok, true, JSON.stringify(resolved));
  return resolved.value.courseIdentity.courseKey;
}

test("PF94 TAKEOVER (1) real state: a consumed non-course batch makes the feature course refuse CGB-CONFLICT, and the text names both verbs", () => {
  const fx = takeoverFixture();
  try {
    assert.equal(fx.consumed.status, "completed");
    assert.equal(fx.consumed.independence, "caller-authored-fallback");
    let error = null;
    try { CGB.assertFeatureCriticReviewUnitOwnership({ repoRoot: fx.root, courseKey: featureCourseKey(fx), logicalWorkIds: ["AC-1", "AC-2"] }); } catch (e) { error = e; }
    assert.equal(error?.code, "CGB-CONFLICT");
    assert.ok(error.message.includes("inspect-course-takeover") && error.message.includes("supersede-course-takeover"), error.message);
  } finally { cleanup(fx); }
});

test("PF95 admit refusal (1) the CLI detail of a CGB-CONFLICT from an old batch names both takeover verbs", () => {
  const fx = takeoverFixture();
  try {
    let error = null;
    try { CGB.assertFeatureCriticReviewUnitOwnership({ repoRoot: fx.root, courseKey: featureCourseKey(fx), logicalWorkIds: ["AC-1", "AC-2"] }); } catch (e) { error = e; }
    assert.equal(error?.code, "CGB-CONFLICT");
    const detail = describeCliError(error);
    assert.equal(typeof detail, "string");
    assert.ok(detail.includes("inspect-course-takeover") && detail.includes("supersede-course-takeover"), detail);
    assert.ok(!/[\r\n]/u.test(detail), detail);
    assert.ok(!/(?:[A-Za-z]:\\|\/)[A-Za-z0-9_.-]/u.test(detail.replaceAll("<path>", "")), detail);
    assert.ok(detail.length <= 220, String(detail.length));
  } finally { cleanup(fx); }
});

test("PF94 TAKEOVER (2) inspect names the work ids, owner, origin kind, consumption and history, read-only and stable", () => {
  const fx = takeoverFixture();
  try {
    const first = takeoverVerb(fx, "inspect-course-takeover", { schema: TAKEOVER_INSPECT_SCHEMA, featureId: fx.featureId });
    assert.equal(first.status, 0, JSON.stringify(first.out));
    assert.deepEqual(first.out.logicalWorkIds, ["AC-1", "AC-2"]);
    assert.equal(first.out.originKind, "authored-delivery");
    assert.equal(first.out.allPacketsConsumed, true);
    assert.equal(first.out.courseHistoryRegistered, false);
    assert.equal(first.out.refusalCode, null);
    assert.match(first.out.digestSha256, /^[a-f0-9]{64}$/u);
    assert.ok(first.out.batchRef.batchId);
    assert.deepEqual(takeoverVerb(fx, "inspect-course-takeover", { schema: TAKEOVER_INSPECT_SCHEMA, featureId: fx.featureId }).out, first.out);
  } finally { cleanup(fx); }
});

test("PF94 TAKEOVER (3) supersede audits first, retires only the index entries, keeps the old evidence, is idempotent, and clears the ownership gate", () => {
  const fx = takeoverFixture();
  try {
    const inspected = takeoverVerb(fx, "inspect-course-takeover", { schema: TAKEOVER_INSPECT_SCHEMA, featureId: fx.featureId }).out;
    const request = { schema: TAKEOVER_SUPERSEDE_SCHEMA, featureId: fx.featureId, digestSha256: inspected.digestSha256, reason: "round 1 ran outside the course; rerun on the course path" };
    const done = takeoverVerb(fx, "supersede-course-takeover", request);
    assert.equal(done.status, 0, JSON.stringify(done.out));
    assert.equal(done.out.status, "superseded");
    const store = join(controlRootOf(fx), "generic-batches");
    assert.ok(existsSync(join(store, inspected.batchRef.batchId, "registration.json")), "old registration stays readable");
    assert.ok(existsSync(join(controlRootOf(fx), inspected.packetIds[0])), "old packet stays");
    assert.ok(existsSync(join(store, "superseded", inspected.digestSha256, "audit.json")), "append-only audit record");
    assert.equal(readdirSync(join(store, "logical")).length, 0);
    assert.equal(readdirSync(join(store, "origins")).length, 0);
    assert.deepEqual(CGB.assertFeatureCriticReviewUnitOwnership({ repoRoot: fx.root, courseKey: featureCourseKey(fx), logicalWorkIds: ["AC-1", "AC-2"] }), { claimed: false, batchRef: null });
    const replay = takeoverVerb(fx, "supersede-course-takeover", request);
    assert.equal(replay.status, 0, JSON.stringify(replay.out));
    assert.equal(replay.out.replay, true);
  } finally { cleanup(fx); }
});

test("PF94 TAKEOVER (4) refusals are typed: stale digest, open batch, registered history, partial work ids, bad reason", () => {
  const fx = takeoverFixture({ consume: false });
  try {
    const base = { repoRoot: fx.root, controlRoot: controlRootOf(fx), courseKey: "c".repeat(64), logicalWorkIds: ["AC-1", "AC-2"], courseHistoryRegistered: false };
    const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };
    const open = CGB.inspectFeatureCourseTakeover(base);
    assert.equal(open.refusalCode, "CGB-TAKEOVER-OPEN");
    assert.equal(code(() => CGB.supersedeFeatureCourseTakeover({ ...base, digestSha256: open.digestSha256, reason: "r" })), "CGB-TAKEOVER-OPEN");
    assert.equal(code(() => CGB.supersedeFeatureCourseTakeover({ ...base, digestSha256: "a".repeat(64), reason: "r" })), "CGB-TAKEOVER-STALE");
    assert.equal(CGB.inspectFeatureCourseTakeover({ ...base, courseHistoryRegistered: true }).refusalCode, "CGB-TAKEOVER-HISTORY");
    assert.equal(CGB.inspectFeatureCourseTakeover({ ...base, logicalWorkIds: ["AC-1", "AC-2", "AC-3"] }).refusalCode, "CGB-TAKEOVER-PARTIAL");
    assert.equal(code(() => CGB.supersedeFeatureCourseTakeover({ ...base, digestSha256: open.digestSha256, reason: "see /etc/passwd" })), "CGB-TAKEOVER-REASON");
  } finally { cleanup(fx); }
});

test("PF94 TAKEOVER (5) a consumed feature-course batch of ANOTHER course key without lineage is retired, nothing is deleted, replay is idempotent, a fresh course may admit", () => {
  const fx = featureCourseFixture();
  try {
    assert.equal(admitSessionCriticReview(fx.request).status, "admitted");
    const verdictValue = { findings: [], deliberately_not_flagged: ["scope"], trajectory_verdict: "consistent", trajectory_evidence: "controlled fixture inspected", briefing_violations: [], pass: false };
    assert.equal(finalizeSessionCriticReview({ ...fx.request, verdict: verdictValue, allowCallerAuthoredFallback: true }).status, "completed");
    fx.featureId = "held-feature";
    const inspected = takeoverVerb(fx, "inspect-course-takeover", { schema: TAKEOVER_INSPECT_SCHEMA, featureId: fx.featureId });
    assert.equal(inspected.status, 0, JSON.stringify(inspected.out));
    assert.equal(inspected.out.originKind, "feature-course");
    assert.equal(inspected.out.allPacketsConsumed, true);
    assert.equal(inspected.out.courseHistoryRegistered, false);
    const newKey = featureCourseKey(fx);
    assert.notEqual(inspected.out.originTargets[0].courseKey, newKey);
    assert.equal(inspected.out.refusalCode, null);
    const request = { schema: TAKEOVER_SUPERSEDE_SCHEMA, featureId: fx.featureId, digestSha256: inspected.out.digestSha256, reason: "round 1 ran under an earlier course key" };
    const done = takeoverVerb(fx, "supersede-course-takeover", request);
    assert.equal(done.status, 0, JSON.stringify(done.out));
    const store = join(controlRootOf(fx), "generic-batches");
    assert.ok(existsSync(join(store, "superseded", inspected.out.digestSha256, "audit.json")));
    assert.equal(readdirSync(join(store, "logical")).length, 0);
    // PF-95: no origins entry of the old batch may remain live (the delivery-target entry blocked the same task on the course path); all of them moved.
    assert.equal(readdirSync(join(store, "origins")).length, 0);
    assert.equal(readdirSync(join(store, "superseded", inspected.out.digestSha256, "logical")).length, 2);
    assert.equal(readdirSync(join(store, "superseded", inspected.out.digestSha256, "origins")).length, 2);
    assert.ok(existsSync(join(store, inspected.out.batchRef.batchId, "registration.json")));
    assert.equal(CGB.assertFeatureCriticReviewUnitOwnership({ repoRoot: fx.root, courseKey: newKey, logicalWorkIds: ["scope-one", "scope-two"] }).claimed, false);
    assert.equal(takeoverVerb(fx, "supersede-course-takeover", request).out.replay, true);
  } finally { cleanup(fx); }
});

test("PF94 TAKEOVER (6) the same task is admitted again on the course path after the takeover", () => {
  const fx = featureCourseFixture();
  try {
    assert.equal(admitSessionCriticReview(fx.request).status, "admitted");
    const verdictValue = { findings: [], deliberately_not_flagged: ["scope"], trajectory_verdict: "consistent", trajectory_evidence: "controlled fixture inspected", briefing_violations: [], pass: false };
    assert.equal(finalizeSessionCriticReview({ ...fx.request, verdict: verdictValue, allowCallerAuthoredFallback: true }).status, "completed");
    fx.featureId = "held-feature";
    const inspected = takeoverVerb(fx, "inspect-course-takeover", { schema: TAKEOVER_INSPECT_SCHEMA, featureId: fx.featureId });
    assert.equal(inspected.out.refusalCode, null, JSON.stringify(inspected.out));
    // The untaken-over batch still owns the delivery target: the refusal must name the takeover verbs.
    let refused = null;
    try { admitSessionCriticReview({ ...fx.request, packetId: "9b".repeat(16) }); } catch (e) { refused = e; }
    assert.ok(refused, "an untaken-over batch refuses the same task");
    const done = takeoverVerb(fx, "supersede-course-takeover", { schema: TAKEOVER_SUPERSEDE_SCHEMA, featureId: fx.featureId, digestSha256: inspected.out.digestSha256, reason: "round 1 ran under an earlier course key" });
    assert.equal(done.status, 0, JSON.stringify(done.out));
    // The very same task id and delivery target (same authored-delivery record) is admitted again on the course path.
    assert.equal(admitSessionCriticReview({ ...fx.request, packetId: "9b".repeat(16) }).status, "admitted");
  } finally { cleanup(fx); }
});

test("PF95 REPLAY (a) replaying a takeover audited before the origins fix moves the leftover origins entry of the old batch and the next admit succeeds", () => {
  const fx = featureCourseFixture();
  try {
    assert.equal(admitSessionCriticReview(fx.request).status, "admitted");
    const verdictValue = { findings: [], deliberately_not_flagged: ["scope"], trajectory_verdict: "consistent", trajectory_evidence: "controlled fixture inspected", briefing_violations: [], pass: false };
    assert.equal(finalizeSessionCriticReview({ ...fx.request, verdict: verdictValue, allowCallerAuthoredFallback: true }).status, "completed");
    fx.featureId = "held-feature";
    const inspected = takeoverVerb(fx, "inspect-course-takeover", { schema: TAKEOVER_INSPECT_SCHEMA, featureId: fx.featureId });
    assert.equal(inspected.out.refusalCode, null, JSON.stringify(inspected.out));
    const request = { schema: TAKEOVER_SUPERSEDE_SCHEMA, featureId: fx.featureId, digestSha256: inspected.out.digestSha256, reason: "round 1 ran under an earlier course key" };
    const done = takeoverVerb(fx, "supersede-course-takeover", request);
    assert.equal(done.status, 0, JSON.stringify(done.out));
    // Simulate the legacy state: the audit written before the origins fix names only the logical entries and the feature-course origins entry.
    const store = join(controlRootOf(fx), "generic-batches");
    const dir = join(store, "superseded", inspected.out.digestSha256);
    const delivery = inspected.out.originEntries.find((e) => e.kind === "authored-delivery").file;
    const auditPath = join(dir, "audit.json");
    const audit = JSON.parse(readFileSync(auditPath, "utf8"));
    assert.ok(audit.moves.some((m) => m.kind === "origins" && m.file === delivery), "the current writer lists the delivery entry");
    audit.moves = audit.moves.filter((m) => !(m.kind === "origins" && m.file === delivery));
    rmSync(auditPath, { force: true });
    writeFileSync(auditPath, canonicalJson(audit), { mode: 0o600 });
    const movedBytes = readFileSync(join(dir, "origins", delivery));
    renameSync(join(dir, "origins", delivery), join(store, "origins", delivery));
    assert.ok(existsSync(join(store, "origins", delivery)), "legacy state: the delivery entry is live again");
    // The same request (same digest) is replayed.
    const replay = takeoverVerb(fx, "supersede-course-takeover", request);
    assert.equal(replay.status, 0, JSON.stringify(replay.out));
    assert.equal(replay.out.status, "superseded");
    assert.equal(replay.out.replay, true);
    assert.equal(existsSync(join(store, "origins", delivery)), false, "the leftover delivery entry is no longer live");
    assert.equal(readdirSync(join(store, "origins")).length, 0);
    assert.ok(existsSync(join(dir, "origins", delivery)), "it is under the superseded directory of that digest");
    assert.deepEqual(readFileSync(join(dir, "origins", delivery)), movedBytes, "nothing was deleted or rewritten");
    assert.deepEqual(JSON.parse(readFileSync(auditPath, "utf8")), audit, "the audit record stays append-only");
    // A second replay is idempotent.
    const again = takeoverVerb(fx, "supersede-course-takeover", request);
    assert.equal(again.out.replay, true);
    assert.equal(readdirSync(join(dir, "origins")).length, 2);
    assert.equal(readdirSync(join(store, "origins")).length, 0);
    // The same task is admitted again on the course path.
    assert.equal(admitSessionCriticReview({ ...fx.request, packetId: "9b".repeat(16) }).status, "admitted");
  } finally { cleanup(fx); }
});

test("Cut A (5) the explicit fallback completes with the weaker marker, keeps reviewPass, and never masks a bad binding", () => {
  const fx = fixture();
  try {
    const request = preadmitted(fx, { packetId: "b2".repeat(16), allowCallerAuthoredFallback: true });
    assert.throws(() => finalizeRaw(request, { readOriginalSourceReturnFn: originStub({ verdictSha256: "d".repeat(64) }) }), codeIs(ORIGIN_BINDING));
    assert.throws(() => finalizeRaw({ ...request, allowCallerAuthoredFallback: "yes" }), codeIs(ORIGIN_UNAVAILABLE));
    const result = finalizeRaw(request);
    assert.equal(result.status, "completed");
    assert.equal(result.independence, "caller-authored-fallback");
    assert.equal(result.origin, "caller-authored");
    assert.equal(result.receipt.reviewPass, true);
    assert.equal(Object.hasOwn(result.receipt, "independence"), false);
  } finally { cleanup(fx); }
});

test("Cut A (6) CLI finalize without an origin exits 2 with the typed code, not SCF-INTERNAL", () => {
  const fx = fixture();
  try {
    const requestPath = writeScratchRequest(fx, "finalize-request.json", cliBatchRequest(fx));
    assert.equal(runSessionCriticFinalizerCli(["admit", "--root", fx.root, "--request", requestPath]).exitCode, 0);
    writeFileSync(join(fx.root, "evidence", "critic-verdict.json"), `${JSON.stringify(verdict())}\n`);
    const result = runSessionCriticFinalizerCli(["finalize", "--root", fx.root, "--request", requestPath]);
    assert.equal(result.exitCode, 2);
    assert.equal(result.output.schema, SESSION_CRITIC_CLI_ERROR_SCHEMA);
    assert.equal(result.output.code, ORIGIN_UNAVAILABLE);
  } finally { cleanup(fx); }
});

const FALLBACK_FLAG = "--allow-caller-authored-fallback";

test("Cut A follow-up (1) CLI finalize without the flag and without a Source record is refused typed at exit 2", () => {
  const fx = fixture();
  try {
    const requestPath = writeScratchRequest(fx, "finalize-request.json", cliBatchRequest(fx));
    assert.equal(runSessionCriticFinalizerCli(["admit", "--root", fx.root, "--request", requestPath]).exitCode, 0);
    writeFileSync(join(fx.root, "evidence", "critic-verdict.json"), `${JSON.stringify(verdict())}\n`);
    const result = runSessionCriticFinalizerCli(["finalize", "--root", fx.root, "--request", requestPath]);
    assert.equal(result.exitCode, 2);
    assert.equal(result.output.code, ORIGIN_UNAVAILABLE);
  } finally { cleanup(fx); }
});

test("Cut A follow-up (2) CLI finalize with the flag completes and reports caller-authored-fallback", () => {
  const fx = fixture();
  try {
    const requestPath = writeScratchRequest(fx, "finalize-request.json", cliBatchRequest(fx));
    assert.equal(runSessionCriticFinalizerCli(["admit", "--root", fx.root, "--request", requestPath]).exitCode, 0);
    writeFileSync(join(fx.root, "evidence", "critic-verdict.json"), `${JSON.stringify(verdict())}\n`);
    const result = runSessionCriticFinalizerCli(["finalize", "--root", fx.root, "--request", requestPath, FALLBACK_FLAG]);
    assert.equal(result.exitCode, 0);
    assert.equal(result.output.status, "completed");
    assert.equal(result.output.independence, "caller-authored-fallback");
    assert.equal(result.output.origin, "caller-authored");
    assert.equal(result.output.nativeAttestation, false);
  } finally { cleanup(fx); }
});

test("Cut A follow-up (3) the flag on any other command is SCF-USAGE", () => {
  const fx = fixture();
  try {
    const requestPath = writeScratchRequest(fx, "finalize-request.json", cliBatchRequest(fx));
    for (const command of ["admit", "register-batch", "append-correction", "export"]) {
      const result = runSessionCriticFinalizerCli([command, "--root", fx.root, "--request", requestPath, FALLBACK_FLAG]);
      assert.equal(result.exitCode, 2, command);
      assert.equal(result.output.code, "SCF-USAGE", command);
    }
  } finally { cleanup(fx); }
});

test("Cut A follow-up (4) a wrong or duplicated sixth token is SCF-USAGE and nothing is consumed", () => {
  const fx = fixture();
  try {
    const requestPath = writeScratchRequest(fx, "finalize-request.json", cliBatchRequest(fx));
    for (const tail of [["--allow-caller-authored"], ["--allow-caller-authored-fallback=true"], ["yes"], [FALLBACK_FLAG, FALLBACK_FLAG], [""]]) {
      const result = runSessionCriticFinalizerCli(["finalize", "--root", fx.root, "--request", requestPath, ...tail]);
      assert.equal(result.exitCode, 2, JSON.stringify(tail));
      assert.equal(result.output.code, "SCF-USAGE", JSON.stringify(tail));
    }
  } finally { cleanup(fx); }
});

// D173 (PF-80): the CLI names the cause of an internal refusal. An argv whose first element throws reaches the
// adapter's catch with any thrown value the case needs, without a model call or a fixture repository.
const D173_ERROR_SCHEMA = "pipeline.session-critic-finalization-error.v1";
function d173Cli(thrown) {
  const argv = ["finalize", "--root", "x", "--request", "y"];
  Object.defineProperty(argv, 0, { get() { throw thrown; } });
  return runSessionCriticFinalizerCli(argv);
}

test("D173 an untyped throw reaching the CLI catch keeps SCF-INTERNAL and names the constructor or inner code", () => {
  class D173CustomFailure {}
  const bare = d173Cli(new D173CustomFailure());
  assert.equal(bare.exitCode, 2);
  assert.equal(bare.output.code, "SCF-INTERNAL");
  assert.equal(bare.output.detail, "untyped error: D173CustomFailure");
  const coded = d173Cli(Object.assign(new Error("record missing"), { code: "LDE-RECORD-MISSING" }));
  assert.equal(coded.output.code, "SCF-INTERNAL");
  assert.equal(coded.output.detail, "LDE-RECORD-MISSING: record missing");
  const root = mkdtempSync(join(tmpdir(), "session-critic-finalizer-d173-"));
  try {
    const real = runSessionCriticFinalizerCli(["finalize", "--root", join(root, "missing"), "--request", "scratch/r.json"]);
    assert.equal(real.output.code, "SCF-INTERNAL");
    assert.match(real.output.detail, /^ENOENT: no such file or directory, [a-z]+ '<path>'$/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("D173 a detail never carries an absolute path", () => {
  const result = d173Cli(new Error("failed reading /home/user/secret/file.json and C:\\Users\\x\\y.txt today"));
  assert.equal(result.output.code, "SCF-INTERNAL");
  assert.equal(result.output.detail, "failed reading <path> and <path> today");
  assert.doesNotMatch(result.output.detail, /\/home|C:\\/u);
});

test("D173 a detail uses only the first line and is capped at 200 characters", () => {
  const result = d173Cli(new Error(`${"x".repeat(300)}\nsecond line SECRET`));
  assert.equal(result.output.detail.length, 200);
  assert.doesNotMatch(result.output.detail, /SECRET/u);
  const spaced = d173Cli(new Error("a   b\t c\nrest"));
  assert.equal(spaced.output.detail, "a b c");
});

test("D173 a typed error keeps its code and gains a detail only when its message differs from the code", () => {
  const same = new SessionCriticFinalizerError("SCF-D173-TYPED");
  Object.defineProperty(same, "message", { value: "SCF-D173-TYPED" });
  const typed = d173Cli(same);
  assert.equal(typed.exitCode, 2);
  assert.equal(typed.output.code, "SCF-D173-TYPED");
  assert.equal(Object.hasOwn(typed.output, "detail"), false);
  const usage = runSessionCriticFinalizerCli(["finalize", "--root", "x"]);
  assert.equal(usage.output.code, "SCF-USAGE");
  assert.equal(usage.output.schema, SESSION_CRITIC_CLI_ERROR_SCHEMA);
  assert.equal(usage.output.detail, "SCF-USAGE: Session Critic finalization is invalid.");
});

test("D173 an output without a detail is byte-identical to the old shape", () => {
  const batch = Object.assign(new Error("CGB-D173"), { name: "GenericCriticBatchError", code: "CGB-D173" });
  assert.equal(JSON.stringify(d173Cli(batch).output), `{"schema":"${D173_ERROR_SCHEMA}","status":"rejected","code":"CGB-D173"}`);
  assert.equal(SESSION_CRITIC_CLI_ERROR_SCHEMA, D173_ERROR_SCHEMA);
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

test("PF94 export (1) the export result names the lineage registration before the next correction commit", () => {
  const fx = fixture();
  try {
    const packetId = "7".repeat(32);
    assert.equal(finalizeSessionCriticReview(preadmitted(fx, { packetId })).status, "completed");
    criticNotes(fx, "# Critic notes\n\nNo findings.\n");
    const result = exportSessionCriticEvidence(exportOptions(fx, packetId));
    assert.equal(typeof result.next, "string");
    assert.ok(result.next.includes(packetId), "next names the literal packet id");
    assert.ok(result.next.includes("--add-review-lineage --packet"));
    assert.ok(result.next.includes("before the next correction commit"));
    assert.ok(result.next.includes("supersede-course-takeover"));
    assert.ok(!result.next.includes("\n"), "next is one line");
    assert.ok(!result.next.includes("/home/"), "next carries no absolute path");
    assert.deepEqual(Object.keys(result).sort(),
      ["indexSha256", "next", "outDir", "packetId", "paths", "receiptSha256", "reportSha256", "schema", "status"]);
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
    assert.ok(typeof output.next === "string" && output.next.includes(`--add-review-lineage --packet ${packetId}`));
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

// D1: the admit and finalize request carries the Critic range bindings file (review.correctionInputBindings).
const D1_DERIVE = fileURLToPath(new URL("./critic-correction-input-bindings.mjs", import.meta.url));
function d1Derive(fx, head, out) {
  mkdirSync(join(fx.root, "scratch"), { recursive: true });
  const result = spawnSync(process.execPath, [D1_DERIVE, "derive", "--root", fx.root, "--base", fx.base, "--head", head, "--out", out], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  return out;
}
function d1Request(fx, bindings) {
  const request = cliBatchRequest(fx);
  if (bindings !== undefined) request.review = { ...request.review, correctionInputBindings: bindings };
  return request;
}
function d1Admit(fx, request, name = "d1-request.json") {
  return runSessionCriticFinalizerCli(["admit", "--root", fx.root, "--request", writeScratchRequest(fx, name, request)]);
}

test("D1 walk (1) admit without the bindings field is refused and the detail names the derive command", () => {
  const fx = fixture({ handover: true });
  try {
    const result = d1Admit(fx, d1Request(fx));
    assert.equal(result.exitCode, 2);
    assert.match(result.output.detail, /CDP-CORRECTION-INPUT-REQUIRED/u);
    assert.match(result.output.detail, /critic-correction-input-bindings\.mjs derive/u);
  } finally { cleanup(fx); }
});

test("D1 walk (2) the real derive command writes the bindings file under scratch/", () => {
  const fx = fixture({ handover: true });
  try {
    d1Derive(fx, fx.candidate, "scratch/bindings.json");
    const written = JSON.parse(readFileSync(join(fx.root, "scratch", "bindings.json"), "utf8"));
    assert.match(written.digestSha256, /^[0-9a-f]{64}$/u);
    assert.equal(written.exclusions.length > 0, true);
  } finally { cleanup(fx); }
});

test("D1 walk (3) admit with the bindings file is admitted and the packet binds the echoed bindings", () => {
  const fx = fixture({ handover: true });
  try {
    d1Derive(fx, fx.candidate, "scratch/bindings.json");
    const request = d1Request(fx, "scratch/bindings.json");
    const result = d1Admit(fx, request);
    assert.equal(result.exitCode, 0, JSON.stringify(result.output));
    const controlRoot = join(fx.root, git(fx.root, ["rev-parse", "--git-common-dir"]), "agent-pipeline", "critic-packets");
    const readback = inspectClaimedSessionAdmission({ controlRoot, packetId: request.packetId });
    const expected = preflightCriticDispatch({ root: fx.root, base: fx.base, candidate: fx.candidate, specPath: "specs/spec.md",
      guardrailPaths: [".claude/pipeline.yaml"], evidencePaths: ["evidence/verify.json"], priorCriticEvidencePath: null,
      correctionInputBindings: "scratch/bindings.json" });
    assert.equal(expected.correctionInputBindings.path, "scratch/bindings.json");
    assert.equal(readback.packet.request.sessionBinding.preflightSha256, createHash("sha256").update(canonicalJson(expected)).digest("hex"));
  } finally { cleanup(fx); }
});

test("D1 walk (4) finalize with the same request and a valid verdict completes", () => {
  const fx = fixture({ handover: true });
  try {
    d1Derive(fx, fx.candidate, "scratch/bindings.json");
    const requestPath = writeScratchRequest(fx, "d1-request.json", d1Request(fx, "scratch/bindings.json"));
    assert.equal(runSessionCriticFinalizerCli(["admit", "--root", fx.root, "--request", requestPath]).exitCode, 0);
    writeFileSync(join(fx.root, "evidence", "critic-verdict.json"), `${JSON.stringify(verdict())}\n`);
    const result = runSessionCriticFinalizerCli(["finalize", "--root", fx.root, "--request", requestPath, FALLBACK_FLAG]);
    assert.equal(result.exitCode, 0, JSON.stringify(result.output));
    assert.equal(result.output.status, "completed");
  } finally { cleanup(fx); }
});

test("D1 walk (5) a stale bindings file is refused at admit", () => {
  const fx = fixture({ handover: true });
  try {
    d1Derive(fx, fx.historicalCandidate, "scratch/stale.json");
    const result = d1Admit(fx, d1Request(fx, "scratch/stale.json"));
    assert.equal(result.exitCode, 2);
    assert.match(result.output.detail, /CDP-CORRECTION-INPUT-STALE/u);
  } finally { cleanup(fx); }
});

test("D1 walk (6) v1 and v2 requests accept the optional key and pass it to the preflight; absent means no property", () => {
  const fx = fixture();
  try {
    const seen = [];
    writeFileSync(join(fx.root, "evidence", "critic-verdict.json"), `${JSON.stringify(verdict())}\n`);
    const deps = { preflightCriticDispatchFn: (input) => { seen.push(input); throw new Error("d1-spy-stop"); } };
    const v1 = (bindings) => cliRequest(fx, bindings === undefined ? {} : { review: { ...cliRequest(fx).review, correctionInputBindings: bindings } });
    const v2 = (bindings) => {
      const review = { ...cliRequest(fx).review, courseContext: null, ...(bindings === undefined ? {} : { correctionInputBindings: bindings }) };
      return cliRequest(fx, { schema: SESSION_CRITIC_FINALIZE_REQUEST_V2_SCHEMA, review });
    };
    const v3 = (bindings) => d1Request(fx, bindings);
    for (const [name, build] of [["v1", v1], ["v2", v2], ["v3", v3]]) {
      for (const command of ["admit", "finalize"]) {
        seen.length = 0;
        const withKey = runSessionCriticFinalizerCli([command, "--root", fx.root, "--request", writeScratchRequest(fx, "d1-spy.json", build("scratch/b.json"))], deps);
        assert.notEqual(withKey.output.code, "SCF-REQUEST", `${name} ${command}`);
        assert.equal(seen.length, 1, `${name} ${command}`);
        assert.equal(seen[0].correctionInputBindings, "scratch/b.json", `${name} ${command}`);
        seen.length = 0;
        runSessionCriticFinalizerCli([command, "--root", fx.root, "--request", writeScratchRequest(fx, "d1-spy.json", build(undefined))], deps);
        assert.equal(seen.length, 1, `${name} ${command}`);
        assert.equal(Object.hasOwn(seen[0], "correctionInputBindings"), false, `${name} ${command}`);
      }
    }
    for (const bad of ["", 7, null]) {
      const result = runSessionCriticFinalizerCli(["admit", "--root", fx.root, "--request", writeScratchRequest(fx, "d1-bad.json", d1Request(fx, bad))], deps);
      assert.equal(result.output.code, "SCF-REQUEST", String(bad));
    }
  } finally { cleanup(fx); }
});
