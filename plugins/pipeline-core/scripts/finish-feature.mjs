#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * One-shot local feature close driver.
 *
 * It does not manufacture lifecycle state: every coordinator transition is
 * planned and immediately applied by its existing CAS writer.  The final
 * action is accepted only when it is the coordinator-provided close-feature
 * invocation.  The protected State writer remains the sole closer.
 */
import { randomBytes } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = new URL(".", import.meta.url);
const COORDINATOR = fileURLToPath(new URL("./close-coordinator.mjs", HERE));
const STATE_WRITER = fileURLToPath(new URL("./pipeline-state.mjs", HERE));
const FEATURE = /^[a-z][a-z0-9-]{2,63}$/u;
const IMPACT = new Set(["architecture-conforms", "architecture-changed", "no-architecture-impact"]);

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function parseJsonOutput(result, code) {
  if (result?.status !== 0) fail(code, String(result?.stderr ?? result?.stdout ?? "command failed").trim() || "Command failed.");
  try { return JSON.parse(String(result.stdout)); } catch { fail(code, "Command did not return one JSON object."); }
}
function readFeatureState(root, deps) {
  const read = deps.readFileSyncFn ?? readFileSync;
  let state;
  try { state = JSON.parse(read(resolve(root, ".claude/pipeline-state.json"), "utf8")); } catch { fail("FINISH-STATE", "Pipeline State is unavailable."); }
  if (state === null || typeof state !== "object" || Array.isArray(state)) fail("FINISH-STATE", "Pipeline State is invalid.");
  return state;
}
function command(runner, executable, argv, code) { return parseJsonOutput(runner(executable, argv), code); }
function flagPairs(values) {
  const argv = [];
  for (const [name, value] of Object.entries(values)) {
    if (value === null || value === undefined) continue;
    if (name === "activate") {
      if (value === true) argv.push("--activate");
      continue;
    }
    argv.push(`--${name}`, value);
  }
  return argv;
}

