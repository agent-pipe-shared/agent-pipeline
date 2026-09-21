// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { produceCriticDiagnostic } from "./critic-diagnostic-producer.mjs";
import { deriveCriticExportView } from "./critic-export-policy.mjs";
import { prepareCandidatePacket, inspectCandidatePacket } from "../scripts/critic-packet-preflight.mjs";
import { CODEX_PACKET_ASSURANCE, prepareCodexPacketDispatch } from "../scripts/codex-critic-packet-host.mjs";
const git = (root, args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
function fixture(exitCode = 1) {
  const root = mkdtempSync(join(tmpdir(), "critic-diagnostic-packet-"));
  git(root, ["init", "-q"]); git(root, ["config", "user.name", "Fixture"]); git(root, ["config", "user.email", "fixture@example.invalid"]);
  writeFileSync(join(root, "spec.md"), "base\n"); git(root, ["add", "."]); git(root, ["commit", "-qm", "base"]);
  const base = git(root, ["rev-parse", "HEAD"]);
  writeFileSync(join(root, "spec.md"), "candidate\n"); git(root, ["add", "."]); git(root, ["commit", "-qm", "candidate"]);
  const candidate = git(root, ["rev-parse", "HEAD"]);
  const diagnostic = produceCriticDiagnostic({ root, specPath: "spec.md", command: [process.execPath, "-e", `console.log('actual diagnostic'); process.exit(${exitCode})`], logPath: "evidence/targeted.log" });
  writeFileSync(join(root, "evidence/diagnostic.json"), JSON.stringify(diagnostic));
  writeFileSync(join(root, "evidence", "dispatch-record-diagnostic-test.json"), `${JSON.stringify({
    schema: "pipeline.dispatch-record.v4", taskId: "diagnostic-test", agentType: "goldfish-implementor", model: "claude-sonnet-5", effort: "medium",
    rulesetSha: "0.6.2+local", dispatcher: "Elephant", candidateCommit: candidate, resultSha256: null,
    outcome: "in-progress", outcomeClassification: { schema: "pipeline.dispatch-outcome-classification.v1", kind: "authored-commit" },
    commits: [], log: [], report: null,
    criticRequired: { schema: "pipeline.critic-required-decision.v1", trigger: { schema: "pipeline.critic-trigger-input.v1", rigorLevel: 2, riskClass: "low", riskFlag: false, diff: { mechanical: false, architecture: false, guardrails: false, security: false } }, appliedRow: "T3" },
  })}\n`);
  const controlRoot = join(root, ".git/agent-pipeline/critic-packets"); mkdirSync(controlRoot, { recursive: true, mode: 0o700 }); chmodSync(join(controlRoot, ".."), 0o700); chmodSync(controlRoot, 0o700);
  return { root, controlRoot, diagnostic, options: { repoRoot: root, controlRoot, packetId: "a".repeat(32), taskId: "diagnostic-test", projectId: "pipeline", baseCommit: base, candidateCommit: candidate, rulesetOid: candidate, route: { routeId: "codex-critic", runner: "codex", adapter: "codex-functional-equivalent", provider: "openai", modelTier: "review", effortTier: "xhigh", assurance: CODEX_PACKET_ASSURANCE, projectionDigest: "b".repeat(64) }, references: [{ kind: "spec", path: "spec.md" }], evidencePaths: ["evidence/diagnostic.json"] } };
}
test("native packet exports exact failed/not-run diagnostic refs to a fresh Codex reviewer without verdict prose", () => {
  const f = fixture();
  try {
    const prepared = prepareCandidatePacket(f.options);
    assert.equal(prepared.packet.diagnostics.items[0].status.fullVerify, "not-run");
    assert.equal(prepared.packet.diagnostics.items[0].status.targeted, "failed");
    const view = deriveCriticExportView(prepared.packet);
    assert.equal(view.diagnostics.items[0].status.targeted, "failed");
    const ready = prepareCodexPacketDispatch({ controlRoot: f.controlRoot, packetId: f.options.packetId, adapter: f.options.route.adapter, claimantNonce: "e".repeat(64) });
    assert.equal(ready.dispatch.forkTurns, "none");
    assert.deepEqual(ready.dispatch.promptPayload.diagnostics, view.diagnostics);
    for (const ref of ready.dispatch.promptPayload.diagnostics.references) assert.ok(readFileSync(join(prepared.packet.checkout.realPath, ref.path)).length > 0);
    assert.equal(JSON.stringify(ready.dispatch.promptPayload).includes("priorCritic"), false);
    const tampered = structuredClone(prepared.packet); tampered.diagnostics.items[0].status.targeted = "passed";
    assert.equal(deriveCriticExportView(tampered), null);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test("packet refuses malformed source/digest before creation and snapshot mutation before claim", () => {
  const f = fixture(0);
  try {
    const bad = structuredClone(f.diagnostic); bad.targeted.log.sha256 = "f".repeat(64);
    writeFileSync(join(f.root, "evidence/diagnostic.json"), JSON.stringify(bad));
    assert.throws(() => prepareCandidatePacket(f.options), error => error.code === "CPP-DIAGNOSTIC");
    writeFileSync(join(f.root, "evidence/diagnostic.json"), JSON.stringify(f.diagnostic));
    const prepared = prepareCandidatePacket(f.options);
    assert.equal(prepared.packet.diagnostics.items[0].status.targeted, "passed");
    const source = prepared.packet.diagnostics.artifacts.find(a => a.sourcePath.endsWith("targeted.log"));
    writeFileSync(join(prepared.packet.checkout.realPath, source.path), "altered");
    assert.throws(() => inspectCandidatePacket({ controlRoot: f.controlRoot, packetId: f.options.packetId }), error => error.code === "CPP-DIAGNOSTIC");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
