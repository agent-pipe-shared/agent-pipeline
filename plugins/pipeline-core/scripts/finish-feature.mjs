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
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { armWriterCommitCapability, armWrittenSince, captureWorktree, formatWriterCommitNextStep, writerCommitSteps } from "../lib/writer-commit-capability.mjs";
import { LEGACY_STATE, NEUTRAL_STATE, resolveProjectAuthorityPaths } from "../lib/project-authority.mjs";
import { ensurePrivateDirectory, writePrivateJsonAtomic } from "../lib/private-boundary.mjs";

const HERE = new URL(".", import.meta.url);
const COORDINATOR = fileURLToPath(new URL("./close-coordinator.mjs", HERE));
const STATE_WRITER = fileURLToPath(new URL("./pipeline-state.mjs", HERE));
const VERIFY_PRODUCER = fileURLToPath(new URL("./verify-evidence-producer.mjs", HERE));
const REGISTER_PACKAGE = fileURLToPath(new URL("./register-feature-package.mjs", HERE));
const SECURITY_SCAN = fileURLToPath(new URL("./security-scan.mjs", HERE));
const PLUGIN_MANIFEST = fileURLToPath(new URL("../.claude-plugin/plugin.json", HERE));
const FEATURE = /^[a-z][a-z0-9-]{2,63}$/u;
// P3: the same five dispositions the coordinator accepts (the driver used to know only three and refused the rest before the coordinator spoke).
const IMPACT = new Set(["architecture-conforms", "architecture-changed", "architecture-decision-added", "architecture-decision-superseded", "architecture-summary-updated", "no-architecture-impact"]);

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function parseJsonOutput(result, code) {
  if (result?.status !== 0) {
    // P3: the coordinator and the State writer print a typed refusal as JSON on STDOUT with an empty stderr; the old text was a bare "Command failed."
    let refusal = null;
    try { const value = JSON.parse(String(result?.stdout ?? "")); if (value !== null && typeof value === "object" && typeof value.code === "string") refusal = value; } catch { /* plain text */ }
    const text = String(result?.stderr ?? "").trim() || (refusal === null ? String(result?.stdout ?? "").trim() : "");
    const error = new Error(refusal === null ? (text || "Command failed.") : `${refusal.code}: ${refusal.message ?? "refused"}${text === "" ? "" : ` (${text})`}`);
    error.code = code;
    if (refusal !== null) { error.refusalCode = refusal.code; error.refusalMessage = String(refusal.message ?? ""); }
    throw error;
  }
  try { return JSON.parse(String(result.stdout)); } catch { fail(code, "Command did not return one JSON object."); }
}
function statePathFor(root) {
  try { const authority = resolveProjectAuthorityPaths({ rootDir: root }); if (authority.status === "ready") return authority.state; } catch { /* the conventional paths below */ }
  return existsSync(resolve(root, NEUTRAL_STATE)) ? NEUTRAL_STATE : LEGACY_STATE;
}
function readFeatureState(root, deps) {
  const read = deps.readFileSyncFn ?? readFileSync;
  let state;
  try { state = JSON.parse(read(resolve(root, statePathFor(root)), "utf8")); } catch { fail("FINISH-STATE", "Pipeline State is unavailable."); }
  if (state === null || typeof state !== "object" || Array.isArray(state)) fail("FINISH-STATE", "Pipeline State is invalid.");
  return state;
}
function command(runner, executable, argv, code) { return parseJsonOutput(runner(executable, argv), code); }
function flagPairs(values) {
  const argv = [];
  for (const [name, value] of Object.entries(values)) {
    if (value === null || value === undefined) continue;
    if (name === "activate" || name === "apply") {
      if (value === true) argv.push(`--${name}`);
      continue;
    }
    argv.push(`--${name}`, value);
  }
  return argv;
}

