// SPDX-License-Identifier: SUL-1.0

import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";

import { loadRunnerProfilesV3Registry } from "./runner-profiles-v3.mjs";

export const CRITIC_EXPORT_RECEIPT_SCHEMA = "pipeline.critic-export-receipt.v1";
export const CRITIC_EXPORT_DATA_CLASS = "repository-candidate";
export const CRITIC_EXPORT_PACKET_BOUNDARY = "candidate-diff-and-allowlisted-references";
const GATE_STATES = new Set(["not-observed", "approved", "additional-check-required", "denied"]);
const PACKET_KEYS = ["schema", "packetId", "createdAt", "expiresAt", "request", "ruleset", "route", "candidate", "diff", "diffPaths", "references", "governance", "checkout", "cleanupCapability", "bindings"];
const REFERENCE_KINDS = new Set(["spec", "calibration", "guardrail", "evidence"]);
const RUNNERS = new Set(["claude", "codex", "antigravity"]);
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
    // A packet-producing host's real filesystem paths are absolute in that host's own
    // convention ("/..." on POSIX, "C:\..." on native Windows); the boundary check is
    // "is this a real absolute path", not "does it start with a POSIX slash".
    || ![packet.checkout.realPath, packet.checkout.gitDir, packet.checkout.commonDir].every((path) => typeof path === "string" && path.length > 0 && isAbsolute(path))
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

// Standing consent is user-decision attribution, not a packet authorization or
// host permission. Keep its schemas and checks separate from the V3 policy above.
export const CRITIC_EXPORT_CONSENT_SCHEMA = "pipeline.critic-export-consent.v1";
export const CRITIC_EXPORT_CONSENT_PLAN_SCHEMA = "pipeline.critic-export-consent-plan.v1";
const CONSENT_CLASSES = ["repository-candidate", "selected-review-evidence"];
const CONSENT_EXCLUSIONS = ["secrets", "authentication", "caches", "transcripts", "unrelated-project-files"];
const digestPattern = /^[a-f0-9]{64}$/u;
const label = (value) => typeof value === "string" && value.trim() === value
  && value.length > 0 && value.length <= 512 && !/[\x00-\x1f\x7f]/u.test(value);

export function criticExportConsentPathAllowed(path) {
  return validPath(path) && !/[\x00-\x1f\x7f]/u.test(path)
    && !path.split("/").some((part) => /^(?:\.git|\.env(?:\..*)?|\.ssh|\.aws|\.azure|\.cache|node_modules|private|auth(?:entication)?|credentials?|secrets?|transcripts?|sessions?|cache|caches)$/iu.test(part)
      || /(?:^|[._-])(?:credentials?|secrets?|transcripts?|auth-token)(?:[._-]|$)/iu.test(part)
      || /\.(?:pem|key|p12|pfx)$/iu.test(part));
}

function validConsentScope(scope) {
  return exactKeys(scope, ["project", "recipient", "purpose", "sourceRoots", "evidenceRoots"])
    && exactKeys(scope.project, ["realPath", "device", "inode"])
    && label(scope.project.realPath) && isAbsolute(scope.project.realPath)
    && [scope.project.device, scope.project.inode].every((value) => typeof value === "string" && /^\d+$/u.test(value))
    && exactKeys(scope.recipient, ["provider", "runner", "service"])
    && Object.values(scope.recipient).every(label) && scope.purpose === "critic"
    && [scope.sourceRoots, scope.evidenceRoots].every((roots) => validSortedPaths(roots)
      && roots.length > 0 && roots.length <= 128 && roots.every(criticExportConsentPathAllowed));
}

export function prepareCriticExportConsent(scope) {
  if (!validConsentScope(scope)) return { ok: false, code: "consent-scope-invalid" };
  const plan = {
    schema: CRITIC_EXPORT_CONSENT_PLAN_SCHEMA,
    scope: structuredClone(scope),
    dataClasses: [...CONSENT_CLASSES], excludedDataClasses: [...CONSENT_EXCLUSIONS],
    decisionMeaning: "user-decision-attribution-only; external-host-approval-not-granted",
  };
  return { ok: true, code: "consent-plan-ready", plan, planSha256: criticExportPolicyDigest(plan) };
}

export function recordCriticExportConsent({ plan, planSha256, decisionReference, decisionSha256 } = {}) {
  const prepared = prepareCriticExportConsent(plan?.scope);
  if (!prepared.ok || !exactPolicy(prepared.plan, plan) || prepared.planSha256 !== planSha256) {
    return { ok: false, code: "consent-plan-drift" };
  }
  if (!label(decisionReference) || !digestPattern.test(decisionSha256 ?? "")) {
    return { ok: false, code: "consent-decision-required" };
  }
  return { ok: true, code: "consent-recorded", consent: {
    schema: CRITIC_EXPORT_CONSENT_SCHEMA, status: "active", plan: structuredClone(plan), planSha256,
    decision: { reference: decisionReference, sha256: decisionSha256 },
  } };
}

