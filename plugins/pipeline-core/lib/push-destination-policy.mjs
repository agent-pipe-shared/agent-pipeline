// SPDX-License-Identifier: SUL-1.0
/**
 * Explicit destination classification for the two Push-Gate lanes.
 *
 * This module deliberately has no permissive default.  A caller receives
 * `protected-publication` unless the manifest policy, parsed refspec, and
 * exact branch namespace are all independently well formed.  Keeping this
 * decision separate from guard-push makes the narrow exception auditable and
 * prevents a future push parser change from accidentally widening it.
 */

export const PUSH_DESTINATION_POLICY_SCHEMA = "pipeline.push-destination-policy.v1";
export const CHECKPOINT_LANE = "feature-checkpoint";
export const PROTECTED_LANE = "protected-publication";

const FEATURE_NAMESPACE_RE = /^refs\/heads\/feat\/[A-Za-z0-9._/-]*$/u;
const BRANCH_RE = /^refs\/heads\/[A-Za-z0-9._/-]+$/u;

function invalid(reason) {
  return { ok: false, reason, namespace: null };
}

/**
 * Validates the deliberately tiny configuration surface.  No default namespace
 * exists: consumers must opt in explicitly and malformed configuration is never
 * interpreted as a feature-checkpoint policy.
 */
export function parsePushDestinationPolicy(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid("policy is missing or not an object");
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== "checkpointNamespace" || keys[1] !== "schema") {
    return invalid("policy has unknown, missing, or conflicting fields");
  }
  if (value.schema !== PUSH_DESTINATION_POLICY_SCHEMA) return invalid("policy schema is unsupported");
  if (typeof value.checkpointNamespace !== "string" || !FEATURE_NAMESPACE_RE.test(value.checkpointNamespace)) {
    return invalid("checkpoint namespace is not a safe feature-branch namespace");
  }
  // A namespace ending in a slash is required.  It forbids declaring an entire
  // branch such as refs/heads/main as a checkpoint destination by configuration.
  if (!value.checkpointNamespace.endsWith("/")) return invalid("checkpoint namespace must end in a slash");
  return { ok: true, reason: null, namespace: value.checkpointNamespace };
}

/**
 * Classifies the already parsed push binding.  `manifestStatus` is part of the
 * input because an invalid manifest must never make its partially parsed policy
 * usable.  The guard passes the loader's exact status rather than inferring it.
 */
export function classifyPushDestination({ manifestStatus, policy, binding } = {}) {
  const parsed = parsePushDestinationPolicy(policy);
  if (manifestStatus !== "ok") return { lane: PROTECTED_LANE, reason: "manifest is not valid", policy: parsed };
  if (!parsed.ok) return { lane: PROTECTED_LANE, reason: parsed.reason, policy: parsed };
  if (!binding || binding.ok !== true) return { lane: PROTECTED_LANE, reason: "push binding is not exact", policy: parsed };
  if (typeof binding.remote !== "string" || binding.remote === "") return { lane: PROTECTED_LANE, reason: "remote is not explicit", policy: parsed };
  if (typeof binding.sourceRef !== "string" || !BRANCH_RE.test(binding.sourceRef)) {
    return { lane: PROTECTED_LANE, reason: "source is not an explicit branch ref", policy: parsed };
  }
  if (typeof binding.destination !== "string" || !BRANCH_RE.test(binding.destination)) {
    return { lane: PROTECTED_LANE, reason: "destination is not an explicit branch ref", policy: parsed };
  }
  if (!binding.destination.startsWith(parsed.namespace)) {
    return { lane: PROTECTED_LANE, reason: "destination is outside checkpoint namespace", policy: parsed };
  }
  if (binding.sourceRef !== binding.destination) {
    return { lane: PROTECTED_LANE, reason: "checkpoint source and destination differ", policy: parsed };
  }
  return { lane: CHECKPOINT_LANE, reason: null, policy: parsed };
}

/**
 * The committed trailer is the lightweight human-intent record for a checkpoint.
 * It is deliberately restrictive so it cannot smuggle multiline command material
 * into the audit stream.
 */
export function validCheckpointIntent(value) {
  return typeof value === "string"
    && value.trim() === value
    && value.length >= 3
    && value.length <= 280
    && /^[\x20-\x7e]+$/u.test(value);
}
