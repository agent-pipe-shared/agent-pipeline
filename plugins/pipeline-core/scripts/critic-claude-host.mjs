// SPDX-License-Identifier: SUL-1.0

/** Candidate-packet host adapter for Claude native-bare and one weak fallback. */
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
import { NativeBareError, preflightNativeBare, runNativeBare } from "./critic-native-bare.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const VERDICT_SCHEMA = JSON.parse(readFileSync(join(HERE, "critic-verdict.schema.json"), "utf8"));
const FALLBACK_DISPATCH_KEYS = ["schema", "packetId", "packetDigest", "exportAuthorizationSha256", "runner", "freshContext", "mayDelegate", "candidate", "diff", "references", "reasonCode", "assurance"];
const FALLBACK_RETURN_KEYS = ["schema", "packetId", "packetDigest", "assurance", "freshContext", "delegated", "verdict"];

export const CLAUDE_NATIVE_ASSURANCE = "claude-native-bare-read-only";
export const CLAUDE_FALLBACK_ASSURANCE = "functional-equivalent-read-only; OS isolation not asserted";
export const CLAUDE_FALLBACK_CODES = Object.freeze(new Set([
  "CLH-BINARY-MISSING",
  "CLH-AUTH-UNAVAILABLE",
  "CLH-NATIVE-CAPABILITY-UNAVAILABLE",
  "CLH-SANDBOX-SETUP",
  "CLH-CHILD-STDIO",
]));

export class ClaudeCriticHostError extends Error {
  constructor(code, message) { super(message); this.name = "ClaudeCriticHostError"; this.code = code; }
}
function fail(code, message) { throw new ClaudeCriticHostError(code, message); }
function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function assertVerdict(verdict) {
  const result = validateAgainstSchema(verdict, VERDICT_SCHEMA);
  if (!result.valid) fail("CLH-RESULT-SCHEMA", `Critic verdict schema invalid: ${result.errors.join("; ")}`);
}
function refs(packet) {
  const entries = [...packet.references, ...packet.governance.required.map((entry) => ({ kind: "guardrail", path: entry.path, candidateBlobOid: entry.candidateBlobOid }))];
  const byPath = new Map();
  for (const entry of entries.sort((a, b) => `${a.kind}:${a.path}`.localeCompare(`${b.kind}:${b.path}`, "en"))) {
    if (!byPath.has(entry.path)) byPath.set(entry.path, { kind: entry.kind, path: entry.path, candidateBlobOid: entry.candidateBlobOid });
  }
  return [...byPath.values()];
}
function promptFor(packet) {
  return canonicalJson({ schema: "pipeline.claude-critic-prompt.v1", packetId: packet.packetId, candidate: { ...packet.candidate }, diff: { ...packet.diff }, references: refs(packet) });
}
function fallbackDispatch(packet, reasonCode, exportAuthorizationSha256) {
  return {
    schema: "pipeline.claude-functional-fallback-dispatch.v1",
    packetId: packet.packetId,
    packetDigest: sha256(canonicalJson(packet)),
    exportAuthorizationSha256,
    runner: "claude",
    freshContext: true,
    mayDelegate: false,
    candidate: { ...packet.candidate },
    diff: { ...packet.diff },
    references: refs(packet),
    reasonCode,
    assurance: CLAUDE_FALLBACK_ASSURANCE,
  };
}

function exportNow(deps) {
  const value = deps.exportNow ?? deps.now ?? new Date();
  const millis = value instanceof Date ? value.getTime() : Number(value);
  return () => millis;
}
function authorizeExport(packet, assuranceClass, options, deps) {
  const registry = deps.registry ?? loadRunnerProfilesV3Registry();
  const policy = deps.exportPolicy ?? registry.criticExportPolicy;
  const exportView = deriveCriticExportView(packet);
  const decision = checkCriticExport({
    policy,
    packet,
    exportView,
    provider: "anthropic",
    assuranceClass,
    hostGate: options.hostGate ?? "not-observed",
    providerGate: options.providerGate ?? "not-observed",
  }, { registry, now: exportNow(deps) });
  if (!decision.ok) fail("CLH-EXPORT", `Critic export denied: ${decision.code}`);
  return { registry, policy, exportView, receipt: decision.receipt };
}
function persistExport(controlRoot, packet, authorization) {
  recordCandidateExport({
    controlRoot,
    packetId: packet.packetId,
    receipt: authorization.receipt,
    exportView: authorization.exportView,
    policy: authorization.policy,
  }, { registry: authorization.registry });
  return sha256(canonicalJson(authorization.receipt));
}

