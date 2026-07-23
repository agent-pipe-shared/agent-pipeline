// SPDX-License-Identifier: SUL-1.0

/** Read-only combined status for one slim private-overlay bootstrap. */
import {
  admitPrivateOverlayActivation,
  consumePrivateOverlayAdmission,
} from "./private-overlay-activation.mjs";
import { planPrivateOverlayRuntimeProjection } from "./private-overlay-runtime-projection.mjs";
import { observePublicCoreIdentity } from "./public-core-observation.mjs";
import { validatePoGateProfileForRepository } from "./po-gate-authority.mjs";

const SCHEMA = "pipeline.private-overlay-bootstrap-status.v1";
const EVIDENCE_SCHEMA = "pipeline.private-overlay-activation-evidence.v1";
const PROFILE_SCHEMA = "pipeline.po-gate-authority-evidence.v1";
const SHA256 = /^[0-9a-f]{64}$/u;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const PLUGIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const PLUGIN_VERSION = /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,127}$/u;
const SAFE_CODE = /^(?:SNT-A2?|PO)-[A-Z0-9-]{1,88}$/u;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactObject(value, keys) {
  return isObject(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function safeCode(result, fallback) {
  try {
    const code = Array.isArray(result?.reasonCodes) && result.reasonCodes.length === 1
      ? result.reasonCodes[0]
      : result?.code;
    return typeof code === "string" && SAFE_CODE.test(code) ? code : fallback;
  } catch {
    return fallback;
  }
}

function rejected(code) {
  return { schema: SCHEMA, status: "rejected", reasonCodes: [code] };
}

function dependencies(overrides) {
  if (!isObject(overrides)) throw new Error("invalid dependencies");
  const allowed = new Set(["observe", "admit", "plan", "profile", "consume"]);
  if (Object.keys(overrides).some((key) => !allowed.has(key))) throw new Error("invalid dependencies");
  const selected = {
    observe: overrides.observe ?? observePublicCoreIdentity,
    admit: overrides.admit ?? admitPrivateOverlayActivation,
    plan: overrides.plan ?? planPrivateOverlayRuntimeProjection,
    profile: overrides.profile ?? validatePoGateProfileForRepository,
    consume: overrides.consume ?? consumePrivateOverlayAdmission,
  };
  if (Object.values(selected).some((value) => typeof value !== "function")) throw new Error("invalid dependency");
  return selected;
}

function input(value) {
  if (!exactObject(value, ["overlayRoot", "sourcePluginRoot", "installedPluginRoot", "consumeInputs"])
    || typeof value.overlayRoot !== "string"
    || typeof value.sourcePluginRoot !== "string"
    || typeof value.installedPluginRoot !== "string"
    || typeof value.consumeInputs !== "function") throw new Error("invalid input");
  return value;
}

function evidenceSummary(evidence) {
  if (!exactObject(evidence, ["schema", "status", "reasonCodes", "candidate", "plugin", "inputs", "admittedCounts"])
    || evidence.schema !== EVIDENCE_SCHEMA
    || evidence.status !== "ready"
    || !Array.isArray(evidence.reasonCodes)
    || evidence.reasonCodes.length !== 1
    || evidence.reasonCodes[0] !== "SNT-A-VALIDATED") throw new Error("invalid evidence");
  if (!exactObject(evidence.candidate, ["repositorySha256", "branchSha256", "commit", "tree"])
    || !SHA256.test(evidence.candidate.repositorySha256)
    || !SHA256.test(evidence.candidate.branchSha256)
    || !OID.test(evidence.candidate.commit)
    || !OID.test(evidence.candidate.tree)) throw new Error("invalid candidate");
  if (!exactObject(evidence.plugin, ["name", "version", "manifestSha256", "contentSha256"])
    || !PLUGIN_NAME.test(evidence.plugin.name)
    || !PLUGIN_VERSION.test(evidence.plugin.version)
    || !SHA256.test(evidence.plugin.manifestSha256)
    || !SHA256.test(evidence.plugin.contentSha256)) throw new Error("invalid plugin");
  if (!exactObject(evidence.inputs, ["sourceSha256", "lockSha256", "admittedSetSha256", "admittedFileSha256"])
    || !SHA256.test(evidence.inputs.sourceSha256)
    || !SHA256.test(evidence.inputs.lockSha256)
    || !SHA256.test(evidence.inputs.admittedSetSha256)
    || !Array.isArray(evidence.inputs.admittedFileSha256)
    || evidence.inputs.admittedFileSha256.some((digest) => typeof digest !== "string" || !SHA256.test(digest))) {
    throw new Error("invalid inputs");
  }
  const countKeys = ["policies", "guidelines", "templates", "extensions", "total"];
  if (!exactObject(evidence.admittedCounts, countKeys)
    || countKeys.some((key) => !Number.isSafeInteger(evidence.admittedCounts[key]) || evidence.admittedCounts[key] < 0)
    || evidence.admittedCounts.total !== countKeys.slice(0, -1).reduce((sum, key) => sum + evidence.admittedCounts[key], 0)
    || evidence.admittedCounts.total !== evidence.inputs.admittedFileSha256.length) throw new Error("invalid counts");
  return {
    candidate: { ...evidence.candidate },
    plugin: { ...evidence.plugin },
    inputs: {
      sourceSha256: evidence.inputs.sourceSha256,
      lockSha256: evidence.inputs.lockSha256,
      admittedSetSha256: evidence.inputs.admittedSetSha256,
      admittedFileSha256: [...evidence.inputs.admittedFileSha256],
    },
    admittedCounts: { ...evidence.admittedCounts },
  };
}

function validPlan(plan) {
  return isObject(plan)
    && ["ready", "noop"].includes(plan.status)
    && typeof plan.planSha256 === "string"
    && SHA256.test(plan.planSha256);
}

function profileSummary(result) {
  if (!exactObject(result, ["ok", "code", "value"])
    || result.ok !== true
    || result.code !== "PO-PROFILE-AUTHORITY-VALID"
    || !exactObject(result.value, ["schema", "humanFacing", "sourceSha256", "runtimeSha256", "receiptSha256", "repositoryFingerprint"])
    || result.value.schema !== PROFILE_SCHEMA
    || !["de", "en"].includes(result.value.humanFacing)
    || !SHA256.test(result.value.sourceSha256)
    || !SHA256.test(result.value.runtimeSha256)
    || !SHA256.test(result.value.receiptSha256)
    || !SHA256.test(result.value.repositoryFingerprint)) throw new Error("invalid profile evidence");
  return {
    humanFacing: result.value.humanFacing,
    sourceSha256: result.value.sourceSha256,
    runtimeSha256: result.value.runtimeSha256,
    receiptSha256: result.value.receiptSha256,
    repositoryFingerprint: result.value.repositoryFingerprint,
  };
}

function sameCounts(left, right) {
  const keys = ["policies", "guidelines", "templates", "extensions", "total"];
  return exactObject(left, keys) && keys.every((key) => left[key] === right[key]);
}

function activationRequired(plan, summary, reasonCode, profileCode = undefined) {
  return {
    schema: SCHEMA,
    status: "activation-required",
    reasonCodes: [reasonCode],
    planSha256: plan.planSha256,
    ...summary,
    ...(profileCode === undefined ? {} : { profile: { status: "invalid", code: profileCode } }),
  };
}

/**
 * Observe and report the current private-overlay bootstrap state without
 * mutating runtime projections or publishing receipts.
 */
export function readPrivateOverlayBootstrapStatus(value, dependencyOverrides = {}) {
  let request;
  let deps;
  try {
    request = input(value);
    deps = dependencies(dependencyOverrides);
  } catch {
    return rejected("SNT-A-BOOTSTRAP-INPUT-INVALID");
  }

  let observation;
  try {
    observation = deps.observe({
      sourcePluginRoot: request.sourcePluginRoot,
      installedPluginRoot: request.installedPluginRoot,
    });
  } catch {
    return rejected("SNT-A-BOOTSTRAP-OBSERVATION-REJECTED");
  }
  if (!isObject(observation) || observation.status !== "ready") {
    return rejected(safeCode(observation, "SNT-A-BOOTSTRAP-OBSERVATION-REJECTED"));
  }

  let evidence;
  try {
    evidence = deps.admit({
      overlayRoot: request.overlayRoot,
      selectedCandidate: observation.candidate,
      installedPlugin: observation.plugin,
    });
  } catch {
    return rejected("SNT-A-BOOTSTRAP-ADMISSION-REJECTED");
  }
  if (!isObject(evidence) || evidence.status !== "ready") {
    return rejected(safeCode(evidence, "SNT-A-BOOTSTRAP-ADMISSION-REJECTED"));
  }

  let summary;
  let plan;
  try {
    summary = evidenceSummary(evidence);
    plan = deps.plan({ overlayRoot: request.overlayRoot, activationEvidence: evidence });
  } catch {
    return rejected("SNT-A-BOOTSTRAP-PLAN-REJECTED");
  }
  if (!validPlan(plan)) return rejected(safeCode(plan, "SNT-A-BOOTSTRAP-PLAN-REJECTED"));
  if (plan.status === "ready") {
    return activationRequired(plan, summary, "SNT-A-RUNTIME-PROJECTION-REQUIRED");
  }

  let profile;
  try { profile = deps.profile({ repoRoot: request.overlayRoot }); }
  catch { return rejected("SNT-A-BOOTSTRAP-PROFILE-REJECTED"); }
  if (!isObject(profile) || profile.ok !== true) {
    return activationRequired(
      plan,
      summary,
      "SNT-A-PO-PROFILE-READBACK-REQUIRED",
      safeCode(profile, "PO-PROFILE-AUTHORITY-INVALID"),
    );
  }

  let profileEvidence;
  try { profileEvidence = profileSummary(profile); }
  catch { return rejected("SNT-A-BOOTSTRAP-PROFILE-REJECTED"); }
  if (profileEvidence.sourceSha256 !== summary.inputs.sourceSha256) {
    return rejected("SNT-A-BOOTSTRAP-PROFILE-BINDING-MISMATCH");
  }

  let callbackCalls = 0;
  let callbackFailed = false;
  let callbackAsync = false;
  let consumed;
  try {
    consumed = deps.consume(evidence, (batch) => {
      callbackCalls += 1;
      if (callbackCalls !== 1) throw new Error("consumer called more than once");
      try {
        const result = request.consumeInputs(batch);
        callbackAsync = result !== null
          && (typeof result === "object" || typeof result === "function")
          && typeof result.then === "function";
        return result;
      } catch (error) {
        callbackFailed = true;
        throw error;
      }
    });
  } catch {
    return rejected("SNT-A-BOOTSTRAP-CONSUME-REJECTED");
  }
  if (callbackFailed) return rejected("SNT-A-CONSUMER-FAILED");
  if (callbackAsync) return rejected("SNT-A-CONSUMER-ASYNC");
  if (callbackCalls !== 1) return rejected("SNT-A-BOOTSTRAP-CONSUME-REJECTED");
  if (!isObject(consumed)
    || consumed.status !== "consumed"
    || !Array.isArray(consumed.reasonCodes)
    || consumed.reasonCodes.length !== 1
    || consumed.reasonCodes[0] !== "SNT-A-PRIVATE-INPUTS-CONSUMED"
    || !sameCounts(consumed.admittedCounts, summary.admittedCounts)) {
    return rejected(safeCode(consumed, "SNT-A-BOOTSTRAP-CONSUME-REJECTED"));
  }
  return {
    schema: SCHEMA,
    status: "activated",
    reasonCodes: ["SNT-A-PRIVATE-OVERLAY-ACTIVATED"],
    planSha256: plan.planSha256,
    ...summary,
    profile: profileEvidence,
  };
}
