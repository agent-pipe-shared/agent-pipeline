// SPDX-License-Identifier: SUL-1.0
// Guard module "command-catalogue" (layer 4), split out of guard-lifecycle-ready.mjs; declarations moved verbatim (s2-guard-split-plan.md).

import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";
import { inspectProjectOnboardingV3 } from "../project-onboarding-v3.mjs";
import { observePipelineStartPreflight } from "../../scripts/pipeline-start-preflight.mjs";
import { readState as readDesignCourseState } from "../../scripts/pipeline-state.mjs";
import { APP_SERVER_SCRIPT, DESIGN_COURSE_SCRIPT, DRIVER_SCRIPT, HEX, HOST_REPOSITORY_INIT_SCRIPT, HUMAN_OVERRIDE_SCRIPT, LAUNCH_SCRIPT, MIGRATION_SCRIPT, OBSERVATION_GOVERNANCE_BOOTSTRAP_SCRIPT, ONBOARDING_CONSENT_MARK_SCRIPT, ONBOARDING_SCRIPT, PIPELINE_STATE_SCRIPT, PO_PROFILE_REPAIR_SCRIPT, PRE_PUSH_HOOK_INSTALL_SCRIPT, PRIVATE_OVERLAY_SCRIPT, PROJECT_AUTHORITY_MIGRATION_SCRIPT, PUSH_INIT_SCRIPT, READBACK_SCRIPT, REPAIR_MAP_SCRIPT, SESSION_CAPABILITY_DIAGNOSE_SCRIPT, SESSION_CLEANUP_SCRIPT, SESSION_CRITIC_FINALIZER_SCRIPT, SETTINGS_ALLOWLIST_MERGE_SCRIPT, START_PREFLIGHT_SCRIPT, TRANSCRIPT_RECOVERY_SCRIPT, V3_BOOTSTRAP_AUTHORITY_SCRIPT, VALID_RUNNERS } from "./constants.mjs";
import { exactRoot, simpleWords } from "./shell-grammar.mjs";
import { resolveSanctionedScriptInvocation, sanctionedDriverArgs, sanctionedHumanOverrideArgs, sanctionedMigrationArgs, sanctionedOnboardingConsentMarkArgs, sanctionedPipelineStateArgs, sanctionedPoProfileRepairArgs, sanctionedProjectAuthorityMigrationArgs, sanctionedPushInitArgs, sanctionedSessionCleanupArgs, sanctionedSessionCriticFinalizerArgs, sanctionedTranscriptRecoveryArgs } from "./sanctioned-args-scripts.mjs";
import { sanctionedOnboardingArgs } from "./sanctioned-args-onboarding.mjs";

const DESIGN_COURSE_SOURCES = ["input", "prd", "spec", "design", "traceability"];

const DESIGN_COURSE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

const DESIGN_COURSE_SHA = /^[a-f0-9]{64}$/u;

function designCourseRelativePath(value) {
  return typeof value === "string" && value.length <= 240 && !/[\\:\0]/u.test(value)
    && value.split("/").every((part) => part && !part.startsWith(".") && part !== "scratch" && part !== "node_modules");
}

// The coordinator owns content/provenance validation and exclusive output CAS.
// This guard admits only its exact current course, with physically bound inputs
// and output names; this is no authority to approve or sign a package.
function physicalDesignCoursePath(root, path, { required = false, file = true } = {}) {
  if (!designCourseRelativePath(path)) return false;
  let current = root;
  const parts = path.split("/");
  try {
    for (let index = 0; index < parts.length; index += 1) {
      current = join(current, parts[index]);
      let info;
      try { info = lstatSync(current); }
      catch (error) { if (error.code === "ENOENT") return !required; throw error; }
      if (info.isSymbolicLink() || realpathSync(current) !== current
        || (index < parts.length - 1 ? !info.isDirectory() : file ? !info.isFile() : !info.isDirectory())) return false;
    }
    return true;
  } catch { return false; }
}