/** Applies exactly the coordinator-returned action bound to `plan` (never a reconstructed one). */
function applyBound(runner, plan, values, code, subcommand) {
  if (!/^[a-f0-9]{64}$/u.test(plan?.planSha256 ?? "")) fail("FINISH-PLAN", "Coordinator plan lacks an exact digest.");
  const expectedArgv = [COORDINATOR, subcommand, ...flagPairs({ ...values, "plan-sha256": plan.planSha256, activate: true })];
  if (plan.nextAction?.executable !== process.execPath
    || JSON.stringify(plan.nextAction?.argv) !== JSON.stringify(expectedArgv)) {
    fail("FINISH-PLAN-ACTION", "Coordinator plan did not return the exact bound apply action.");
  }
  const applied = command(runner, plan.nextAction.executable, plan.nextAction.argv, code);
  if (!new Set(["applied", "replayed"]).has(applied?.status)) fail(code, "Coordinator did not durably apply its exact plan.");
  return applied;
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
  // G20-66: every stage that writes files (the coordinator's start, checkpoint and prepared transitions, then the State close)
  // arms the commit of exactly the bytes it wrote, so the close's own outputs are committed without a human override. A fault
  // in arming never changes a stage's outcome: it is recorded in `stages` and the hook then keeps its old refusal.
  const writerCommitStages = [];
  const rerun = `node ${fileURLToPath(import.meta.url)} --root ${root} --by ${JSON.stringify(by.trim())} --architecture-impact ${architectureImpact} --audit-request ${JSON.stringify(auditRequest)} --critic-verify-lifecycle ${criticVerifyLifecycle}${continuityCloseRequest === null ? "" : ` --continuity-close-request ${JSON.stringify(continuityCloseRequest)}`} --resume-lifecycle-id ${id}`;
  const armStage = (stage, run, succeeded = () => true) => {
    const before = captureWorktree(root);
    const out = run();
    if (before === null || !succeeded(out)) return out;
    try {
      const armed = armWrittenSince({ rootDir: root, before, writer: `finish-feature.mjs ${stage}`, rerun });
      if (armed.paths.length > 0) writerCommitStages.push({ stage, status: armed.status, paths: armed.paths });
    } catch (error) {
      writerCommitStages.push({ stage, status: "unavailable", paths: [], code: error?.code ?? "WC-FAULT", heal: error?.heal ?? rerun });
    }
    return out;
  };
  const writerCommit = () => {
    const paths = [...new Set(writerCommitStages.flatMap((entry) => entry.paths))].sort();
    const message = "chore(pipeline): commit the finish-feature output";
    return { status: writerCommitStages.some((entry) => entry.status === "armed") ? "armed" : "not-needed", paths, stages: writerCommitStages, message, steps: paths.length > 0 ? writerCommitSteps(paths, message) : [], writer: "finish-feature.mjs", rerun };
  };
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
  const apply = (plan, values, code, subcommand) => applyBound(runner, plan, values, code, subcommand);
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
      armStage("apply-start", () => apply(start, { ...base, "close-intent": "durable-stop" }, "FINISH-START-APPLY", "apply-start"));
      phase = "active";
    }
    if (phase === "active") {
      const checkpoint = invokeCoordinator("plan-transition", { ...base, phase: "checkpointed" }, "FINISH-CHECKPOINT-PLAN");
      armStage("apply-checkpoint", () => apply(checkpoint, { ...base, phase: "checkpointed" }, "FINISH-CHECKPOINT-APPLY", "apply-transition"));
      phase = "checkpointed";
    }
    if (phase === "checkpointed") {
      const prepared = invokeCoordinator("plan-transition", preparedValues, "FINISH-PREPARE-PLAN");
      preparedApplied = armStage("apply-prepared", () => apply(prepared, preparedValues, "FINISH-PREPARE-APPLY", "apply-transition"));
    } else {
      if (prior.coordinator.architectureImpact !== architectureImpact
        || prior.coordinator.featureCloseAudit?.criticVerifyLifecycleId !== criticVerifyLifecycle
        || !/^[a-f0-9]{64}$/u.test(prior.coordinator.effects?.at(-1)?.operationSha256 ?? "")) {
        fail("FINISH-RESUME-BINDING", "The prepared close is not bound to these exact inputs.");
      }
      preparedApplied = armStage("replay-prepared", () => invokeCoordinator("apply-transition", { ...preparedValues,
        "plan-sha256": prior.coordinator.effects.at(-1).operationSha256, activate: true }, "FINISH-PREPARE-REPLAY"));
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
  const closed = armStage("close-feature", () => runner(next.executable, next.argv), (out) => out?.status === 0);
  if (closed?.status !== 0) fail("FINISH-CLOSE", String(closed?.stderr ?? closed?.stdout ?? "State close failed.").trim() || "State close failed.");
  return Object.freeze({ schema: "pipeline.finish-feature.v1", status: "closed", lifecycleId: id, featureId, coordinator: preparedApplied, closeOutput: String(closed.stdout ?? "").trim(), writerCommit: writerCommit() });
  } catch (error) {
    error.lifecycleId = id;
    throw error;
  }
}

