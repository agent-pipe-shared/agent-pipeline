#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CriticPacketError,
  SESSION_PACKET_BINDING_SCHEMA,
  claimCandidatePacket,
  cleanupCandidatePacket,
  consumeCandidatePacket,
  prepareCandidatePacket,
  recordCandidateResult,
} from "./critic-packet-preflight.mjs";
import { hardenWindowsPrivateDirectory } from "../lib/windows-private-state.mjs";
import { compileCriticReviewLineage } from "../lib/critic-review-lineage.mjs";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";

const cases = [];
const injectedFailure = process.env.PIPELINE_CPP_TEST_INJECT_FAILURE ?? "";
const selfProbeChild = process.env.PIPELINE_CPP_TEST_SELF_PROBE_CHILD === "1";
function check(name, run) {
  const id = `CPP${String(cases.length + 1).padStart(2, "0")}`;
  cases.push({
    id,
    name,
    run() {
      if (injectedFailure === id) {
        assert.fail("intentional candidate packet case-completion failure");
      }
      return run();
    },
  });
}
function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH ?? "" } }).trim();
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "cpp-test-"));
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.email", "pipeline@example.invalid"]);
  git(root, ["config", "user.name", "Pipeline Test"]);
  mkdirSync(join(root, "specs"));
  writeFileSync(join(root, "specs", "review.md"), "base\n");
  git(root, ["add", "."]);
  git(root, ["commit", "--quiet", "-m", "base"]);
  const base = git(root, ["rev-parse", "HEAD"]);
  writeFileSync(join(root, "specs", "review.md"), "candidate\n");
  mkdirSync(join(root, "roles"));
  writeFileSync(join(root, "roles", "critic.md"), "critic contract\n");
  git(root, ["add", "."]);
  git(root, ["commit", "--quiet", "-m", "candidate"]);
  const candidate = git(root, ["rev-parse", "HEAD"]);
  const common = git(root, ["rev-parse", "--git-common-dir"]);
  const control = join(root, common, "agent-pipeline", "critic-packets");
  mkdirSync(control, { recursive: true, mode: 0o700 });
  chmodSync(join(root, common, "agent-pipeline"), 0o700);
  chmodSync(control, 0o700);
  if (process.platform === "win32") {
    hardenWindowsPrivateDirectory(join(root, common, "agent-pipeline"));
    hardenWindowsPrivateDirectory(control);
  }
  return { root, control, base, candidate };
}
function options(f, packetId = "1".repeat(32)) {
  return {
    repoRoot: f.root,
    controlRoot: f.control,
    packetId,
    taskId: "batman-b1",
    projectId: "pipeline",
    baseCommit: f.base,
    candidateCommit: f.candidate,
    rulesetOid: f.candidate,
    trigger: "T1",
    route: {
      routeId: "critic-codex",
      runner: "codex",
      adapter: "codex-functional-equivalent",
      provider: "openai",
      modelTier: "review",
      effortTier: "xhigh",
      assurance: "functional-equivalent-read-only; OS isolation not asserted",
      projectionDigest: "a".repeat(64),
    },
    references: [{ kind: "spec", path: "specs/review.md" }],
  };
}
function expectCode(code) {
  return (error) => error instanceof CriticPacketError && error.code === code;
}
function lineage(packet, reviewId = "nova-a5-review") {
  return compileCriticReviewLineage({
    packet,
    reviewId,
    parent: null,
    packages: [{
      id: "nova-a5",
      subjectSha256: "a".repeat(64),
      changedPaths: [...packet.diffPaths],
      integrationEdges: ["critic-packet-claim"],
    }],
    coverage: {
      changedPaths: [...packet.diffPaths],
      acceptanceIds: ["NVA-A54-1"],
      integrationEdges: ["critic-packet-claim"],
      complete: false,
      receiptSha256: null,
    },
    lane: {
      laneId: "independent-critic",
      contextSha256: "c".repeat(64),
      evidenceSha256: "b".repeat(64),
    },
    verdict: { status: "pending", schemaValid: false, resultSha256: null, failure: null },
    findings: [],
    correction: null,
    invalidation: { kind: "none", reason: null, evidenceSha256: null },
    reviewAttempt: { round: 1, correctionCommits: 0, requestedMode: "full" },
  });
}
function claimInput(prepared, claimantNonce) {
  return {
    controlRoot: prepared.packetDir.slice(0, -prepared.packet.packetId.length - 1),
    packetId: prepared.packet.packetId,
    adapter: prepared.packet.route.adapter,
    claimantNonce,
    lineage: lineage(prepared.packet),
  };
}