function designCourseInputDigest(root, path, digest) {
  return DESIGN_COURSE_SHA.test(digest ?? "") && physicalDesignCoursePath(root, path, { required: true })
    && createHash("sha256").update(readFileSync(join(root, path))).digest("hex") === digest;
}

function sanctionedDesignCourseArgs(args, root) {
  try {
    if (!isAbsolute(root) || resolve(root) !== root || realpathSync(root) !== root || !lstatSync(root).isDirectory()) return false;
    const observed = readDesignCourseState(root);
    if (observed.status !== "ok") return false;
    const state = observed.state;
    const submitted = state.planSubmission;
    const featureId = state.activeFeature?.id;
    if (state.planApproved !== false || state.activeFeature?.phase !== "design" || state.activeFeature?.planPath !== submitted?.planPath
      || !DESIGN_COURSE_ID.test(featureId ?? "") || submitted?.featureId !== featureId
      || !["feature", "epic"].includes(submitted?.profile)
      || !designCourseRelativePath(submitted.planPath) || !designCourseRelativePath(submitted.specPath)
      || !DESIGN_COURSE_SHA.test(submitted.planSha256 ?? "") || !DESIGN_COURSE_SHA.test(submitted.specSha256 ?? "")) return false;
    if (args[0] === "--inspect") {
      return args.length === 5 && exactRoot(args, root, 1) && args[3] === "--runner" && VALID_RUNNERS.has(args[4]);
    }
    const runV2 = args[0] === "--run-v2";
    let index = runV2 ? 1 : 0;
    const take = (flag, check) => {
      if (args[index] !== flag || typeof args[index + 1] !== "string" || !check(args[index + 1])) return false;
      index += 2; return true;
    };
    let runner; let stage;
    if (!take("--root", value => value === root) || !take("--runner", value => {
      runner = value; return VALID_RUNNERS.has(value);
    })) return false;
    if (!runV2 && !take("--stage", value => { stage = value; return ["advisor", "readiness"].includes(value); })) return false;
    const authoringDispatchId = state.continuity?.queueHead?.dispatch?.dispatchId
      ?? state.continuity?.queueHead?.dispatchId ?? state.continuity?.queueHead?.dispatch?.id;
    const prefix = `evidence/design-course/${featureId}/${runner}`;
    if (!DESIGN_COURSE_ID.test(authoringDispatchId ?? "")
      || !take("--feature-id", value => value === featureId)
      || !take("--authoring-dispatch-id", value => value === authoringDispatchId)
      || !take("--profile", value => value === submitted.profile)
      || !take("--output-prefix", value => value === prefix && physicalDesignCoursePath(root, value))) return false;
    const directory = dirname(submitted.specPath).split(sep).join("/");
    const expectedPaths = { input: `${directory}/design-input.md`, prd: submitted.planPath, spec: submitted.specPath,
      design: `${directory}/design.md`, traceability: `${directory}/traceability.md` };
    const paths = new Set();
    for (const name of DESIGN_COURSE_SOURCES) {
      if (args[index] !== "--source" || args[index + 1] !== name || args[index + 2] !== expectedPaths[name]
        || paths.has(args[index + 2]) || !designCourseInputDigest(root, args[index + 2], args[index + 3])
        || (name === "prd" && args[index + 3] !== submitted.planSha256)
        || (name === "spec" && args[index + 3] !== submitted.specSha256)) return false;
      paths.add(args[index + 2]); index += 4;
    }
    if (stage === "advisor") return args[index] === "--execute" && index + 1 === args.length;
    if (!take("--readiness-dispatch-id", value => DESIGN_COURSE_ID.test(value) && value !== authoringDispatchId)
      || !take("--queue-revision", value => /^(0|[1-9][0-9]*)$/u.test(value) && Number.isSafeInteger(Number(value))
        && Number(value) === state.continuity?.revision)
      || !take("--receipt", value => value === `${prefix}.readiness.json` && physicalDesignCoursePath(root, value))
      || !take("--preparation", value => value === `${prefix}.preparation.json`
        && physicalDesignCoursePath(root, value, { required: !runV2 }))) return false;
    if (runV2 && !take("--package", value => value === `${prefix}.package.json` && physicalDesignCoursePath(root, value))) return false;
    if (runner === "codex" && (!take("--session-id", value => /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u.test(value))
      || !take("--descriptor-sha256", value => DESIGN_COURSE_SHA.test(value)))) return false;
    if (runV2) {
      const takeReference = (flag, path) => {
        if (args[index] !== flag || args[index + 1] !== path || !designCourseInputDigest(root, path, args[index + 2])) return false;
        index += 3; return true;
      };
      if (runner === "codex") {
        if (!takeReference("--disposition", `${prefix}.disposition.json`)
          || !takeReference("--revisions", `${prefix}.revisions.json`)) return false;
      } else if (!takeReference("--exception-rationale", `${prefix}.exception-rationale.txt`)) return false;
      if (args[index] === "--advisor-result" && !takeReference("--advisor-result", `${prefix}.advisor-result.json`)) return false;
    }
    return args[index] === "--execute" && index + 1 === args.length;
  } catch { return false; }
}

