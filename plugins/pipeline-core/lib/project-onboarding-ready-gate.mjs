// SPDX-License-Identifier: SUL-1.0

/** One fail-closed, intent-bound admission gate for mutating Pipeline entrypoints. */
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  expectedPipelineScriptsRunnerAllowlistEntries,
  inspectProjectOnboardingV3,
  PROJECT_ONBOARDING_BASE_RESULT_KEYS,
  PROJECT_ONBOARDING_READY_ONLY_RESULT_KEYS,
  PROJECT_ONBOARDING_VERIFY_COMMAND_PLACEHOLDER,
  RUNNER_PERMISSIONS_TARGET,
} from "./project-onboarding-v3.mjs";
import { SETTINGS_ALLOWLIST_MERGE_PLAN_SCHEMA } from "../scripts/settings-allowlist-merge.mjs";
import { isSessionCapabilityFailurePhase } from "./codex-onboarding-capabilities.mjs";
import {
  ORPHAN_ARCHIVE_APPLY_SCHEMA,
  ORPHAN_ARCHIVE_PLAN_SCHEMA,
} from "./session-cleanup-recovery.mjs";

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
  "enrollment-retirement-required",
  "enrollment-history-recovery-required",
  "enrollment-activation-required",
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
const PIPELINE_STATE_SCRIPT = fileURLToPath(new URL("../scripts/pipeline-state.mjs", import.meta.url));
const SETTINGS_ALLOWLIST_MERGE_SCRIPT = fileURLToPath(new URL("../scripts/settings-allowlist-merge.mjs", import.meta.url));
const SESSION_CLEANUP_SCRIPT = fileURLToPath(new URL("../scripts/session-cleanup.mjs", import.meta.url));
const SHA256_HEX = /^[0-9a-f]{64}$/u;

