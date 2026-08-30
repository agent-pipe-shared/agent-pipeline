// SPDX-License-Identifier: SUL-1.0

/** One fail-closed, intent-bound admission gate for mutating Pipeline entrypoints. */
import { realpathSync } from "node:fs";

import {
  inspectProjectOnboardingV3,
  PROJECT_ONBOARDING_BASE_RESULT_KEYS,
  PROJECT_ONBOARDING_READY_ONLY_RESULT_KEYS,
  PROJECT_ONBOARDING_VERIFY_COMMAND_PLACEHOLDER,
} from "./project-onboarding-v3.mjs";

export const PROJECT_ONBOARDING_READY_GATE_SCHEMA = "pipeline.project-onboarding-ready-gate.v1";
// This list stays hand-maintained -- unlike BASE_RESULT_KEYS/READY_ONLY_RESULT_KEYS above,
// deriving it structurally from project-onboarding-v3.mjs (Direction option 1,
// backlog/items/2026-08-28-the-ready-gate-hand-maintains-a-mirror-of-a-shape-it-does-not-own.md)
// was tried and is genuinely blocked: the ~40 status literals that reach v4Inspection's
// shared `lifecycleResult()` builder are not all passed as string literals at the call site.
// At least one (the app-server-* trio, project-onboarding-v3.mjs's `readyLifecycleResult`,
// around the `status` shorthand bound from a local ternary rather than written inline) is
// computed a few lines above its `lifecycleResult({ status, ... })` call, so no reliable
// static or call-site-local extraction of "every status the producer can return" exists
// without either an AST-level constant-folding pass or a structural rewrite of ~40
// independent branches spanning ~2500 lines -- out of proportion for this task and outside
// its own prohibition on changing the producer's actual output shape. Falls back to Direction
// option 2 instead: project-onboarding-ready-gate.test.mjs's derived-enumeration test drives
// this exact list against real gate behaviour and fails if a status here goes stale, so
// drift is still caught mechanically -- just at test time, not import time.
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
  // Wave 4 onboarding coordinator, step 6 (NVA-BL-INTAKEBIND-1, design.md
  // SSa.4): this allowlist was never updated when step 6 added these three
  // new v4Inspection statuses, so a repo genuinely sitting at one of them
  // failed closed with the wrong typed error (PORG-INVALID-OBSERVATION
  // instead of PORG-NOT-READY) below at line 152's NON_READY_STATUSES.has()
  // check -- blocking any narrow admission keyed off error.lifecycleStatus
  // for this window (see guard-lifecycle-ready.mjs's bootstrap-binding-
  // required staging-authoring admission).
  "intake-required",
  "intake-design-questions-required",
  "bootstrap-binding-required",
]);

const INTENTS = new Set(["onboarding", "bootstrap", "session", "dispatch"]);
const RUNNERS = new Set(["claude", "codex", "antigravity"]);
const NON_READY_STATUSES = new Set(PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES);
// pipeline.ready-gate-keys-derived-from-producer: both key lists below are IMPORTED from
// project-onboarding-v3.mjs -- the module that actually constructs a V4 observation -- rather
// than retyped here. This closes the second of two confirmed live instances (backlog:
// pipeline.ready-gate-hand-maintained-shape-mirror) where a field project-onboarding-v3.mjs
// started attaching to a ready result was not mirrored into a hand-maintained list here,
// silently refusing every governed write in every ready project. `BASE_RESULT_KEYS` is the
// base envelope every V4 observation carries, ready or not -- also the exact, closed shape a
// NON-ready observation must have, which is why the two ready-only fields below are rejected
// on a non-ready observation: they are simply absent from this list.
const BASE_RESULT_KEYS = PROJECT_ONBOARDING_BASE_RESULT_KEYS;
// project-onboarding-v3.mjs attaches these two fields ONLY to a `status: "ready"` result --
// they describe machine-level push-approval/trust-anchor state that only makes sense once a
// repository is fully ready. A ready observation is therefore validated against the base
// keys PLUS these two; a non-ready observation is validated against the base keys alone, so
// the same two fields showing up on a non-ready observation are rejected as invalid rather
// than silently accepted. Neither list is a subset check: exactKeys() below still demands
// the closed set match exactly, so a genuinely unexpected extra key is refused either way.
const READY_ONLY_RESULT_KEYS = PROJECT_ONBOARDING_READY_ONLY_RESULT_KEYS;
const READY_RESULT_KEYS = Object.freeze([...BASE_RESULT_KEYS, ...READY_ONLY_RESULT_KEYS]);
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

