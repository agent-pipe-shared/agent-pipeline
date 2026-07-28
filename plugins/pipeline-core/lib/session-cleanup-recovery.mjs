// SPDX-License-Identifier: SUL-1.0

import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  bindOnboardingSessionCleanup,
  readOnboardingSessionCleanupBinding,
  recordClosedOnboardingSessionCleanupRelease,
  releaseOnboardingSessionCleanup,
} from "./onboarding-continuity.mjs";
import {
  inspectSessionRetirement,
  inspectSessionClosure,
  listActiveSessionDescriptors,
  loadSessionDescriptor,
  retireSessionDescriptor,
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
  };
  if (Object.hasOwn(plan, "orphanDescriptors")) {
    binding.orphanDescriptors = plan.orphanDescriptors;
  }
  return binding;
}

function readyRecoveryPlan(partial, scriptPath) {
  const planSha256 = digest(recoveryBinding(partial));
  const status = partial.recovery === "bind-orphan"
    ? "rebound"
    : partial.recovery === "retire-orphans"
      ? "retired"
      : "recovered";
  const applyAction = {
    kind: "command",
    executable: "node",
    argv: [
      scriptPath,
      "apply-recovery",
      "--repo",
      partial.root,
      "--plan-sha256",
      planSha256,
      "--activate",
    ],
    mutation: true,
    requiresConfirmation: true,
    expected: {
      schema: SESSION_CLEANUP_RECOVERY_APPLY_SCHEMA,
      statuses: [status],
    },
  };
  const plan = { ...partial, applyAction };
  return {
    ...plan,
    status: "ready",
    planSha256: digest(recoveryBinding(plan)),
  };
}

/**
 * Plan only closed crash residues. A single validated unbound active
 * descriptor can be rebound through explicit PO confirmation. Multiple exact
 * descriptors may be retired only when every descriptor has no cleanup
 * manifest and its owner is proven non-live/reused or is a legacy V1 owner
 * whose liveness is deliberately unobserved; that legacy case is therefore a
 * Human-only, digest-bound recovery rather than an automatic cleanup. A bound
 * handle whose private descriptor and closure receipt are both absent can be
 * released. Active bound descriptors still require ordinary cleanup and closed
 * ones release-binding.
 */
