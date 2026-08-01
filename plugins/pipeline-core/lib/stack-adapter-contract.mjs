// SPDX-License-Identifier: SUL-1.0
/**
 * CYB-6 adapter contract.  The exchange stays provider-neutral and offline:
 * no adapter installs a scanner, executes repository setup, or reaches a
 * network service.  IaC, container and workflow adapters nevertheless inspect
 * the supplied candidate-bound source bytes with deterministic local rules.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { validateSecurityEvidenceV2 } from "./security-evidence-evaluator.mjs";
import { evaluateStackCapabilityPlan, validateStackCapabilityPlan } from "./stack-capability-plan.mjs";
import { evaluateDynamicTargetAuthorization } from "./stack-dynamic-boundary.mjs";

export const STACK_ADAPTER_KINDS = Object.freeze(["static", "sca", "iac", "container", "ci-workflow", "dast", "fuzz"]);
export const STACK_ADAPTER_PLATFORMS = Object.freeze(["linux", "darwin", "win32"]);
const CAPABILITY_BY_KIND = Object.freeze({
  static: "cap.sast",
  sca: "cap.sca",
  iac: "cap.iac",
  container: "cap.container",
  "ci-workflow": "cap.ci-workflow",
  dast: "cap.dast",
  fuzz: "cap.fuzz",
});
const STATUS = new Set(["PASS", "FINDINGS", "SKIPPED", "ERROR"]);
const REAL_STATIC_KINDS = new Set(["iac", "container", "ci-workflow"]);
const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const safe = (value) => typeof value === "string" && /^[a-z][a-z0-9.-]{0,63}$/u.test(value);
const oid = (value) => /^[a-f0-9]{40,64}$/u.test(value ?? "");
const digest = (value) => createHash("sha256").update(value).digest("hex");

function defaultCoverage(subject, scannedFileCount = 1) {
  return {
    subject,
    exclusions: [],
    ignored: [],
    unsupportedScope: [],
    truncation: { truncated: false, scannedFileCount, totalEligibleFileCount: scannedFileCount },
    dataAge: { ageSeconds: 0, snapshotAt: null },
  };
}

function adapter(kind) {
  const realStatic = REAL_STATIC_KINDS.has(kind);
  const real = {
    iac: { id: "offline.iac", tool: "terraform-static", rulePack: "pipeline/iac-static/v1" },
    container: { id: "offline.container", tool: "dockerfile-static", rulePack: "pipeline/container-static/v1" },
    "ci-workflow": { id: "offline.ci-workflow", tool: "github-actions-static", rulePack: "pipeline/ci-workflow-static/v1" },
  }[kind];
  const ruleRef = realStatic ? real.rulePack : `synthetic/${kind}/v1`;
  return Object.freeze({
    id: realStatic ? real.id : `synthetic.${kind}`,
    capability: CAPABILITY_BY_KIND[kind],
    kind,
    tool: Object.freeze({ name: realStatic ? real.tool : `synthetic-${kind}`, version: "1" }),
    rulePack: Object.freeze({ ref: ruleRef, digest: digest(ruleRef) }),
    supportedPlatforms: STACK_ADAPTER_PLATFORMS,
    dynamic: kind === "dast" || kind === "fuzz",
    executionMode: realStatic ? "static-analysis" : "synthetic-conformance",
  });
}

function lineOf(content, match) {
  return content.slice(0, match.index).split("\n").length;
}

function finding(adapterValue, severity, rule, source, match, msg) {
  return { tool: adapterValue.tool.name, severity, rule, path: source.path, line: lineOf(source.content, match), msg };
}

function staticFindings(adapterValue, source) {
  const findings = [];
  if (adapterValue.kind === "iac") {
    for (const match of source.content.matchAll(/0\.0\.0\.0\/0/g)) findings.push(finding(adapterValue, "high", "public-ingress", source, match, "public IPv4 ingress must be explicitly constrained"));
  } else if (adapterValue.kind === "container") {
    for (const match of source.content.matchAll(/^\s*FROM\s+[^\s]+:latest\s*$/gim)) findings.push(finding(adapterValue, "medium", "mutable-base-image", source, match, "container base image must use an immutable tag or digest"));
    const root = /^\s*USER\s+root\s*$/gim.exec(source.content);
    if (root) findings.push(finding(adapterValue, "high", "root-user", source, root, "container must not run as root"));
    if (!/^\s*USER\s+(?!root\b)[^\s#]+/im.test(source.content)) findings.push({ tool: adapterValue.tool.name, severity: "high", rule: "missing-nonroot-user", path: source.path, line: null, msg: "container must declare a non-root USER" });
  } else if (adapterValue.kind === "ci-workflow") {
    for (const match of source.content.matchAll(/^\s*pull_request_target\s*:/gim)) findings.push(finding(adapterValue, "high", "unsafe-pr-target", source, match, "pull_request_target must not run untrusted pull-request code"));
    for (const match of source.content.matchAll(/^\s*permissions\s*:\s*write-all\s*$/gim)) findings.push(finding(adapterValue, "high", "write-all-permissions", source, match, "workflow must not request write-all permissions"));
    for (const match of source.content.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)\s*$/gim)) {
      if (!/@[a-f0-9]{40}$/i.test(match[1])) findings.push(finding(adapterValue, "medium", "unpinned-action", source, match, "workflow action must be pinned to a full commit SHA"));
    }
  }
  return findings;
}

function executionRecord(adapterValue, plan, environment, source = null) {
  const findings = adapterValue.executionMode === "static-analysis" ? staticFindings(adapterValue, source) : [];
  const unsigned = { schema: "pipeline.stack-adapter-execution.v1", adapterId: adapterValue.id, candidate: structuredClone(plan.candidate), planDigest: plan.digest, sourceSha256: source === null ? null : digest(JSON.stringify(source)), environment: structuredClone(environment), status: findings.length === 0 ? "PASS" : "FINDINGS", findings, coverage: defaultCoverage(source?.path ?? adapterValue.id), reason: adapterValue.executionMode === "static-analysis" ? (findings.length === 0 ? "offline-static-analysis" : "offline-static-analysis-findings") : "synthetic-conformance" };
  return { ...unsigned, digest: digest(JSON.stringify(unsigned)) };
}

function validExecution(value, adapterValue, plan, environment, source = null) {
  if (!own(value, ["schema", "adapterId", "candidate", "planDigest", "sourceSha256", "environment", "status", "findings", "coverage", "reason", "digest"]) || value.schema !== "pipeline.stack-adapter-execution.v1" || value.adapterId !== adapterValue.id || JSON.stringify(value.candidate) !== JSON.stringify(plan.candidate) || value.planDigest !== plan.digest || value.sourceSha256 !== (source === null ? null : digest(JSON.stringify(source))) || JSON.stringify(value.environment) !== JSON.stringify(environment) || !STATUS.has(value.status) || !Array.isArray(value.findings) || (value.status === "PASS" && value.findings.length !== 0) || (value.status === "FINDINGS" && value.findings.length === 0) || typeof value.reason !== "string" || !/^[a-f0-9]{64}$/u.test(value.digest)) return false;
  const { digest: executionDigest, ...unsigned } = value;
  return executionDigest === digest(JSON.stringify(unsigned));
}

/** Seven representative adapters, one per CYB-6 major technique cluster. */
export const REPRESENTATIVE_STACK_ADAPTERS = Object.freeze(STACK_ADAPTER_KINDS.map(adapter));

