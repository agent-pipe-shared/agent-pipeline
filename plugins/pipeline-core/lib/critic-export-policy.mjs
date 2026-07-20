// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";

import { loadRunnerProfilesV3Registry } from "./runner-profiles-v3.mjs";

export const CRITIC_EXPORT_RECEIPT_SCHEMA = "pipeline.critic-export-receipt.v1";
export const CRITIC_EXPORT_DATA_CLASS = "repository-candidate";
export const CRITIC_EXPORT_PACKET_BOUNDARY = "candidate-diff-and-allowlisted-references";
const GATE_STATES = new Set(["not-observed", "approved", "additional-check-required", "denied"]);
const PACKET_KEYS = ["schema", "packetId", "createdAt", "expiresAt", "request", "ruleset", "route", "candidate", "diff", "diffPaths", "references", "governance", "checkout", "cleanupCapability", "bindings"];
const REFERENCE_KINDS = new Set(["spec", "calibration", "guardrail", "evidence"]);
const RUNNERS = new Set(["claude", "codex"]);
const PROVIDER_BY_RUNNER = Object.freeze({ claude: "anthropic", codex: "openai" });

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function criticExportPolicyDigest(policy) {
  return sha256(JSON.stringify(stable(policy)));
}

function packetDigest(packet) {
  return sha256(JSON.stringify(stable(packet)));
}

function bindingDigest(value) {
  return sha256(`${JSON.stringify(value, null, 2)}\n`);
}

function validOid(value) {
  return typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value);
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function validPath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 240
    && value.trim() === value && !value.includes("\\") && !value.startsWith("/")
    && !value.startsWith("./") && !value.endsWith("/") && !/^[A-Za-z]:/u.test(value)
    && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function validSortedPaths(paths) {
  return Array.isArray(paths) && paths.every(validPath)
    && new Set(paths).size === paths.length
    && JSON.stringify(paths) === JSON.stringify([...paths].sort());
}

function nonempty(value) {
  return typeof value === "string" && value.length > 0;
}

function validTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function validPacketBoundary(packet) {
  if (!exactKeys(packet, PACKET_KEYS) || packet.schema !== "pipeline.critic-candidate-packet.v1"
    || !/^[a-f0-9]{32}$/u.test(packet.packetId ?? "")
    || !validTimestamp(packet.createdAt) || !validTimestamp(packet.expiresAt)
    || Date.parse(packet.expiresAt) <= Date.parse(packet.createdAt)
    || !exactKeys(packet.request, ["taskId", "projectId", "trigger"])
    || !Object.values(packet.request).every(nonempty)
    || !exactKeys(packet.ruleset, ["oid", "objectFormat"])
    || !validOid(packet.ruleset.oid) || !["sha1", "sha256"].includes(packet.ruleset.objectFormat)
    || packet.ruleset.oid.length !== (packet.ruleset.objectFormat === "sha1" ? 40 : 64)
    || !exactKeys(packet.route, ["routeId", "runner", "adapter", "provider", "modelTier", "effortTier", "assurance", "projectionDigest"])
    || !Object.values(packet.route).every(nonempty) || !RUNNERS.has(packet.route.runner)
    || !/^[a-f0-9]{64}$/u.test(packet.route.projectionDigest)
    || !exactKeys(packet.candidate, ["base", "commit", "tree"])
    || !Object.values(packet.candidate).every((oid) => validOid(oid) && oid.length === packet.ruleset.oid.length)
    || !exactKeys(packet.diff, ["base", "commit", "path", "bytes", "sha256"])
    || packet.diff.base !== packet.candidate.base || packet.diff.commit !== packet.candidate.commit
    || packet.diff.path !== ".git/agent-pipeline-review.diff"
    || !Number.isSafeInteger(packet.diff.bytes) || packet.diff.bytes < 0
    || !/^[a-f0-9]{64}$/u.test(packet.diff.sha256 ?? "")
    || !validSortedPaths(packet.diffPaths)
    || !Array.isArray(packet.references)
    || !exactKeys(packet.governance, ["schema", "governance", "required"])
    || packet.governance.schema !== "pipeline.critic-packet-governance.v1"
    || !(packet.governance.governance === null
      || (exactKeys(packet.governance.governance, ["manifestPath", "guidelinesPath", "policiesPath"])
        && Object.values(packet.governance.governance).every(validPath)))
    || !Array.isArray(packet.governance.required)
    || !exactKeys(packet.checkout, ["realPath", "gitDir", "commonDir", "objectFormat", "candidateOid", "candidateTree", "creatorNonce"])
    || !["sha1", "sha256"].includes(packet.checkout.objectFormat)
    || packet.checkout.objectFormat !== packet.ruleset.objectFormat
    || ![packet.checkout.realPath, packet.checkout.gitDir, packet.checkout.commonDir].every((path) => typeof path === "string" && path.startsWith("/"))
    || packet.checkout.candidateOid !== packet.candidate.commit || packet.checkout.candidateTree !== packet.candidate.tree
    || !/^[a-f0-9]{64}$/u.test(packet.checkout.creatorNonce ?? "")
    || !/^[a-f0-9]{64}$/u.test(packet.cleanupCapability ?? "")
    || !exactKeys(packet.bindings, ["requestSha256", "diffPathsSha256", "governanceSha256"])) return false;
  const references = packet.references.map((entry) => exactKeys(entry, ["kind", "path", "candidateBlobOid"])
    && REFERENCE_KINDS.has(entry.kind) && validPath(entry.path) && validOid(entry.candidateBlobOid));
  if (references.some((valid) => !valid)) return false;
  const referenceKeys = packet.references.map((entry) => `${entry.kind}:${entry.path}`);
  if (new Set(referenceKeys).size !== referenceKeys.length
    || JSON.stringify(referenceKeys) !== JSON.stringify([...referenceKeys].sort())) return false;
  const required = packet.governance.required.map((entry) => exactKeys(entry, ["path", "candidateBlobOid", "reasons"])
    && validPath(entry.path) && validOid(entry.candidateBlobOid)
    && Array.isArray(entry.reasons) && entry.reasons.length > 0
    && entry.reasons.every(nonempty)
    && new Set(entry.reasons).size === entry.reasons.length
    && JSON.stringify(entry.reasons) === JSON.stringify([...entry.reasons].sort()));
  if (required.some((valid) => !valid)) return false;
  const requiredPaths = packet.governance.required.map(({ path }) => path);
  if (new Set(requiredPaths).size !== requiredPaths.length
    || JSON.stringify(requiredPaths) !== JSON.stringify([...requiredPaths].sort())) return false;
  const expectedBindings = {
    requestSha256: bindingDigest(packet.request),
    diffPathsSha256: bindingDigest(packet.diffPaths),
    governanceSha256: bindingDigest(packet.governance),
  };
  return JSON.stringify(packet.bindings) === JSON.stringify(expectedBindings);
}

export function deriveCriticExportView(packet) {
  if (!validPacketBoundary(packet)) return null;
  return {
    schema: "pipeline.critic-export-view.v1",
    packetId: packet.packetId,
    candidate: { base: packet.candidate.base, commit: packet.candidate.commit, tree: packet.candidate.tree },
    diff: structuredClone(packet.diff),
    diffPaths: structuredClone(packet.diffPaths),
    references: structuredClone(packet.references),
    governanceReferences: structuredClone(packet.governance.required),
  };
}

function exactPolicy(policy, expected) {
  return JSON.stringify(stable(policy)) === JSON.stringify(stable(expected));
}

/**
 * Pure pre-export decision. It never opens a network connection or serializes
 * packet content. Host/provider checks remain separately visible and cannot be
 * converted into a Pipeline approval.
 */
