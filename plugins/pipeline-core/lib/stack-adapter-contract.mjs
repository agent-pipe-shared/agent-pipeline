// SPDX-License-Identifier: SUL-1.0
/**
 * CYB-6 adapter contract.  The contract is deliberately provider-neutral and
 * synthetic: it proves the exchange boundary without installing a scanner,
 * executing repository setup, or reaching a network service.
 */
import { createHash } from "node:crypto";

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
const own = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const safe = (value) => typeof value === "string" && /^[a-z][a-z0-9.-]{0,63}$/u.test(value);
const oid = (value) => /^[a-f0-9]{40,64}$/u.test(value ?? "");
const digest = (value) => createHash("sha256").update(value).digest("hex");

function defaultCoverage(subject) {
  return {
    subject,
    exclusions: [],
    ignored: [],
    unsupportedScope: [],
    truncation: { truncated: false, scannedFileCount: 1, totalEligibleFileCount: 1 },
    dataAge: { ageSeconds: 0, snapshotAt: null },
  };
}

function adapter(kind) {
  return Object.freeze({
    id: `synthetic.${kind}`,
    capability: CAPABILITY_BY_KIND[kind],
    kind,
    tool: Object.freeze({ name: `synthetic-${kind}`, version: "1" }),
    rulePack: Object.freeze({ ref: `synthetic/${kind}/v1`, digest: digest(`synthetic/${kind}/v1`) }),
    supportedPlatforms: STACK_ADAPTER_PLATFORMS,
    dynamic: kind === "dast" || kind === "fuzz",
  });
}

function executionRecord(adapterValue, plan, environment) {
  const unsigned = { schema: "pipeline.stack-adapter-execution.v1", adapterId: adapterValue.id, candidate: structuredClone(plan.candidate), planDigest: plan.digest, environment: structuredClone(environment), status: "PASS", findings: [], coverage: defaultCoverage(adapterValue.id), reason: "synthetic-conformance" };
  return { ...unsigned, digest: digest(JSON.stringify(unsigned)) };
}

function validExecution(value, adapterValue, plan, environment) {
  if (!own(value, ["schema", "adapterId", "candidate", "planDigest", "environment", "status", "findings", "coverage", "reason", "digest"]) || value.schema !== "pipeline.stack-adapter-execution.v1" || value.adapterId !== adapterValue.id || JSON.stringify(value.candidate) !== JSON.stringify(plan.candidate) || value.planDigest !== plan.digest || JSON.stringify(value.environment) !== JSON.stringify(environment) || value.status !== "PASS" || !Array.isArray(value.findings) || typeof value.reason !== "string" || !/^[a-f0-9]{64}$/u.test(value.digest)) return false;
  const { digest: executionDigest, ...unsigned } = value;
  return executionDigest === digest(JSON.stringify(unsigned));
}

/** Seven representative adapters, one per CYB-6 major technique cluster. */
export const REPRESENTATIVE_STACK_ADAPTERS = Object.freeze(STACK_ADAPTER_KINDS.map(adapter));

/** Validates a declarative adapter; it never probes a provider or executes setup. */
export function validateStackAdapter(value) {
  if (!own(value, ["id", "capability", "kind", "tool", "rulePack", "supportedPlatforms", "dynamic"])
    || !safe(value.id) || !STACK_ADAPTER_KINDS.includes(value.kind)
    || value.capability !== CAPABILITY_BY_KIND[value.kind]
    || !own(value.tool, ["name", "version"]) || !safe(value.tool.name) || typeof value.tool.version !== "string"
    || !own(value.rulePack, ["ref", "digest"]) || typeof value.rulePack.ref !== "string" || value.rulePack.ref === ""
    || !/^[a-f0-9]{64}$/u.test(value.rulePack.digest)
    || !Array.isArray(value.supportedPlatforms) || value.supportedPlatforms.length === 0
    || !value.supportedPlatforms.every((platform) => STACK_ADAPTER_PLATFORMS.includes(platform))
    || new Set(value.supportedPlatforms).size !== value.supportedPlatforms.length
    || typeof value.dynamic !== "boolean") return { ok: false, code: "STACK-ADAPTER-INVALID" };
  return { ok: true };
}

/**
 * Creates the sole adapter result interchange: a closed CYB-2 evidence-v2
 * envelope.  The caller supplies already-observed synthetic output; no tool
 * command, network endpoint, credential, or repository path is accepted.
 */
