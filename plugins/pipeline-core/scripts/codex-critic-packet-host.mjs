// SPDX-License-Identifier: SUL-1.0

/** Coordinator half of the host-native Codex Critic packet protocol. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateAgainstSchema } from "../lib/schema-lite.mjs";
import { checkCriticExport, deriveCriticExportView } from "../lib/critic-export-policy.mjs";
import { loadRunnerProfilesV3Registry } from "../lib/runner-profiles-v3.mjs";
import {
  canonicalJson,
  claimCandidatePacket,
  cleanupCandidatePacket,
  consumeCandidatePacket,
  inspectCandidatePacket,
  readCandidateExport,
  recordCandidateExport,
  recordCandidateResult,
  sha256,
} from "./critic-packet-preflight.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const VERDICT_SCHEMA = JSON.parse(readFileSync(join(HERE, "critic-verdict.schema.json"), "utf8"));
export const CODEX_PACKET_ASSURANCE = "functional-equivalent-read-only; OS isolation not asserted";
export const CODEX_HOST_LIMITS = Object.freeze({ firstEvidenceMs: 60_000, progressGapMs: 180_000, maxElapsedMs: 480_000 });
export const CODEX_RESIDUAL_RISKS = Object.freeze([
  "filesystem reads outside packet references are not technically excluded",
  "hidden tools and network access are not technically excluded",
  "writes outside observable repository fingerprints are not technically excluded",
  "provider fallback is not independently attested",
  "write-then-restore activity can evade final-state detection",
]);

export class CodexCriticHostError extends Error {
  constructor(code, message) { super(message); this.name = "CodexCriticHostError"; this.code = code; }
}
function fail(code, message) { throw new CodexCriticHostError(code, message); }
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, keys) {
  return isObject(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function compareReference(left, right) {
  const a = `${left.kind}:${left.path}`;
  const b = `${right.kind}:${right.path}`;
  return a < b ? -1 : a > b ? 1 : 0;
}
function packetReferences(packet) {
  const direct = packet.references.map((entry) => ({ kind: entry.kind, path: entry.path, candidateBlobOid: entry.candidateBlobOid }));
  const governance = packet.governance.required.map((entry) => ({ kind: "guardrail", path: entry.path, candidateBlobOid: entry.candidateBlobOid }));
  const byPath = new Map();
  for (const entry of [...direct, ...governance].sort(compareReference)) {
    const prior = byPath.get(entry.path);
    if (prior && prior.candidateBlobOid !== entry.candidateBlobOid) fail("CCH-REFERENCE", `Contradictory locator: ${entry.path}`);
    byPath.set(entry.path, prior ?? entry);
  }
  return [...byPath.values()].sort(compareReference);
}
function packetDigest(packet) { return sha256(canonicalJson(packet)); }
function exportNow(deps) {
  const value = deps.exportNow ?? deps.now ?? new Date();
  const millis = value instanceof Date ? value.getTime() : Number(value);
  return () => millis;
}
function authorizeExport(packet, options, deps) {
  const registry = deps.registry ?? loadRunnerProfilesV3Registry();
  const policy = deps.exportPolicy ?? registry.criticExportPolicy;
  const exportView = deriveCriticExportView(packet);
  const decision = checkCriticExport({
    policy,
    packet,
    exportView,
    provider: "openai",
    assuranceClass: CODEX_PACKET_ASSURANCE,
    hostGate: options.hostGate ?? "not-observed",
    providerGate: options.providerGate ?? "not-observed",
  }, { registry, now: exportNow(deps) });
  if (!decision.ok) fail("CCH-EXPORT", `Critic export denied: ${decision.code}`);
  return { registry, policy, exportView, receipt: decision.receipt };
}

/** Claim one B1 packet and construct the only permitted fresh-agent handoff. */
export function prepareCodexPacketDispatch(options, deps = {}) {
  const inspected = inspectCandidatePacket({ controlRoot: options.controlRoot, packetId: options.packetId }, deps);
  if (inspected.packet.route.runner !== "codex" || inspected.packet.route.provider !== "openai"
    || inspected.packet.route.adapter !== options.adapter
    || inspected.packet.route.assurance !== CODEX_PACKET_ASSURANCE) fail("CCH-ROUTE", "Packet does not select the bounded Codex route.");
  const authorization = authorizeExport(inspected.packet, options, deps);
  const claim = claimCandidatePacket({
    controlRoot: options.controlRoot,
    packetId: options.packetId,
    adapter: options.adapter,
    claimantNonce: options.claimantNonce,
  }, deps);
  const { packet } = claim;
  if (packetDigest(packet) !== packetDigest(inspected.packet)) fail("CCH-CANDIDATE", "Packet changed between export authorization and claim.");
  recordCandidateExport({
    controlRoot: options.controlRoot,
    packetId: options.packetId,
    receipt: authorization.receipt,
    exportView: authorization.exportView,
    policy: authorization.policy,
  }, { registry: authorization.registry });
  const references = packetReferences(packet);
  const taskName = `critic-${packet.packetId}`;
  return {
    ok: true,
    code: "CCH-DISPATCH-READY",
    dispatch: {
      schema: "pipeline.codex-critic-dispatch.v1",
      packetId: packet.packetId,
      packetDigest: packetDigest(packet),
      exportAuthorizationSha256: sha256(canonicalJson(authorization.receipt)),
      taskName,
      subagentType: "critic",
      forkTurns: "none",
      mayDelegate: false,
      checkoutRoot: packet.checkout.realPath,
      candidate: { base: packet.candidate.base, commit: packet.candidate.commit, tree: packet.candidate.tree },
      diff: { ...packet.diff },
      route: {
        routeId: packet.route.routeId,
        provider: packet.route.provider,
        modelTier: packet.route.modelTier,
        effortTier: packet.route.effortTier,
        projectionDigest: packet.route.projectionDigest,
      },
      promptPayload: { packetId: packet.packetId, candidate: { ...packet.candidate }, diff: { ...packet.diff }, references },
    },
    exportAuthorization: authorization.receipt,
    cleanupCapability: packet.cleanupCapability,
  };
}

