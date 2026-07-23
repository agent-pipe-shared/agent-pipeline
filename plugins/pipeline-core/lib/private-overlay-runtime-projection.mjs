// SPDX-License-Identifier: SUL-1.0

/**
 * Sanitized, review-bound runtime projection for an admitted private overlay.
 *
 * The underlying migration plan never crosses this boundary. Its WeakMap
 * authentication and target bytes remain usable only through the exact review
 * object returned by this module in the same process.
 */
import { createHash } from "node:crypto";

import {
  applyRunnerProfileMigrationV3,
  planRunnerProfileMigrationV3,
} from "./runner-profile-migration-v3.mjs";
import { loadRuntimeProjectionV3OwnedKeys } from "./runtime-projection-v3.mjs";

const ACTIVATION_EVIDENCE_SCHEMA = "pipeline.private-overlay-activation-evidence.v1";
const PLAN_SCHEMA = "pipeline.private-overlay-runtime-projection-plan.v1";
const APPLY_SCHEMA = "pipeline.private-overlay-runtime-projection-activation.v1";
const SHA256 = /^[0-9a-f]{64}$/u;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const PLUGIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const PLUGIN_VERSION = /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,127}$/u;
const RUNTIME_PATHS = Object.freeze(loadRuntimeProjectionV3OwnedKeys().targets.map((target) => target.path).sort());
const TARGET_PATHS = Object.freeze([...RUNTIME_PATHS, "pipeline.user.yaml"]);
const NATIVE_PLAN_REJECTIONS = Object.freeze({
  "invalid-root": "SNT-A-PROJECTION-INVALID-ROOT",
  "recovery-required": "SNT-A-PROJECTION-RECOVERY-REQUIRED",
  "invalid-source": "SNT-A-PROJECTION-INVALID-SOURCE",
  "invalid-intent": "SNT-A-PROJECTION-INVALID-INTENT",
  "invalid-baseline": "SNT-A-PROJECTION-INVALID-BASELINE",
  "invalid-manifest": "SNT-A-PROJECTION-INVALID-MANIFEST",
});
const AUTHENTICATED_REVIEWS = new WeakMap();

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactObject(value, keys) {
  return isObject(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (isObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalDigest(value) {
  return sha256(JSON.stringify(stable(value)));
}

function publicSignature(value) {
  const ancestors = new WeakSet();
  function encode(item) {
    if (item === null) return ["null"];
    if (["string", "boolean", "number", "undefined"].includes(typeof item)) return [typeof item, item];
    if (typeof item !== "object" || ancestors.has(item)) throw new Error("unsupported review value");
    const prototype = Object.getPrototypeOf(item);
    if (prototype !== Object.prototype && prototype !== Array.prototype) throw new Error("unsupported review prototype");
    if (Object.getOwnPropertySymbols(item).length > 0) throw new Error("unsupported review symbol");
    ancestors.add(item);
    const properties = Object.getOwnPropertyNames(item).sort().map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || !("value" in descriptor)) throw new Error("unsupported review accessor");
      return [key, descriptor.enumerable, descriptor.configurable, descriptor.writable, encode(descriptor.value)];
    });
    ancestors.delete(item);
    return [Array.isArray(item) ? "array" : "object", properties];
  }
  return JSON.stringify(encode(value));
}

function validActivationEvidence(evidence) {
  if (!exactObject(evidence, ["schema", "status", "reasonCodes", "candidate", "plugin", "inputs", "admittedCounts"])
    || evidence.schema !== ACTIVATION_EVIDENCE_SCHEMA
    || evidence.status !== "ready"
    || !Array.isArray(evidence.reasonCodes)
    || evidence.reasonCodes.length !== 1
    || evidence.reasonCodes[0] !== "SNT-A-VALIDATED") return false;

  if (!exactObject(evidence.candidate, ["repositorySha256", "branchSha256", "commit", "tree"])
    || !SHA256.test(evidence.candidate.repositorySha256)
    || !SHA256.test(evidence.candidate.branchSha256)
    || !OID.test(evidence.candidate.commit)
    || !OID.test(evidence.candidate.tree)) return false;

  if (!exactObject(evidence.plugin, ["name", "version", "manifestSha256", "contentSha256"])
    || !PLUGIN_NAME.test(evidence.plugin.name)
    || !PLUGIN_VERSION.test(evidence.plugin.version)
    || !SHA256.test(evidence.plugin.manifestSha256)
    || !SHA256.test(evidence.plugin.contentSha256)) return false;

  if (!exactObject(evidence.inputs, ["sourceSha256", "lockSha256", "admittedSetSha256", "admittedFileSha256"])
    || !SHA256.test(evidence.inputs.sourceSha256)
    || !SHA256.test(evidence.inputs.lockSha256)
    || !SHA256.test(evidence.inputs.admittedSetSha256)
    || !Array.isArray(evidence.inputs.admittedFileSha256)
    || evidence.inputs.admittedFileSha256.some((digest) => typeof digest !== "string" || !SHA256.test(digest))) return false;

  const countKeys = ["policies", "guidelines", "templates", "extensions", "total"];
  if (!exactObject(evidence.admittedCounts, countKeys)
    || countKeys.some((key) => !Number.isSafeInteger(evidence.admittedCounts[key]) || evidence.admittedCounts[key] < 0)
    || evidence.admittedCounts.total !== countKeys.slice(0, -1).reduce((sum, key) => sum + evidence.admittedCounts[key], 0)
    || evidence.admittedCounts.total !== evidence.inputs.admittedFileSha256.length) return false;
  return true;
}