function validConsentRecord(consent) {
  if (!exactKeys(consent, ["schema", "status", "plan", "planSha256", "decision"])
    || consent.schema !== CRITIC_EXPORT_CONSENT_SCHEMA || !["active", "revoked"].includes(consent.status)
    || !exactKeys(consent.decision, ["reference", "sha256"])) return false;
  return recordCriticExportConsent({ plan: consent.plan, planSha256: consent.planSha256,
    decisionReference: consent.decision.reference, decisionSha256: consent.decision.sha256 }).ok;
}

export function revokeCriticExportConsent(consent) {
  if (!validConsentRecord(consent)) return { ok: false, code: "consent-invalid" };
  return { ok: true, code: "consent-revoked", consent: { ...structuredClone(consent), status: "revoked" } };
}

/** Caller supplies verified physical identity and digest-bound selected records.
 * Native referenceRecords must be explicitly normalized; this does not validate
 * either a native packet or the classic candidate-packet v1 schema.
 */
export function checkCriticExportConsent({ scope, consent, invocation, hostGate = "not-observed",
  providerGate = "not-observed", observedEndpoint = null } = {}) {
  const prepared = prepareCriticExportConsent(scope);
  const result = (code, coverage = "not-covered") => ({
    schema: "pipeline.critic-export-consent-check.v1", ok: code === "consent-covered", code,
    coverage, externalGates: { host: hostGate, provider: providerGate },
    observedEndpoint, declaredRecipient: scope?.recipient ?? null,
    disclosure: prepared.ok && code !== "consent-invocation-invalid" ? { project: structuredClone(scope.project), purpose: scope.purpose,
      dataClasses: [...CONSENT_CLASSES], excludedDataClasses: [...CONSENT_EXCLUSIONS],
      sourceRoots: [...scope.sourceRoots], evidenceRoots: [...scope.evidenceRoots],
      candidate: validOid(invocation?.candidate?.commit) && validOid(invocation?.candidate?.tree)
        ? { commit: invocation.candidate.commit, tree: invocation.candidate.tree } : null,
      selectedRecords: Array.isArray(invocation?.records) ? invocation.records
        .filter((record) => criticExportConsentPathAllowed(record?.path) && digestPattern.test(record?.sha256 ?? "")
          && CONSENT_CLASSES.includes(record?.dataClass))
        .map(({ path, sha256, dataClass }) => ({ path, sha256, dataClass })) : [],
      invocationSha256: invocation ? criticExportPolicyDigest(invocation) : null,
      planSha256: prepared.planSha256 } : null,
    hostApprovalGranted: false,
  });
  if (!prepared.ok) return result("consent-scope-invalid");
  if (!GATE_STATES.has(hostGate) || !GATE_STATES.has(providerGate)
    || !(observedEndpoint === null || label(observedEndpoint))) return result("external-gate-state-invalid");
  if (!exactKeys(invocation, ["candidate", "records"])
    || !exactKeys(invocation.candidate, ["commit", "tree"])
    || !Object.values(invocation.candidate).every(validOid)
    || !Array.isArray(invocation.records) || invocation.records.length === 0 || invocation.records.length > 512
    || !invocation.records.every((record) => exactKeys(record, ["path", "sha256", "dataClass"])
      && criticExportConsentPathAllowed(record.path) && digestPattern.test(record.sha256 ?? "")
      && CONSENT_CLASSES.includes(record.dataClass))
    || new Set(invocation.records.map((record) => record.path)).size !== invocation.records.length) {
    return result("consent-invocation-invalid");
  }
  if (!consent) return result("consent-missing");
  if (!validConsentRecord(consent)) return result("consent-invalid");
  if (consent.status === "revoked") return result("consent-revoked");
  if (!exactPolicy(consent.plan.scope.project, scope.project)) return result("consent-project-not-covered");
  if (!exactPolicy(consent.plan.scope.recipient, scope.recipient)) return result("consent-recipient-not-covered");
  if (consent.planSha256 !== prepared.planSha256) return result("consent-scope-not-covered");
  for (const record of invocation.records) {
    const roots = record.dataClass === "repository-candidate" ? scope.sourceRoots : scope.evidenceRoots;
    if (!roots.some((root) => record.path === root || record.path.startsWith(`${root}/`))) {
      return result("consent-path-not-covered");
    }
  }
  if (hostGate === "denied" || providerGate === "denied") return result("external-gate-denied", "covered");
  return result("consent-covered", "covered");
}
