#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CriticPacketError,
  claimCandidatePacket,
  cleanupCandidatePacket,
  consumeCandidatePacket,
  prepareCandidatePacket,
  recordCandidateResult,
} from "./critic-packet-preflight.mjs";
import { hardenWindowsPrivateDirectory } from "../lib/windows-private-state.mjs";

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  process.stdout.write(`PASS CPP${String(passed).padStart(2, "0")} ${name}\n`);
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

await check("prepares a canonical no-remote packet with sorted diff and explicit empty governance", () => {
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

await check("claims once, records once, consumes once and capability-cleans only its checkout", () => {
  const f = fixture();
  try {
    const prepared = prepareCandidatePacket(options(f, "2".repeat(32)), { now: new Date("2026-07-18T12:00:00.000Z"), nonce: () => Buffer.alloc(32, 8) });
    const claim = claimCandidatePacket({ controlRoot: f.control, packetId: prepared.packet.packetId, adapter: prepared.packet.route.adapter, claimantNonce: "b".repeat(64) }, { now: new Date("2026-07-18T12:01:00.000Z") });
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

await check("fails closed on expiry before a claim", () => {
  const f = fixture();
  try {
    const prepared = prepareCandidatePacket(options(f, "3".repeat(32)), { now: new Date("2026-07-18T12:00:00.000Z"), nonce: () => Buffer.alloc(32, 9) });
    assert.throws(() => claimCandidatePacket({ controlRoot: f.control, packetId: prepared.packet.packetId, adapter: prepared.packet.route.adapter, claimantNonce: "d".repeat(64) }, { now: new Date("2026-07-18T12:15:00.001Z") }), expectCode("CPP-EXPIRED"));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

await check("detects candidate mutation before result publication", () => {
  const f = fixture();
  try {
    const prepared = prepareCandidatePacket(options(f, "4".repeat(32)), { now: new Date("2026-07-18T12:00:00.000Z"), nonce: () => Buffer.alloc(32, 10) });
    claimCandidatePacket({ controlRoot: f.control, packetId: prepared.packet.packetId, adapter: prepared.packet.route.adapter, claimantNonce: "e".repeat(64) }, { now: new Date("2026-07-18T12:01:00.000Z") });
    writeFileSync(join(prepared.packet.checkout.realPath, "specs", "review.md"), "mutated\n");
    assert.throws(() => recordCandidateResult({ controlRoot: f.control, packetId: prepared.packet.packetId, result: { verdict: "pass" } }, { now: new Date("2026-07-18T12:02:00.000Z") }), expectCode("CPP-TREE"));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

await check("detects materialized diff mutation before a claim", () => {
  const f = fixture();
  try {
    const prepared = prepareCandidatePacket(options(f, "5".repeat(32)), { now: new Date("2026-07-18T12:00:00.000Z"), nonce: () => Buffer.alloc(32, 11) });
    writeFileSync(join(prepared.packet.checkout.realPath, prepared.packet.diff.path), "tampered\n");
    assert.throws(() => claimCandidatePacket({ controlRoot: f.control, packetId: prepared.packet.packetId, adapter: prepared.packet.route.adapter, claimantNonce: "f".repeat(64) }, { now: new Date("2026-07-18T12:01:00.000Z") }), expectCode("CPP-DIFF"));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

process.stdout.write(`${passed}/5 checks passed.\n`);