/** Validates a declarative adapter; it never probes a provider or executes setup. */
export function validateStackAdapter(value) {
  if (!own(value, ["id", "capability", "kind", "tool", "rulePack", "supportedPlatforms", "dynamic", "executionMode"])
    || !safe(value.id) || !STACK_ADAPTER_KINDS.includes(value.kind)
    || value.capability !== CAPABILITY_BY_KIND[value.kind]
    || !own(value.tool, ["name", "version"]) || !safe(value.tool.name) || typeof value.tool.version !== "string"
    || !own(value.rulePack, ["ref", "digest"]) || typeof value.rulePack.ref !== "string" || value.rulePack.ref === ""
    || !/^[a-f0-9]{64}$/u.test(value.rulePack.digest)
    || !Array.isArray(value.supportedPlatforms) || value.supportedPlatforms.length === 0
    || !value.supportedPlatforms.every((platform) => STACK_ADAPTER_PLATFORMS.includes(platform))
    || new Set(value.supportedPlatforms).size !== value.supportedPlatforms.length
    || typeof value.dynamic !== "boolean"
    || !["synthetic-conformance", "static-analysis"].includes(value.executionMode)
    || (value.executionMode === "static-analysis") !== REAL_STATIC_KINDS.has(value.kind)) return { ok: false, code: "STACK-ADAPTER-INVALID" };
  return { ok: true };
}

function validStaticSourcePath(adapterValue, sourcePath) {
  if (typeof sourcePath !== "string" || sourcePath === "" || sourcePath.startsWith("/") || sourcePath.includes("\\") || sourcePath.split("/").some((part) => part === "" || part === "." || part === "..")) return false;
  if (adapterValue.kind === "iac") return /\.tf$/u.test(sourcePath);
  if (adapterValue.kind === "container") return /(^|\/)Dockerfile$/u.test(sourcePath);
  return /^\.github\/workflows\/[^/]+\.ya?ml$/u.test(sourcePath);
}