export function prepareClaudePacketReview(options, deps = {}) {
  const inspected = inspectCandidatePacket({ controlRoot: options.controlRoot, packetId: options.packetId }, deps);
  const packet = inspected.packet;
  if (packet.route.runner !== "claude" || packet.route.provider !== "anthropic"
    || packet.route.adapter !== options.adapter) fail("CLH-ROUTE", "Packet does not select this Claude adapter.");
  const nativeAuthorization = authorizeExport(packet, CLAUDE_NATIVE_ASSURANCE, options, deps);
  const claim = claimCandidatePacket({ controlRoot: options.controlRoot, packetId: options.packetId, adapter: options.adapter, claimantNonce: options.claimantNonce }, deps);
  if (sha256(canonicalJson(claim.packet)) !== sha256(canonicalJson(packet))) fail("CLH-CANDIDATE", "Packet changed between export authorization and claim.");
  const nativeAuthorizationSha256 = persistExport(options.controlRoot, packet, nativeAuthorization);
  const exportOptions = { hostGate: options.hostGate ?? "not-observed", providerGate: options.providerGate ?? "not-observed" };
  try {
    const handle = preflightNativeBare({
      executablePath: options.executablePath,
      checkoutRoot: packet.checkout.realPath,
      contractPath: options.contractPath,
      schemaPath: options.schemaPath,
      model: packet.route.modelTier,
      effort: packet.route.effortTier,
      routeDigest: packet.route.projectionDigest,
      neutralCwd: options.neutralCwd,
    }, deps);
    return {
      ok: true,
      code: "CLH-NATIVE-READY",
      mode: "native",
      controlRoot: options.controlRoot,
      exportOptions,
      packet,
      packetDigest: sha256(canonicalJson(packet)),
      exportAuthorization: nativeAuthorization.receipt,
      exportAuthorizationSha256: nativeAuthorizationSha256,
      cleanupCapability: packet.cleanupCapability,
      handle,
      prompt: promptFor(packet),
    };
  } catch (error) {
    if (!(error instanceof NativeBareError) || !error.preVerdict || !CLAUDE_FALLBACK_CODES.has(error.code)) throw error;
    const fallbackAuthorization = authorizeExport(packet, CLAUDE_FALLBACK_ASSURANCE, options, deps);
    const fallbackAuthorizationSha256 = persistExport(options.controlRoot, packet, fallbackAuthorization);
    return {
      ok: true,
      code: "CLH-FALLBACK-READY",
      mode: "fallback",
      controlRoot: options.controlRoot,
      exportOptions,
      packet,
      packetDigest: sha256(canonicalJson(packet)),
      exportAuthorization: fallbackAuthorization.receipt,
      exportAuthorizationSha256: fallbackAuthorizationSha256,
      cleanupCapability: packet.cleanupCapability,
      fallback: fallbackDispatch(packet, error.code, fallbackAuthorizationSha256),
    };
  }
}

export function executeClaudeNative(prepared, deps = {}) {
  if (prepared?.mode !== "native" || prepared.packetDigest !== sha256(canonicalJson(prepared.packet))) fail("CLH-HANDLE", "Native preparation is invalid.");
  const registry = deps.registry ?? loadRunnerProfilesV3Registry();
  const durableAuthorization = readCandidateExport({
    controlRoot: prepared.controlRoot,
    packetId: prepared.packet.packetId,
    assuranceClass: CLAUDE_NATIVE_ASSURANCE,
    policy: deps.exportPolicy ?? registry.criticExportPolicy,
  }, { ...deps, registry, requireLiveCandidate: true });
  if (sha256(canonicalJson(durableAuthorization.packet)) !== prepared.packetDigest
    || sha256(canonicalJson(durableAuthorization.receipt)) !== prepared.exportAuthorizationSha256) {
    fail("CLH-EXPORT", "Native handoff is not bound to the live candidate and persisted export authorization.");
  }
  const authorizedPrompt = promptFor(durableAuthorization.packet);
  if (prepared.prompt !== authorizedPrompt) fail("CLH-PROMPT", "Native handoff prompt drifted from the authorized candidate packet.");
  try {
    const result = runNativeBare(prepared.handle, { checkoutRoot: prepared.packet.checkout.realPath, prompt: authorizedPrompt }, deps);
    return { schema: "pipeline.claude-critic-result.v1", mode: "native", assurance: CLAUDE_NATIVE_ASSURANCE, exportAuthorizationSha256: prepared.exportAuthorizationSha256, verdict: result.verdict, outputSha256: result.outputSha256, outputBytes: result.outputBytes };
  } catch (error) {
    if (error instanceof NativeBareError && error.preVerdict && error.outputBytes === 0 && CLAUDE_FALLBACK_CODES.has(error.code)) {
      const authorization = authorizeExport(prepared.packet, CLAUDE_FALLBACK_ASSURANCE, prepared.exportOptions, deps);
      const exportAuthorizationSha256 = persistExport(prepared.controlRoot, prepared.packet, authorization);
      return { schema: "pipeline.claude-critic-fallback-required.v1", mode: "fallback-required", exportAuthorization: authorization.receipt, fallback: fallbackDispatch(prepared.packet, error.code, exportAuthorizationSha256) };
    }
    throw error;
  }
}

