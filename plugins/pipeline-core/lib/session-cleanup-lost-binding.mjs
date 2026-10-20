// SPDX-License-Identifier: SUL-1.0
//
// D70 (a) / AC-203: the activated recovery that releases the private cleanup binding of a session descriptor that
// is gone (a host crash) and closes the onboarding-continuity registry member the crashed process left bound and
// `armed`. Import direction: session-cleanup-recovery -> this module -> onboarding-continuity and the registry.
//
// Crash-safe order inside one registry boundary: the registry member is released FIRST, the private binding second,
// then the registry is healed and read back strictly. A process that dies after the member step leaves a registry
// with no in-flight member, so the next boundary heals the namespace and the still-present binding is released by
// rerunning the recovery. The reverse order would leave an armed member whose namespace no longer matches, which
// the registry refuses for good.

import { createHash } from "node:crypto";

import {
  continuityAuthorityRepository,
  readOnboardingSessionCleanupBinding,
  releaseOnboardingSessionCleanupInternal,
} from "./onboarding-continuity.mjs";
import {
  inspectSessionOwnerRuntime,
  inspectSignedDescriptorCustodyRepository,
  listActiveSessionDescriptors,
} from "./worktree-lifecycle.mjs";
import {
  healSessionAuthorityDrift,
  releaseLostSessionAuthorityMember,
  withSessionAuthorityBoundary,
} from "./session-authority-registry.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const RELEASE_MODES = new Set(["release-lost-binding", "retire-orphans-release-lost-binding"]);

export class LostBindingReleaseError extends Error {
  constructor(code, message, repair) {
    super(message);
    this.name = "LostBindingReleaseError";
    this.code = code;
    this.repair = repair;
  }
}