function readCandidateSource(adapterValue, repositoryRoot, sourcePath, candidate) {
  if (typeof repositoryRoot !== "string" || repositoryRoot === "" || !validStaticSourcePath(adapterValue, sourcePath)) return null;
  try {
    const tree = execFileSync("git", ["-C", resolve(repositoryRoot), "rev-parse", `${candidate.commit}^{tree}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (tree !== candidate.tree) return null;
    const content = execFileSync("git", ["-C", resolve(repositoryRoot), "show", `${candidate.commit}:${sourcePath}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1024 * 1024 });
    return Buffer.byteLength(content, "utf8") <= 1024 * 1024 ? { path: sourcePath, content } : null;
  } catch { return null; }
}

function resolveStaticInput(adapterValue, input, plan, phase) {
  const base = phase === "execution" ? ["adapter", "plan", "environment", "authorization"] : ["adapter", "plan", "environment", "execution", "authorization"];
  const currentKeys = [...base, "repositoryRoot", "sourcePath"];
  if (own(input, currentKeys)) return readCandidateSource(adapterValue, input.repositoryRoot, input.sourcePath, plan.candidate);
  const legacyKeys = [...base, "source"];
  if (!own(input, legacyKeys) || !own(input.source, ["candidate", "path", "content"]) || JSON.stringify(input.source.candidate) !== JSON.stringify(plan.candidate) || typeof input.source.content !== "string") return null;
  const actual = readCandidateSource(adapterValue, process.cwd(), input.source.path, plan.candidate);
  return actual !== null && actual.content === input.source.content ? actual : null;
}

/**
 * Creates the sole adapter result interchange: a closed CYB-2 evidence-v2
 * envelope.  Synthetic adapters supply no observed output; real static
 * adapters resolve closed candidate-tree paths with `git show`, never caller-
 * supplied content.  No scanner command, network endpoint, credential, or
 * repository setup is accepted.
 */
export function executeStackAdapterConformance(input) {
  if (!input || typeof input !== "object" || !validateStackCapabilityPlan(input.plan).valid || !own(input.environment, ["platform", "nodeVersion"]) || !STACK_ADAPTER_PLATFORMS.includes(input.environment.platform) || !(typeof input.environment.nodeVersion === "string" || input.environment.nodeVersion === null)) return { ok: false, code: "STACK-ADAPTER-EXECUTION-INVALID" };
  const adapterResult = validateStackAdapter(input.adapter);
  if (!adapterResult.ok) return adapterResult;
  const expectedKeys = ["adapter", "plan", "environment", "authorization"];
  if (input.adapter.executionMode !== "static-analysis" && !own(input, expectedKeys)) return { ok: false, code: "STACK-ADAPTER-EXECUTION-INVALID" };
  const source = input.adapter.executionMode === "static-analysis" ? resolveStaticInput(input.adapter, input, input.plan, "execution") : null;
  if (input.adapter.executionMode === "static-analysis" && source === null) return { ok: false, code: "STACK-ADAPTER-EXECUTION-INVALID" };
  const selection = input.plan.entries.find((entry) => entry.capability === input.adapter.capability);
  if (!selection || !["selected", "optional-selected"].includes(selection.status)) return { ok: false, code: "STACK-ADAPTER-CAPABILITY-UNSELECTED" };
  if (!input.adapter.supportedPlatforms.includes(input.environment.platform)) return { ok: false, code: "STACK-ADAPTER-PLATFORM-UNSUPPORTED" };
  if (input.adapter.dynamic) {
    if (!own(input.authorization, ["candidate", "target", "scope", "execution", "intent", "approvalAuthority", "approvalProof"])) return { ok: false, code: "STACK-ADAPTER-VERIFICATION-REQUIRED" };
    const authorization = evaluateDynamicTargetAuthorization(input.authorization);
    if (!authorization.allowed || JSON.stringify(input.authorization.candidate) !== JSON.stringify(input.plan.candidate)) return { ok: false, code: "STACK-ADAPTER-VERIFICATION-REQUIRED" };
  } else if (input.authorization !== null) return { ok: false, code: "STACK-ADAPTER-AUTHORIZATION-INVALID" };
  return { ok: true, execution: executionRecord(input.adapter, input.plan, input.environment, source) };
}