// ---- P3 (C20D-P3-ONE-SHOT-CLOSE, AC-108): one agent command for the whole local close ------------------------------------------------------
// finish-feature.mjs already owns the stage order (start, checkpoint, prepared, State close) and the G20-66 commit capability of each stage, so the
// one-shot mode extends THIS driver instead of the coordinator's `drive`, which walks one phase per call and has no stage before the start.
// It runs only the sanctioned verbs, each through the injectable runner, signs nothing and pushes nothing. Every point that needs a human, or a
// repair, is a typed stop: { code, reason, repair } with the rerun command; it never guesses an input.
const sha256Hex = (bytes) => createHash("sha256").update(bytes).digest("hex");
const EMPTY_SHA256 = sha256Hex("");
const HEX32 = /^[a-f0-9]{32}$/u;
function stopResult(stage, code, reason, repair, extra = {}) { return Object.freeze({ schema: "pipeline.one-shot-close.v1", status: "stopped", stage, stop: Object.freeze({ code, reason: String(reason).slice(0, 1200), repair }), ...extra }); }
function writeRepoJson(root, path, value) { const target = resolve(root, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`); return path; }

export function oneShotClose({ rootDir = process.cwd(), by, architectureImpact, criticPacketId = null, resumeLifecycleId = null } = {}, deps = {}) {
  const root = (deps.realpathSyncFn ?? realpathSync)(resolve(rootDir));
  if (typeof by !== "string" || by.trim() === "") fail("FINISH-BY", "Feature close requires a non-empty --by.");
  if (!IMPACT.has(architectureImpact)) fail("FINISH-IMPACT", "Feature close requires a known architecture impact.");
  if (criticPacketId !== null && !HEX32.test(criticPacketId)) fail("FINISH-CRITIC-PACKET", "The Critic packet id must be 32 lowercase hex characters.");
  if (resumeLifecycleId !== null && !/^[A-Za-z0-9._-]{1,100}$/u.test(resumeLifecycleId)) fail("FINISH-LIFECYCLE", "Lifecycle ID is invalid.");
  const runner = deps.runCommand ?? ((executable, argv) => spawnSync(executable, argv, { cwd: root, encoding: "utf8", shell: false, env: { ...process.env, CLAUDE_PROJECT_DIR: root } }));
  const actor = by.trim();
  const rawGit = (args) => { const out = runner("git", args); return out?.status === 0 ? String(out.stdout ?? "").trim() : null; };
  const state = readFeatureState(root, deps);
  const featureId = state.activeFeature?.id;
  const statePath = statePathFor(root);
  const evidenceDir = featureId === undefined ? null : `specs/${featureId}/evidence`;
  const rerunBase = `node ${fileURLToPath(import.meta.url)} --one-shot --root ${root} --by ${JSON.stringify(actor)} --architecture-impact ${architectureImpact}`;
  let packetForRerun = criticPacketId;
  const rerun = (id) => `${rerunBase}${id || packetForRerun === null ? "" : ` --critic-packet-id ${packetForRerun}`}${id ? ` --resume-lifecycle-id ${id}` : ""}`;
  const repairFor = (error, id) => `${error.refusalMessage ? `${error.refusalMessage} -- then` : "repair the refusal above, then"} rerun the identical command: ${rerun(id)}`;
  const stages = [];
  if (featureId !== undefined && !FEATURE.test(featureId)) fail("FINISH-FEATURE", "A valid active feature is required.");
  if (featureId === undefined && resumeLifecycleId === null) {
    return stopResult("preflight", "ONESHOT-NO-ACTIVE-FEATURE", "Pipeline State has no active feature, so there is nothing to close.", `if a close was started, rerun with the lifecycle id it printed: ${rerunBase} --resume-lifecycle-id <id>`);
  }
  const common = () => { const value = rawGit(["rev-parse", "--git-common-dir"]); return value === null ? null : resolve(root, value); };
  const failedText = (out) => String(out?.stderr ?? "").trim() || String(out?.stdout ?? "").trim() || "no output";

  // ---- before the commit: Verify evidence, package, Result block, audit request, then the close itself -------------------------------------------------
  let id = resumeLifecycleId;
  const auditRequestPath = featureId === undefined ? null : `${evidenceDir}/audit-request.json`;
  const closeRequestPath = featureId === undefined ? null : `${evidenceDir}/close-request.json`;
  const verifyPath = featureId === undefined ? null : `${evidenceDir}/verify-candidate.json`;
  if (featureId !== undefined) {
    let criticVerifyLifecycle;
    if (resumeLifecycleId === null) {
      let packet = criticPacketId;
      if (packet === null) {
        let found = [];
        try { const dir = common(); found = (deps.listCriticPackets ?? ((c) => readdirSync(join(c, "agent-pipeline", "critic-packets"))))(dir).filter((name) => HEX32.test(name)).sort(); } catch { found = []; }
        if (found.length === 1) packet = found[0];
        else return stopResult("critic-packet", "ONESHOT-CRITIC-PACKET-MISSING", found.length === 0 ? "No consumed Critic packet exists for this repository, so the candidate Verify cannot be bound to a Critic review." : `Several Critic packets exist (${found.join(", ")}); the close will not guess which one reviewed this candidate.`,
          `finish the Critic review (it records the packet), then run: ${rerunBase} --critic-packet-id <packet-id>`);
      }
      packetForRerun = packet;
      stages.push("verify-candidate");
      const verify = runner(process.execPath, [VERIFY_PRODUCER, "--root", root, "--mode", "candidate", "--critic-packet-id", packet, "--critic-evidence-feature-id", featureId, "--out", verifyPath]);
      if (verify?.status !== 0) return stopResult("verify-candidate", "ONESHOT-VERIFY-RED", failedText(verify), `fix what the Verify output names without committing, then rerun the identical command: ${rerun(null)}`);
      stages.push("register-verify-evidence");
      const register = runner(process.execPath, [REGISTER_PACKAGE, "--root", root, "--add-verify-evidence", verifyPath]);
      if (register?.status !== 0) return stopResult("register-verify-evidence", "ONESHOT-REGISTER-FAILED", failedText(register), `register the evidence by hand to see the typed refusal: node ${REGISTER_PACKAGE} --root ${root} --add-verify-evidence ${verifyPath}`);
      const manifest = `specs/${featureId}/lifecycle.json`;
      for (const nextState of ["verifying", "completed"]) {
        stages.push(`feature-package-${nextState}`);
        try {
          const plan = command(runner, process.execPath, [STATE_WRITER, "feature-package-plan", "--root", root, "--manifest", manifest, "--next-state", nextState], "ONESHOT-PACKAGE-PLAN");
          command(runner, process.execPath, [STATE_WRITER, "feature-package-apply", "--root", root, "--manifest", manifest, "--next-state", nextState, "--plan-sha256", plan.planSha256], "ONESHOT-PACKAGE-APPLY");
        } catch (error) { return stopResult(`feature-package-${nextState}`, error.refusalCode ?? error.code, error.message, `nothing was committed; ${repairFor(error, null)}`); }
      }
      let lifecycleFile = null;
      try {
        const dir = join(common(), "agent-pipeline", "critic-verify-lifecycle");
        const candidates = readdirSync(dir).filter((name) => /^[a-f0-9]{64}\.json$/u.test(name) && readFileSync(join(dir, name), "utf8").includes(packet)).map((name) => ({ name, mtime: statSync(join(dir, name)).mtimeMs })).sort((a, b) => b.mtime - a.mtime);
        lifecycleFile = candidates[0]?.name ?? null;
      } catch { lifecycleFile = null; }
      if (lifecycleFile === null) return stopResult("critic-verify-lifecycle", "ONESHOT-LIFECYCLE-MISSING", "The candidate Verify did not leave a Critic/Verify lifecycle receipt for this packet.", `rerun the Verify bound to the packet: node ${VERIFY_PRODUCER} --root ${root} --mode candidate --critic-packet-id ${packet} --critic-evidence-feature-id ${featureId} --out ${verifyPath}`);
      criticVerifyLifecycle = lifecycleFile.slice(0, -5);
      let coreVersion = "0.0.0";
      try { coreVersion = String(JSON.parse(readFileSync(PLUGIN_MANIFEST, "utf8")).version).split(/[+-]/u)[0]; } catch { /* the request is refused by the coordinator with its typed code */ }
      stages.push("audit-request");
      writeRepoJson(root, auditRequestPath, { schema: "pipeline.feature-close-audit-request.v1", manifestPath: manifest, coreVersion, packs: ["pipeline-core-baseline"], criticVerifyLifecycleId: criticVerifyLifecycle });
      if (state.continuity !== null && typeof state.continuity === "object") {
        let current = state;
        if (state.continuity.queueHead?.nextAction !== "close") {
          stages.push("result-close-block");
          const result = state.continuity.authority?.result;
          try {
            const plan = command(runner, process.execPath, [STATE_WRITER, "continuity-result-close-plan", "--feature-id", featureId, "--expected-revision", String(state.continuity.revision), "--result-path", result?.path, "--result-sha256", result?.sha256], "ONESHOT-RESULT-CLOSE-PLAN");
            command(runner, plan.applyAction?.executable, plan.applyAction?.argv, "ONESHOT-RESULT-CLOSE-APPLY");
          } catch (error) {
            const owner = /SDC-AUTHORITY-UNAVAILABLE/u.test(error.message);
            return stopResult("result-close-block", owner ? "ONESHOT-OWNER-ROUTE-REQUIRED" : (error.refusalCode ?? error.code), error.message,
              owner ? `this project has a session-authority catalogue: run the Result close entries through node ${join(dirname(STATE_WRITER), "continuity-owner-route.mjs")} run --root ${root} --lifecycle <id> -- continuity-result-close-plan <flags>, then rerun the identical command` : "repair the refusal above, then rerun the identical command");
          }
          current = readFeatureState(root, deps);
        }
        stages.push("close-request");
        writeRepoJson(root, closeRequestPath, { schema: "pipeline.continuity-close.v0", featureId, expectedRevision: current.continuity.revision, result: current.continuity.authority.result, closeEvidence: { path: verifyPath, sha256: sha256Hex(readFileSync(resolve(root, verifyPath))) } });
      }
    } else {
      try { criticVerifyLifecycle = JSON.parse(readFileSync(resolve(root, auditRequestPath), "utf8")).criticVerifyLifecycleId; } catch { criticVerifyLifecycle = undefined; }
      if (!/^[a-f0-9]{64}$/u.test(criticVerifyLifecycle ?? "")) return stopResult("resume", "ONESHOT-RESUME-REQUEST-MISSING", `The audit request ${auditRequestPath} written by the first call is missing or unreadable.`, `rerun without --resume-lifecycle-id to produce it again: ${rerunBase}`);
    }
    stages.push("close");
    let closed;
    try {
      closed = finishFeature({ rootDir: root, by: actor, architectureImpact, auditRequest: auditRequestPath, criticVerifyLifecycle, continuityCloseRequest: state.continuity ? closeRequestPath : null, ...(resumeLifecycleId === null ? {} : { resumeLifecycleId }) }, { ...deps, runCommand: runner, realpathSyncFn: (value) => value });
    } catch (error) {
      id = error.lifecycleId ?? id;
      return stopResult("close", error.refusalCode ?? error.code, error.message, repairFor(error, id), { resumeLifecycleId: id ?? null, next: rerun(id) });
    }
    id = closed.lifecycleId;
  }

  // ---- after the close: tracked effects, the one commit, then the freeze and the final gates up to closed-local -------------------------------------------
  const coordinate = (subcommand, values, code) => command(runner, process.execPath, [COORDINATOR, subcommand, ...flagPairs(values)], code);
  const inspect = () => coordinate("inspect", { root, lifecycle: id }, "ONESHOT-INSPECT");
  const transition = (phase, extra = {}) => { const values = { root, lifecycle: id, actor, phase, ...extra }; return applyBound(runner, coordinate("plan-transition", values, "ONESHOT-PLAN"), values, "ONESHOT-APPLY", "apply-transition"); };
  const step = (name, fn) => { stages.push(name); try { return { value: fn() }; } catch (error) { return { stop: stopResult(name, error.refusalCode ?? error.code, error.message, repairFor(error, id), { resumeLifecycleId: id, next: rerun(id) }) }; } };
  let observed = step("inspect", inspect); if (observed.stop) return observed.stop;
  const closedFeatureId = featureId ?? observed.value.identity?.featureId;
  const commitFacts = () => {
    // not rawGit: its trim() would eat the leading space of the first " M" status entry
    const status = runner("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", statePath, `specs/${closedFeatureId}`, `audit-bundles/${closedFeatureId}`]);
    const tokens = (status?.status === 0 ? String(status.stdout ?? "") : "").split("\0").filter((token) => token !== "");
    const paths = []; for (let index = 0; index < tokens.length; index += 1) { const code = tokens[index].slice(0, 2); paths.push(tokens[index].slice(3)); if (/[RC]/u.test(code)) index += 1; }
    paths.sort();
    const message = `chore(close): close feature ${closedFeatureId}`;
    let armed = null;
    if (paths.length > 0) {
      try { armed = armWriterCommitCapability({ rootDir: root, writer: "finish-feature.mjs --one-shot", rerun: rerun(id), files: paths.filter((path) => existsSync(resolve(root, path))).map((path) => ({ path, sha256: sha256Hex(readFileSync(resolve(root, path))) })) }); } catch { armed = null; }
    }
    return { paths, excluded: armed?.excluded ?? [], capability: armed?.id ?? null, message, steps: paths.length > 0 ? writerCommitSteps(paths, message) : [] };
  };
  let phase = observed.value.coordinator?.phase;
  if (phase === "feature-close-prepared") {
    const resultPath = state.continuity?.authority?.result?.path ?? `specs/${closedFeatureId}/result.md`;
    let resultBytes = null; try { resultBytes = readFileSync(resolve(root, resultPath)); } catch { resultBytes = null; }
    if (resultBytes === null) return stopResult("tracked-close-finalized", "ONESHOT-RESULT-MISSING", `The Result ${resultPath} is missing.`, `restore it, then rerun the identical command: ${rerun(id)}`, { resumeLifecycleId: id, next: rerun(id) });
    const trackedPath = `specs/${closedFeatureId}/evidence/tracked-close.json`;
    // Only resultSha256 and pipelineStateSha256 are compared by the coordinator; a project without the other artefacts uses the empty-input digest (PO rule).
    writeRepoJson(root, trackedPath, { schema: "pipeline.close-tracked-effects.v1", resultSha256: sha256Hex(resultBytes), backlogSha256: EMPTY_SHA256, handoverSha256: EMPTY_SHA256, historySha256: EMPTY_SHA256, telemetrySha256: EMPTY_SHA256, retrospectiveSha256: EMPTY_SHA256, pipelineStateSha256: sha256Hex(readFileSync(resolve(root, statePath))) });
    const tracked = step("tracked-close-finalized", () => transition("tracked-close-finalized", { evidence: trackedPath })); if (tracked.stop) return tracked.stop;
    const commit = commitFacts();
    return Object.freeze({ schema: "pipeline.one-shot-close.v1", status: "commit-required", featureId: closedFeatureId, lifecycleId: id, resumeLifecycleId: id, stages, commit,
      next: rerun(id), message: "Run the commit (the pre-commit hook admits exactly these bytes), then run the next command: it continues to closed-local. Nothing here signs or pushes." });
  }
  if (phase === "tracked-close-finalized") {
    const commit = commitFacts();
    if (commit.paths.length > 0) return stopResult("commit", "ONESHOT-COMMIT-PENDING", `The close outputs are not committed yet: ${commit.paths.join(", ")}`, `${commit.steps.join(" && ")} then rerun the identical command: ${rerun(id)}`, { commit, resumeLifecycleId: id, next: rerun(id) });
    const frozen = step("candidate-frozen", () => transition("candidate-frozen")); if (frozen.stop) return frozen.stop;
    phase = "candidate-frozen";
  }
  if (phase === "candidate-frozen") {
    stages.push("verify-candidate-frozen");
    const verify = runner(process.execPath, [VERIFY_PRODUCER, "--root", root, "--mode", "candidate", "--out", "evidence/verify-candidate.json"]);
    if (verify?.status !== 0) return stopResult("verify-candidate-frozen", "ONESHOT-VERIFY-RED", failedText(verify), `fix what the Verify output names and commit the fix (the freeze renews), then rerun the identical command: ${rerun(id)}`, { resumeLifecycleId: id, next: rerun(id) });
    stages.push("security-scan");
    const scan = runner(process.execPath, [SECURITY_SCAN, "--root", root]);
    if (scan?.status !== 0) return stopResult("security-scan", "ONESHOT-SECURITY-BLOCKING", failedText(scan), `the frozen candidate has a blocking finding: fix it and commit, or put it on the scanner's own ignore route with a reason (see the close-feature skill), then rerun the identical command: ${rerun(id)}; the scan is node ${SECURITY_SCAN} --root ${root}`, { resumeLifecycleId: id, next: rerun(id) });
    const final = step("final-verify-green", () => {
      const head = rawGit(["rev-parse", "HEAD"]); const tree = rawGit(["rev-parse", "HEAD^{tree}"]);
      const directory = observed.value.evidenceDirectory;
      const evidencePath = join(directory, "final-verification.json");
      ensurePrivateDirectory(directory);
      writePrivateJsonAtomic(evidencePath, { schema: "pipeline.close-final-verification.v1", candidateOid: head, candidateTree: tree, verifyStatus: "green", verifySha256: sha256Hex(readFileSync(resolve(root, "evidence/verify-candidate.json"))), securityStatus: "green", securitySha256: sha256Hex(readFileSync(resolve(root, "evidence/security-latest.v2.verdict.json"))) });
      return transition("final-verify-green", { evidence: evidencePath });
    }); if (final.stop) return final.stop;
    phase = "final-verify-green";
  }
  if (phase === "final-verify-green") {
    const cleanup = step("cleanup-complete", () => {
      const driven = coordinate("drive", { root, lifecycle: id, actor, phase: "cleanup-complete", apply: true }, "ONESHOT-CLEANUP");
      if (driven?.status !== "applied") fail("ONESHOT-CLEANUP", String(driven?.message ?? `cleanup-complete was not applied (${driven?.status})`));
      return driven;
    }); if (cleanup.stop) return cleanup.stop;
    phase = "cleanup-complete";
  }
  if (phase === "cleanup-complete") {
    const local = step("closed-local", () => transition("closed-local")); if (local.stop) return local.stop;
    phase = "closed-local";
  }
  if (phase === "closed-local" || phase === "delivered" || phase === "release-eligible" || phase === "promoted") {
    return Object.freeze({ schema: "pipeline.one-shot-close.v1", status: "closed-local", featureId: closedFeatureId, lifecycleId: id, stages, message: "The feature is closed locally. Publication, push and release are separate human-gated steps and were not touched." });
  }
  return stopResult("inspect", "ONESHOT-PHASE-UNEXPECTED", `The close coordinator is in phase ${phase}, which this command does not continue from.`, `inspect it: node ${COORDINATOR} drive --root ${root} --lifecycle ${id} --actor ${JSON.stringify(actor)}`, { resumeLifecycleId: id });
}

