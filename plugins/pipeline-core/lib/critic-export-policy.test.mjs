#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import * as consentApi from "./critic-export-policy.mjs";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

import { checkCriticExport, deriveCriticExportView, validateCriticExportAuthorization } from "./critic-export-policy.mjs";
import { loadRunnerProfilesV3Registry } from "./runner-profiles-v3.mjs";

const registry = loadRunnerProfilesV3Registry();
test("standing consent preparation is available separately from packet authorization", () => {
  assert.equal(typeof consentApi.prepareCriticExportConsent, "function");
});
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

const consentScope = {
  project: { realPath: "/fixture/project", device: "1", inode: "2" },
  recipient: { provider: "openai", runner: "codex", service: "declared-review-service" },
  purpose: "critic", sourceRoots: ["src"], evidenceRoots: ["evidence"],
};
const invocation = { candidate: { commit: "a".repeat(40), tree: "b".repeat(40) }, records: [
  { path: "src/a.mjs", sha256: "c".repeat(64), dataClass: "repository-candidate" },
  { path: "evidence/verify-1.json", sha256: "d".repeat(64), dataClass: "selected-review-evidence" },
] };
function grant(scope = consentScope) {
  return consentApi.recordCriticExportConsent({ ...consentApi.prepareCriticExportConsent(scope),
    decisionReference: "user-message:setup", decisionSha256: "e".repeat(64) }).consent;
}
test("standing consent covers new candidates and fresh evidence, but never grants host approval", () => {
  const consent = grant();
  const next = structuredClone(invocation);
  next.candidate.commit = "f".repeat(40);
  next.records[1].path = "evidence/verify-2.json";
  next.records[1].sha256 = "f".repeat(64);
  const input = { scope: consentScope, consent, invocation: next, hostGate: "additional-check-required" };
  const result = consentApi.checkCriticExportConsent(input);
  assert.equal(result.code, "consent-covered");
  assert.equal(result.hostApprovalGranted, false);
  assert.equal(result.externalGates.host, "additional-check-required");
  assert.equal(result.observedEndpoint, null);
  assert.deepEqual(result.disclosure.selectedRecords, next.records);
  assert.equal(consentApi.checkCriticExportConsent({ ...input, hostGate: "denied" }).code, "external-gate-denied");
  assert.equal(consentApi.checkCriticExportConsent({ ...input, providerGate: "denied" }).ok, false);
  assert.equal(consentApi.checkCriticExportConsent({ ...input, consent: null }).code, "consent-missing");
  assert.equal(consentApi.checkCriticExportConsent({ ...input, consent: consentApi.revokeCriticExportConsent(consent).consent }).code, "consent-revoked");
});
test("changed project, recipient, data scope and outside paths require a new decision", () => {
  const input = { scope: consentScope, consent: grant(), invocation };
  for (const [key, patch, code] of [
    ["project", { ...consentScope.project, inode: "3" }, "consent-project-not-covered"],
    ["recipient", { ...consentScope.recipient, service: "another-service" }, "consent-recipient-not-covered"],
    ["sourceRoots", ["other"], "consent-scope-not-covered"],
    ["evidenceRoots", ["reports"], "consent-scope-not-covered"],
  ]) assert.equal(consentApi.checkCriticExportConsent({ ...input, scope: { ...consentScope, [key]: patch } }).code, code);
  const outside = structuredClone(invocation);
  outside.records[1].path = "reports/verify.json";
  assert.equal(consentApi.checkCriticExportConsent({ ...input, invocation: outside }).code, "consent-path-not-covered");
  for (const path of ["../escape", "src/../escape", "src/.env", "evidence/transcript.json", "src/secret.key", "src/cache/data", "src/auth/token", "src/credentials.json"]) {
    outside.records[1].path = path;
    assert.equal(consentApi.checkCriticExportConsent({ ...input, invocation: outside }).code, "consent-invocation-invalid", path);
  }
  const plan = consentApi.prepareCriticExportConsent(consentScope);
  assert.equal(consentApi.recordCriticExportConsent({ ...plan }).code, "consent-decision-required");
  assert.equal(consentApi.recordCriticExportConsent({ ...plan, planSha256: "0".repeat(64) }).code, "consent-plan-drift");
});