function image(value) {
  if (!exactObject(value, ["status", "sha256", "byteLength"])
    || !["present", "absent"].includes(value.status)
    || !Number.isSafeInteger(value.byteLength)
    || value.byteLength < 0) throw new Error("invalid target image");
  if (value.status === "absent" && (value.sha256 !== null || value.byteLength !== 0)) throw new Error("invalid absent target image");
  if (value.status === "present" && (typeof value.sha256 !== "string" || !SHA256.test(value.sha256))) throw new Error("invalid present target image");
  return { status: value.status, sha256: value.sha256, byteLength: value.byteLength };
}

function sanitizedTargets(nativePlan) {
  if (!Array.isArray(nativePlan.targets) || nativePlan.targets.length !== TARGET_PATHS.length) throw new Error("invalid target boundary");
  const targets = nativePlan.targets.map((target) => {
    if (!isObject(target)
      || !TARGET_PATHS.includes(target.path)
      || !["runtime", "source"].includes(target.kind)
      || typeof target.changed !== "boolean") throw new Error("invalid target");
    if ((target.path === "pipeline.user.yaml") !== (target.kind === "source")) throw new Error("invalid source boundary");
    return {
      path: target.path,
      kind: target.kind,
      changed: target.changed,
      before: image(target.before),
      after: image(target.after),
    };
  }).sort((left, right) => left.path.localeCompare(right.path));
  if (targets.map((target) => target.path).join("\0") !== [...TARGET_PATHS].sort().join("\0")) throw new Error("incomplete target boundary");
  return targets;
}

function rejected(schema, reasonCode, extra = {}) {
  return { schema, status: "rejected", reasonCodes: [reasonCode], ...extra };
}

function nativePlanReason(status) {
  return typeof status === "string" && Object.hasOwn(NATIVE_PLAN_REJECTIONS, status)
    ? NATIVE_PLAN_REJECTIONS[status]
    : "SNT-A-PROJECTION-REJECTED";
}

function resolveDependencies(dependencies) {
  if (dependencies === null || typeof dependencies !== "object" || Array.isArray(dependencies)) throw new Error("invalid dependencies");
  const allowed = new Set(["planMigration", "applyMigration"]);
  if (Object.keys(dependencies).some((key) => !allowed.has(key))) throw new Error("invalid dependencies");
  if (Object.hasOwn(dependencies, "planMigration") && typeof dependencies.planMigration !== "function") throw new Error("invalid plan dependency");
  if (Object.hasOwn(dependencies, "applyMigration") && typeof dependencies.applyMigration !== "function") throw new Error("invalid apply dependency");
  return {
    planMigration: dependencies.planMigration ?? planRunnerProfileMigrationV3,
    applyMigration: dependencies.applyMigration ?? applyRunnerProfileMigrationV3,
  };
}