export class ProjectOnboardingReadyError extends Error {
  constructor(code, message, { intent = null, lifecycleStatus = null, sessionCapabilityFailurePhase = null } = {}) {
    super(message);
    this.name = "ProjectOnboardingReadyError";
    this.code = code;
    this.intent = intent;
    this.lifecycleStatus = lifecycleStatus;
    this.sessionCapabilityFailurePhase = sessionCapabilityFailurePhase;
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

function validRunnerPermissions(value, runner, root) {
  const optional = plainObject(value) && Object.hasOwn(value, "optionalPlan");
  if (!exactKeys(value, ["target", "status", "lanes", "exactEntries", ...(optional ? ["optionalPlan"] : [])])
    || ![RUNNER_PERMISSIONS_TARGET, ".claude/settings.json"].includes(value.target)
    || !Array.isArray(value.lanes)
    || !Array.isArray(value.exactEntries)) return false;
  if (value.status === "not-applicable") {
    return !optional && ["codex", "antigravity"].includes(runner)
      && value.lanes.length === 0
      && value.exactEntries.length === 0;
  }
  if (value.status === "current") {
    return !optional && JSON.stringify(value.lanes) === JSON.stringify(["Bash", "PowerShell"])
      && JSON.stringify(value.exactEntries) === JSON.stringify(expectedPipelineScriptsRunnerAllowlistEntries());
  }
  return ["drifted", "pending-runtime-initialization"].includes(value.status)
    && runner === "claude"
    && optional && validRunnerPermissionsPlanner(value.optionalPlan, root)
    && JSON.stringify(value.lanes) === JSON.stringify(["Bash", "PowerShell"])
    && JSON.stringify(value.exactEntries) === JSON.stringify(expectedPipelineScriptsRunnerAllowlistEntries());
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

function validPlanLifecycleInspectCommand(value) {
  return exactKeys(value, ["kind", "executable", "argv", "mutation", "requiresConfirmation", "expected"])
    && value.kind === "command"
    && value.executable === "node"
    && Array.isArray(value.argv)
    && JSON.stringify(value.argv) === JSON.stringify([PIPELINE_STATE_SCRIPT, "inspect"])
    && value.mutation === false
    && value.requiresConfirmation === false
    && exactKeys(value.expected, ["schema", "statuses"])
    && value.expected.schema === "pipeline.inspect.v1"
    && JSON.stringify(value.expected.statuses) === JSON.stringify(["draft", "awaiting-approval"]);
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

// ALFRED-W0-4 (backlog 2026-10-04-approved-lifecycle-state-refuses-its-own-recovery-and-backlog-writes):
// writer/observer conformance for `nextAction`. designToImplementationHandoverAction()
// (project-onboarding-v3.mjs) publishes two more closed shapes in the `approved` and
// `implementing` lifecycle states than this gate used to know -- the deterministic
// `materialize-architecture` command and the `reopen-design` collect-input/apply pair
// (architecture evidence invalid or the approval stale). Neither was admitted, so a project in
// that state was observed as PORG-INVALID-OBSERVATION: a shape verdict, not a not-ready verdict,
// which carries no lifecycleStatus and therefore reached none of the status-keyed recovery lanes.
// Both shapes stay as closed as the four above: exact key sets, exact argv, exact flags.
const REOPEN_DESIGN_ACTOR_PLACEHOLDER = "<recovery actor's name>";

// The producer binds both shapes to its own resolved `../scripts/pipeline-state.mjs`
// (PO_AUTHORITY_REBIND_WRITER, the same expression as PIPELINE_STATE_SCRIPT above). Pin them to that
// exact path, as validPlanLifecycleInspectCommand() does -- a basename comparison would admit a
// same-named script in any other directory as an action the driver is told to execute.
function validPipelineStateScript(value) {
  return typeof value === "string" && value === PIPELINE_STATE_SCRIPT;
}

function validMaterializeArchitectureCommand(value) {
  return exactKeys(value, ["kind", "executable", "argv", "mutation", "requiresConfirmation", "expected"])
    && value.kind === "command"
    && value.executable === "node"
    && Array.isArray(value.argv)
    && value.argv.length === 2
    && validPipelineStateScript(value.argv[0])
    && value.argv[1] === "materialize-architecture"
    && value.mutation === true
    && value.requiresConfirmation === false
    && exactKeys(value.expected, ["schema", "statuses"])
    && value.expected.schema === "pipeline.architecture-design-materialization.v1"
    && JSON.stringify(value.expected.statuses) === JSON.stringify(["materialized"]);
}

function validReopenDesignCommand(value) {
  return exactKeys(value, ["kind", "executable", "argv", "mutation", "requiresConfirmation", "expected"])
    && value.kind === "command"
    && value.executable === "node"
    && Array.isArray(value.argv)
    && value.argv.length === 4
    && validPipelineStateScript(value.argv[0])
    && JSON.stringify(value.argv.slice(1)) === JSON.stringify(["reopen-design", "--by", REOPEN_DESIGN_ACTOR_PLACEHOLDER])
    && value.mutation === true
    && value.requiresConfirmation === true
    && validReadyExpected(value.expected);
}

function validReopenDesignActorInput(value) {
  return exactKeys(value, ["name", "encoding", "trim", "minBytes", "maxBytes", "singleLine", "rejectNul"])
    && value.name === "by"
    && value.encoding === "utf8"
    && value.trim === true
    && value.minBytes === 1
    && value.maxBytes === 128
    && value.singleLine === true
    && value.rejectNul === true;
}

function validReopenDesignCollectAction(value) {
  return exactKeys(value, ["kind", "inputs", "mutation", "requiresConfirmation", "guidance", "applyAction"])
    && value.kind === "collect-input"
    && Array.isArray(value.inputs)
    && value.inputs.length === 1
    && validReopenDesignActorInput(value.inputs[0])
    && value.mutation === false
    && value.requiresConfirmation === false
    && typeof value.guidance === "string"
    && value.guidance.length > 0
    && validReopenDesignCommand(value.applyAction);
}

function validRunnerPermissionsPlanner(value, root) {
  return exactKeys(value, ["kind", "executable", "argv", "mutation", "requiresConfirmation", "expected"])
    && value.kind === "command"
    && value.executable === "node"
    && value.mutation === false
    && value.requiresConfirmation === false
    && Array.isArray(value.argv)
    && JSON.stringify(value.argv) === JSON.stringify([SETTINGS_ALLOWLIST_MERGE_SCRIPT, "plan-runner-permissions", "--root", root])
    && exactKeys(value.expected, ["schema", "statuses"])
    && value.expected.schema === SETTINGS_ALLOWLIST_MERGE_PLAN_SCHEMA
    && JSON.stringify(value.expected.statuses) === JSON.stringify(["ready", "no-op", "unrepairable"]);
}

// RF2B (ALFRED-RF2B-20261004): a ready observation may carry exactly one kind of
// diagnostic -- the typed `cleanup_residue_foreign` warning for foreign
// zero-authority cleanup residue. Its closed shape is validated here and, like
// every other action this gate admits, its two typed archive actions are bound
// to the plugin's OWN resolved session-cleanup.mjs and to the observed root --
// never to a basename in any directory. Any other diagnostic, extra key or
// mismatched action keeps the observation invalid (PORG-INVALID-OBSERVATION).
function validOrphanArchivePlanAction(value, root) {
  return exactKeys(value, ["kind", "executable", "argv", "mutation", "requiresConfirmation", "expected"])
    && value.kind === "command"
    && value.executable === "node"
    && JSON.stringify(value.argv) === JSON.stringify([SESSION_CLEANUP_SCRIPT, "plan-archive-orphan", "--repo", root])
    && value.mutation === false
    && value.requiresConfirmation === false
    && exactKeys(value.expected, ["schema", "statuses"])
    && value.expected.schema === ORPHAN_ARCHIVE_PLAN_SCHEMA
    && JSON.stringify(value.expected.statuses) === JSON.stringify(["ready"]);
}

function validOrphanArchiveApplyAction(value, root) {
  return exactKeys(value, ["kind", "executable", "argv", "mutation", "requiresConfirmation", "requiresInput", "executionBoundary", "expected"])
    && value.kind === "command"
    && value.executable === "node"
    && Array.isArray(value.argv)
    && value.argv.length === 12
    && value.argv.every((entry) => typeof entry === "string")
    && value.argv[0] === SESSION_CLEANUP_SCRIPT
    && value.argv[1] === "archive-orphan"
    && value.argv[2] === "--repo"
    && value.argv[3] === root
    && value.argv[4] === "--session-descriptor"
    && value.argv[5].length > 0 && !value.argv[5].startsWith("--")
    && value.argv[6] === "--expected-descriptor-sha256"
    && SHA256_HEX.test(value.argv[7])
    && value.argv[8] === "--by"
    && value.argv[9] === "<operator>"
    && value.argv[10] === "--reason"
    && value.argv[11] === "<reason>"
    && value.mutation === true
    && value.requiresConfirmation === false
    && JSON.stringify(value.requiresInput) === JSON.stringify(["--by", "--reason"])
    && value.executionBoundary === "local-process"
    && exactKeys(value.expected, ["schema", "statuses"])
    && value.expected.schema === ORPHAN_ARCHIVE_APPLY_SCHEMA
    && JSON.stringify(value.expected.statuses) === JSON.stringify(["archived", "already-archived"]);
}

export function validForeignCleanupResidueWarning(value, root) {
  return exactKeys(value, ["path", "code", "message", "guidance", "severity", "nextAction", "archiveActions"])
    && value.path === "$.authority.sessionCleanup"
    && value.code === "cleanup_residue_foreign"
    && value.severity === "warning"
    && typeof value.message === "string" && value.message.length > 0
    && typeof value.guidance === "string"
    && validOrphanArchivePlanAction(value.nextAction, root)
    && Array.isArray(value.archiveActions)
    && value.archiveActions.length > 0
    && value.archiveActions.every((action) => validOrphanArchiveApplyAction(action, root));
}

function validReadyDiagnostics(value, root) {
  return Array.isArray(value) && value.every((entry) => validForeignCleanupResidueWarning(entry, root));
}

function validReadyNextAction(value, root) {
  if (value === null) return true;
  if (validPlanLifecycleInspectCommand(value)) return true;
  if (validImplementationHandoverCommand(value)) return true;
  if (validMaterializeArchitectureCommand(value)) return true;
  if (validReopenDesignCollectAction(value)) return true;
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

  const candidatePhase = observed?.repository?.sessionCapabilityFailurePhase;
  const phasePresent = observed?.repository && typeof observed.repository === "object"
    && Object.prototype.hasOwnProperty.call(observed.repository, "sessionCapabilityFailurePhase");
  if (phasePresent && (observed.status !== "session-capability-unavailable"
    || !isSessionCapabilityFailurePhase(candidatePhase))) {
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
      { intent, lifecycleStatus, sessionCapabilityFailurePhase: phasePresent ? candidatePhase : null },
    );
  }

  if (observed.runner !== resolvedRunner
    || !plainObject(observed.repository)
    || !plainObject(observed.runtime)
    || !plainObject(observed.continuity)
    || !plainObject(observed.appServer)
    || !validRunnerPermissions(observed.runnerPermissions, resolvedRunner, physicalRoot)
    || !validReadyNextAction(observed.nextAction, physicalRoot)
    || !validReadyDiagnostics(observed.diagnostics, physicalRoot)) {
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