function validateLiveness(liveness) {
  if (!exactKeys(liveness, ["events", "completedElapsedMs"]) || !Array.isArray(liveness.events)
    || !Number.isSafeInteger(liveness.completedElapsedMs) || liveness.completedElapsedMs < 0
    || liveness.completedElapsedMs > CODEX_HOST_LIMITS.maxElapsedMs) fail("CCH-LIVENESS", "Invalid or late completion.");
  if (liveness.events.length < 2) fail("CCH-LIVENESS", "Semantic liveness evidence is missing.");
  let prior = -1;
  for (const event of liveness.events) {
    if (!exactKeys(event, ["kind", "elapsedMs", "evidenceSha256"])
      || !["reference-inspected", "analysis-progress", "review-completed"].includes(event.kind)
      || !Number.isSafeInteger(event.elapsedMs) || event.elapsedMs <= prior
      || !/^[a-f0-9]{64}$/.test(event.evidenceSha256)) fail("CCH-LIVENESS", "Liveness event is invalid.");
    if (prior >= 0 && event.elapsedMs - prior > CODEX_HOST_LIMITS.progressGapMs) fail("CCH-LIVENESS", "Semantic progress stalled.");
    prior = event.elapsedMs;
  }
  if (liveness.events[0].elapsedMs > CODEX_HOST_LIMITS.firstEvidenceMs
    || liveness.events.at(-1).kind !== "review-completed"
    || liveness.events.at(-1).elapsedMs !== liveness.completedElapsedMs) fail("CCH-LIVENESS", "Liveness boundary mismatch.");
}
function validateHostReturn(hostReturn, dispatch) {
  const keys = ["schema", "packetId", "packetDigest", "taskName", "forkTurns", "delegated", "assurance", "providerAttested", "dispatchObservation", "liveness", "verdict"];
  if (!exactKeys(hostReturn, keys) || hostReturn.schema !== "pipeline.codex-critic-return.v1"
    || hostReturn.packetId !== dispatch.packetId || hostReturn.packetDigest !== dispatch.packetDigest
    || hostReturn.taskName !== dispatch.taskName || hostReturn.forkTurns !== "none" || hostReturn.delegated !== false
    || hostReturn.assurance !== CODEX_PACKET_ASSURANCE || hostReturn.providerAttested !== false) {
    fail("CCH-RETURN", "Host return contradicts its dispatch contract.");
  }
  if (hostReturn.dispatchObservation !== null) {
    if (!exactKeys(hostReturn.dispatchObservation, ["provider", "model", "evidenceSha256"])
      || typeof hostReturn.dispatchObservation.provider !== "string" || typeof hostReturn.dispatchObservation.model !== "string"
      || !/^[a-f0-9]{64}$/.test(hostReturn.dispatchObservation.evidenceSha256)) fail("CCH-ROUTE", "Observed identity is not same-dispatch evidence.");
  }
  validateLiveness(hostReturn.liveness);
  const verdict = validateAgainstSchema(hostReturn.verdict, VERDICT_SCHEMA);
  if (!verdict.valid) fail("CCH-VERDICT", `Critic verdict schema invalid: ${verdict.errors.join("; ")}`);
}
function sanitizedVerdict(verdict) {
  return {
    pass: verdict.pass,
    findingCount: verdict.findings.length,
    findingsSha256: sha256(canonicalJson(verdict.findings)),
    deliberatelyNotFlaggedSha256: sha256(canonicalJson(verdict.deliberately_not_flagged)),
    trajectoryVerdict: verdict.trajectory_verdict,
    trajectoryEvidenceSha256: sha256(verdict.trajectory_evidence),
    briefingViolationCount: verdict.briefing_violations.length,
    briefingViolationsSha256: sha256(canonicalJson(verdict.briefing_violations)),
  };
}

