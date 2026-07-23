#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { checkCriticExport, deriveCriticExportView, validateCriticExportAuthorization } from "./critic-export-policy.mjs";
import { loadRunnerProfilesV3Registry } from "./runner-profiles-v3.mjs";

const registry = loadRunnerProfilesV3Registry();
const policy = registry.criticExportPolicy;
const packet = {
  schema: "pipeline.critic-candidate-packet.v1",
  packetId: "a".repeat(32),
  createdAt: "2026-07-19T00:00:00.000Z",
  expiresAt: "2026-07-19T00:10:00.000Z",
  request: { taskId: "critic-export-test", projectId: "pipeline", trigger: "T1" },
  ruleset: { oid: "d".repeat(40), objectFormat: "sha1" },
  route: { routeId: "critic-codex", runner: "codex", adapter: "codex-functional-equivalent", provider: "openai", modelTier: "review", effortTier: "xhigh", assurance: "functional-equivalent-read-only; OS isolation not asserted", projectionDigest: "e".repeat(64) },
  candidate: { base: "a".repeat(40), commit: "b".repeat(40), tree: "c".repeat(40) },
  diff: { base: "a".repeat(40), commit: "b".repeat(40), path: ".git/agent-pipeline-review.diff", bytes: 17, sha256: "4".repeat(64) },
  diffPaths: ["src/example.mjs"],
  references: [{ kind: "spec", path: "specs/example.md", candidateBlobOid: "f".repeat(40) }],
  governance: { schema: "pipeline.critic-packet-governance.v1", governance: null, required: [{ path: "src/example.mjs", candidateBlobOid: "1".repeat(40), reasons: ["changed-flow"] }] },
  checkout: { realPath: "/not-exported", gitDir: "/not-exported/.git", commonDir: "/not-exported/.git", objectFormat: "sha1", candidateOid: "b".repeat(40), candidateTree: "c".repeat(40), creatorNonce: "2".repeat(64) },
  cleanupCapability: "3".repeat(64),
  bindings: null,
};
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const hash = (value) => createHash("sha256").update(`${JSON.stringify(value, null, 2)}\n`).digest("hex");
packet.bindings = {
  requestSha256: hash(packet.request),
  diffPathsSha256: hash(packet.diffPaths),
  governanceSha256: hash(packet.governance),
};
const exportView = deriveCriticExportView(packet);
const options = { registry, now: () => 1_784_355_600_000 };

test("matching classified packet is authorized once without hiding external gates", () => {
  const result = checkCriticExport({
    policy, packet, exportView, provider: "openai",
    assuranceClass: "functional-equivalent-read-only; OS isolation not asserted",
    hostGate: "additional-check-required", providerGate: "not-observed",
  }, options);
  assert.equal(result.ok, true);
  assert.equal(result.receipt.pipelineDecision, "authorized");
  assert.deepEqual(result.receipt.externalGates, { host: "additional-check-required", provider: "not-observed" });
  assert.equal(JSON.stringify(result.receipt).includes("must never enter"), false);
  assert.equal(JSON.stringify(exportView).includes("/not-exported"), false);
  assert.match(result.receipt.exportViewSha256, /^[a-f0-9]{64}$/u);
  assert.equal(validateCriticExportAuthorization({ receipt: result.receipt, packet, exportView, policy }, { registry }), true);
});

test("provider must match the packet runner", () => {
  const contradictory = structuredClone(packet);
  contradictory.route = { ...contradictory.route, provider: "anthropic" };
  const contradictoryView = deriveCriticExportView(contradictory);
  assert.equal(checkCriticExport({ policy, packet: contradictory, exportView: contradictoryView, provider: "anthropic", assuranceClass: contradictory.route.assurance }, options).code, "packet-provider-runner-drift");
});

test("policy, provider, packet route and assurance drift deny before export", () => {
  const changed = structuredClone(policy);
  changed.mode = "disabled";
  assert.equal(checkCriticExport({ policy: changed, packet, exportView, provider: "openai", assuranceClass: packet.route.assurance }, options).code, "policy-drift");
  assert.equal(checkCriticExport({ policy, packet, exportView, provider: "anthropic", assuranceClass: packet.route.assurance }, options).code, "packet-route-drift");
  assert.equal(checkCriticExport({ policy, packet, exportView, provider: "openai", assuranceClass: "claude-native-bare-read-only" }, options).code, "packet-route-drift");
});

test("unclassified packets and explicit external denial fail closed", () => {
  assert.equal(checkCriticExport({ policy, packet: { ...packet, schema: "unknown" }, exportView, provider: "openai", assuranceClass: packet.route.assurance }, options).code, "packet-invalid");
  assert.equal(checkCriticExport({ policy, packet, exportView, provider: "openai", assuranceClass: packet.route.assurance, hostGate: "denied" }, options).code, "external-gate-denied");
});

test("both Claude assurance classes are distinct allowlist entries", () => {
  for (const assuranceClass of ["claude-native-bare-read-only", "functional-equivalent-read-only; OS isolation not asserted"]) {
    const claudePacket = { ...packet, route: { ...packet.route, runner: "claude", provider: "anthropic", assurance: assuranceClass } };
    const claudeView = deriveCriticExportView(claudePacket);
    assert.equal(checkCriticExport({ policy, packet: claudePacket, exportView: claudeView, provider: "anthropic", assuranceClass }, options).ok, true);
  }
});

test("closed packet shape and the exact export view are both required", () => {
  const incomplete = structuredClone(packet);
  delete incomplete.checkout;
  assert.equal(checkCriticExport({ policy, packet: incomplete, exportView, provider: "openai", assuranceClass: packet.route.assurance }, options).code, "packet-invalid");
  const widened = { ...exportView, checkout: packet.checkout };
  assert.equal(checkCriticExport({ policy, packet, exportView: widened, provider: "openai", assuranceClass: packet.route.assurance }, options).code, "packet-boundary-drift");
});

test("expired packets cannot be exported", () => {
  const expiredOptions = { registry, now: () => Date.parse(packet.expiresAt) + 1 };
  assert.equal(checkCriticExport({ policy, packet, exportView, provider: "openai", assuranceClass: packet.route.assurance }, expiredOptions).code, "packet-expired");
});
