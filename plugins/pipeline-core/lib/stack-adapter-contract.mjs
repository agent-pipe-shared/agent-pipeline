// SPDX-License-Identifier: SUL-1.0
/**
 * CYB-6 adapter contract.  The contract is deliberately provider-neutral and
 * synthetic: it proves the exchange boundary without installing a scanner,
 * executing repository setup, or reaching a network service.
 */
import { createHash } from "node:crypto";

import { validateSecurityEvidenceV2 } from "./security-evidence-evaluator.mjs";

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
export function createStackAdapterEvidence(input) {
  if (!own(input, ["adapter", "candidate", "policyRevision", "environment", "result"])
    || !own(input.candidate, ["commit", "tree"]) || !oid(input.candidate.commit) || !oid(input.candidate.tree)
    || typeof input.policyRevision !== "string" || input.policyRevision === ""
    || !own(input.environment, ["platform", "nodeVersion"])
    || !STACK_ADAPTER_PLATFORMS.includes(input.environment.platform)
    || !(typeof input.environment.nodeVersion === "string" || input.environment.nodeVersion === null)
    || !own(input.result, ["status", "findings", "coverage", "reason"])
    || !STATUS.has(input.result.status) || !Array.isArray(input.result.findings)
    || !(typeof input.result.reason === "string" || input.result.reason === null)) return { ok: false, code: "STACK-ADAPTER-INPUT-INVALID" };
  const adapterResult = validateStackAdapter(input.adapter);
  if (!adapterResult.ok) return adapterResult;
  if (!input.adapter.supportedPlatforms.includes(input.environment.platform)) {
    return { ok: false, code: "STACK-ADAPTER-PLATFORM-UNSUPPORTED" };
  }
  const evidence = {
    schema: "pipeline.security-evidence.v2",
    policy: { configurationSha256: digest(input.policyRevision) },
    input: {
      commit: input.candidate.commit,
      tree: input.candidate.tree,
      inputSha256: digest(JSON.stringify({ adapter: input.adapter.id, candidate: input.candidate, policyRevision: input.policyRevision })),
    },
    environment: structuredClone(input.environment),
    capabilities: [{
      capabilityId: input.adapter.capability,
      tool: structuredClone(input.adapter.tool),
      rulePack: structuredClone(input.adapter.rulePack),
      status: input.result.status,
      classification: "synthetic-conformance",
      findings: structuredClone(input.result.findings),
      coverage: structuredClone(input.result.coverage),
      reason: input.result.reason,
    }],
  };
  const validation = validateSecurityEvidenceV2(evidence);
  return validation.valid ? { ok: true, evidence } : { ok: false, code: "STACK-ADAPTER-EVIDENCE-INVALID", errors: validation.errors };
}

/** Runs the same pure conformance exchange against every representative adapter. */
export function runRepresentativeAdapterConformance({ candidate, policyRevision, platform = "linux" } = {}) {
  const results = REPRESENTATIVE_STACK_ADAPTERS.map((item) => createStackAdapterEvidence({
    adapter: item,
    candidate,
    policyRevision,
    environment: { platform, nodeVersion: null },
    result: { status: "PASS", findings: [], coverage: defaultCoverage(item.id), reason: "synthetic-conformance" },
  }));
  return results.every((result) => result.ok) ? { ok: true, results } : { ok: false, code: "STACK-ADAPTER-CONFORMANCE-FAILED", results };
}