export function checkCriticExport(input, {
  registry = loadRunnerProfilesV3Registry(),
  now = () => Date.now(),
} = {}) {
  const policy = input?.policy;
  const packet = input?.packet;
  const hostGate = input?.hostGate ?? "not-observed";
  const providerGate = input?.providerGate ?? "not-observed";
  const base = {
    schema: CRITIC_EXPORT_RECEIPT_SCHEMA,
    policySha256: policy && typeof policy === "object" ? criticExportPolicyDigest(policy) : null,
    packetSha256: packet && typeof packet === "object" ? packetDigest(packet) : null,
    exportViewSha256: input?.exportView && typeof input.exportView === "object"
      ? packetDigest(input.exportView) : null,
    packetId: typeof packet?.packetId === "string" ? packet.packetId : null,
    candidate: validOid(packet?.candidate?.base) && validOid(packet?.candidate?.commit) && validOid(packet?.candidate?.tree)
      ? { base: packet.candidate.base, commit: packet.candidate.commit, tree: packet.candidate.tree }
      : null,
    dataClass: CRITIC_EXPORT_DATA_CLASS,
    provider: input?.provider ?? null,
    packetSchema: packet?.schema ?? null,
    packetBoundary: CRITIC_EXPORT_PACKET_BOUNDARY,
    assuranceClass: input?.assuranceClass ?? null,
    pipelineDecision: "denied",
    reasonCode: "invalid-input",
    externalGates: { host: hostGate, provider: providerGate },
    checkedAtMs: now(),
  };
  const deny = (reasonCode) => ({ ok: false, code: reasonCode, receipt: { ...base, reasonCode } });

  if (!exactPolicy(policy, registry.criticExportPolicy)) return deny("policy-drift");
  if (!GATE_STATES.has(hostGate) || !GATE_STATES.has(providerGate)) return deny("external-gate-state-invalid");
  if (hostGate === "denied" || providerGate === "denied") return deny("external-gate-denied");
  const derivedView = deriveCriticExportView(packet);
  if (derivedView === null) return deny("packet-invalid");
  if (now() > Date.parse(packet.expiresAt)) return deny("packet-expired");
  if (JSON.stringify(stable(input.exportView)) !== JSON.stringify(stable(derivedView))) return deny("packet-boundary-drift");
  if (PROVIDER_BY_RUNNER[packet.route.runner] !== packet.route.provider) return deny("packet-provider-runner-drift");
  const assuranceMatches = packet.route.assurance === input.assuranceClass
    || (packet.route.runner === "claude" && packet.route.assurance === "native-preferred"
      && ["claude-native-bare-read-only", "functional-equivalent-read-only; OS isolation not asserted"].includes(input.assuranceClass));
  if (packet.route?.provider !== input.provider || !assuranceMatches) return deny("packet-route-drift");
  const rule = policy.rules.find((entry) => entry.dataClass === CRITIC_EXPORT_DATA_CLASS
    && entry.provider === input.provider
    && entry.packetSchema === packet.schema
    && entry.packetBoundary === CRITIC_EXPORT_PACKET_BOUNDARY
    && entry.assuranceClass === input.assuranceClass);
  if (!rule) return deny("not-allowlisted");
  return {
    ok: true,
    code: "authorized",
    receipt: { ...base, pipelineDecision: "authorized", reasonCode: "allowlist-match" },
  };
}

/** Recompute and byte-logically bind one already-created authorization receipt. */
export function validateCriticExportAuthorization({ receipt, packet, exportView, policy }, options = {}) {
  if (!receipt || typeof receipt !== "object" || receipt.pipelineDecision !== "authorized"
    || !Number.isSafeInteger(receipt.checkedAtMs)) return false;
  const expected = checkCriticExport({
    policy,
    packet,
    exportView,
    provider: receipt.provider,
    assuranceClass: receipt.assuranceClass,
    hostGate: receipt.externalGates?.host,
    providerGate: receipt.externalGates?.provider,
  }, { ...options, now: () => receipt.checkedAtMs });
  return expected.ok && JSON.stringify(stable(expected.receipt)) === JSON.stringify(stable(receipt));
}