function parseOneShot(argv) {
  const allowed = ["--root", "--by", "--architecture-impact", "--critic-packet-id", "--resume-lifecycle-id"]; const value = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]; const next = argv[i + 1];
    if (!allowed.includes(flag) || next === undefined || next.startsWith("--") || Object.hasOwn(value, flag)) fail("FINISH-USAGE", "Usage: finish-feature.mjs --one-shot --by <name> --architecture-impact <value> [--root <repo>] [--critic-packet-id <32-hex>] [--resume-lifecycle-id <id>]");
    value[flag] = next;
  }
  return { rootDir: value["--root"] ?? process.cwd(), by: value["--by"], architectureImpact: value["--architecture-impact"], criticPacketId: value["--critic-packet-id"] ?? null, resumeLifecycleId: value["--resume-lifecycle-id"] ?? null };
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

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === "--one-shot") {
  // P3: the one agent command. JSON on stdout; the commit steps or the stop with its repair on stderr; exit 2 when stopped.
  try {
    const result = oneShotClose(parseOneShot(process.argv.slice(3)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status === "stopped") { process.stderr.write(`finish-feature --one-shot: stopped at ${result.stage}: ${result.stop.code}: ${result.stop.reason}\nrepair: ${result.stop.repair}\n`); process.exitCode = 2; }
    else if (result.status === "commit-required") process.stderr.write(`finish-feature --one-shot: run the commit, then the next command.\n${(result.commit.steps ?? []).join("\n")}\nnext: ${result.next}\n`);
  } catch (error) { process.stderr.write(`finish-feature: ${error?.code ?? "FINISH-ERROR"}: ${error.message}\n`); process.exitCode = 2; }
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = finishFeature(parse(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    // G20-66: the exact commit of what the close wrote, as the next step (stderr; stdout stays the one JSON object).
    if (result.writerCommit?.status === "armed") process.stderr.write(`${formatWriterCommitNextStep({ ...result.writerCommit, id: "per stage, see writerCommit.stages" }).join("\n")}\n`);
  }
  catch (error) { process.stderr.write(`finish-feature: ${error?.code ?? "FINISH-ERROR"}: ${error.message}${error.lifecycleId ? ` (lifecycle-id: ${error.lifecycleId})` : ""}\n`); process.exitCode = 2; }
}
