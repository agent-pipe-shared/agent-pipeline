// SPDX-License-Identifier: SUL-1.0
/**
 * Runner-neutral controls for accepting AI-assisted development input.
 *
 * This module deliberately makes no claim that a model, runner, tool, or
 * repository artifact is trusted.  Authority is supplied only by a bounded
 * manifest and independently checkable receipts.
 */
import { createHash } from "node:crypto";

export const AI_HARDENING_SCHEMA = "pipeline.ai-assisted-hardening.v1";
export const UNTRUSTED_SOURCES = Object.freeze([
  "repository", "issue", "pull-request", "log", "web", "tool", "agent",
]);
const SHA256 = /^[0-9a-f]{64}$/u;
const TRUST_RANK = Object.freeze({ untrusted: 0, bounded: 1, policy: 2 });
const CHANGE_CLASSES = Object.freeze({
  scope: /(^|\/)(specs?|docs)\//u,
  test: /(^|\/)(test|tests|harness)\/|\.test\.[cm]?js$/u,
  guard: /(^|\/)(hooks|guard-|pipeline-core\/scripts\/(?:ai-assisted-hardening-gate|verify-topology-preflight))/u,
  policy: /(^|\/)(\.claude|project)\//u,
  dependency: /(^|\/)(package-lock\.json|package\.json|pnpm-lock\.yaml|yarn\.lock)$/u,
  workflow: /^\.github\/workflows\//u,
  evidence: /(^|\/)(evidence|receipts)\//u,
});

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => JSON.stringify(value, Object.keys(value).sort());
const validDigest = (digest) => typeof digest === "string" && SHA256.test(digest);
const isSubset = (requested, allowed) => requested.every((value) => allowed.includes(value));

/** Classify every external/repository-derived input as untrusted by default. */
export function classifyInput({ source, content = "" } = {}) {
  return Object.freeze({
    schema: AI_HARDENING_SCHEMA,
    source: UNTRUSTED_SOURCES.includes(source) ? source : "unknown",
    trust: "untrusted",
    contentSha256: sha256(String(content)),
    authority: "none",
  });
}

/** Content can describe a request, but cannot modify its executable authority. */
export function rejectAuthorityFromContent({ input, requestedAuthority } = {}) {
  const classified = classifyInput(input);
  return Object.freeze({
    ...classified,
    accepted: false,
    code: "AIH-UNTRUSTED-AUTHORITY",
    requestedAuthority: requestedAuthority ?? null,
  });
}

/**
 * Make skills, tools, hooks and adapters digest-bound.  Ties choose the
 * lexicographically smallest immutable id, never declaration order.
 */
export function createDefinitionInventory(definitions = []) {
  const byName = new Map();
  for (const definition of definitions) {
    if (!definition || !["skill", "role", "hook", "tool", "adapter"].includes(definition.kind)
      || typeof definition.name !== "string" || !definition.name || typeof definition.id !== "string"
      || !definition.id || !validDigest(definition.sha256) || !Number.isInteger(definition.precedence)) {
      return Object.freeze({ schema: AI_HARDENING_SCHEMA, status: "invalid-definition" });
    }
    const key = `${definition.kind}:${definition.name}`;
    const previous = byName.get(key);
    if (!previous || definition.precedence > previous.precedence
      || (definition.precedence === previous.precedence && definition.id.localeCompare(previous.id) < 0)) {
      byName.set(key, Object.freeze({ ...definition }));
    }
  }
  const winners = [...byName.values()].sort((left, right) => `${left.kind}:${left.name}`.localeCompare(`${right.kind}:${right.name}`));
  return Object.freeze({
    schema: AI_HARDENING_SCHEMA,
    status: "ready",
    definitions: Object.freeze(winners),
    inventorySha256: sha256(JSON.stringify(winners.map(({ kind, name, id, precedence, sha256: digest }) => ({ kind, name, id, precedence, sha256: digest })))),
  });
}

/** Bound a task and forbid a child manifest from widening its parent. */
export function validateTaskAuthority({ manifest, request, parentManifest = null } = {}) {
  if (!manifest || !request || !Array.isArray(manifest.operations) || !Array.isArray(manifest.paths)
    || !Array.isArray(request.operations) || !Array.isArray(request.paths)) {
    return Object.freeze({ schema: AI_HARDENING_SCHEMA, allowed: false, code: "AIH-MANIFEST-INVALID" });
  }
  const contained = isSubset(request.operations, manifest.operations) && isSubset(request.paths, manifest.paths);
  const parentContained = !parentManifest || (isSubset(manifest.operations, parentManifest.operations)
    && isSubset(manifest.paths, parentManifest.paths));
  return Object.freeze({
    schema: AI_HARDENING_SCHEMA,
    allowed: contained && parentContained,
    code: contained && parentContained ? "AIH-AUTHORITY-BOUND" : "AIH-AUTHORITY-ESCALATION",
    manifestSha256: sha256(canonical({ operations: manifest.operations.slice().sort(), paths: manifest.paths.slice().sort() })),
  });
}

