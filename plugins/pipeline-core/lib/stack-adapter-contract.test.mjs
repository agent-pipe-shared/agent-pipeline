// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  REPRESENTATIVE_STACK_ADAPTERS,
  createStackAdapterEvidence,
  executeStackAdapterConformance,
  runRepresentativeAdapterConformance,
  validateStackAdapter,
} from "./stack-adapter-contract.mjs";
import { buildStackCapabilityPlan, STACK_CAPABILITIES } from "./stack-capability-plan.mjs";
import { createDynamicTargetAuthorization } from "./stack-dynamic-boundary.mjs";
import { PO_APPROVAL_PROOF_SCHEMA } from "./po-approval-proof.mjs";
import { validateSecurityEvidenceV2 } from "./security-evidence-evaluator.mjs";

function candidateFixture() {
  const root = mkdtempSync(join(tmpdir(), "stack-static-candidate-"));
  const files = {
    "infra/main.tf": "resource \"aws_s3_bucket\" \"safe\" {}\n",
    "infra/public.tf": "cidr_blocks = [\"0.0.0.0/0\"]\n",
    Dockerfile: "FROM alpine@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\nUSER 10001\n",
    "bad/Dockerfile": "FROM nginx:latest\nUSER root\n",
    ".github/workflows/ci.yml": "on: [push]\njobs:\n  verify:\n    steps:\n      - uses: actions/checkout@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n",
    ".github/workflows/pr.yml": "on:\n  pull_request_target:\npermissions: write-all\njobs:\n  x:\n    steps:\n      - uses: actions/checkout@v4 # temporary pin\n",
  };
  for (const [path, content] of Object.entries(files)) { mkdirSync(join(root, dirname(path)), { recursive: true }); writeFileSync(join(root, path), content); }
  execFileSync("git", ["init", "--quiet", root]);
  execFileSync("git", ["-C", root, "add", "."]);
  execFileSync("git", ["-C", root, "-c", "user.name=stack-test", "-c", "user.email=stack-test@example.invalid", "commit", "--quiet", "-m", "fixture"]);
  return { root, candidate: { commit: execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), tree: execFileSync("git", ["-C", root, "rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim() } };
}

function committedStaticFixture(files, symlinks = {}) {
  const root = mkdtempSync(join(tmpdir(), "stack-static-boundary-"));
  for (const [path, content] of Object.entries(files)) { mkdirSync(join(root, dirname(path)), { recursive: true }); writeFileSync(join(root, path), content); }
  for (const [path, target] of Object.entries(symlinks)) { mkdirSync(join(root, dirname(path)), { recursive: true }); symlinkSync(target, join(root, path)); }
  execFileSync("git", ["init", "--quiet", root]);
  execFileSync("git", ["-C", root, "add", "."]);
  execFileSync("git", ["-C", root, "-c", "user.name=stack-test", "-c", "user.email=stack-test@example.invalid", "commit", "--quiet", "-m", "fixture"]);
  return { root, candidate: { commit: execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), tree: execFileSync("git", ["-C", root, "rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).trim() } };
}

function staticPlan(candidate) {
  const observations = [];
  const discovery = { ok: true, schema: "pipeline.stack-discovery.v1", candidate, observations, digest: createHash("sha256").update(JSON.stringify({ candidate, observations })).digest("hex") };
  return buildStackCapabilityPlan({ candidate, discovery, policyRevision: "policy-v1", threatModel: { candidate, digest: "d".repeat(64) }, observations: STACK_CAPABILITIES.map((capability) => ({ capability, present: true })), requirements: [] });
}
const fixture = candidateFixture();
const candidate = fixture.candidate;
const observations = [];
const discovery = { ok: true, schema: "pipeline.stack-discovery.v1", candidate, observations, digest: createHash("sha256").update(JSON.stringify({ candidate, observations })).digest("hex") };
const threatModel = { candidate, digest: "d".repeat(64) };
const plan = buildStackCapabilityPlan({ candidate, discovery, policyRevision: "policy-v1", threatModel, observations: STACK_CAPABILITIES.map((capability) => ({ capability, present: true })), requirements: [] });
const pair = generateKeyPairSync("ed25519"); const publicKey = pair.publicKey.export({ type: "spki", format: "pem" });
const approvalAuthority = { keyReference: "test-external-key", publicKeySha256: createHash("sha256").update(publicKey).digest("hex") };
function authorization(id) { const target = { id, environment: "test", bindingSha256: "c".repeat(64) }; const scope = { id: "scope", paths: ["fixtures"] }; const execution = { network: "offline", credential: "none", timeoutMs: 1000 }; const intent = createDynamicTargetAuthorization({ candidate, target, scope, execution }).intent; return { candidate, target, scope, execution, intent, approvalAuthority, approvalProof: { schema: PO_APPROVAL_PROOF_SCHEMA, intentSha256: intent.sha256, keyReference: approvalAuthority.keyReference, publicKey, signatureBase64: sign(null, Buffer.from(intent.sha256), pair.privateKey).toString("base64") } }; }
const authorizations = { "cap.dast": authorization("dast-target"), "cap.fuzz": authorization("fuzz-target") };
const sources = {
  "cap.iac": "infra/main.tf",
  "cap.container": "Dockerfile",
  "cap.ci-workflow": ".github/workflows/ci.yml",
};
function executionInput(adapter) {
  const input = { adapter, plan, environment: { platform: "linux", nodeVersion: null }, authorization: adapter.dynamic ? authorizations[adapter.capability] : null };
  if (adapter.executionMode === "static-analysis") { input.repositoryRoot = fixture.root; input.sourcePath = sources[adapter.capability]; }
  return input;
}
const coverage = {
  subject: "synthetic",
  exclusions: [],
  ignored: [],
  unsupportedScope: [],
  truncation: { truncated: false, scannedFileCount: 1, totalEligibleFileCount: 1 },
  dataAge: { ageSeconds: 0, snapshotAt: null },
};
let pass = 0;
function check(name, fn) {
  fn();
  pass++;
  console.log(`PASS ${name}`);
}

check("seven representative adapters cover every major family cluster", () => {
  assert.equal(REPRESENTATIVE_STACK_ADAPTERS.length, 7);
  assert.equal(new Set(REPRESENTATIVE_STACK_ADAPTERS.map((adapter) => adapter.capability)).size, 7);
  for (const adapter of REPRESENTATIVE_STACK_ADAPTERS) assert.deepEqual(validateStackAdapter(adapter), { ok: true });
});

for (const adapter of REPRESENTATIVE_STACK_ADAPTERS) {
  check(`${adapter.kind} adapter emits schema-valid CYB-2 evidence`, () => {
    const execution = executeStackAdapterConformance(executionInput(adapter));
    assert.equal(execution.ok, true);
    const result = createStackAdapterEvidence({
      adapter,
      plan,
      environment: { platform: "linux", nodeVersion: null },
      execution: execution.execution,
      authorization: adapter.dynamic ? authorizations[adapter.capability] : null,
      ...(adapter.executionMode === "static-analysis" ? { repositoryRoot: fixture.root, sourcePath: sources[adapter.capability] } : {}),
    });
    assert.equal(result.ok, true);
    assert.deepEqual(validateSecurityEvidenceV2(result.evidence), { valid: true });
    assert.equal(result.evidence.capabilities[0].capabilityId, adapter.capability);
  });
}

check("shared conformance suite runs every representative adapter offline", () => {
  const result = runRepresentativeAdapterConformance({ plan, authorizations, repositoryRoot: fixture.root, sourcePaths: sources });
  assert.equal(result.ok, true);
  assert.equal(result.results.length, 7);
});

check("declared platform matrix is offline evidence, not a claim of native host execution", () => {
  for (const platform of ["linux", "darwin", "win32"]) {
    const result = runRepresentativeAdapterConformance({ plan, platform, authorizations, repositoryRoot: fixture.root, sourcePaths: sources });
    assert.equal(result.ok, true, platform);
    assert.equal(result.results.every((entry) => entry.evidence.environment.platform === platform), true, platform);
  }
});

check("unsupported platform is typed and never becomes evidence", () => {
  const execution = executeStackAdapterConformance({ adapter: REPRESENTATIVE_STACK_ADAPTERS[0], plan, environment: { platform: "linux", nodeVersion: null }, authorization: null });
  const result = createStackAdapterEvidence({
    adapter: REPRESENTATIVE_STACK_ADAPTERS[0],
    plan,
    environment: { platform: "unsupported", nodeVersion: null },
    execution: execution.execution,
    authorization: null,
  });
  assert.deepEqual(result, { ok: false, code: "STACK-ADAPTER-INPUT-INVALID" });
});

check("dynamic and fuzz adapters cannot report conformance without an offline authorization", () => {
  const fuzz = REPRESENTATIVE_STACK_ADAPTERS.find((adapter) => adapter.kind === "fuzz");
  assert.equal(executeStackAdapterConformance({ adapter: fuzz, plan, environment: { platform: "linux", nodeVersion: null }, authorization: null }).code, "STACK-ADAPTER-VERIFICATION-REQUIRED");
  assert.equal(runRepresentativeAdapterConformance({ plan, repositoryRoot: fixture.root, sourcePaths: sources }).ok, false);
});

check("a required unsupported capability cannot be hidden by successful selected adapters", () => {
  const unavailablePlan = buildStackCapabilityPlan({ candidate, discovery, policyRevision: "policy-v1", threatModel, observations: STACK_CAPABILITIES.map((capability) => ({ capability, present: capability !== "cap.dast" })), requirements: [{ capability: "cap.dast", required: true }] });
  assert.deepEqual(runRepresentativeAdapterConformance({ plan: unavailablePlan, authorizations, repositoryRoot: fixture.root, sourcePaths: sources }), { ok: false, code: "STACK-ADAPTER-REQUIRED-UNAVAILABLE", unavailable: ["cap.dast"] });
});

check("invalid adapter and malformed evidence are rejected fail closed", () => {
  assert.deepEqual(validateStackAdapter({}), { ok: false, code: "STACK-ADAPTER-INVALID" });
  const execution = executeStackAdapterConformance(executionInput(REPRESENTATIVE_STACK_ADAPTERS[0]));
  const result = createStackAdapterEvidence({
    adapter: REPRESENTATIVE_STACK_ADAPTERS[0],
    plan,
    environment: { platform: "linux", nodeVersion: null },
    execution: { ...execution.execution, coverage: { ...coverage, unexpected: true } },
    authorization: null,
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "STACK-ADAPTER-EXECUTION-INVALID");
});

check("real offline adapters produce typed findings from candidate source bytes", () => {
  const fixtures = { iac: "infra/public.tf", container: "bad/Dockerfile", "ci-workflow": ".github/workflows/pr.yml" };
  const expectedRules = { iac: "public-ingress", container: "mutable-base-image", "ci-workflow": "unpinned-action" };
  for (const adapter of REPRESENTATIVE_STACK_ADAPTERS.filter((item) => item.executionMode === "static-analysis")) {
    const execution = executeStackAdapterConformance({ adapter, plan, environment: { platform: "linux", nodeVersion: null }, authorization: null, repositoryRoot: fixture.root, sourcePath: fixtures[adapter.kind] });
    assert.equal(execution.ok, true, adapter.kind);
    assert.equal(execution.execution.status, "FINDINGS", adapter.kind);
    assert.ok(execution.execution.findings.length > 0, adapter.kind);
    assert.equal(execution.execution.findings.some((item) => item.rule === expectedRules[adapter.kind]), true, adapter.kind);
    const result = createStackAdapterEvidence({ adapter, plan, environment: { platform: "linux", nodeVersion: null }, execution: execution.execution, authorization: null, repositoryRoot: fixture.root, sourcePath: fixtures[adapter.kind] });
    assert.equal(result.ok, true, adapter.kind);
    assert.equal(result.evidence.capabilities[0].classification, "static-analysis", adapter.kind);
  }
});

check("real adapters scan every eligible candidate file despite a legacy selected source path", () => {
  const selectedSafePaths = { iac: "infra/main.tf", container: "Dockerfile", "ci-workflow": ".github/workflows/ci.yml" };
  const expectedRules = { iac: "public-ingress", container: "mutable-base-image", "ci-workflow": "unpinned-action" };
  const expectedPaths = { iac: "infra/public.tf", container: "bad/Dockerfile", "ci-workflow": ".github/workflows/pr.yml" };
  for (const adapter of REPRESENTATIVE_STACK_ADAPTERS.filter((item) => item.executionMode === "static-analysis")) {
    const execution = executeStackAdapterConformance({ adapter, plan, environment: { platform: "linux", nodeVersion: null }, authorization: null, repositoryRoot: fixture.root, sourcePath: selectedSafePaths[adapter.kind] });
    assert.equal(execution.ok, true, adapter.kind);
    assert.equal(execution.execution.status, "FINDINGS", adapter.kind);
    assert.equal(execution.execution.findings.some((item) => item.rule === expectedRules[adapter.kind] && item.path === expectedPaths[adapter.kind]), true, adapter.kind);
    assert.deepEqual(execution.execution.coverage.truncation, { truncated: false, scannedFileCount: 2, totalEligibleFileCount: 2 }, adapter.kind);
  }
});

check("a static-source symlink is typed as incomplete coverage, never scanned as its target bytes", () => {
  const fixture = committedStaticFixture({ "container-source": "FROM nginx:latest\nUSER root\n" }, { Dockerfile: "container-source" });
  const adapter = REPRESENTATIVE_STACK_ADAPTERS.find((item) => item.kind === "container");
  const plan = staticPlan(fixture.candidate);
  const execution = executeStackAdapterConformance({ adapter, plan, environment: { platform: "linux", nodeVersion: null }, authorization: null, repositoryRoot: fixture.root, sourcePath: "Dockerfile" });
  assert.equal(execution.ok, true);
  assert.equal(execution.execution.status, "ERROR");
  assert.deepEqual(execution.execution.coverage.truncation, { truncated: false, scannedFileCount: 0, totalEligibleFileCount: 1 });
  assert.equal(execution.execution.coverage.unsupportedScope.some((item) => item.startsWith("Dockerfile: non-regular git entry (120000 blob)")), true);
  assert.equal(createStackAdapterEvidence({ adapter, plan, environment: { platform: "linux", nodeVersion: null }, execution: execution.execution, authorization: null, repositoryRoot: fixture.root, sourcePath: "Dockerfile" }).ok, true);
});

check("static-source limits report typed incomplete coverage instead of a false pass", () => {
  const files = Object.fromEntries(Array.from({ length: 129 }, (_, index) => [`infra/${String(index).padStart(3, "0")}.tf`, "resource \"aws_s3_bucket\" \"safe\" {}\n"]));
  const fixture = committedStaticFixture(files);
  const adapter = REPRESENTATIVE_STACK_ADAPTERS.find((item) => item.kind === "iac");
  const plan = staticPlan(fixture.candidate);
  const execution = executeStackAdapterConformance({ adapter, plan, environment: { platform: "linux", nodeVersion: null }, authorization: null, repositoryRoot: fixture.root, sourcePath: "infra/000.tf" });
  assert.equal(execution.ok, true);
  assert.equal(execution.execution.status, "ERROR");
  assert.deepEqual(execution.execution.coverage.truncation, { truncated: true, scannedFileCount: 128, totalEligibleFileCount: 129 });
  assert.deepEqual(execution.execution.coverage.unsupportedScope, []);
  assert.equal(createStackAdapterEvidence({ adapter, plan, environment: { platform: "linux", nodeVersion: null }, execution: execution.execution, authorization: null, repositoryRoot: fixture.root, sourcePath: "infra/000.tf" }).ok, true);
});

check("real adapters reject missing or mismatched source without creating evidence", () => {
  const iac = REPRESENTATIVE_STACK_ADAPTERS.find((adapter) => adapter.kind === "iac");
  assert.equal(executeStackAdapterConformance({ adapter: iac, plan, environment: { platform: "linux", nodeVersion: null }, authorization: null }).code, "STACK-ADAPTER-EXECUTION-INVALID");
  assert.equal(executeStackAdapterConformance({ adapter: iac, plan, environment: { platform: "linux", nodeVersion: null }, authorization: null, repositoryRoot: fixture.root, sourcePath: "Dockerfile" }).code, "STACK-ADAPTER-EXECUTION-INVALID");
  assert.equal(executeStackAdapterConformance({ adapter: iac, plan, environment: { platform: "linux", nodeVersion: null }, authorization: null, repositoryRoot: fixture.root, sourcePath: "infra/not-present.tf" }).code, "STACK-ADAPTER-EXECUTION-INVALID");
});

check("static analysis refuses a commit whose resolved tree differs from the plan", () => {
  const wrongCandidate = { ...candidate, tree: "f".repeat(40) };
  const wrongDiscovery = { ...discovery, candidate: wrongCandidate, digest: createHash("sha256").update(JSON.stringify({ candidate: wrongCandidate, observations })).digest("hex") };
  const wrongPlan = buildStackCapabilityPlan({ candidate: wrongCandidate, discovery: wrongDiscovery, policyRevision: "policy-v1", threatModel: { candidate: wrongCandidate, digest: "d".repeat(64) }, observations: STACK_CAPABILITIES.map((capability) => ({ capability, present: true })), requirements: [] });
  const iac = REPRESENTATIVE_STACK_ADAPTERS.find((adapter) => adapter.kind === "iac");
  assert.equal(executeStackAdapterConformance({ adapter: iac, plan: wrongPlan, environment: { platform: "linux", nodeVersion: null }, authorization: null, repositoryRoot: fixture.root, sourcePath: "infra/main.tf" }).code, "STACK-ADAPTER-EXECUTION-INVALID");
});

check("legacy source callers remain compatible only when bytes match the candidate tree", () => {
  const iac = REPRESENTATIVE_STACK_ADAPTERS.find((adapter) => adapter.kind === "iac");
  const source = { candidate, path: "infra/main.tf", content: readFileSync(join(fixture.root, "infra/main.tf"), "utf8") };
  const previous = process.cwd(); process.chdir(fixture.root);
  try {
    const execution = executeStackAdapterConformance({ adapter: iac, plan, environment: { platform: "linux", nodeVersion: null }, authorization: null, source });
    assert.equal(execution.ok, true);
    assert.equal(createStackAdapterEvidence({ adapter: iac, plan, environment: { platform: "linux", nodeVersion: null }, execution: execution.execution, authorization: null, source }).ok, true);
    assert.equal(executeStackAdapterConformance({ adapter: iac, plan, environment: { platform: "linux", nodeVersion: null }, authorization: null, source: { ...source, content: "benign replacement" } }).code, "STACK-ADAPTER-EXECUTION-INVALID");
  } finally { process.chdir(previous); }
});

console.log(`${pass} stack adapter contract checks passed`);