function refuse(code, message, repair) {
  throw new LostBindingReleaseError(code, message, repair);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Moved verbatim from session-cleanup-recovery.mjs; the recovery module imports them back.
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function digest(value) {
  return createHash("sha256").update(Buffer.from(canonicalJson(value), "utf8")).digest("hex");
}

export function recoveryBinding(plan) {
  const binding = {
    schema: plan.schema,
    root: plan.root,
    stateSha256: plan.stateSha256,
    revision: plan.revision,
    sessionCleanup: plan.sessionCleanup,
    closure: plan.closure,
    activeDescriptorCount: plan.activeDescriptorCount,
    recovery: plan.recovery,
    releaseProof: plan.releaseProof ?? null,
    coordinatorCloseSha256: plan.coordinatorCloseSha256 ?? null,
  };
  if (Object.hasOwn(plan, "orphanDescriptors")) {
    binding.orphanDescriptors = plan.orphanDescriptors;
  }
  if (Object.hasOwn(plan, "externalRetirements")) {
    binding.externalRetirements = plan.externalRetirements;
  }
  if (Object.hasOwn(plan, "expectedBindingStatus")) {
    binding.expectedBindingStatus = plan.expectedBindingStatus;
  }
  if (Object.hasOwn(plan, "privateReceiptRecoverySha256")) {
    binding.privateReceiptRecoverySha256 = plan.privateReceiptRecoverySha256;
  }
  if (Object.hasOwn(plan, "expectedPostStateSha256")) {
    binding.expectedPostStateSha256 = plan.expectedPostStateSha256;
  }
  if (Object.hasOwn(plan, "expectedPostRevision")) {
    binding.expectedPostRevision = plan.expectedPostRevision;
  }
  if (Object.hasOwn(plan, "writerIdentity")) {
    binding.writerIdentity = plan.writerIdentity;
  }
  return binding;
}

function replanCommand(plan, scriptPath) {
  return `node ${scriptPath} plan-recovery --repo ${typeof plan?.root === "string" ? plan.root : "<repo>"}`;
}

function applyCommand(plan, scriptPath) {
  const action = plan?.applyAction;
  return isObject(action) && typeof action.executable === "string" && Array.isArray(action.argv)
    ? [action.executable, ...action.argv].join(" ")
    : replanCommand(plan, scriptPath);
}

/**
 * Releases the private cleanup binding named by an activated, ready recovery plan whose session descriptor is gone,
 * and brings the onboarding-continuity registry member that binding left `armed` to the released state, in one
 * registry boundary. Every plan, tuple, State and owner check below runs before the first write and refuses with
 * `code` and a runnable `repair`; the registry function enforces its own descriptor and member preconditions.
 */
export function releaseLostSessionCleanupBinding({
  plan,
  expectedPlanSha256,
  activate = false,
  scriptPath = "session-cleanup.mjs",
  deps = {},
} = {}) {
  if (activate !== true) {
    refuse("WT-LOST-BINDING-ACTIVATION", "lost cleanup binding release requires explicit activation", applyCommand(plan, scriptPath));
  }
  if (!isObject(plan) || plan.status !== "ready" || !RELEASE_MODES.has(plan.recovery)
    || typeof plan.root !== "string" || !isObject(plan.sessionCleanup)
    || !SHA256.test(expectedPlanSha256 ?? "") || plan.planSha256 !== expectedPlanSha256
    || digest(recoveryBinding(plan)) !== expectedPlanSha256) {
    refuse("WT-LOST-BINDING-PLAN", "lost cleanup binding release needs the exact ready recovery plan", replanCommand(plan, scriptPath));
  }
  const tuple = plan.sessionCleanup;
  const readBinding = deps.readOnboardingSessionCleanupBindingFn ?? readOnboardingSessionCleanupBinding;
  const checkBinding = () => {
    const binding = readBinding({ rootDir: plan.root });
    if (binding.status !== "bound" || canonicalJson(binding.sessionCleanup) !== canonicalJson(tuple)) {
      refuse("WT-LOST-BINDING-TUPLE", "the private cleanup binding is not the planned session tuple", replanCommand(plan, scriptPath));
    }
    if (binding.stateSha256 !== plan.stateSha256 || binding.revision !== plan.revision) {
      refuse("WT-LOST-BINDING-CAS", "State changed since the recovery plan", replanCommand(plan, scriptPath));
    }
  };
  checkBinding();
  const listDescriptors = deps.listActiveSessionDescriptorsFn ?? listActiveSessionDescriptors;
  if (listDescriptors(plan.root).some((descriptor) => descriptor.sessionId === tuple.sessionId)) {
    refuse("WT-LOST-BINDING-DESCRIPTOR-LIVE", "the session descriptor is active, so its binding is not lost", replanCommand(plan, scriptPath));
  }
  const inspectOwner = deps.inspectSessionOwnerRuntimeFn ?? inspectSessionOwnerRuntime;
  let owner = null;
  try {
    owner = inspectOwner(plan.root, tuple.sessionId, { expectedDescriptorSha256: tuple.descriptorSha256 });
  } catch {
    owner = null; // no descriptor to read an owner from: the owner is not observable as live
  }
  if (owner !== null && owner.status === "live") {
    refuse("WT-LOST-BINDING-OWNER-LIVE", "the session owner is observable as live", replanCommand(plan, scriptPath));
  }
  const repository = continuityAuthorityRepository(inspectSignedDescriptorCustodyRepository(plan.root));
  return withSessionAuthorityBoundary({ repository }, (token) => {
    checkBinding();
    try {
      releaseLostSessionAuthorityMember({ boundary: token, producerId: "onboarding-continuity", target: tuple });
    } catch (error) {
      if (error?.code === "SDC-AUTHORITY-CAS" && error?.reason === "lost-binding-members-ambiguous") {
        refuse("WT-LOST-BINDING-MEMBER", "more than one in-flight registry member names the lost session",
          typeof error.repair === "string" ? error.repair : replanCommand(plan, scriptPath));
      }
      throw error;
    }
    const released = releaseOnboardingSessionCleanupInternal({
      rootDir: plan.root,
      expectedStateSha256: plan.stateSha256,
      expectedRevision: plan.revision,
      sessionCleanup: tuple,
    });
    if (released.status !== "released" || released.sessionCleanup !== null) {
      refuse("WT-LOST-BINDING-READBACK", "the cleanup binding release did not read back as released", replanCommand(plan, scriptPath));
    }
    // The binding release moved the producer namespace the member step baselined, and no in-flight member remains, so
    // the registry's own heal adopts it; the heal ends in the registry's strict read-back.
    const registry = healSessionAuthorityDrift({ boundary: token });
    if (registry.status !== "readable") {
      refuse("WT-LOST-BINDING-READBACK",
        `the session-authority registry did not read back strictly after the release (${registry.code ?? "refused"}: ${registry.reason ?? "unreadable"})`,
        replanCommand(plan, scriptPath));
    }
    return released;
  });
}