export function acceptClaudeFallback(prepared, hostReturn) {
  const dispatch = prepared.mode === "fallback" ? prepared.fallback : hostReturn?.dispatch;
  const expectedReturnKeys = prepared.mode === "fallback" ? FALLBACK_RETURN_KEYS : [...FALLBACK_RETURN_KEYS, "dispatch"];
  if (!exactKeys(dispatch, FALLBACK_DISPATCH_KEYS)
    || dispatch.schema !== "pipeline.claude-functional-fallback-dispatch.v1"
    || dispatch.packetId !== prepared.packet.packetId || dispatch.packetDigest !== prepared.packetDigest
    || dispatch.runner !== "claude" || dispatch.freshContext !== true || dispatch.mayDelegate !== false
    || !CLAUDE_FALLBACK_CODES.has(dispatch.reasonCode) || dispatch.assurance !== CLAUDE_FALLBACK_ASSURANCE
    || canonicalJson(dispatch.candidate) !== canonicalJson(prepared.packet.candidate)
    || canonicalJson(dispatch.diff) !== canonicalJson(prepared.packet.diff)
    || canonicalJson(dispatch.references) !== canonicalJson(refs(prepared.packet))) {
    fail("CLH-FALLBACK", "Fallback dispatch binding is invalid.");
  }
  if (!exactKeys(hostReturn, expectedReturnKeys) || hostReturn.schema !== "pipeline.claude-functional-fallback-return.v1"
    || hostReturn.packetId !== dispatch.packetId || hostReturn.packetDigest !== dispatch.packetDigest
    || hostReturn.assurance !== CLAUDE_FALLBACK_ASSURANCE || hostReturn.freshContext !== true
    || hostReturn.delegated !== false || typeof hostReturn.verdict !== "object" || hostReturn.verdict === null) {
    fail("CLH-FALLBACK", "Fallback return is invalid.");
  }
  assertVerdict(hostReturn.verdict);
  if (!/^[a-f0-9]{64}$/u.test(dispatch.exportAuthorizationSha256 ?? "")) fail("CLH-EXPORT", "Fallback export authorization is missing.");
  return { schema: "pipeline.claude-critic-result.v1", mode: "fallback", assurance: CLAUDE_FALLBACK_ASSURANCE, exportAuthorizationSha256: dispatch.exportAuthorizationSha256, verdict: hostReturn.verdict, outputSha256: sha256(canonicalJson(hostReturn)), outputBytes: Buffer.byteLength(canonicalJson(hostReturn)) };
}

export function finalizeClaudePacketReview(options, deps = {}) {
  const { prepared, result } = options;
  if (!prepared?.packet || prepared.packetDigest !== sha256(canonicalJson(prepared.packet))
    || result?.schema !== "pipeline.claude-critic-result.v1"
    || ![CLAUDE_NATIVE_ASSURANCE, CLAUDE_FALLBACK_ASSURANCE].includes(result.assurance)
    || !/^[a-f0-9]{64}$/u.test(result.exportAuthorizationSha256 ?? "")) fail("CLH-RESULT", "Claude result binding is invalid.");
  if ((result.mode === "native") !== (result.assurance === CLAUDE_NATIVE_ASSURANCE)) fail("CLH-ASSURANCE", "Claude result overstates its route assurance.");
  assertVerdict(result.verdict);
  const registry = deps.registry ?? loadRunnerProfilesV3Registry();
  const durableAuthorization = readCandidateExport({
    controlRoot: options.controlRoot,
    packetId: prepared.packet.packetId,
    assuranceClass: result.assurance,
    policy: deps.exportPolicy ?? registry.criticExportPolicy,
  }, { registry });
  const durableAuthorizationSha256 = sha256(canonicalJson(durableAuthorization.receipt));
  if (result.exportAuthorizationSha256 !== durableAuthorizationSha256) {
    fail("CLH-EXPORT", "Result is not bound to the persisted Critic export authorization.");
  }
  const recorded = recordCandidateResult({ controlRoot: options.controlRoot, packetId: prepared.packet.packetId, result }, deps);
  const receipt = {
    schema: "pipeline.claude-critic-receipt.v1",
    packetId: recorded.packet.packetId,
    packetDigest: prepared.packetDigest,
    exportAuthorizationSha256: durableAuthorizationSha256,
    candidate: { base: recorded.packet.candidate.base, commit: recorded.packet.candidate.commit, tree: recorded.packet.candidate.tree },
    diffSha256: recorded.packet.diff.sha256,
    route: {
      routeId: recorded.packet.route.routeId,
      provider: recorded.packet.route.provider,
      requestedModelTier: recorded.packet.route.modelTier,
      requestedEffortTier: recorded.packet.route.effortTier,
      executableSha256: result.mode === "native" ? prepared.handle.executable.sha256 : null,
    },
    assurance: result.assurance,
    verdictSha256: sha256(canonicalJson(result.verdict)),
    reviewPass: result.verdict.pass === true,
  };
  consumeCandidatePacket({ controlRoot: options.controlRoot, packetId: prepared.packet.packetId, receipt }, deps);
  try {
    cleanupCandidatePacket({ controlRoot: options.controlRoot, packetId: prepared.packet.packetId, cleanupCapability: prepared.cleanupCapability }, deps);
  } catch (error) {
    fail("CLH-CLEANUP", `Receipt is durable but cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { ok: true, code: "CLH-CONSUMED", receipt };
}