function sanctionedLifecycleScriptArgs(script, args, root, options = {}) {
  if (script === DESIGN_COURSE_SCRIPT) return sanctionedDesignCourseArgs(args, root);
  if (script === ONBOARDING_SCRIPT) return sanctionedOnboardingArgs(args, root, options);
  // NVA-K-DRIVERREACH: admitted read-only by exact argv shape (sanctionedDriverArgs() above)
  // -- grants no authority beyond ONBOARDING_SCRIPT's own admissions just above, since every
  // mutating step this driver spawns is itself re-checked against this same guard when it
  // runs, on its own terms, exactly as if an agent had typed it directly.
  if (script === DRIVER_SCRIPT) return sanctionedDriverArgs(args, root);
  // NVA-V4-PUSHDRIVER: same admission discipline as DRIVER_SCRIPT immediately above --
  // exact argv shape only (sanctionedPushInitArgs() above), grants no authority beyond what
  // push-init.mjs's own three read-only steps could already do if hand-typed one at a time.
  if (script === PUSH_INIT_SCRIPT) return sanctionedPushInitArgs(args, root);
  if (script === TRANSCRIPT_RECOVERY_SCRIPT) return sanctionedTranscriptRecoveryArgs(args, root);
  if (script === MIGRATION_SCRIPT) return sanctionedMigrationArgs(args, root);
  if (script === V3_BOOTSTRAP_AUTHORITY_SCRIPT) {
    return exactRoot(args, root, 0) && args.length === 2;
  }
  if (script === LAUNCH_SCRIPT) {
    return exactRoot(args, root, 0)
      && args[2] === "--barrier-sha256" && HEX.test(args[3] ?? "")
      && args[4] === "--activate" && args.length === 5;
  }
  if (script === READBACK_SCRIPT) return exactRoot(args, root, 0) && args.length === 2;
  if (script === START_PREFLIGHT_SCRIPT) return args.length === 0;
  if (script === PRE_PUSH_HOOK_INSTALL_SCRIPT) return args[0] === "--install" && args.length === 1;
  if (script === OBSERVATION_GOVERNANCE_BOOTSTRAP_SCRIPT) return exactRoot(args, root, 0) && args.length === 2;
  // F6 is an obligatory read-only diagnosis after governance bootstrap reports failure.
  if (script === resolve(root, "harness/scripts/check-observation-governance.mjs")) return args.length === 0;
  // OBLIGROUTE-1. templates/prompts/agent-obligations.md SS5 tells every dispatched agent to
  // ASK which refusals can be lifted -- `node <plugin-root>/scripts/repair-map.mjs` -- rather
  // than read a static table, and the map's own `GUARD-LIFECYCLE-NOT-READY` row is the row an
  // agent needs precisely in the state this branch decides. Until this line the instruction was
  // unreachable in exactly that state: the answer to "am I stuck?" was itself blocked.
  //
  // Admitted as narrowly as the sibling above and for the same reason: this is the file that
  // stops an agent weakening the gate authorizing it, so the admission is one exact argv shape
  // -- the absolute path of THIS plugin's own repair-map.mjs (resolved from import.meta.url,
  // never a directory, prefix or wildcard) with NO arguments at all. That is the whole of its
  // interface: the script parses no subcommand and no flag, and reads its root from
  // CLAUDE_PROJECT_DIR/cwd, so every other argv is a shape it would ignore and this gate has no
  // reason to admit. `node --check <path>` and the sanctioned list stay the only `node` lanes.
  //
  // Read-only is a property of the script, not an assumption made here: repair-map.mjs calls
  // `eligibility()` (pure) and reaches `recordHumanGuardDenial()` only on the branch that
  // returns before `storage()` -- its own AC-5 test pins that it writes nothing.
  if (script === REPAIR_MAP_SCRIPT) return args.length === 0;
  if (script === SESSION_CAPABILITY_DIAGNOSE_SCRIPT) return args[0] === "--repo" && args[1] === root && args.length === 2;
  if (script === SESSION_CLEANUP_SCRIPT) return sanctionedSessionCleanupArgs(args, root);
  if (script === SESSION_CRITIC_FINALIZER_SCRIPT) return sanctionedSessionCriticFinalizerArgs(args, root);
  if (script === PIPELINE_STATE_SCRIPT) {
    return sanctionedPipelineStateArgs(args, root);
  }
  if (script === PO_PROFILE_REPAIR_SCRIPT) return sanctionedPoProfileRepairArgs(args, root);
  if (script === PROJECT_AUTHORITY_MIGRATION_SCRIPT) {
    return sanctionedProjectAuthorityMigrationArgs(args, root);
  }
  if (script === HUMAN_OVERRIDE_SCRIPT) return sanctionedHumanOverrideArgs(args, root);
  if (script === PRIVATE_OVERLAY_SCRIPT) {
    return args[0] === "route"
      && args[1] === "--project-root"
      && args[2] === root
      && args.length === 3;
  }
  if (script === HOST_REPOSITORY_INIT_SCRIPT) {
    if (args[0] === "plan") return exactRoot(args, root, 1) && args.length === 3;
    return args[0] === "apply"
      && exactRoot(args, root, 1)
      && args[3] === "--plan-sha256" && HEX.test(args[4] ?? "")
      && args[5] === "--activate" && args.length === 6;
  }
  if (script === ONBOARDING_CONSENT_MARK_SCRIPT) return sanctionedOnboardingConsentMarkArgs(args, root);
  return script === APP_SERVER_SCRIPT
    && ["--recover", "--doctor"].includes(args[0])
    && args.length === 1;
}