check("prepares a canonical no-remote packet with sorted diff and explicit empty governance", () => {
  const f = fixture();
  try {
    const result = prepareCandidatePacket(options(f), { now: new Date("2026-07-18T12:00:00.000Z"), nonce: () => Buffer.alloc(32, 7) });
    assert.equal(result.code, "CPP-PREPARED");
    assert.deepEqual(result.packet.diffPaths, ["roles/critic.md", "specs/review.md"]);
    assert.deepEqual(result.packet.governance, { schema: "pipeline.critic-packet-governance.v1", governance: null, required: [{ path: "roles/critic.md", candidateBlobOid: git(f.root, ["rev-parse", "HEAD:roles/critic.md"]), reasons: ["changed-role"] }] });
    assert.equal(git(result.packet.checkout.realPath, ["remote"]), "");
    assert.equal(git(result.packet.checkout.realPath, ["status", "--porcelain=v1", "--untracked-files=all"]), "");
    assert.match(readFileSync(join(result.packet.checkout.realPath, result.packet.diff.path), "utf8"), /^diff --git /u);
    assert.equal(result.packet.diff.base, f.base);
    assert.equal(readFileSync(join(result.packetDir, "packet.json"), "utf8").endsWith("\n"), true);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

check("binds an ordinary session preflight explicitly without changing legacy packets", () => {
  const f = fixture();
  try {
    const legacy = prepareCandidatePacket(options(f, "8".repeat(32)), { now: new Date("2026-07-18T12:00:00.000Z"), nonce: () => Buffer.alloc(32, 16) });
    assert.equal(Object.hasOwn(legacy.packet.request, "sessionBinding"), false);
    const boundOptions = options(f, "9".repeat(32));
    boundOptions.sessionBinding = {
      schema: SESSION_PACKET_BINDING_SCHEMA,
      sessionId: "session-critic-1",
      preflightSha256: "f".repeat(64),
      assurance: "functional-equivalent-read-only; OS isolation not asserted",
      freshContext: true,
      historyInherited: false,
      mayDelegate: false,
    };
    const bound = prepareCandidatePacket(boundOptions, { now: new Date("2026-07-18T12:00:00.000Z"), nonce: () => Buffer.alloc(32, 17) });
    assert.deepEqual(bound.packet.request.sessionBinding, boundOptions.sessionBinding);
    const invalid = options(f, "a".repeat(32));
    invalid.sessionBinding = { ...boundOptions.sessionBinding, assurance: "runner-native" };
    assert.throws(() => prepareCandidatePacket(invalid), expectCode("CPP-SESSION-BINDING"));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

check("claims once, records once, consumes once and capability-cleans only its checkout", () => {
  const f = fixture();
  try {
    const prepared = prepareCandidatePacket(options(f, "2".repeat(32)), { now: new Date("2026-07-18T12:00:00.000Z"), nonce: () => Buffer.alloc(32, 8) });
    const claim = claimCandidatePacket(claimInput(prepared, "b".repeat(64)), { now: new Date("2026-07-18T12:01:00.000Z") });
    assert.equal(claim.code, "CPP-CLAIMED");
    assert.throws(() => claimCandidatePacket({ controlRoot: f.control, packetId: prepared.packet.packetId, adapter: prepared.packet.route.adapter, claimantNonce: "c".repeat(64) }, { now: new Date("2026-07-18T12:01:01.000Z") }), expectCode("CPP-CLAIM"));
    const result = recordCandidateResult({ controlRoot: f.control, packetId: prepared.packet.packetId, result: { verdict: "pass" } }, { now: new Date("2026-07-18T12:02:00.000Z") });
    assert.equal(result.replay, false);
    assert.throws(() => recordCandidateResult({ controlRoot: f.control, packetId: prepared.packet.packetId, result: { verdict: "ignored" } }, { now: new Date("2026-07-18T12:03:00.000Z") }), expectCode("CPP-RESULT-REPLAY"));
    assert.equal(recordCandidateResult({ controlRoot: f.control, packetId: prepared.packet.packetId, result: { verdict: "pass" } }, { now: new Date("2026-07-18T12:03:00.000Z") }).replay, true);
    const consumed = consumeCandidatePacket({ controlRoot: f.control, packetId: prepared.packet.packetId, receipt: { verdictStatus: "pass" } }, { now: new Date("2026-07-18T12:04:00.000Z") });
    assert.equal(consumed.code, "CPP-CONSUMED");
    assert.throws(() => consumeCandidatePacket({ controlRoot: f.control, packetId: prepared.packet.packetId, receipt: { verdictStatus: "fail" } }), expectCode("CPP-CONSUME-REPLAY"));
    assert.equal(consumeCandidatePacket({ controlRoot: f.control, packetId: prepared.packet.packetId, receipt: { verdictStatus: "pass" } }).replay, true);
    assert.throws(() => cleanupCandidatePacket({ controlRoot: f.control, packetId: prepared.packet.packetId, cleanupCapability: "0".repeat(64) }), expectCode("CPP-CLEANUP"));
    assert.equal(cleanupCandidatePacket({ controlRoot: f.control, packetId: prepared.packet.packetId, cleanupCapability: prepared.packet.cleanupCapability }).code, "CPP-CLEANUP-COMPLETE");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

check("fails closed on expiry before a claim", () => {
  const f = fixture();
  try {
    const prepared = prepareCandidatePacket(options(f, "3".repeat(32)), { now: new Date("2026-07-18T12:00:00.000Z"), nonce: () => Buffer.alloc(32, 9) });
    assert.throws(() => claimCandidatePacket({ controlRoot: f.control, packetId: prepared.packet.packetId, adapter: prepared.packet.route.adapter, claimantNonce: "d".repeat(64) }, { now: new Date("2026-07-18T12:15:00.001Z") }), expectCode("CPP-EXPIRED"));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

check("detects candidate mutation before result publication", () => {
  const f = fixture();
  try {
    const prepared = prepareCandidatePacket(options(f, "4".repeat(32)), { now: new Date("2026-07-18T12:00:00.000Z"), nonce: () => Buffer.alloc(32, 10) });
    claimCandidatePacket(claimInput(prepared, "e".repeat(64)), { now: new Date("2026-07-18T12:01:00.000Z") });
    writeFileSync(join(prepared.packet.checkout.realPath, "specs", "review.md"), "mutated\n");
    assert.throws(() => recordCandidateResult({ controlRoot: f.control, packetId: prepared.packet.packetId, result: { verdict: "pass" } }, { now: new Date("2026-07-18T12:02:00.000Z") }), expectCode("CPP-TREE"));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

check("detects materialized diff mutation before a claim", () => {
  const f = fixture();
  try {
    const prepared = prepareCandidatePacket(options(f, "5".repeat(32)), { now: new Date("2026-07-18T12:00:00.000Z"), nonce: () => Buffer.alloc(32, 11) });
    writeFileSync(join(prepared.packet.checkout.realPath, prepared.packet.diff.path), "tampered\n");
    assert.throws(() => claimCandidatePacket({ controlRoot: f.control, packetId: prepared.packet.packetId, adapter: prepared.packet.route.adapter, claimantNonce: "f".repeat(64) }, { now: new Date("2026-07-18T12:01:00.000Z") }), expectCode("CPP-DIFF"));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

check("binds an admissible closed Nova A5 lineage at claim and rejects a forged binding", () => {
  const f = fixture();
  try {
    const prepared = prepareCandidatePacket(options(f, "6".repeat(32)), { now: new Date("2026-07-18T12:00:00.000Z"), nonce: () => Buffer.alloc(32, 12) });
    const admitted = lineage(prepared.packet);
    const claim = claimCandidatePacket({ controlRoot: f.control, packetId: prepared.packet.packetId, adapter: prepared.packet.route.adapter, claimantNonce: "1".repeat(64), lineage: admitted }, { now: new Date("2026-07-18T12:01:00.000Z") });
    assert.equal(claim.claim.body.criticReviewLineageSha256, admitted.recordSha256);
    const second = prepareCandidatePacket(options(f, "7".repeat(32)), { now: new Date("2026-07-18T12:00:00.000Z"), nonce: () => Buffer.alloc(32, 13) });
    const forged = structuredClone(lineage(second.packet));
    forged.recordSha256 = "0".repeat(64);
    assert.throws(() => claimCandidatePacket({ controlRoot: f.control, packetId: second.packet.packetId, adapter: second.packet.route.adapter, claimantNonce: "2".repeat(64), lineage: forged }, { now: new Date("2026-07-18T12:01:00.000Z") }), expectCode("CPP-LINEAGE"));
  } finally { rmSync(f.root, { recursive: true, force: true }); }

  if (!selfProbeChild) {
    const probe = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      encoding: "utf8",
      env: {
        ...process.env,
        PIPELINE_CPP_TEST_INJECT_FAILURE: "CPP02",
        PIPELINE_CPP_TEST_SELF_PROBE_CHILD: "1",
        PIPELINE_VERIFY_CASE_COMPLETION_FD: "3",
        PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES: "65536",
      },
      shell: false,
      stdio: ["ignore", "pipe", "pipe", "pipe"],
      timeout: 30_000,
    });
    assert.notEqual(probe.status, 0, "the injected early case must fail");
    const records = String(probe.output[3]).trim().split("\n").map((line) => JSON.parse(line));
    const disposed = records.filter((record) => record.event === "DISPOSED");
    assert.equal(records[0].event, "DECLARED");
    assert.equal(records[0].caseCount, 7);
    assert.equal(disposed.length, 7);
    assert.equal(disposed.find((record) => record.id === "CPP02")?.disposition, "fail");
    assert.equal(disposed.find((record) => record.id === "CPP07")?.disposition, "pass");
    assert.deepEqual(records.at(-1).counts, { pass: 6, fail: 1, skip: 0, todo: 0 });
    assert.equal(records.at(-1).declaredCount, 7);
    assert.equal(records.at(-1).disposedCount, 7);
  }
});

assert.equal(cases.length, 7, "the complete candidate packet corpus must be registered before execution begins");
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openSync(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({
  cases: cases,
  fd: completionFd,
  maxBytes: Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES ?? "65536"),
});