export function executeStackAdapterConformance(input) {
  if (!own(input, ["adapter", "plan", "environment", "authorization"]) || !validateStackCapabilityPlan(input.plan).valid || !own(input.environment, ["platform", "nodeVersion"]) || !STACK_ADAPTER_PLATFORMS.includes(input.environment.platform) || !(typeof input.environment.nodeVersion === "string" || input.environment.nodeVersion === null)) return { ok: false, code: "STACK-ADAPTER-EXECUTION-INVALID" };
  const adapterResult = validateStackAdapter(input.adapter);
  if (!adapterResult.ok) return adapterResult;
  const selection = input.plan.entries.find((entry) => entry.capability === input.adapter.capability);
  if (!selection || !["selected", "optional-selected"].includes(selection.status)) return { ok: false, code: "STACK-ADAPTER-CAPABILITY-UNSELECTED" };
  if (!input.adapter.supportedPlatforms.includes(input.environment.platform)) return { ok: false, code: "STACK-ADAPTER-PLATFORM-UNSUPPORTED" };
  if (input.adapter.dynamic) {
    if (!own(input.authorization, ["candidate", "target", "scope", "execution", "intent", "approvalAuthority", "approvalProof"])) return { ok: false, code: "STACK-ADAPTER-VERIFICATION-REQUIRED" };
    const authorization = evaluateDynamicTargetAuthorization(input.authorization);
    if (!authorization.allowed || JSON.stringify(input.authorization.candidate) !== JSON.stringify(input.plan.candidate)) return { ok: false, code: "STACK-ADAPTER-VERIFICATION-REQUIRED" };
  } else if (input.authorization !== null) return { ok: false, code: "STACK-ADAPTER-AUTHORIZATION-INVALID" };
  return { ok: true, execution: executionRecord(input.adapter, input.plan, input.environment) };
}

export function createStackAdapterEvidence(input) {
  if (!own(input, ["adapter", "plan", "environment", "execution", "authorization"])
    || !validateStackCapabilityPlan(input.plan).valid
    || !own(input.environment, ["platform", "nodeVersion"])
    || !STACK_ADAPTER_PLATFORMS.includes(input.environment.platform)
    || !(typeof input.environment.nodeVersion === "string" || input.environment.nodeVersion === null)) return { ok: false, code: "STACK-ADAPTER-INPUT-INVALID" };
  const adapterResult = validateStackAdapter(input.adapter);
  if (!adapterResult.ok) return adapterResult;
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
  if (!validExecution(input.execution, input.adapter, input.plan, input.environment)) return { ok: false, code: "STACK-ADAPTER-EXECUTION-INVALID" };
  const evidence = {
    schema: "pipeline.security-evidence.v2",
    policy: { configurationSha256: digest(input.plan.policyRevision) },
    input: {
      commit: input.plan.candidate.commit,
      tree: input.plan.candidate.tree,
      inputSha256: digest(JSON.stringify({ adapter: input.adapter.id, candidate: input.plan.candidate, policyRevision: input.plan.policyRevision, planDigest: input.plan.digest })),
    },
    environment: structuredClone(input.environment),
    capabilities: [{
      capabilityId: input.adapter.capability,
      tool: structuredClone(input.adapter.tool),
      rulePack: structuredClone(input.adapter.rulePack),
      status: input.execution.status,
      classification: "synthetic-conformance",
      findings: structuredClone(input.execution.findings),
      coverage: structuredClone(input.execution.coverage),
      reason: input.execution.reason,
    }],
  };
  const validation = validateSecurityEvidenceV2(evidence);
  return validation.valid ? { ok: true, evidence } : { ok: false, code: "STACK-ADAPTER-EVIDENCE-INVALID", errors: validation.errors };
}

/** Runs the same pure conformance exchange against every representative adapter. */
export function runRepresentativeAdapterConformance({ plan, platform = "linux", authorizations = {} } = {}) {
  if (!validateStackCapabilityPlan(plan).valid) return { ok: false, code: "STACK-ADAPTER-PLAN-INVALID" };
  const assessment = evaluateStackCapabilityPlan(plan);
  if (assessment.code === "STACK-REQUIRED-UNAVAILABLE") return { ok: false, code: "STACK-ADAPTER-REQUIRED-UNAVAILABLE", unavailable: assessment.unavailable };
  const results = REPRESENTATIVE_STACK_ADAPTERS.filter((item) => plan.entries.some((entry) => entry.capability === item.capability && ["selected", "optional-selected"].includes(entry.status))).map((item) => {
    const execution = executeStackAdapterConformance({ adapter: item, plan, environment: { platform, nodeVersion: null }, authorization: item.dynamic ? authorizations[item.capability] : null });
    return execution.ok ? createStackAdapterEvidence({ adapter: item, plan, environment: { platform, nodeVersion: null }, execution: execution.execution, authorization: item.dynamic ? authorizations[item.capability] : null }) : execution;
  });
  return results.length > 0 && results.every((result) => result.ok) ? { ok: true, candidate: structuredClone(plan.candidate), planDigest: plan.digest, results } : { ok: false, code: "STACK-ADAPTER-CONFORMANCE-FAILED", results };
}