/** Host fallback is denied unless policy and durable evidence are both explicit. */
export function evaluateHostFallback({ requested, policyAllows, receipt } = {}) {
  if (!requested) return Object.freeze({ schema: AI_HARDENING_SCHEMA, status: "not-requested" });
  if (policyAllows === true && receipt?.schema === "pipeline.host-fallback-receipt.v1" && validDigest(receipt.sha256)) {
    return Object.freeze({ schema: AI_HARDENING_SCHEMA, status: "allowed", receiptSha256: receipt.sha256 });
  }
  return Object.freeze({ schema: AI_HARDENING_SCHEMA, status: "blocked", code: "AIH-HOST-FALLBACK-DENIED" });
}

/** Sensitive data never crosses an agent boundary without an explicit allowlist. */
export function evaluateContextExport({ fields = [], allowlisted = [] } = {}) {
  const sensitive = fields.filter((field) => /secret|token|credential|private|reasoning|transcript/iu.test(field));
  const allowed = sensitive.length === 0 || sensitive.every((field) => allowlisted.includes(field));
  return Object.freeze({ schema: AI_HARDENING_SCHEMA, allowed, code: allowed ? "AIH-EXPORT-ALLOWED" : "AIH-EXPORT-DENIED" });
}

/** Independently account for every security-sensitive delta class. */
export function evaluateChangeIntegrity({ paths = [], independentChecks = [] } = {}) {
  const changed = Object.entries(CHANGE_CLASSES)
    .filter(([, pattern]) => paths.some((path) => pattern.test(path)))
    .map(([name]) => name);
  const missing = changed.filter((name) => !independentChecks.includes(name));
  return Object.freeze({ schema: AI_HARDENING_SCHEMA, changed, missing, allowed: missing.length === 0, code: missing.length ? "AIH-INDEPENDENT-CHECK-MISSING" : "AIH-INTEGRITY-CHECKED" });
}

export function routeSecurityReview({ changedPaths = [], authorId, reviewerId } = {}) {
  const sensitive = changedPaths.some((path) => /(^|\/)(hooks|\.claude|project|workflows|security|pipeline-core\/scripts\/(?:ai-assisted-hardening-gate|verify-topology-preflight))|\.test\.[cm]?js$/u.test(path));
  const allowed = !sensitive || (typeof reviewerId === "string" && reviewerId !== authorId);
  return Object.freeze({ schema: AI_HARDENING_SCHEMA, required: sensitive, allowed, code: allowed ? "AIH-REVIEW-ROUTED" : "AIH-INDEPENDENT-REVIEW-REQUIRED" });
}

/** A forwarded message retains its least-trusted origin; relays cannot upgrade it. */
export function preserveMessageOrigin({ originTrust = "untrusted", relayTrust = "untrusted" } = {}) {
  const origin = TRUST_RANK[originTrust] ?? 0;
  const relay = TRUST_RANK[relayTrust] ?? 0;
  const effective = Math.min(origin, relay);
  return Object.freeze({ schema: AI_HARDENING_SCHEMA, originTrust, relayTrust, effectiveTrust: Object.keys(TRUST_RANK).find((key) => TRUST_RANK[key] === effective) });
}

/** Untrusted CI events need an isolation gate before privileged capability use. */
export function evaluateCiAuthority({ event, privileged = false, isolated = false, validated = false } = {}) {
  const untrustedEvent = ["pull_request", "pull_request_target", "fork"].includes(event);
  const allowed = !privileged || !untrustedEvent || (isolated && validated);
  return Object.freeze({ schema: AI_HARDENING_SCHEMA, allowed, code: allowed ? "AIH-CI-AUTHORITY-BOUND" : "AIH-CI-ISOLATION-REQUIRED" });
}

/** Definition digest drift must emit a typed requalification event. */
export function requalifyForDrift({ recordedInventorySha256, currentInventorySha256, runner } = {}) {
  const changed = validDigest(recordedInventorySha256) && validDigest(currentInventorySha256) && recordedInventorySha256 !== currentInventorySha256;
  return Object.freeze({ schema: AI_HARDENING_SCHEMA, status: changed ? "requalification-required" : "current", runner: runner ?? "unknown", code: changed ? "AIH-DEFINITION-DRIFT" : "AIH-DEFINITION-CURRENT" });
}

/** Evidence is public-safe only if it excludes secret, hidden-reasoning and transcript fields. */
export function validateEvidenceHygiene(evidence = {}) {
  const forbidden = Object.keys(evidence).filter((key) => /secret|token|credential|reasoning|transcript/iu.test(key));
  return Object.freeze({ schema: AI_HARDENING_SCHEMA, allowed: forbidden.length === 0, forbidden, code: forbidden.length ? "AIH-EVIDENCE-HYGIENE-FAILED" : "AIH-EVIDENCE-HYGIENE-PASSED" });
}

/** Provider/model labels never grant trust; any supported runner uses the same controls. */
export function evaluateRunnerNeutralConformance({ runner, manifest, request } = {}) {
  const authority = validateTaskAuthority({ manifest, request });
  return Object.freeze({ schema: AI_HARDENING_SCHEMA, runner: runner ?? "unknown", providerTrusted: false, allowed: authority.allowed, code: authority.code });
}
