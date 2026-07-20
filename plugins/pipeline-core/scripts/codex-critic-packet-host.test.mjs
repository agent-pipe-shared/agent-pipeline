#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { prepareCandidatePacket } from "./critic-packet-preflight.mjs";
import {
  CODEX_PACKET_ASSURANCE,
  CodexCriticHostError,
  finalizeCodexPacketDispatch,
  prepareCodexPacketDispatch,
} from "./codex-critic-packet-host.mjs";

let passed = 0;
function check(name, fn) { fn(); passed += 1; process.stdout.write(`PASS CCH${String(passed).padStart(2, "0")} ${name}\n`); }
function git(root, args) { return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH ?? "" } }).trim(); }
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "cch-packet-"));
  git(root, ["init", "--quiet"]); git(root, ["config", "user.email", "test@example.invalid"]); git(root, ["config", "user.name", "Test"]);
  mkdirSync(join(root, "specs")); writeFileSync(join(root, "specs", "work.md"), "base\n");
  git(root, ["add", "."]); git(root, ["commit", "--quiet", "-m", "base"]); const base = git(root, ["rev-parse", "HEAD"]);
  writeFileSync(join(root, "specs", "work.md"), "candidate\n"); git(root, ["add", "."]); git(root, ["commit", "--quiet", "-m", "candidate"]); const candidate = git(root, ["rev-parse", "HEAD"]);
  const control = join(root, git(root, ["rev-parse", "--git-common-dir"]), "agent-pipeline", "critic-packets");
  mkdirSync(control, { recursive: true, mode: 0o700 }); chmodSync(join(control, ".."), 0o700); chmodSync(control, 0o700);
  const prepared = prepareCandidatePacket({
    repoRoot: root, controlRoot: control, packetId: "a".repeat(32), taskId: "batman-codex", projectId: "pipeline",
    baseCommit: base, candidateCommit: candidate, rulesetOid: candidate,
    route: { routeId: "codex-critic", runner: "codex", adapter: "codex-functional-equivalent", provider: "openai", modelTier: "review", effortTier: "xhigh", assurance: CODEX_PACKET_ASSURANCE, projectionDigest: "b".repeat(64) },
    references: [{ kind: "spec", path: "specs/work.md" }],
  }, { now: new Date("2026-07-18T12:00:00.000Z"), nonce: () => Buffer.alloc(32, 12) });
  return { root, control, prepared };
}
function verdict(pass = true) {
  return { findings: [], deliberately_not_flagged: ["spec"], trajectory_verdict: "consistent", trajectory_evidence: "checked", briefing_violations: [], pass };
}
function returned(dispatch, overrides = {}) {
  return {
    schema: "pipeline.codex-critic-return.v1", packetId: dispatch.packetId, packetDigest: dispatch.packetDigest,
    taskName: dispatch.taskName, forkTurns: "none", delegated: false, assurance: CODEX_PACKET_ASSURANCE,
    providerAttested: false, dispatchObservation: null,
    liveness: { events: [{ kind: "reference-inspected", elapsedMs: 1000, evidenceSha256: "c".repeat(64) }, { kind: "review-completed", elapsedMs: 2000, evidenceSha256: "d".repeat(64) }], completedElapsedMs: 2000 },
    verdict: verdict(), ...overrides,
  };
}

check("builds a fork_turns:none refs-only dispatch against the B1 checkout", () => {
  const f = fixture();
  try {
    const ready = prepareCodexPacketDispatch({ controlRoot: f.control, packetId: f.prepared.packet.packetId, adapter: "codex-functional-equivalent", claimantNonce: "e".repeat(64) }, { now: new Date("2026-07-18T12:01:00.000Z") });
    assert.equal(ready.dispatch.forkTurns, "none"); assert.equal(ready.dispatch.mayDelegate, false);
    const exportReceipt = JSON.parse(readFileSync(join(f.control, f.prepared.packet.packetId, "export-fallback.json"), "utf8"));
    assert.equal(exportReceipt.pipelineDecision, "authorized");
    assert.match(ready.dispatch.exportAuthorizationSha256, /^[a-f0-9]{64}$/u);
    assert.deepEqual(Object.keys(ready.dispatch.promptPayload), ["packetId", "candidate", "diff", "references"]);
    assert.equal(ready.dispatch.promptPayload.candidate.base, f.prepared.packet.candidate.base);
    assert.equal(ready.dispatch.promptPayload.diff.sha256, f.prepared.packet.diff.sha256);
    assert.deepEqual(ready.dispatch.promptPayload.references.map(({ path }) => path), ["specs/work.md"]);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

check("consumes one schema-valid return without inventing provider attestation", () => {
  const f = fixture();
  try {
    const ready = prepareCodexPacketDispatch({ controlRoot: f.control, packetId: f.prepared.packet.packetId, adapter: "codex-functional-equivalent", claimantNonce: "f".repeat(64) }, { now: new Date("2026-07-18T12:01:00.000Z") });
    const result = finalizeCodexPacketDispatch({ controlRoot: f.control, dispatch: ready.dispatch, hostReturn: returned(ready.dispatch), cleanupCapability: ready.cleanupCapability }, { now: new Date("2026-07-18T12:02:00.000Z") });
    assert.equal(result.code, "CCH-CONSUMED"); assert.equal(result.receipt.route.providerAttested, false);
    assert.equal(result.receipt.route.effectiveProvider, null); assert.equal(result.receipt.assurance, CODEX_PACKET_ASSURANCE);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

check("rejects delegation, attestation overclaim and liveness stalls before publication", () => {
  for (const overrides of [
    { delegated: true }, { providerAttested: true },
    { liveness: { events: [{ kind: "reference-inspected", elapsedMs: 1000, evidenceSha256: "c".repeat(64) }, { kind: "review-completed", elapsedMs: 200_000, evidenceSha256: "d".repeat(64) }], completedElapsedMs: 200_000 } },
  ]) {
    const f = fixture();
    try {
      const ready = prepareCodexPacketDispatch({ controlRoot: f.control, packetId: f.prepared.packet.packetId, adapter: "codex-functional-equivalent", claimantNonce: "1".repeat(64) }, { now: new Date("2026-07-18T12:01:00.000Z") });
      assert.throws(() => finalizeCodexPacketDispatch({ controlRoot: f.control, dispatch: ready.dispatch, hostReturn: returned(ready.dispatch, overrides), cleanupCapability: ready.cleanupCapability }, { now: new Date("2026-07-18T12:02:00.000Z") }), (error) => error instanceof CodexCriticHostError);
    } finally { rmSync(f.root, { recursive: true, force: true }); }
  }
});

check("rejects a dispatch whose export digest is not the persisted authorization", () => {
  const f = fixture();
  try {
    const ready = prepareCodexPacketDispatch({ controlRoot: f.control, packetId: f.prepared.packet.packetId, adapter: "codex-functional-equivalent", claimantNonce: "2".repeat(64) }, { now: new Date("2026-07-18T12:01:00.000Z") });
    const drifted = { ...ready.dispatch, exportAuthorizationSha256: "0".repeat(64) };
    assert.throws(() => finalizeCodexPacketDispatch({ controlRoot: f.control, dispatch: drifted, hostReturn: returned(drifted), cleanupCapability: ready.cleanupCapability }, { now: new Date("2026-07-18T12:02:00.000Z") }), (error) => error instanceof CodexCriticHostError && error.code === "CCH-EXPORT");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

process.stdout.write(`${passed}/4 checks passed.\n`);