export function isSanctionedLifecycleCommand(command, root, options = {}) {
  const resolved = resolveSanctionedScriptInvocation(command, root, options);
  return resolved !== null && sanctionedLifecycleScriptArgs(resolved.script, resolved.args, root, options);
}

/**
 * NVA-B8: a non-ready onboarding observation must never hand the session a
 * command that this guard refuses merely because the producer's absolute Node
 * executable differs from the guard host's. This is not an executable
 * allowlist: the observed executable and every argv element must be identical,
 * and the bundled script/argv still has to pass the existing closed lifecycle
 * validator. A neighbouring executable, an altered argument, a ready or
 * foreign-root observation, and any producer action outside that validator all
 * remain refused.
 */
export function observedOnboardingCommandMatch(command, root, dependencies = {}) {
  const words = simpleWords(command, root);
  if (!words) return null;
  let observed;
  try {
    observed = (dependencies.inspectProjectOnboardingV3Fn ?? inspectProjectOnboardingV3)({
      rootDir: root,
      intent: "session",
      runner: dependencies.runner,
    });
  } catch {
    return null;
  }
  const action = observed?.nextAction;
  if (observed?.schema !== "pipeline.project-onboarding.v4"
    || observed?.status === "ready"
    || typeof observed?.status !== "string"
    || observed?.root !== root
    || observed?.intent !== "session"
    || action?.kind !== "command"
    || typeof action.executable !== "string"
    || !Array.isArray(action.argv)
    || !action.argv.every((value) => typeof value === "string")
    || typeof action.mutation !== "boolean"
    || typeof action.requiresConfirmation !== "boolean"
    || words.length !== action.argv.length + 1
    || words[0] !== action.executable
    || action.argv.some((value, index) => words[index + 1] !== value)) return null;
  return {observed, action};
}