export function finishFeature({ rootDir = process.cwd(), by, architectureImpact, auditRequest, criticVerifyLifecycle, continuityCloseRequest = null, lifecycleId = null, resumeLifecycleId = null } = {}, deps = {}) {
  const root = (deps.realpathSyncFn ?? realpathSync)(resolve(rootDir));
  if (typeof by !== "string" || by.trim() === "") fail("FINISH-BY", "Feature close requires a non-empty --by.");
  if (!IMPACT.has(architectureImpact)) fail("FINISH-IMPACT", "Feature close requires a known architecture impact.");
  if (typeof auditRequest !== "string" || auditRequest.length === 0 || auditRequest.startsWith("/") || auditRequest.includes("\\") || auditRequest.split("/").some(part => part === "" || part === "." || part === "..")) fail("FINISH-AUDIT-REQUEST", "Feature close requires one safe repository-relative audit request.");
  if (!/^[a-f0-9]{64}$/u.test(criticVerifyLifecycle ?? "")) fail("FINISH-CRITIC-VERIFY", "Feature close requires the exact private Critic/Verify lifecycle receipt ID.");
  if (continuityCloseRequest !== null && (typeof continuityCloseRequest !== "string" || continuityCloseRequest.length === 0 || continuityCloseRequest.startsWith("/") || continuityCloseRequest.includes("\\") || continuityCloseRequest.split("/").some(part => part === "" || part === "." || part === ".."))) fail("FINISH-CONTINUITY", "Continuity close request must be safe and repository-relative.");
  if (lifecycleId !== null && resumeLifecycleId !== null) fail("FINISH-LIFECYCLE", "A new lifecycle ID and a resume ID cannot both be supplied.");
  const state = readFeatureState(root, deps);
  const featureId = state.activeFeature?.id;
  if (featureId !== undefined && !FEATURE.test(featureId)) fail("FINISH-FEATURE", "A valid active feature is required.");
  if (featureId === undefined && resumeLifecycleId === null) fail("FINISH-FEATURE", "A valid active feature is required.");
  const id = resumeLifecycleId ?? lifecycleId ?? `${featureId}-${(deps.randomBytesFn ?? randomBytes)(12).toString("hex")}`;
  if (!/^[A-Za-z0-9._-]{1,100}$/u.test(id)) fail("FINISH-LIFECYCLE", "Lifecycle ID is invalid.");
  const runner = deps.runCommand ?? ((executable, argv) => spawnSync(executable, argv, {
    cwd: root, encoding: "utf8", shell: false, env: { ...process.env, CLAUDE_PROJECT_DIR: root },
  }));
  const base = { root, lifecycle: id, actor: by.trim() };
  const invokeCoordinator = (subcommand, values, code) => command(runner, process.execPath, [COORDINATOR, subcommand, ...flagPairs(values)], code);
  if (featureId === undefined) {
    try {
      const prior = invokeCoordinator("inspect", { root, lifecycle: id }, "FINISH-RESUME-INSPECT");
      const matching = Array.isArray(state.closedFeatures)
        ? state.closedFeatures.filter((entry) => entry?.coordinatorClose?.lifecycleId === id) : [];
      const closed = matching[0];
      if (matching.length !== 1 || !FEATURE.test(prior?.identity?.featureId ?? "")
        || prior.identity.lifecycleId !== id || prior.coordinator?.phase !== "feature-close-prepared"
        || prior.coordinator.architectureImpact !== architectureImpact
        || prior.coordinator.featureCloseAudit?.criticVerifyLifecycleId !== criticVerifyLifecycle
        || !/^[a-f0-9]{64}$/u.test(prior.coordinator.featureCloseAudit?.auditReceiptSha256 ?? "")
        || !/^[a-f0-9]{64}$/u.test(prior.stateSha256 ?? "")
        || closed?.id !== prior.identity.featureId || closed?.closedBy !== by.trim()
        || closed?.architectureImpact !== architectureImpact
        || closed?.coordinatorClose?.stateSha256 !== prior.stateSha256
        || closed?.coordinatorClose?.phase !== "feature-close-prepared"
        || closed?.coordinatorClose?.revision !== prior.coordinator.revision
        || closed?.auditReference?.auditReceiptSha256 !== prior.coordinator.featureCloseAudit.auditReceiptSha256
        || closed?.auditReference?.criticVerifyLifecycleId !== criticVerifyLifecycle) {
        fail("FINISH-RESUME-CLOSED-MISMATCH", "The durable close is not bound to this lifecycle, actor, audit and feature.");
      }
      return Object.freeze({ schema: "pipeline.finish-feature.v1", status: "closed", lifecycleId: id,
        featureId: closed.id, coordinator: prior, closeOutput: "already-closed" });
    } catch (error) {
      error.lifecycleId = id;
      throw error;
    }
  }
  const apply = (plan, values, code, subcommand) => {
    if (!/^[a-f0-9]{64}$/u.test(plan?.planSha256 ?? "")) fail("FINISH-PLAN", "Coordinator plan lacks an exact digest.");
    const expectedArgv = [COORDINATOR, subcommand, ...flagPairs({ ...values, "plan-sha256": plan.planSha256, activate: true })];
    if (plan.nextAction?.executable !== process.execPath
      || JSON.stringify(plan.nextAction?.argv) !== JSON.stringify(expectedArgv)) {
      fail("FINISH-PLAN-ACTION", "Coordinator plan did not return the exact bound apply action.");
    }
    const applied = command(runner, plan.nextAction.executable, plan.nextAction.argv, code);
    if (!new Set(["applied", "replayed"]).has(applied?.status)) fail(code, "Coordinator did not durably apply its exact plan.");
    return applied;
  };
  const preparedValues = { ...base, phase: "feature-close-prepared", "architecture-impact": architectureImpact, "audit-request": auditRequest, "critic-verify-lifecycle": criticVerifyLifecycle, "continuity-close-request": continuityCloseRequest };
  let phase = null;
  let prior = null;
  try {
  if (resumeLifecycleId !== null) {
    prior = invokeCoordinator("inspect", { root, lifecycle: id }, "FINISH-RESUME-INSPECT");
    if (prior?.identity?.lifecycleId !== id || prior?.identity?.featureId !== featureId
      || !new Set(["active", "checkpointed", "feature-close-prepared"]).has(prior?.coordinator?.phase)) {
      fail("FINISH-RESUME-STATE", "The requested lifecycle does not match an unfinished close for the active feature.");
    }
    phase = prior.coordinator.phase;
  }
  let preparedApplied;
    if (phase === null) {
      const start = invokeCoordinator("plan-start", { ...base, "close-intent": "durable-stop" }, "FINISH-START-PLAN");
      apply(start, { ...base, "close-intent": "durable-stop" }, "FINISH-START-APPLY", "apply-start");
      phase = "active";
    }
    if (phase === "active") {
      const checkpoint = invokeCoordinator("plan-transition", { ...base, phase: "checkpointed" }, "FINISH-CHECKPOINT-PLAN");
      apply(checkpoint, { ...base, phase: "checkpointed" }, "FINISH-CHECKPOINT-APPLY", "apply-transition");
      phase = "checkpointed";
    }
    if (phase === "checkpointed") {
      const prepared = invokeCoordinator("plan-transition", preparedValues, "FINISH-PREPARE-PLAN");
      preparedApplied = apply(prepared, preparedValues, "FINISH-PREPARE-APPLY", "apply-transition");
    } else {
      if (prior.coordinator.architectureImpact !== architectureImpact
        || prior.coordinator.featureCloseAudit?.criticVerifyLifecycleId !== criticVerifyLifecycle
        || !/^[a-f0-9]{64}$/u.test(prior.coordinator.effects?.at(-1)?.operationSha256 ?? "")) {
        fail("FINISH-RESUME-BINDING", "The prepared close is not bound to these exact inputs.");
      }
      preparedApplied = invokeCoordinator("apply-transition", { ...preparedValues,
        "plan-sha256": prior.coordinator.effects.at(-1).operationSha256, activate: true }, "FINISH-PREPARE-REPLAY");
      if (preparedApplied?.status !== "replayed") fail("FINISH-PREPARE-REPLAY", "The prepared close was not replayed from its durable record.");
  }
  const next = preparedApplied.nextAction;
  const expectedCloseArgv = [STATE_WRITER, "close-feature", "--by", by.trim(),
    "--architecture-impact", architectureImpact, "--coordinator-lifecycle", id,
    "--coordinator-sha256", preparedApplied.stateSha256,
    "--critic-verify-lifecycle", criticVerifyLifecycle,
    ...(continuityCloseRequest === null ? [] : ["--continuity-close-request", continuityCloseRequest])];
  if (!/^[a-f0-9]{64}$/u.test(preparedApplied.stateSha256 ?? "")
    || next?.executable !== process.execPath
    || JSON.stringify(next?.argv) !== JSON.stringify(expectedCloseArgv)) {
    fail("FINISH-CLOSE-ACTION", "Coordinator did not return its exact bound close-feature action.");
  }
  const closed = runner(next.executable, next.argv);
  if (closed?.status !== 0) fail("FINISH-CLOSE", String(closed?.stderr ?? closed?.stdout ?? "State close failed.").trim() || "State close failed.");
  return Object.freeze({ schema: "pipeline.finish-feature.v1", status: "closed", lifecycleId: id, featureId, coordinator: preparedApplied, closeOutput: String(closed.stdout ?? "").trim() });
  } catch (error) {
    error.lifecycleId = id;
    throw error;
  }
}