function validReadyExpected(value) {
  return exactKeys(value, ["schema", "statuses"])
    && value.schema === "pipeline.project-onboarding.v4"
    && JSON.stringify(value.statuses) === JSON.stringify(["ready"]);
}

function validImplementationHandoverCommand(value, { requiresVerifyCommand = false } = {}) {
  const suffix = requiresVerifyCommand
    ? ["set-phase", "--phase", "implementation", "--verify-command", PROJECT_ONBOARDING_VERIFY_COMMAND_PLACEHOLDER]
    : ["set-phase", "--phase", "implementation"];
  if (!exactKeys(value, ["kind", "executable", "argv", "mutation", "requiresConfirmation", "expected"])
    || value.kind !== "command") return false;
  return value.executable === "node"
    && value.mutation === true
    && value.requiresConfirmation === true
    && Array.isArray(value.argv)
    && value.argv.length === suffix.length + 1
    && typeof value.argv[0] === "string"
    && value.argv[0].split(/[\\/]/u).at(-1) === "pipeline-state.mjs"
    && JSON.stringify(value.argv.slice(1)) === JSON.stringify(suffix)
    && validReadyExpected(value.expected);
}

function validVerifyCommandInput(value) {
  return exactKeys(value, ["name", "encoding", "trim", "minBytes", "maxBytes", "singleLine", "rejectNul"])
    && value.name === "verifyCommand"
    && value.encoding === "utf8"
    && value.trim === true
    && value.minBytes === 1
    && value.maxBytes === 512
    && value.singleLine === true
    && value.rejectNul === true;
}

function validReadyNextAction(value) {
  if (value === null) return true;
  if (validImplementationHandoverCommand(value)) return true;
  return exactKeys(value, [
    "kind", "input", "mutation", "requiresConfirmation", "guidance", "applyAction", "expected",
  ])
    && value.kind === "collect-input"
    && validVerifyCommandInput(value.input)
    && value.mutation === false
    && value.requiresConfirmation === false
    && typeof value.guidance === "string"
    && value.guidance.length > 0
    && validImplementationHandoverCommand(value.applyAction, { requiresVerifyCommand: true })
    && validReadyExpected(value.expected);
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

  // Session/runner identity is threaded explicitly (ADR-0051): every caller
  // resolves its own runner at its own boundary (CLI flag, spawn argv, etc.)
  // and passes it in. This shared gate never infers or defaults a runner
  // itself -- no ambient-environment read here, by design. Reading an
  // ambient session marker is legitimate only at a CLI entry boundary that
  // then carries the value forward explicitly (see
  // pipeline-start-preflight.mjs); doing it inside a shared admission gate
  // let a stray inherited marker silently reassign which runner's exemptions
  // applied (backlog: ready-gate-env-var-runner-authority).
  if (typeof runner !== "string" || !RUNNERS.has(runner)) {
    fail("PORG-RUNNER", "Project onboarding readiness requires an explicit, valid runner.", { intent });
  }
  const resolvedRunner = runner;

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

  // Which exact key set applies depends on the observation's OWN declared status: a plain
  // read of a field the closed-set check below will itself re-verify, never a second trust
  // decision. `plainObject` guards the property read so a malformed (null/array/scalar)
  // observed value falls through to the base list and is then rejected by exactKeys() below,
  // exactly as before this change.
  const expectedKeys = plainObject(observed) && observed.status === "ready" ? READY_RESULT_KEYS : BASE_RESULT_KEYS;
  if (!exactKeys(observed, expectedKeys)
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
    || !validReadyNextAction(observed.nextAction)
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