export function isExactObservedOnboardingNextAction(command, root, dependencies = {}) {
  const match = observedOnboardingCommandMatch(command, root, dependencies);
  if (!match) return false;
  const action = match.action;
  const [script, ...args] = action.argv;
  // The rebind planner is intentionally not a generally sanctioned lifecycle
  // command: outside a currently observed action it would make unrelated
  // partial states look repairable. Here its fixed read-only argv is still
  // closed by this exact observation/equality corridor.
  const observedOnlyPlanner = script === PIPELINE_STATE_SCRIPT
    && args.length === 1 && args[0] === "po-authority-rebind-plan";
  return typeof script === "string"
    && (observedOnlyPlanner || sanctionedLifecycleScriptArgs(script, args, root, dependencies));
}

/**
 * NVA-B8-IPA: a newly installed local Codex plugin has no receipt until its
 * own preflight publishes the one host writer that creates it. The guard used
 * to reject that writer whenever its separate onboarding readback was malformed,
 * creating an install loop. This admits no independently constructed command:
 * it re-observes this installed plugin's preflight and requires byte-for-byte
 * executable/argv equality with its sole typed host-postinstall action.
 */
export function isExactObservedInstalledPluginAttestationAction(command, root, dependencies = {}) {
  const words = simpleWords(command, root);
  if (!words) return false;
  let observed;
  try {
    observed = (dependencies.observePipelineStartPreflightFn ?? observePipelineStartPreflight)({
      cwd: root,
      scriptUrl: new URL("../../scripts/pipeline-start-preflight.mjs", import.meta.url).href,
      ...(dependencies.preflightEnv === undefined ? {} : { env: dependencies.preflightEnv }),
    });
  } catch {
    return false;
  }
  const action = observed?.nextAction;
  const expected = action?.expected;
  const exactKeys = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
  const argv = action?.argv;
  // This is deliberately stronger than equality with a freshly observed
  // action.  The emergency lane exists only for Codex's registry-selected
  // receipt writer; a matching preflight that named the generic writer would
  // otherwise turn exact-observation equality into a generic host-write lane.
  // The optional source root remains data for the writer to compare against
  // the registry, but its flag position and the installed root are closed
  // here before the host command can run.
  const codexWriterArgv = Array.isArray(argv)
    && argv[0] === resolve(observed?.pluginRoot ?? "", "scripts", "installed-plugin-attestation-host.mjs")
    && argv[1] === "write-local-from-codex-registry"
    && argv[2] === "--version"
    && argv[3] === observed?.version
    && typeof argv[3] === "string" && argv[3] !== ""
    && (() => {
      const sourceOffset = argv[4] === "--source-plugin-root" ? 2 : 0;
      return (sourceOffset === 0 || (typeof argv[5] === "string" && isAbsolute(argv[5])))
        && argv.length === 6 + sourceOffset
        && argv[4 + sourceOffset] === "--installed-plugin-root"
        && argv[5 + sourceOffset] === observed.pluginRoot;
    })();
  return observed?.schema === "pipeline.start-preflight.v1"
    && observed?.status === "plugin-attestation-required"
    && typeof observed?.pluginRoot === "string" && isAbsolute(observed.pluginRoot)
    && exactKeys(action, ["schema", "kind", "executable", "argv", "mutation", "requiresPoApproval", "executionBoundary", "expected"])
    && action.schema === "pipeline.installed-plugin-attestation-setup-action.v1"
    && action.kind === "host-postinstall"
    && action.executable === "node"
    && Array.isArray(action.argv) && action.argv.every((value) => typeof value === "string")
    && codexWriterArgv
    && action.mutation === true && action.requiresPoApproval === false && action.executionBoundary === "host"
    && exactKeys(expected, ["schema", "status"])
    && expected.schema === "pipeline.installed-plugin-attestation-host-result.v1"
    && expected.status === "written"
    && words.length === action.argv.length + 1
    && words[0] === action.executable
    && action.argv.every((value, index) => words[index + 1] === value);
}