export function createStackAdapterEvidence(input) {
  if (!input || typeof input !== "object"
    || !validateStackCapabilityPlan(input.plan).valid
    || !own(input.environment, ["platform", "nodeVersion"])
    || !STACK_ADAPTER_PLATFORMS.includes(input.environment.platform)
    || !(typeof input.environment.nodeVersion === "string" || input.environment.nodeVersion === null)) return { ok: false, code: "STACK-ADAPTER-INPUT-INVALID" };
  const adapterResult = validateStackAdapter(input.adapter);
  if (!adapterResult.ok) return adapterResult;
  const expectedKeys = ["adapter", "plan", "environment", "execution", "authorization"];
  if (input.adapter.executionMode !== "static-analysis" && !own(input, expectedKeys)) return { ok: false, code: "STACK-ADAPTER-INPUT-INVALID" };
  const source = input.adapter.executionMode === "static-analysis" ? resolveStaticInput(input.adapter, input, input.plan, "evidence") : null;
  if (input.adapter.executionMode === "static-analysis" && source === null) return { ok: false, code: "STACK-ADAPTER-INPUT-INVALID" };
  const selection = input.plan.entries.find((entry) => entry.capability === input.adapter.capability);
  if (!selection || !["selected", "optional-selected"].includes(selection.status)) return { ok: false, code: "STACK-ADAPTER-CAPABILITY-UNSELECTED" };
  if (input.adapter.dynamic) {
    if (!own(input.authorization, ["candidate", "target", "scope", "execution", "intent", "approvalAuthority", "approvalProof"])) return { ok: false, code: "STACK-ADAPTER-VERIFICATION-REQUIRED" };
    const authorization = evaluateDynamicTargetAuthorization(input.authorization);
    if (!authorization.allowed || JSON.stringify(input.authorization.candidate) !== JSON.stringify(input.plan.candidate)) return { ok: false, code: "STACK-ADAPTER-VERIFICATION-REQUIRED" };
  } else if (input.authorization !== null) return { ok: false, code: "STACK-ADAPTER-AUTHORIZATION-INVALID" };
  if (!input.adapter.supportedPlatforms.includes(input.environment.platform)) {
    return { ok: false, code: "STACK-ADAPTER-PLATFORM-UNSUPPORTED" };
  }
  if (!validExecution(input.execution, input.adapter, input.plan, input.environment, source)) return { ok: false, code: "STACK-ADAPTER-EXECUTION-INVALID" };
  const evidence = {
    schema: "pipeline.security-evidence.v2",
    policy: { configurationSha256: digest(input.plan.policyRevision) },
    input: {
      commit: input.plan.candidate.commit,
      tree: input.plan.candidate.tree,
      inputSha256: digest(JSON.stringify({ adapter: input.adapter.id, candidate: input.plan.candidate, policyRevision: input.plan.policyRevision, planDigest: input.plan.digest, sourceSha256: input.execution.sourceSha256 })),
    },
    environment: structuredClone(input.environment),
    capabilities: [{
      capabilityId: input.adapter.capability,
      tool: structuredClone(input.adapter.tool),
      rulePack: structuredClone(input.adapter.rulePack),
      status: input.execution.status,
      classification: input.adapter.executionMode,
      findings: structuredClone(input.execution.findings),
      coverage: structuredClone(input.execution.coverage),
      reason: input.execution.reason,
    }],
  };
  const validation = validateSecurityEvidenceV2(evidence);
  return validation.valid ? { ok: true, evidence } : { ok: false, code: "STACK-ADAPTER-EVIDENCE-INVALID", errors: validation.errors };
}

/** Runs the same pure conformance exchange against every representative adapter. */
export function runRepresentativeAdapterConformance({ plan, platform = "linux", authorizations = {}, repositoryRoot = null, sourcePaths = {} } = {}) {
  if (!validateStackCapabilityPlan(plan).valid) return { ok: false, code: "STACK-ADAPTER-PLAN-INVALID" };
  const assessment = evaluateStackCapabilityPlan(plan);
  if (assessment.code === "STACK-REQUIRED-UNAVAILABLE") return { ok: false, code: "STACK-ADAPTER-REQUIRED-UNAVAILABLE", unavailable: assessment.unavailable };
  const results = REPRESENTATIVE_STACK_ADAPTERS.filter((item) => plan.entries.some((entry) => entry.capability === item.capability && ["selected", "optional-selected"].includes(entry.status))).map((item) => {
    const input = { adapter: item, plan, environment: { platform, nodeVersion: null }, authorization: item.dynamic ? authorizations[item.capability] : null };
    if (item.executionMode === "static-analysis") { input.repositoryRoot = repositoryRoot; input.sourcePath = sourcePaths[item.capability]; }
    const execution = executeStackAdapterConformance(input);
    const evidenceInput = { adapter: item, plan, environment: { platform, nodeVersion: null }, execution: execution.execution, authorization: item.dynamic ? authorizations[item.capability] : null };
    if (item.executionMode === "static-analysis") { evidenceInput.repositoryRoot = repositoryRoot; evidenceInput.sourcePath = sourcePaths[item.capability]; }
    return execution.ok ? createStackAdapterEvidence(evidenceInput) : execution;
  });
  return results.length > 0 && results.every((result) => result.ok) ? { ok: true, candidate: structuredClone(plan.candidate), planDigest: plan.digest, results } : { ok: false, code: "STACK-ADAPTER-CONFORMANCE-FAILED", results };
}