function parse(argv) {
  const value = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]; const next = argv[i + 1];
    if (!["--root", "--by", "--architecture-impact", "--audit-request", "--critic-verify-lifecycle", "--continuity-close-request", "--resume-lifecycle-id"].includes(flag) || next === undefined || next.startsWith("--") || Object.hasOwn(value, flag)) fail("FINISH-USAGE", "Usage: finish-feature.mjs --root <repo> --by <name> --architecture-impact <value> --audit-request <repo-relative-json> --critic-verify-lifecycle <receipt-id> [--continuity-close-request <repo-relative-json>] [--resume-lifecycle-id <id>]");
    value[flag] = next;
  }
  return { rootDir: value["--root"] ?? process.cwd(), by: value["--by"], architectureImpact: value["--architecture-impact"], auditRequest: value["--audit-request"], criticVerifyLifecycle: value["--critic-verify-lifecycle"], continuityCloseRequest: value["--continuity-close-request"] ?? null, resumeLifecycleId: value["--resume-lifecycle-id"] ?? null };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(finishFeature(parse(process.argv.slice(2))), null, 2)}\n`); }
  catch (error) { process.stderr.write(`finish-feature: ${error?.code ?? "FINISH-ERROR"}: ${error.message}${error.lifecycleId ? ` (lifecycle-id: ${error.lifecycleId})` : ""}\n`); process.exitCode = 2; }
}