test("real CLI binds local input and decision, persists privately, reuses and revokes", () => {
  const root = mkdtempSync(join(tmpdir(), "critic-consent-"));
  const cli = fileURLToPath(new URL("../scripts/critic-export-consent.mjs", import.meta.url));
  const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
  const run = (command, ...flags) => {
    const child = spawnSync(process.execPath, [cli, command, "--root", root, ...flags], { encoding: "utf8" });
    assert.equal(child.error, undefined);
    return JSON.parse(child.stdout);
  };
  try {
    git("init", "-q");
    mkdirSync(join(root, "src")); mkdirSync(join(root, "evidence"));
    writeFileSync(join(root, "src/a.mjs"), "export const a = 1;\n");
    writeFileSync(join(root, ".gitignore"), "evidence/\nrequest.json\n");
    git("add", "--", "src/a.mjs", ".gitignore");
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture");
    const request = { scope: { ...consentScope }, invocation: structuredClone(invocation) };
    delete request.scope.project;
    request.invocation.candidate = { commit: git("rev-parse", "HEAD"), tree: git("rev-parse", "HEAD^{tree}") };
    writeFileSync(join(root, "evidence/verify-1.json"), "{}\n");
    for (const record of request.invocation.records) record.sha256 = createHash("sha256").update(readFileSync(join(root, record.path))).digest("hex");
    const save = () => writeFileSync(join(root, "request.json"), JSON.stringify(request));
    save();
    const args = ["--request", "request.json"];
    assert.equal(run("check", ...args).code, "consent-missing");
    const plan = run("plan", ...args);
    const decision = ["--decision-reference", "user-message:fixture", "--decision-sha256", "e".repeat(64)];
    assert.equal(run("record", ...args, "--plan-sha256", "0".repeat(64), ...decision).code, "consent-plan-drift");
    assert.equal(run("record", ...args, "--plan-sha256", plan.planSha256, ...decision).code, "consent-recorded");
    assert.equal(git("status", "--porcelain"), "");
    assert.equal(run("check", ...args).code, "consent-covered");
    request.hostGate = "denied"; save();
    assert.equal(run("check", ...args).code, "external-gate-denied");
    request.hostGate = "not-observed";
    request.invocation.records[1].path = "evidence/verify-2.json";
    writeFileSync(join(root, "evidence/verify-2.json"), "{}\n"); save();
    assert.equal(run("check", ...args).code, "consent-covered");
    writeFileSync(join(root, "src/a.mjs"), "export const a = 2;\n");
    git("add", "--", "src/a.mjs");
    git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "next candidate");
    request.invocation.candidate = { commit: git("rev-parse", "HEAD"), tree: git("rev-parse", "HEAD^{tree}") };
    request.invocation.records[0].sha256 = createHash("sha256").update(readFileSync(join(root, "src/a.mjs"))).digest("hex"); save();
    assert.equal(run("check", ...args).code, "consent-covered");
    assert.equal(run("plan", ...args).planSha256, plan.planSha256);
    writeFileSync(join(root, "evidence/verify-2.json"), "changed");
    assert.equal(run("check", ...args).code, "consent-input-digest-drift");
    rmSync(join(root, "evidence/verify-2.json"));
    symlinkSync(join(root, "evidence/verify-1.json"), join(root, "evidence/verify-2.json"));
    assert.equal(run("check", ...args).code, "consent-symlink");
    assert.equal(run("plan", "--request", "../outside.json").code, "consent-path-invalid");
    symlinkSync(join(root, "request.json"), join(root, "evidence/request-link.json"));
    assert.equal(run("plan", "--request", "evidence/request-link.json").code, "consent-symlink");
    assert.equal(run("revoke").code, "consent-revoked");
    assert.equal(run("check", ...args).code, "consent-revoked");
    assert.equal(git("status", "--porcelain"), "");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