/**
 * NVA-B8-RUNNER-PERMISSIONS: a versioned local plugin may be unable to run its
 * own next installation/recovery action until its four exact runner-permission
 * entries have been merged. The producer already publishes one digest-bound
 * repair action. If the settings merge cannot safely construct a write, the
 * same producer instead returns its closed, read-only planner. Admit only
 * either freshly observed action; never a reconstructed settings write or an
 * unobserved planner invocation.
 */
export function isExactObservedRunnerPermissionsRepairAction(command, root, dependencies = {}) {
  const words = simpleWords(command, root);
  if (!words) return false;
  let observed;
  try {
    observed = (dependencies.inspectProjectOnboardingV3Fn ?? inspectProjectOnboardingV3)({
      rootDir: root,
      intent: "session",
      runner: dependencies.runner,
    });
  } catch {
    return false;
  }
  const action = observed?.nextAction;
  const expected = action?.expected;
  const exactKeys = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
  return observed?.schema === "pipeline.project-onboarding.v4"
    && observed?.status === "projection-drift"
    && observed?.root === root
    && observed?.intent === "session"
    // A newly initialized runner reports the same exact merge action as
    // `pending-runtime-initialization`; a formerly initialized one reports
    // `drifted`.  Both are producer-defined repair states, while all command
    // bytes below remain re-observed and exact.
    && ["drifted", "pending-runtime-initialization"].includes(observed?.runnerPermissions?.status)
    && exactKeys(action, ["kind", "executable", "argv", "mutation", "requiresConfirmation", "expected"])
    && action.kind === "command" && action.executable === "node"
    && Array.isArray(action.argv) && action.argv.length === 7 && action.argv.every((value) => typeof value === "string")
    && action.argv[0] === SETTINGS_ALLOWLIST_MERGE_SCRIPT
    && action.argv[1] === "apply-runner-permissions"
    && action.argv[2] === "--root" && action.argv[3] === root
    && action.argv[4] === "--plan-sha256" && HEX.test(action.argv[5])
    && action.argv[6] === "--activate"
    && action.mutation === true && action.requiresConfirmation === true
    && exactKeys(expected, ["schema", "statuses"])
    && expected.schema === "pipeline.settings-allowlist-merge-apply.v1"
    && Array.isArray(expected.statuses) && expected.statuses.length === 2
    && expected.statuses[0] === "ready" && expected.statuses[1] === "no-op"
    && words.length === action.argv.length + 1
    && words[0] === action.executable
    && action.argv.every((value, index) => words[index + 1] === value);
}