export function planSessionCleanupRecovery({
  rootDir,
  scriptPath = DEFAULT_SCRIPT,
  deps = {},
} = {}) {
  const readBinding = deps.readOnboardingSessionCleanupBindingFn
    ?? readOnboardingSessionCleanupBinding;
  const inspectClosure = deps.inspectSessionClosureFn ?? inspectSessionClosure;
  const inspectRetirement = deps.inspectSessionRetirementFn
    ?? inspectSessionRetirement;
  const listDescriptors = deps.listActiveSessionDescriptorsFn
    ?? listActiveSessionDescriptors;
  const binding = readBinding({ rootDir });
  if (new Set(["released", "closed-unbound"]).has(binding.status)) {
    return {
      schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
      status: "not-needed",
    };
  }
  if (binding.status === "closed-bound") {
    const closure = inspectClosure(binding.root, binding.sessionCleanup.sessionId, {
      expectedDescriptorSha256: binding.sessionCleanup.descriptorSha256,
    });
    if (closure.status === "active") {
      return {
        schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
        status: "cleanup-required",
        nextAction: {
          kind: "command",
          executable: "node",
          argv: [
            scriptPath,
            "cleanup",
            "--repo",
            binding.root,
            "--session-descriptor",
            binding.sessionCleanup.sessionId,
            "--expected-descriptor-sha256",
            binding.sessionCleanup.descriptorSha256,
          ],
          mutation: true,
          requiresConfirmation: false,
        },
      };
    }
    if (closure.status !== "closed" || !SHA256.test(closure.receiptSha256 ?? "")) {
      return {
        schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
        status: "closed-recovery-unavailable",
      };
    }
    return readyRecoveryPlan({
      schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
      root: binding.root,
      stateSha256: binding.stateSha256,
      revision: binding.revision,
      sessionCleanup: binding.sessionCleanup,
      closure,
      activeDescriptorCount: 0,
      recovery: "release-closed-feature",
      releaseProof: binding.releaseProof,
      applyAction: null,
    }, scriptPath);
  }
  if (binding.status === "unbound") {
    const activeDescriptors = listDescriptors(binding.root);
    if (activeDescriptors.length === 0) {
      return {
        schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
        status: "not-needed",
      };
    }
    if (activeDescriptors.length > 1) {
      const orphanDescriptors = activeDescriptors.map((descriptor) => inspectRetirement(
        binding.root,
        descriptor.sessionId,
        { expectedDescriptorSha256: descriptor.descriptorSha256 },
      ));
      if (orphanDescriptors.some((descriptor) => descriptor.status !== "retirable")) {
        return {
          schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
          status: "orphan-recovery-unavailable",
          activeDescriptorCount: activeDescriptors.length,
        };
      }
      return readyRecoveryPlan({
        schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
        root: binding.root,
        stateSha256: binding.stateSha256,
        revision: binding.revision,
        sessionCleanup: null,
        closure: "unbound-orphans",
        activeDescriptorCount: activeDescriptors.length,
        recovery: "retire-orphans",
        orphanDescriptors: orphanDescriptors.map((descriptor) => ({
          sessionId: descriptor.sessionId,
          descriptorSha256: descriptor.descriptorSha256,
          ownerStatus: descriptor.ownerStatus,
        })),
        applyAction: null,
      }, scriptPath);
    }
    if (activeDescriptors.length !== 1) {
      return {
        schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
        status: "orphan-recovery-unavailable",
        activeDescriptorCount: activeDescriptors.length,
      };
    }
    return readyRecoveryPlan({
      schema: SESSION_CLEANUP_RECOVERY_PLAN_SCHEMA,
      root: binding.root,
      stateSha256: binding.stateSha256,
      revision: binding.revision,
      sessionCleanup: activeDescriptors[0],
      closure: "active",
      activeDescriptorCount: 1,
      recovery: "bind-orphan",
      applyAction: null,
    }, scriptPath);
  }
  if (binding.status !== "bound") {
    fail("WT-SESSION-RECOVERY-BINDING", "cleanup recovery binding status is invalid");
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
    recovery: "release-lost-binding",
    applyAction: null,
  };
  return readyRecoveryPlan(partial, scriptPath);
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
  const readBinding = deps.readOnboardingSessionCleanupBindingFn
    ?? readOnboardingSessionCleanupBinding;
  const before = readBinding({ rootDir });
  if (before.status === "released"
    && SHA256.test(expectedPlanSha256 ?? "")
    && before.releasePlanSha256 === expectedPlanSha256) {
    return {
      schema: SESSION_CLEANUP_RECOVERY_APPLY_SCHEMA,
      status: "recovered",
      root: before.root,
      planSha256: expectedPlanSha256,
      stateSha256: before.stateSha256,
      revision: before.revision,
      mutated: false,
    };
  }
  const plan = planSessionCleanupRecovery({ rootDir, scriptPath, deps });
  if (plan.status !== "ready"
    || !SHA256.test(expectedPlanSha256 ?? "")
    || plan.planSha256 !== expectedPlanSha256
    || digest(recoveryBinding(plan)) !== expectedPlanSha256) {
    fail("WT-SESSION-RECOVERY-PLAN", "cleanup recovery plan digest does not match");
  }
  if (plan.recovery === "bind-orphan") {
    const loadDescriptor = deps.loadSessionDescriptorFn ?? loadSessionDescriptor;
    const bind = deps.bindOnboardingSessionCleanupFn ?? bindOnboardingSessionCleanup;
    const descriptor = loadDescriptor(plan.root, plan.sessionCleanup.sessionId, {
      expectedDescriptorSha256: plan.sessionCleanup.descriptorSha256,
    });
    const result = bind({
      rootDir: plan.root,
      expectedStateSha256: plan.stateSha256,
      expectedRevision: plan.revision,
      sessionCleanup: {
        sessionId: descriptor.sessionId,
        descriptorSha256: descriptor.descriptorSha256,
      },
    });
    if (!new Set(["bound", "reused"]).has(result.status)
      || result.sessionCleanup.sessionId !== plan.sessionCleanup.sessionId
      || result.sessionCleanup.descriptorSha256 !== plan.sessionCleanup.descriptorSha256) {
      fail("WT-SESSION-RECOVERY-READBACK", "cleanup recovery did not bind the exact active descriptor");
    }
    return {
      schema: SESSION_CLEANUP_RECOVERY_APPLY_SCHEMA,
      status: "rebound",
      root: plan.root,
      planSha256: plan.planSha256,
      stateSha256: result.stateSha256,
      revision: result.revision,
    };
  }
  if (plan.recovery === "retire-orphans") {
    const inspectRetirement = deps.inspectSessionRetirementFn
      ?? inspectSessionRetirement;
    const loadDescriptor = deps.loadSessionDescriptorFn ?? loadSessionDescriptor;
    const retireDescriptor = deps.retireSessionDescriptorFn
      ?? retireSessionDescriptor;
    const listDescriptors = deps.listActiveSessionDescriptorsFn
      ?? listActiveSessionDescriptors;
    const prepared = plan.orphanDescriptors.map((expected) => {
      const observed = inspectRetirement(plan.root, expected.sessionId, {
        expectedDescriptorSha256: expected.descriptorSha256,
      });
      if (observed.status !== "retirable"
        || observed.ownerStatus !== expected.ownerStatus
        || observed.descriptorSha256 !== expected.descriptorSha256) {
        fail("WT-SESSION-RECOVERY-PLAN", "orphan descriptor retirement binding changed");
      }
      return loadDescriptor(plan.root, expected.sessionId, {
        expectedDescriptorSha256: expected.descriptorSha256,
      });
    });
    for (const descriptor of prepared) {
      retireDescriptor(plan.root, {
        sessionId: descriptor.sessionId,
        descriptorSha256: descriptor.descriptorSha256,
        ownerNonce: descriptor.ownerNonce,
      });
    }
    if (listDescriptors(plan.root).length !== 0) {
      fail("WT-SESSION-RECOVERY-READBACK", "orphan descriptor retirement did not clear the exact active set");
    }
    const readback = readBinding({ rootDir: plan.root });
    if (readback.status !== "unbound"
      || readback.stateSha256 !== plan.stateSha256
      || readback.revision !== plan.revision) {
      fail("WT-SESSION-RECOVERY-READBACK", "orphan descriptor retirement changed continuity authority");
    }
    return {
      schema: SESSION_CLEANUP_RECOVERY_APPLY_SCHEMA,
      status: "retired",
      root: plan.root,
      planSha256: plan.planSha256,
      stateSha256: readback.stateSha256,
      revision: readback.revision,
      retiredDescriptorCount: prepared.length,
    };
  }
  if (plan.recovery === "release-closed-feature") {
    const recordRelease = deps.recordClosedOnboardingSessionCleanupReleaseFn
      ?? recordClosedOnboardingSessionCleanupRelease;
    const result = recordRelease({
      rootDir: plan.root,
      expectedStateSha256: plan.stateSha256,
      releaseProof: plan.releaseProof,
      closureReceiptSha256: plan.closure.receiptSha256,
      recoveryPlanSha256: plan.planSha256,
      deps: { spawn: deps.spawn },
    });
    if (result.status !== "released" || result.sessionCleanup !== null) {
      fail("WT-SESSION-RECOVERY-READBACK", "closed cleanup recovery did not record the exact release");
    }
    const readback = readBinding({ rootDir: plan.root });
    if (readback.status !== "released") {
      fail("WT-SESSION-RECOVERY-READBACK", "closed cleanup release readback is invalid");
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
  if (plan.recovery !== "release-lost-binding") {
    fail("WT-SESSION-RECOVERY-PLAN", "cleanup recovery plan mode is invalid");
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
