// SPDX-License-Identifier: SUL-1.0

/** One fail-closed, intent-bound admission gate for mutating Pipeline entrypoints. */
import { realpathSync } from "node:fs";

import { inspectProjectOnboardingV3 } from "./project-onboarding-v3.mjs";

export const PROJECT_ONBOARDING_READY_GATE_SCHEMA = "pipeline.project-onboarding-ready-gate.v1";
export const PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES = Object.freeze([
  "portable-seed-required",
  "runtime-initialization-required",
  "runtime-attestation-required",
  "restart-required",
  "kickoff-required",
  "host-repository-init-required",
  "partial",
  "invalid",
  "unsafe",
  "migration-required",
  "adoption-required",
  "repository-mount-read-only",
  "repository-control-path-invalid",
  "git-capability-unavailable",
  "project-root-read-only",
  "repository-mode-unsupported",
  "session-capability-unavailable",
  "worktree-capability-unavailable",
  "runtime-target-read-only",
  "runtime-readback-unavailable",
  "projection-drift",
  "continuity-damaged",
  "repository-observation-unavailable",
  "continuity-observation-unavailable",
  "app-server-execution-denied",
  "app-server-not-running",
  "app-server-unavailable",
]);

const INTENTS = new Set(["onboarding", "bootstrap", "session", "dispatch"]);
const NON_READY_STATUSES = new Set(PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES);
const RESULT_KEYS = [
  "appServer",
  "continuity",
  "diagnostics",
  "intent",
  "nextAction",
  "repository",
  "root",
  "runner",
  "runtime",
  "schema",
  "status",
];
const SAFE_STATUS = /^[a-z][a-z0-9-]{0,79}$/u;

export class ProjectOnboardingReadyError extends Error {
  constructor(code, message, { intent = null, lifecycleStatus = null } = {}) {
    super(message);
    this.name = "ProjectOnboardingReadyError";
    this.code = code;
    this.intent = intent;
    this.lifecycleStatus = lifecycleStatus;
  }
}

function fail(code, message, fields) {
  throw new ProjectOnboardingReadyError(code, message, fields);
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return plainObject(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function safeLifecycleStatus(value) {
  return typeof value === "string" && SAFE_STATUS.test(value) ? value : null;
}

/**
 * Require one exact V4 `ready` observation for the caller's explicit intent.
 *
 * The returned receipt deliberately carries no project path, component detail,
 * diagnostic, or recovery action. Callers may surface only the typed error code
 * and fixed message below; raw lifecycle output stays private to the admission
 * decision.
 */
export function requireProjectOnboardingReady({
  rootDir,
  intent,
  runner,
  inspect = inspectProjectOnboardingV3,
} = {}) {
  if (!INTENTS.has(intent)) {
    fail("PORG-INTENT", "Project onboarding readiness requires an exact lifecycle intent.", { intent: null });
  }

  // Session/runner identity is threaded explicitly (ADR-0051), never
  // defaulted silently to "codex": an explicit `runner` argument always wins;
  // absent one, resolve the real invoking runner from the one Claude Code
  // sets in every session (main and subagent) rather than falling through to
  // inspectProjectOnboardingV3's own historical Codex-CLI default.
  const resolvedRunner = runner ?? (process.env.CLAUDECODE === "1" ? "claude" : "codex");

  let physicalRoot;
  try {
    if (typeof rootDir !== "string" || rootDir.length === 0) throw new Error("invalid root");
    physicalRoot = realpathSync(rootDir);
  } catch {
    fail(
      "PORG-OBSERVATION-UNAVAILABLE",
      `Project onboarding readiness could not be observed for intent ${intent}.`,
      { intent },
    );
  }

  let observed;
  try {
    observed = inspect({ rootDir, intent, runner: resolvedRunner });
  } catch {
    fail(
      "PORG-OBSERVATION-UNAVAILABLE",
      `Project onboarding readiness could not be observed for intent ${intent}.`,
      { intent },
    );
  }

  if (!exactKeys(observed, RESULT_KEYS)
    || observed.schema !== "pipeline.project-onboarding.v4"
    || observed.intent !== intent
    || observed.root !== physicalRoot) {
    fail(
      "PORG-INVALID-OBSERVATION",
      `Project onboarding readiness returned an invalid result for intent ${intent}.`,
      { intent },
    );
  }

  if (observed.status !== "ready") {
    const lifecycleStatus = safeLifecycleStatus(observed.status);
    if (lifecycleStatus === null || !NON_READY_STATUSES.has(lifecycleStatus)) {
      fail(
        "PORG-INVALID-OBSERVATION",
        `Project onboarding readiness returned an invalid result for intent ${intent}.`,
        { intent },
      );
    }
    fail(
      "PORG-NOT-READY",
      `Project onboarding lifecycle is not ready for intent ${intent} (status ${lifecycleStatus}).`,
      { intent, lifecycleStatus },
    );
  }

  if (observed.runner !== resolvedRunner
    || !plainObject(observed.repository)
    || !plainObject(observed.runtime)
    || !plainObject(observed.continuity)
    || !plainObject(observed.appServer)
    || observed.nextAction !== null
    || !Array.isArray(observed.diagnostics)
    || observed.diagnostics.length !== 0) {
    fail(
      "PORG-INVALID-OBSERVATION",
      `Project onboarding readiness returned an invalid result for intent ${intent}.`,
      { intent },
    );
  }

  return {
    schema: PROJECT_ONBOARDING_READY_GATE_SCHEMA,
    status: "ready",
    intent,
  };
}