export function isExactObservedRunnerPermissionsPlannerAction(command, root, dependencies = {}) {
  const words = simpleWords(command, root);
  if (!words) return false;
  let observed;
  try {
    observed = (dependencies.inspectProjectOnboardingV3Fn ?? inspectProjectOnboardingV3)({
      rootDir: root,
      intent: "session",
      runner: dependencies.runner,
    });
  } catch {
    return false;
  }
  const action = observed?.nextAction;
  const expected = action?.expected;
  const exactKeys = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
  const observedApplyAction = exactKeys(action, ["kind", "executable", "argv", "mutation", "requiresConfirmation", "expected"])
    && action.kind === "command" && action.executable === "node"
    && Array.isArray(action.argv) && action.argv.length === 7 && action.argv.every((value) => typeof value === "string")
    && action.argv[0] === SETTINGS_ALLOWLIST_MERGE_SCRIPT
    && action.argv[1] === "apply-runner-permissions"
    && action.argv[2] === "--root" && action.argv[3] === root
    && action.argv[4] === "--plan-sha256" && HEX.test(action.argv[5])
    && action.argv[6] === "--activate"
    && action.mutation === true && action.requiresConfirmation === true
    && exactKeys(expected, ["schema", "statuses"])
    && expected.schema === "pipeline.settings-allowlist-merge-apply.v1"
    && Array.isArray(expected.statuses) && expected.statuses.length === 2
    && expected.statuses[0] === "ready" && expected.statuses[1] === "no-op";
  const observedPlannerAction = exactKeys(action, ["kind", "executable", "argv", "mutation", "requiresConfirmation", "expected"])
    && action.kind === "command" && action.executable === "node"
    && Array.isArray(action.argv) && action.argv.length === 4 && action.argv.every((value) => typeof value === "string")
    && action.argv[0] === SETTINGS_ALLOWLIST_MERGE_SCRIPT
    && action.argv[1] === "plan-runner-permissions"
    && action.argv[2] === "--root" && action.argv[3] === root
    && action.mutation === false && action.requiresConfirmation === false
    && exactKeys(expected, ["schema", "statuses"])
    && expected.schema === "pipeline.settings-allowlist-merge-plan.v1"
    && Array.isArray(expected.statuses) && expected.statuses.length === 3
    && expected.statuses[0] === "ready" && expected.statuses[1] === "no-op" && expected.statuses[2] === "unrepairable";
  return observed?.schema === "pipeline.project-onboarding.v4"
    && observed?.status === "projection-drift"
    && observed?.root === root
    && observed?.intent === "session"
    && ["drifted", "pending-runtime-initialization", "unavailable"].includes(observed?.runnerPermissions?.status)
    && observedPlannerAction
    && words.length === action.argv.length + 1
    && words[0] === action.executable
    && action.argv.every((value, index) => words[index + 1] === value);
}

/**
 * GF-097: a bare `gh --version` and a bare `gh auth status` are GitHub CLI's own
 * documented read-only diagnostics -- the former only prints the installed CLI version
 * (`gh --help`), the latter only reports which account(s) are authenticated and to which
 * hosts (`gh auth status --help`); neither writes to the repository, the remote, or any
 * credential store. Confirmed live 2026-08-10: a Codex session had both refused with the
 * generic GUARD-LIFECYCLE-NOT-READY denial, identically to a real mutating `gh` command,
 * while diagnosing an unrelated push problem.
 *
 * Deliberately NOT a branch inside isSanctionedLifecycleCommand() above: that function's
 * simpleWords()-based dispatch is keyed on a trusted `node <script>` first word, and `gh`
 * is a different binary entirely -- one this codebase does not own the source of. That is
 * a materially different trust basis than GF-093's `--help` admission (sanctionedOnboardingArgs()
 * above), which could point at the bundled script's own source (`main()` returns before any
 * filesystem access) as its proof of safety; no such proof is available for a third-party
 * binary. The trust basis here is instead GitHub CLI's OWN documented behaviour for exactly
 * these two invocation shapes, stated rather than papered over.
 *
 * Narrow by construction, exactly like every sibling admission in this file: only these two
 * EXACT bare shapes -- no extra flag, no other subcommand, no partial-match tolerance, never
 * a blanket `gh` carve-out. `gh pr create`, `gh auth login`, `gh repo clone`,
 * `gh --version --help` and `gh auth status --hostname <host>` all still fall through to the
 * ordinary GUARD-LIFECYCLE-NOT-READY refusal below, unchanged.
 */
export function isSanctionedGhReadOnlyDiagnostic(command, root, options = {}) {
  const words = simpleWords(command, root, options);
  if (!words || words.length === 0) return false;
  if (!["gh", "gh.exe"].includes(basename(words[0]).toLowerCase())) return false;
  const args = words.slice(1);
  if (args.length === 1 && args[0] === "--version") return true;
  return args.length === 2 && args[0] === "auth" && args[1] === "status";
}