/** Plan one sanitized projection without writing the selected overlay. */
export function planPrivateOverlayRuntimeProjection({ overlayRoot, activationEvidence } = {}, dependencies = {}) {
  try {
    if (!validActivationEvidence(activationEvidence)) return rejected(PLAN_SCHEMA, "SNT-A-PROJECTION-EVIDENCE-INVALID");
  } catch {
    return rejected(PLAN_SCHEMA, "SNT-A-PROJECTION-EVIDENCE-INVALID");
  }
  let deps;
  try { deps = resolveDependencies(dependencies); }
  catch { return rejected(PLAN_SCHEMA, "SNT-A-PROJECTION-DEPENDENCY-INVALID"); }

  let nativePlan;
  try {
    nativePlan = deps.planMigration({
      rootDir: overlayRoot,
      initializeMissingRuntimeForSlimV3: true,
    });
  } catch {
    return rejected(PLAN_SCHEMA, "SNT-A-PROJECTION-REJECTED");
  }
  try {
    if (!isObject(nativePlan) || !["ready", "noop"].includes(nativePlan.status)) {
      return rejected(PLAN_SCHEMA, nativePlanReason(nativePlan?.status));
    }
    if (nativePlan.sourceKind !== "v3" || nativePlan.sourceSha256 !== activationEvidence.inputs.sourceSha256) {
      return rejected(PLAN_SCHEMA, "SNT-A-PROJECTION-SOURCE-MISMATCH");
    }
    const evidenceSha256 = canonicalDigest(activationEvidence);
    const targets = sanitizedTargets(nativePlan);
    const core = {
      schema: PLAN_SCHEMA,
      status: nativePlan.status,
      reasonCodes: [nativePlan.status === "noop" ? "SNT-A-PROJECTION-NOOP" : "SNT-A-PROJECTION-READY"],
      activationEvidenceSha256: evidenceSha256,
      sourceSha256: nativePlan.sourceSha256,
      intentSha256: nativePlan.intentSha256,
      targetSetSha256: canonicalDigest(targets),
      targets,
      changeCount: targets.filter((target) => target.changed).length,
      activation: { required: true, sourceCommittedLast: true },
    };
    if (!SHA256.test(core.intentSha256)) throw new Error("invalid intent digest");
    const planSha256 = canonicalDigest(core);
    const review = { ...core, planSha256 };
    AUTHENTICATED_REVIEWS.set(review, {
      signature: publicSignature(review),
      overlayRoot,
      activationEvidence,
      activationEvidenceSignature: publicSignature(activationEvidence),
      evidenceSha256,
      nativePlan,
      planSha256,
      nativeStatus: nativePlan.status,
      applyMigration: deps.applyMigration,
      used: false,
    });
    return review;
  } catch {
    return rejected(PLAN_SCHEMA, "SNT-A-PROJECTION-REJECTED");
  }
}

/** Activate only the exact, unchanged, reviewed in-process projection plan. */
export function activatePrivateOverlayRuntimeProjection(review, {
  overlayRoot,
  activate = false,
  expectedPlanSha256,
} = {}) {
  const state = isObject(review) ? AUTHENTICATED_REVIEWS.get(review) : undefined;
  if (!state || state.used) return rejected(APPLY_SCHEMA, state?.used ? "SNT-A-PROJECTION-REPLAY" : "SNT-A-PROJECTION-REVIEW-INVALID");
  if (activate !== true) return rejected(APPLY_SCHEMA, "SNT-A-PROJECTION-ACTIVATION-REQUIRED");
  if (typeof expectedPlanSha256 !== "string" || !SHA256.test(expectedPlanSha256) || expectedPlanSha256 !== state.planSha256) {
    return rejected(APPLY_SCHEMA, "SNT-A-PROJECTION-DIGEST-MISMATCH");
  }
  try {
    if (publicSignature(review) !== state.signature
      || publicSignature(state.activationEvidence) !== state.activationEvidenceSignature
      || canonicalDigest(state.activationEvidence) !== state.evidenceSha256
      || !validActivationEvidence(state.activationEvidence)
      || review.planSha256 !== canonicalDigest(Object.fromEntries(Object.entries(review).filter(([key]) => key !== "planSha256")))
      || review.activationEvidenceSha256 !== state.evidenceSha256
      || review.sourceSha256 !== state.activationEvidence.inputs.sourceSha256
      || overlayRoot !== state.overlayRoot) {
      return rejected(APPLY_SCHEMA, "SNT-A-PROJECTION-REVIEW-INVALID");
    }
  } catch {
    return rejected(APPLY_SCHEMA, "SNT-A-PROJECTION-REVIEW-INVALID");
  }

  state.used = true;
  let nativeResult;
  try {
    nativeResult = state.applyMigration(state.nativePlan, { rootDir: state.overlayRoot, activate: true });
  } catch {
    return rejected(APPLY_SCHEMA, "SNT-A-PROJECTION-APPLY-REJECTED", { planSha256: state.planSha256 });
  }
  if (!isObject(nativeResult) || !["applied", "noop"].includes(nativeResult.status)) {
    return rejected(APPLY_SCHEMA, "SNT-A-PROJECTION-APPLY-REJECTED", { planSha256: state.planSha256 });
  }
  if ((state.nativeStatus === "noop") !== (nativeResult.status === "noop")) {
    return rejected(APPLY_SCHEMA, "SNT-A-PROJECTION-APPLY-REJECTED", { planSha256: state.planSha256 });
  }
  return {
    schema: APPLY_SCHEMA,
    status: nativeResult.status,
    reasonCodes: [nativeResult.status === "noop" ? "SNT-A-PROJECTION-NOOP" : "SNT-A-PROJECTION-APPLIED"],
    planSha256: state.planSha256,
    changeCount: review.changeCount,
    sourceCommittedLast: nativeResult.status === "applied",
  };
}
