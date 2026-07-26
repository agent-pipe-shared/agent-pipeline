// SPDX-License-Identifier: SUL-1.0

import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  readOnboardingSessionCleanupBinding,
  releaseOnboardingSessionCleanup,
} from "./onboarding-continuity.mjs";
import {
  inspectSessionClosure,
  listActiveSessionDescriptors,
} from "./worktree-lifecycle.mjs";

export const SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA = "pipeline.session-cleanup-recovery-plan.v1";
export const SESSION_CLEANUP_RECOVERY_APPLY_SCHEMA = "pipeline.session-cleanup-recovery-apply.v1";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCRIPT = join(HERE, "..", "scripts", "session-cleanup.mjs");
const SHA256 = /^[a-f0-9]{64}$/u;

export class SessionCleanupRecoveryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SessionCleanupRecoveryError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new SessionCleanupRecoveryError(code, message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(Buffer.from(canonicalJson(value), "utf8")).digest("hex");
}

function recoveryBinding(plan) {
  return {
    schema: plan.schema,
    root: plan.root,
    stateSha256: plan.stateSha256,
    revision: plan.revision,
    sessionCleanup: plan.sessionCleanup,
    closure: plan.closure,
    activeDescriptorCount: plan.activeDescriptorCount,
  };
}

/**
 * Plan only the ambiguous crash residue: the State handle remains, while both
 * its private descriptor and a completed closure receipt are absent. Active
 * descriptors must go through ordinary cleanup and closed descriptors through
 * release-binding; neither is eligible for a PO override.
 */
export function planSessionCleanupRecovery({
  rootDir,
  scriptPath = DEFAULT_SCRIPT,
  deps = {},
} = {}) {
  const readBinding = deps.readOnboardingSessionCleanupBindingFn
    ?? readOnboardingSessionCleanupBinding;
  const inspectClosure = deps.inspectSessionClosureFn ?? inspectSessionClosure;
  const listDescriptors = deps.listActiveSessionDescriptorsFn
    ?? listActiveSessionDescriptors;
  const binding = readBinding({ rootDir });
  if (binding.status !== "bound") {
    return {
      schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
      status: "not-needed",
    };
  }
  const closure = inspectClosure(binding.root, binding.sessionCleanup.sessionId, {
    expectedDescriptorSha256: binding.sessionCleanup.descriptorSha256,
  });
  if (closure.status === "active") {
    return {
      schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
      status: "cleanup-required",
    };
  }
  if (closure.status === "closed") {
    return {
      schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
      status: "release-ready",
      nextAction: {
        kind: "command",
        executable: "node",
        argv: [scriptPath, "release-binding", "--repo", binding.root],
        mutation: true,
        requiresConfirmation: false,
      },
    };
  }
  const activeDescriptors = listDescriptors(binding.root);
  if (activeDescriptors.length !== 0) {
    return {
      schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
      status: "orphan-cleanup-required",
    };
  }
  const partial = {
    schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
    root: binding.root,
    stateSha256: binding.stateSha256,
    revision: binding.revision,
    sessionCleanup: binding.sessionCleanup,
    closure: "unknown",
    activeDescriptorCount: 0,
    applyAction: null,
  };
  const planSha256 = digest(recoveryBinding(partial));
  const applyAction = {
    kind: "command",
    executable: "node",
    argv: [
      scriptPath,
      "apply-recovery",
      "--repo",
      binding.root,
      "--plan-sha256",
      planSha256,
      "--activate",
    ],
    mutation: true,
    requiresConfirmation: true,
    expected: {
      schema: SESSION_CLEANUP_RECOVERY_APPLY_SCHEMA,
      statuses: ["recovered"],
    },
  };
  const plan = { ...partial, applyAction };
  return {
    ...plan,
    status: "ready",
    planSha256: digest(recoveryBinding(plan)),
  };
}

export function applySessionCleanupRecovery({
  rootDir,
  expectedPlanSha256,
  activate = false,
  scriptPath = DEFAULT_SCRIPT,
  deps = {},
} = {}) {
  if (activate !== true) {
    fail("WT-SESSION-RECOVERY-ACTIVATION", "cleanup recovery requires explicit activation");
  }
  const plan = planSessionCleanupRecovery({ rootDir, scriptPath, deps });
  if (plan.status !== "ready"
    || !SHA256.test(expectedPlanSha256 ?? "")
    || plan.planSha256 !== expectedPlanSha256
    || digest(recoveryBinding(plan)) !== expectedPlanSha256) {
    fail("WT-SESSION-RECOVERY-PLAN", "cleanup recovery plan digest does not match");
  }
  const release = deps.releaseOnboardingSessionCleanupFn
    ?? releaseOnboardingSessionCleanup;
  const result = release({
    rootDir: plan.root,
    expectedStateSha256: plan.stateSha256,
    expectedRevision: plan.revision,
    sessionCleanup: plan.sessionCleanup,
  });
  if (result.status !== "released" || result.sessionCleanup !== null) {
    fail("WT-SESSION-RECOVERY-READBACK", "cleanup recovery did not release the exact State handle");
  }
  return {
    schema: SESSION_CLEANUP_RECOVERY_APPLY_SCHEMA,
    status: "recovered",
    root: plan.root,
    planSha256: plan.planSha256,
    stateSha256: result.stateSha256,
    revision: result.revision,
  };
}