/** Validate one closed host return, durably consume it, then capability-clean B1. */
export function finalizeCodexPacketDispatch(options, deps = {}) {
  validateHostReturn(options.hostReturn, options.dispatch);
  const registry = deps.registry ?? loadRunnerProfilesV3Registry();
  const durableAuthorization = readCandidateExport({
    controlRoot: options.controlRoot,
    packetId: options.dispatch.packetId,
    assuranceClass: CODEX_PACKET_ASSURANCE,
    policy: deps.exportPolicy ?? registry.criticExportPolicy,
  }, { registry });
  const durableAuthorizationSha256 = sha256(canonicalJson(durableAuthorization.receipt));
  if (options.dispatch.exportAuthorizationSha256 !== durableAuthorizationSha256) {
    fail("CCH-EXPORT", "Dispatch is not bound to the persisted Critic export authorization.");
  }
  const recorded = recordCandidateResult({
    controlRoot: options.controlRoot,
    packetId: options.dispatch.packetId,
    result: {
      schema: "pipeline.codex-critic-result.v1",
      returnSha256: sha256(canonicalJson(options.hostReturn)),
      verdict: options.hostReturn.verdict,
    },
  }, deps);
  const packet = recorded.packet;
  if (packetDigest(packet) !== options.dispatch.packetDigest || packet.candidate.commit !== options.dispatch.candidate.commit
    || packet.candidate.tree !== options.dispatch.candidate.tree) fail("CCH-CANDIDATE", "Candidate binding drift.");
  const observation = options.hostReturn.dispatchObservation;
  const receipt = {
    schema: "pipeline.codex-critic-receipt.v1",
    packetId: packet.packetId,
    packetDigest: options.dispatch.packetDigest,
    exportAuthorizationSha256: durableAuthorizationSha256,
    candidate: { base: packet.candidate.base, commit: packet.candidate.commit, tree: packet.candidate.tree },
    diffSha256: packet.diff.sha256,
    route: {
      routeId: packet.route.routeId,
      requestedProvider: packet.route.provider,
      requestedModelTier: packet.route.modelTier,
      requestedEffortTier: packet.route.effortTier,
      effectiveProvider: observation?.provider ?? null,
      effectiveModel: observation?.model ?? null,
      providerAttested: false,
    },
    assurance: CODEX_PACKET_ASSURANCE,
    residualRisks: [...CODEX_RESIDUAL_RISKS],
    liveness: options.hostReturn.liveness,
    verdict: sanitizedVerdict(options.hostReturn.verdict),
    reviewPass: options.hostReturn.verdict.pass,
  };
  consumeCandidatePacket({ controlRoot: options.controlRoot, packetId: packet.packetId, receipt }, deps);
  try {
    cleanupCandidatePacket({ controlRoot: options.controlRoot, packetId: packet.packetId, cleanupCapability: options.cleanupCapability }, deps);
  } catch (error) {
    fail("CCH-CLEANUP", `Receipt is durable but cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { ok: true, code: "CCH-CONSUMED", receipt };
}

export const __test = Object.freeze({ validateHostReturn, sanitizedVerdict, packetReferences });
