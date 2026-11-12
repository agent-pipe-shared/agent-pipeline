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
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { armWriterCommitCapability, armWrittenSince, captureWorktree, formatWriterCommitNextStep, writerCommitSteps } from "../lib/writer-commit-capability.mjs";
import { LEGACY_STATE, NEUTRAL_STATE, resolveProjectAuthorityPaths } from "../lib/project-authority.mjs";
import { ensurePrivateDirectory, writePrivateJsonAtomic } from "../lib/private-boundary.mjs";
import { acceptanceQuestion, acceptanceTarget, acceptanceYesForm, featureStatusVocabulary, isAcceptanceYes, openChecksOf, readAcceptanceRecord, writeAcceptanceRecord, writeDeclineRecord } from "../lib/close-acceptance-record.mjs";
import { readConsumedCandidateResult } from "../lib/critic-packet-preflight-read.mjs";
import { CLOSE_COMMIT_SPLIT_SCHEMA, describeCommitSplit, featureRangeCommitSplit } from "../lib/close-commit-split.mjs";
import { minorsFromVerdictFindings, openMinorsCloseLine, recordOpenMinors, summarizeOpenMinors } from "../lib/open-minors.mjs";
import { closeSecurityScope, describeCloseSecurityScope } from "../lib/security-close-status.mjs";
import { declaredRepositoryMode } from "./repository-freshness.mjs";
import { exportCriticRoundFromJournal } from "./session-critic-finalizer.mjs";
import { FOLLOWUP_EVIDENCE } from "../lib/critical-action-authorization.mjs";
import { closeDispatchProjectionBytes, projectCloseDispatches, readCloseDispatchInputs } from "../lib/durable-evidence.mjs";
import { closeSbom, sbomFindingHelp } from "../lib/sbom-close.mjs";

const HERE = new URL(".", import.meta.url);
const COORDINATOR = fileURLToPath(new URL("./close-coordinator.mjs", HERE));
const STATE_WRITER = fileURLToPath(new URL("./pipeline-state.mjs", HERE));
const OWNER_ROUTE = fileURLToPath(new URL("./continuity-owner-route.mjs", HERE));
const PREPARE_DISPATCH = fileURLToPath(new URL("./prepare-dispatch.mjs", HERE));
const VERIFY_PRODUCER = fileURLToPath(new URL("./verify-evidence-producer.mjs", HERE));
const REGISTER_PACKAGE = fileURLToPath(new URL("./register-feature-package.mjs", HERE));
const SECURITY_SCAN = fileURLToPath(new URL("./security-scan.mjs", HERE));
const PLUGIN_MANIFEST = fileURLToPath(new URL("../.claude-plugin/plugin.json", HERE));
const FEATURE = /^[a-z][a-z0-9-]{2,63}$/u;
const SBOM_OUTPUTS = Object.freeze(["record.json", "cyclonedx.json", "spdx.json"]);
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
  if (!IMPACT.has(architectureImpact)) fail("FINISH-IMPACT", `Feature close requires a known architecture impact; allowed --architecture-impact values: ${[...IMPACT].join(", ")}.`);
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

export function oneShotClose({ rootDir = process.cwd(), by, architectureImpact, criticPacketId = null, resumeLifecycleId = null, humanAcceptance = null, humanDecline = null, openChecks = null, sbomOverride = null } = {}, deps = {}) {
  const root = (deps.realpathSyncFn ?? realpathSync)(resolve(rootDir));
  if (typeof by !== "string" || by.trim() === "") fail("FINISH-BY", "Feature close requires a non-empty --by.");
  if (!IMPACT.has(architectureImpact)) fail("FINISH-IMPACT", `Feature close requires a known architecture impact; allowed --architecture-impact values: ${[...IMPACT].join(", ")}.`);
  if (criticPacketId !== null && !HEX32.test(criticPacketId)) fail("FINISH-CRITIC-PACKET", "The Critic packet id must be 32 lowercase hex characters.");
  if (resumeLifecycleId !== null && !/^[A-Za-z0-9._-]{1,100}$/u.test(resumeLifecycleId)) fail("FINISH-LIFECYCLE", "Lifecycle ID is invalid.");
  // C22 (CGR-06): the human's literal answer to the acceptance question is recorded as given, so only its presence and size are checked.
  if (humanAcceptance !== null && (typeof humanAcceptance !== "string" || humanAcceptance.trim() === "" || humanAcceptance.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(humanAcceptance))) fail("FINISH-ACCEPTANCE", "The human acceptance must be the human's literal answer: non-empty, at most 500 characters, no control characters.");
  // C28: the human's literal words of a decline, held to the same bounds; the two answers exclude each other.
  if (humanDecline !== null && (typeof humanDecline !== "string" || humanDecline.trim() === "" || humanDecline.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(humanDecline))) fail("FINISH-ACCEPTANCE", "The human decline must be the human's literal answer: non-empty, at most 500 characters, no control characters.");
  // C28c: the human's literal words accepting a gap in the SBOM, held to the same bounds; it is recorded as given, never composed by the agent.
  if (sbomOverride !== null && (typeof sbomOverride !== "string" || sbomOverride.trim() === "" || sbomOverride.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(sbomOverride))) fail("FINISH-SBOM-OVERRIDE", "The SBOM override must be the human's literal words: non-empty, at most 500 characters, no control characters.");
  if (humanAcceptance !== null && humanDecline !== null) fail("FINISH-ACCEPTANCE", "--human-acceptance and --human-decline are exclusive: the human either accepted (exactly the fixed yes form) or did not.");
  if (openChecks !== null && (!Array.isArray(openChecks) || openChecks.some((value) => typeof value !== "string"))) fail("FINISH-ACCEPTANCE", "The open checks must be a list of texts.");
  const runner = deps.runCommand ?? ((executable, argv) => spawnSync(executable, argv, { cwd: root, encoding: "utf8", shell: false, env: { ...process.env, CLAUDE_PROJECT_DIR: root } }));
  const actor = by.trim();
  const rawGit = (args) => { const out = runner("git", args); return out?.status === 0 ? String(out.stdout ?? "").trim() : null; };
  const state = readFeatureState(root, deps);
  const featureId = state.activeFeature?.id;
  const statePath = statePathFor(root);
  const evidenceDir = featureId === undefined ? null : `specs/${featureId}/evidence`;
  const rerunBase = `node ${fileURLToPath(import.meta.url)} --one-shot --root ${root} --by ${JSON.stringify(actor)} --architecture-impact ${architectureImpact}`;
  let packetForRerun = criticPacketId;
  // C24 (Claude greenfield): a resume dropped the packet, and with two Critic rounds on record the printed command stopped at ONESHOT-CRITIC-PACKET-MISSING.
  const rerun = (id) => `${rerunBase}${packetForRerun === null ? "" : ` --critic-packet-id ${packetForRerun}`}${id ? ` --resume-lifecycle-id ${id}` : ""}`;
  const repairFor = (error, id) => `${error.refusalMessage ? `${error.refusalMessage} -- then` : "repair the refusal above, then"} rerun the identical command: ${rerun(id)}`;
  const stages = [];
  // The calibrated handover file (project/pipeline.json `handover`), the same resolution the coordinator's quality readback uses.
  const handoverPath = (() => {
    try { const configured = JSON.parse(readFileSync(resolve(root, "project/pipeline.json"), "utf8")).handover; return typeof configured === "string" && /^[A-Za-z0-9._][A-Za-z0-9._/-]*$/u.test(configured) && !configured.split("/").includes("..") ? configured : "docs/state.md"; } catch { return "docs/state.md"; }
  })();
  if (featureId !== undefined && !FEATURE.test(featureId)) fail("FINISH-FEATURE", "A valid active feature is required.");
  if (featureId === undefined && resumeLifecycleId === null) {
    return stopResult("preflight", "ONESHOT-NO-ACTIVE-FEATURE", "Pipeline State has no active feature, so there is nothing to close.", `if a close was started, rerun with the lifecycle id it printed: ${rerunBase} --resume-lifecycle-id <id>`);
  }
  const common = () => { const value = rawGit(["rev-parse", "--git-common-dir"]); return value === null ? null : resolve(root, value); };
  const failedText = (out) => String(out?.stderr ?? "").trim() || String(out?.stdout ?? "").trim() || "no output";
  // The Critic packet this close was bound to, read back from its audit request and the Critic/Verify receipt that request names; null when either is unreadable.
  const packetOfAuditRequest = (path) => {
    try {
      const lifecycle = JSON.parse(readFileSync(resolve(root, path), "utf8")).criticVerifyLifecycleId;
      const receipt = JSON.parse(readFileSync(join(common(), "agent-pipeline", "critic-verify-lifecycle", `${lifecycle}.json`), "utf8"));
      const known = receipt?.critic?.packetId ?? receipt?.receipt?.critic?.packetId;
      return HEX32.test(known ?? "") ? known : null;
    } catch { return null; }
  };
  // CGF-21: the push gate reads evidence/verify-latest.json bound to the Critic, which the close never writes; the run had to search for the flags. Named at closed-local instead. Never run here: push stays separate.
  const pushEvidenceStep = (closedId) => {
    const packet = criticPacketId ?? packetOfAuditRequest(`specs/${closedId}/evidence/audit-request.json`);
    if (packet === null) return {};
    const out = "evidence/verify-latest.json";
    const argv = [VERIFY_PRODUCER, "--root", root, "--mode", "release", "--critic-packet-id", packet, "--critic-evidence-feature-id", closedId, "--out", out];
    const aside = existsSync(resolve(root, out)) ? ` The producer never overwrites, so first move the existing ${out} aside.` : "";
    return { pushEvidence: { executable: "node", argv, command: `node ${argv.join(" ")}`, note: `Before push-init: this produces the Critic-bound Verify the push gate reads, at the current HEAD.${aside}` } };
  };

  // ---- before the commit: Verify evidence, package, Result block, audit request, then the close itself -------------------------------------------------
  let id = resumeLifecycleId;
  const auditRequestPath = featureId === undefined ? null : `${evidenceDir}/audit-request.json`;
  const closeRequestPath = featureId === undefined ? null : `${evidenceDir}/close-request.json`;
  const verifyPath = featureId === undefined ? null : `${evidenceDir}/verify-candidate.json`;
  if (featureId !== undefined) {
    let criticVerifyLifecycle;
    // C21C (Codex greenfield): the commits a close needs on its way (the proof, its own evidence) move HEAD past the candidate of a package that is
    // already `completed`; a resumed close skipped the evidence stages and then refused with FCA-PACKAGE, with no way out. It now qualifies the new HEAD again.
    const packageManifest = `specs/${featureId}/lifecycle.json`;
    const packageAt = () => {
      let value = null;
      try { value = JSON.parse(readFileSync(resolve(root, packageManifest), "utf8")); } catch { return { state: null, moved: false }; }
      const head = rawGit(["rev-parse", "HEAD"]);
      return { state: value?.state ?? null, moved: typeof value?.candidate?.commit === "string" && head !== null && head !== value.candidate.commit };
    };
    const coordinatorStillBeforePrepared = () => {
      try { return new Set(["active", "checkpointed"]).has(command(runner, process.execPath, [COORDINATOR, "inspect", "--root", root, "--lifecycle", resumeLifecycleId], "ONESHOT-INSPECT")?.coordinator?.phase); } catch { return false; }
    };
    // C23 (Codex greenfield F25): in a project with a session-authority catalogue the Result entries run only on the owner route, which needs a Close lifecycle at
    // checkpointed, so the one-shot opens that lifecycle itself and drives the entries through the route. A rerun finds the open lifecycle again, also one an agent started by hand.
    const coordinatorOf = (lifecycle) => { try { return command(runner, process.execPath, [COORDINATOR, "inspect", "--root", root, "--lifecycle", lifecycle], "ONESHOT-INSPECT"); } catch { return null; } };
    const ownerRouteRequired = (() => { try { return existsSync(join(common(), "agent-pipeline", "session-authority", "catalogue.json")); } catch { return false; } })();
    const onlyOpenLifecycle = () => {
      let names;
      try { names = readdirSync(join(common(), "agent-pipeline", "publication-close")); } catch { return null; }
      const open = names.filter((name) => /^[A-Za-z0-9._-]{1,100}$/u.test(name)).filter((name) => {
        const seen = coordinatorOf(name);
        return seen?.identity?.featureId === featureId && new Set(["active", "checkpointed"]).has(seen?.coordinator?.phase);
      });
      return open.length === 1 ? open[0] : null;
    };
    if (ownerRouteRequired && resumeLifecycleId === null) resumeLifecycleId = onlyOpenLifecycle();
    const ensureOwnerLifecycle = () => {
      const lifecycle = resumeLifecycleId ?? `${featureId}-close`;
      const flags = ["--root", root, "--lifecycle", lifecycle, "--actor", actor];
      const runAction = (planned, code) => command(runner, planned?.nextAction?.executable, planned?.nextAction?.argv, code);
      const seen = coordinatorOf(lifecycle);
      if (seen === null) runAction(command(runner, process.execPath, [COORDINATOR, "plan-start", ...flags, "--close-intent", "durable-stop"], "ONESHOT-OWNER-START-PLAN"), "ONESHOT-OWNER-START-APPLY");
      if (seen === null || seen.coordinator?.phase === "active") runAction(command(runner, process.execPath, [COORDINATOR, "plan-transition", ...flags, "--phase", "checkpointed"], "ONESHOT-OWNER-CHECKPOINT-PLAN"), "ONESHOT-OWNER-CHECKPOINT-APPLY");
      resumeLifecycleId = lifecycle;
      return lifecycle;
    };
    // The first pass stopped before it wrote the requests a resume reads (an agent's hand-started lifecycle has none either): the evidence stages still have to run.
    const firstPassUnfinished = () => !existsSync(resolve(root, auditRequestPath)) || (state.continuity !== null && typeof state.continuity === "object" && !existsSync(resolve(root, closeRequestPath)));
    const requalify = resumeLifecycleId !== null && (packageAt().moved || (ownerRouteRequired && firstPassUnfinished())) && coordinatorStillBeforePrepared();
    const again = requalify ? resumeLifecycleId : null;
    if (resumeLifecycleId === null || requalify) {
      let accepted = null;
      let packet = criticPacketId;
      if (packet === null && requalify) packet = packetOfAuditRequest(auditRequestPath);
      if (packet === null) {
        let found = [];
        try { const dir = common(); found = (deps.listCriticPackets ?? ((c) => readdirSync(join(c, "agent-pipeline", "critic-packets"))))(dir).filter((name) => HEX32.test(name)).sort(); } catch { found = []; }
        if (found.length === 1) packet = found[0];
        else return stopResult("critic-packet", "ONESHOT-CRITIC-PACKET-MISSING", found.length === 0 ? "No consumed Critic packet exists for this repository, so the candidate Verify cannot be bound to a Critic review." : `Several Critic packets exist (${found.join(", ")}); the close will not guess which one reviewed this candidate.`,
          `finish the Critic review (it records the packet), then run: ${rerunBase}${again === null ? "" : ` --resume-lifecycle-id ${again}`} --critic-packet-id <packet-id>`);
      }
      packetForRerun = packet;
      // C28c (PO decision 2026-11-11): the SBOM is a standard part of the close. An existing record is checked, otherwise one is generated from the tracked lockfiles. A finding of any blocking state
      // (stale, invalid, partial, unsupported) stops the close HERE, before the acceptance question or any write, so nothing half-closed is left; only a human's literal override, recorded in the record, lets it pass.
      // Nothing is written yet: the files are written after the candidate Verify, with the other close evidence, from this same result.
      const tracked = runner("git", ["ls-files", "-z"]);
      if (tracked?.status !== 0) return stopResult("sbom", "ONESHOT-SBOM-TRACKED-FILES", failedText(tracked), `rerun the identical command: ${rerun(again)}`);
      const readText = (path) => { try { return readFileSync(resolve(root, path), "utf8"); } catch { return null; } };
      const sbom = closeSbom({ featureId, evidenceDir, tracked: String(tracked.stdout ?? "").split("\0").filter((path) => path !== ""), read: readText, existing: readText(`${evidenceDir}/sbom/record.json`), override: sbomOverride, actor });
      if (sbom.status === "blocked") {
        const helps = [...new Set(sbom.blocks.map((block) => sbomFindingHelp(block)))];
        return stopResult("sbom", sbom.blocks[0].code, sbom.blocks.map((block) => `${block.state} ${block.path}: ${block.reason}`).join("; "),
          `${helps.join(" ")} A human can instead accept the gap: ask them, then rerun with --sbom-override "<the human's literal words>" (the record names every finding it covers and travels in the audit bundle): ${rerun(again)}`);
      }
      // C24 (Claude greenfield): a round that did not pass used to surface only inside Verify, after the Result bootstrap, with no way out named, and a run took a PO's word in chat for an acceptance.
      let standing = null;
      try { standing = command(runner, process.execPath, [COORDINATOR, "critic-standing", "--root", root, "--packet", packet], "ONESHOT-CRITIC-STANDING"); } catch { standing = null; /* the close keeps its own check */ }
      if (standing?.status === "failed" && !state.residualAcceptance?.lastAccepted) {
        const signed = ` Under a signature gate that step also needs --proof-request, --proof-authority and --proof, which the PO's terminal prepares with node ${join(dirname(STATE_WRITER), "po-human-approval.mjs")} authorize-critical --kind accept-residual-critic-findings --critic-packet ${packet} and that command's usual flags.`;
        const acceptance = standing.blockers > 0 ? "A blocker can never be accepted."
          : standing.majors > 0 ? `A major can be accepted only when no commit can correct it (the PO's own attended step: node ${STATE_WRITER} approve-residual-acceptance --by <name> --critic-packet ${packet} --reason-class uncorrectable-past-authorship); a major that a commit can correct has to be corrected.${signed}`
            : `Only minor findings are open, so the PO may instead accept them in the PO's own attended step: node ${STATE_WRITER} approve-residual-acceptance --by <name> --critic-packet ${packet}.${signed}`;
        return stopResult("critic-standing", "ONESHOT-CRITIC-NOT-PASSED", `The Critic round ${packet} did not pass (${standing.blockers} blocker, ${standing.majors} major, ${standing.minors} minor) and no PO residual acceptance is on record, so this candidate cannot close. A statement in chat is not an acceptance.`,
          `nothing was written; correct the findings through a dispatch, run a Critic delta round on the new candidate, then run: ${rerunBase}${again === null ? "" : ` --resume-lifecycle-id ${again}`} --critic-packet-id <new-packet-id>. ${acceptance}`);
      }
      // C21B: a Continuity feature without a bound Result cannot pass the Result close block below; stop BEFORE Verify, so no partial close evidence has to be cleaned up by hand.
      if (state.continuity !== null && typeof state.continuity === "object" && state.continuity.queueHead?.nextAction !== "close" && !state.continuity.authority?.result) {
        if (ownerRouteRequired) {
          let lifecycle;
          try { lifecycle = ensureOwnerLifecycle(); } catch (error) { return stopResult("result-bootstrap", error.refusalCode ?? error.code, error.message, repairFor(error, again)); }
          const route = `node ${OWNER_ROUTE} run --root ${root} --lifecycle ${lifecycle} --`;
          return stopResult("result-bootstrap", "ONESHOT-RESULT-NOT-BOUND", `Continuity authority.result is null, so this feature has no bound Implementation Result. This project has a session-authority catalogue, so the State entries run on the owner route; the Close lifecycle ${lifecycle} it needs is open and nothing in the work tree was written.`,
            `in the project root ${root}: (1) ${route} continuity-result-bootstrap-plan; (2) run the applyAction it returns on the same route, that is ${route} followed by its argv from the second element on; (3) when its completion prints a reconcileCommand, run it, and a plan that needs the PO also prints the signatureCommand for the PO; (4) node ${join(dirname(STATE_WRITER), "commit-pipeline-owned.mjs")} --root ${root} --agent; (5) ${rerun(lifecycle)}`);
        }
        return stopResult("result-bootstrap", "ONESHOT-RESULT-NOT-BOUND", "Continuity authority.result is null, so this feature has no bound Implementation Result; nothing was written.",
          `in the project root ${root} (the first command takes no flags and reads the working directory): (1) node ${STATE_WRITER} continuity-result-bootstrap-plan; (2) run the applyAction it returns; (3) when its completion prints a reconcileCommand, run it, and a plan that needs the PO also prints the signatureCommand for the PO; (4) node ${join(dirname(STATE_WRITER), "commit-pipeline-owned.mjs")} --root ${root} --agent; (5) ${rerun(null)}`);
      }
      // C21C: the missing PO acknowledgement of a caller-authored Critic used to surface only inside the close, after Verify and the package move. Its signature needs
      // a clean tree, so the close's evidence had to be committed and the bound candidate went stale. Named here, it stops before anything was written.
      let acknowledgementGap = null;
      try {
        const independence = command(runner, process.execPath, [COORDINATOR, "critic-independence", "--root", root, "--packet", packet], "ONESHOT-CRITIC-INDEPENDENCE");
        if (independence?.status === "acknowledgement-required") acknowledgementGap = String(independence.message ?? "");
      } catch { acknowledgementGap = null; /* the close keeps its own check */ }
      if (acknowledgementGap !== null) {
        // C21E: the signing command behind this acknowledgement refuses a dirty tree, and the PO should not find that out by entering a passphrase. The raw runner keeps the status column intact; rawGit trims it away.
        const porcelain = runner("git", ["status", "--porcelain=v1", "--untracked-files=all"]);
        const dirty = porcelain?.status === 0 ? String(porcelain.stdout ?? "").split("\n").filter((line) => line !== "").map((line) => line.slice(3)) : [];
        const dirtyNote = dirty.length === 0 ? "" : `first commit the ${dirty.length} uncommitted path(s) or move them out of the work tree, because the signing command refuses a dirty tree (${dirty.slice(0, 8).join(", ")}${dirty.length > 8 ? ", ..." : ""}); `;
        return stopResult("critic-acknowledgement", "CLOSE-CRITIC-CALLER-AUTHORED", acknowledgementGap, `nothing was written; ${dirtyNote}record the acknowledgement as the reason says, then rerun the identical command: ${rerun(again)}`);
      }
      // C21E: the close writes the Critic addenda itself, and their commit moves HEAD. Doing that here, before Verify, keeps the candidate of the Verify below current.
      let addenda = null;
      try { addenda = command(runner, process.execPath, [COORDINATOR, "critic-addenda", "--root", root], "ONESHOT-CRITIC-ADDENDA"); } catch { addenda = null; /* the close keeps its own check */ }
      if (addenda?.status === "written") {
        const steps = writerCommitSteps(addenda.commitPaths, addenda.subject);
        steps[0] = steps[0].replace("git add --", "git add -f --");
        return Object.freeze({ schema: "pipeline.one-shot-close.v1", status: "commit-required", featureId, lifecycleId: again, resumeLifecycleId: again, stages: [...stages, "critic-addenda"],
          commit: { paths: addenda.commitPaths, excluded: [], capability: null, message: addenda.subject, steps }, next: rerun(again),
          message: "The close derived the Critic addenda from the passed review and wrote them; Verify has not run yet. Run the commit, then the next command. Do not build addenda by hand." });
      }
      // C22 (CGR-06): the human acceptance. The stop belongs here because nothing has been written yet (a stop costs no Verify and no cleanup), HEAD is final (the addenda commit above moved it) and the
      // irreversible State close is still ahead. A resumed close (past the prepared stages) never enters this branch, so it never asks twice and a close already running is not broken. An acceptance recorded for
      // this very candidate (committed or still uncommitted) is kept; a changed candidate asks again. Nothing is signed: the answer is an attribution record in the feature's acceptance.md.
      const candidateHead = rawGit(["rev-parse", "HEAD"]);
      if (candidateHead === null) return stopResult("acceptance", "ONESHOT-HEAD-UNREADABLE", "The candidate commit (HEAD) could not be read, so the acceptance cannot be bound to it.", `repair the repository, then rerun the identical command: ${rerun(again)}`);
      // C28 (AC-108, PO decision 2026-11-10 'Ablehnung im Close'): one fixed yes form. An answer that is not exactly that form is never an acceptance and no keyword is searched in it; the way out is the decline.
      const yesForm = acceptanceYesForm(state.continuity?.runtime?.humanFacingLanguage);
      const named = openChecks === null ? "" : ` --open-checks ${JSON.stringify(openChecks.join("; "))}`;
      const bothWays = `if the human answered exactly "${yesForm}", rerun the identical command: ${rerun(again)}${named} --human-acceptance "${yesForm}". Any other answer (a bug, a change request, a doubt, a question) is a decline, not an acceptance: rerun the identical command with ${rerun(again)}${named} --human-decline "<the human's literal answer>"; the feature then returns to a correction round without reopening the design.`;
      if (humanDecline !== null) {
        const declineRepair = (error) => `${error.refusalMessage ? `${error.refusalMessage} -- then` : "repair the refusal above, then"} rerun the identical command with --human-decline "<the human's literal answer>": ${rerun(again)}${named}`;
        stages.push("decline-record");
        let decline;
        try { decline = writeDeclineRecord({ root, featureId, record: { candidate: candidateHead, answer: humanDecline, openChecks: openChecksOf(openChecks) }, ...(deps.nowFn === undefined ? {} : { now: deps.nowFn }) }); }
        catch (error) { return stopResult("decline", "ONESHOT-DECLINE-RECORD", error.message, declineRepair(error)); }
        const bound = state.continuity !== null && typeof state.continuity === "object" ? state.continuity.authority?.result ?? null : null;
        let retired = null; let lifecycle = again;
        if (bound !== null) {
          stages.push("retire-result");
          try {
            const flags = ["--result-path", bound.path, "--decline-record", decline.path];
            let applyAction;
            if (ownerRouteRequired) {
              lifecycle = ensureOwnerLifecycle();
              const route = [OWNER_ROUTE, "run", "--root", root, "--lifecycle", lifecycle, "--"];
              const plan = command(runner, process.execPath, [...route, "continuity-result-retire-plan", ...flags], "ONESHOT-RETIRE-PLAN");
              if (!Array.isArray(plan.applyAction?.argv)) fail("ONESHOT-RETIRE-PLAN", "The Result retire plan returned no apply action.");
              applyAction = { executable: process.execPath, argv: [...route, ...plan.applyAction.argv.slice(1)] };
            } else {
              const plan = command(runner, process.execPath, [STATE_WRITER, "continuity-result-retire-plan", ...flags], "ONESHOT-RETIRE-PLAN");
              if (!Array.isArray(plan.applyAction?.argv)) fail("ONESHOT-RETIRE-PLAN", "The Result retire plan returned no apply action.");
              applyAction = { executable: plan.applyAction.executable, argv: plan.applyAction.argv };
            }
            // The transition also restores result.md to the text before the bootstrap block and takes the package manifest's Result digest back with it: nothing is left to reconcile.
            command(runner, applyAction.executable, applyAction.argv, "ONESHOT-RETIRE-APPLY");
            retired = { path: bound.path, sha256: bound.sha256, apply: applyAction };
          } catch (error) { return stopResult("retire-result", error.refusalCode ?? error.code, error.message, declineRepair(error), { decline: { path: decline.path, sha256: decline.sha256, candidate: candidateHead } }); }
        }
        // C28 (PO decision 2026-11-11, replaces the label-only handling of the record lag): the package record must not keep saying `verifying` or `completed` while the feature is back in a
        // correction round. State now proves the round (a retirement of the reason declined-acceptance, no Result bound), so the planner admits the move to `implementing`; the second
        // move to `verifying` rebinds the candidate as always. Idempotent: a package that is already past this step (implementing, draft, ...) is left alone.
        let packageBack = null;
        try {
          const packageManifest = `specs/${featureId}/lifecycle.json`;
          let packageState = null;
          try { const value = JSON.parse(readFileSync(resolve(root, packageManifest), "utf8")).state; packageState = typeof value === "string" ? value : null; } catch { packageState = null; }
          if (packageState === "verifying" || packageState === "completed") {
            stages.push("package-correction-round");
            const plan = command(runner, process.execPath, [STATE_WRITER, "feature-package-plan", "--root", root, "--manifest", packageManifest, "--next-state", "implementing"], "ONESHOT-PACKAGE-PLAN");
            if (typeof plan.planSha256 !== "string") fail("ONESHOT-PACKAGE-PLAN", "The package plan for the correction round returned no plan digest.");
            command(runner, process.execPath, [STATE_WRITER, "feature-package-apply", "--root", root, "--manifest", packageManifest, "--next-state", "implementing", "--plan-sha256", plan.planSha256], "ONESHOT-PACKAGE-APPLY");
            packageBack = { manifest: packageManifest, from: packageState, to: "implementing" };
          }
        } catch (error) {
          // Never a stop: the decline itself (the record and the retired Result) is done and must not be blocked by this side step. The failure is reported in the result, and the four-status
          // projection (`featureStatus.recordLag`) keeps the lagging record visible until the move to `implementing` is made by hand (feature-package-plan / feature-package-apply).
          packageBack = { manifest: `specs/${featureId}/lifecycle.json`, to: "implementing", error: String(error.refusalCode ?? error.code ?? "ONESHOT-PACKAGE"), detail: String(error.message ?? "").slice(0, 300) };
        }
        // The decline's own outputs travel in one commit through the writer-commit capability the close uses; none of them is an output the leftover rollback below names.
        const status = runner("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", statePath, `specs/${featureId}`]);
        const tokens = (status?.status === 0 ? String(status.stdout ?? "") : "").split("\0").filter((token) => token !== "");
        const paths = []; for (let index = 0; index < tokens.length; index += 1) { const code = tokens[index].slice(0, 2); paths.push(tokens[index].slice(3)); if (/[RC]/u.test(code)) index += 1; }
        paths.sort();
        const message = `chore(close): record the declined acceptance of ${featureId}`;
        let armed = null;
        if (paths.length > 0) { try { armed = armWriterCommitCapability({ rootDir: root, writer: "finish-feature.mjs --one-shot", rerun: rerun(lifecycle), files: paths.filter((path) => existsSync(resolve(root, path))).map((path) => ({ path, sha256: sha256Hex(readFileSync(resolve(root, path))) })) }); } catch { armed = null; } }
        const commit = { paths, excluded: armed?.excluded ?? [], capability: armed?.id ?? null, message, steps: paths.length > 0 ? writerCommitSteps(paths, message) : [] };
        const next = [
          commit.paths.length > 0 ? `commit the decline outputs, nothing else (the pre-commit hook admits exactly these bytes): ${commit.steps.join(" && ")}` : "nothing to commit: the decline wrote no tracked output",
          `correction dispatch: build the Goldfish briefing with node ${PREPARE_DISPATCH} goldfish --root ${root} (the human's literal words, recorded in ${decline.path}, are the correction request), run it, and commit its result`,
          `Critic delta round on the new candidate: node ${PREPARE_DISPATCH} critic --delta-request <the delta request path> --root ${root} (see the critic-review skill); the packet it consumes is the new packet`,
          `then run the identical close command with the new packet: ${rerunBase} --critic-packet-id <new-packet-id>; it runs the Result bootstrap again and asks the acceptance question again for the new candidate`,
        ];
        return Object.freeze({ schema: "pipeline.one-shot-close.v1", status: "declined", featureId, lifecycleId: lifecycle ?? null, resumeLifecycleId: lifecycle ?? null, stages: [...stages], decline: { path: decline.path, sha256: decline.sha256, candidate: candidateHead }, retired, packageBack, commit, next,
          message: "The acceptance was declined: the human's words are recorded (not as an acceptance), the bound Result is retired and the feature returns to a correction round without reopening the design. Nothing was verified, closed, signed or pushed. Follow `next` in order." });
      }
      if (humanAcceptance !== null && !isAcceptanceYes(humanAcceptance, yesForm)) {
        return stopResult("acceptance", "ONESHOT-ACCEPTANCE-NOT-YES", `The answer given with --human-acceptance is not the fixed yes form "${yesForm}" (case, surrounding space and a closing . or ! do not matter), so it is not recorded as an acceptance.`,
          `nothing was written. ${bothWays} The answer is recorded as an attribution record in the feature's acceptance record only for the yes form; nothing is signed.`);
      }
      const recorded = readAcceptanceRecord(root, featureId);
      if (recorded !== null && recorded.candidate === candidateHead) accepted = { candidate: candidateHead, answer: recorded.answer, openChecks: recorded.openChecks };
      else if (humanAcceptance !== null) accepted = { candidate: candidateHead, answer: humanAcceptance, openChecks: openChecksOf(openChecks) };
      else {
        return stopResult("acceptance", "ONESHOT-ACCEPTANCE-REQUIRED", acceptanceQuestion({ featureId, candidate: candidateHead, openChecks: openChecksOf(openChecks), form: yesForm }),
          `nothing was written. In the same message, say in one line how you really started or opened the delivered result and what it showed, whatever kind of result it is, or say plainly that you could not and why, and then also name it with --open-checks. Ask the human exactly this one sentence in the chat (reason above), then ${bothWays} If a check you know about is missing from the sentence (for example a real device check), first rerun with --open-checks "<check; check>" so the sentence names it, then ask. The answer is recorded in the feature's acceptance record as an attribution record; nothing is signed.`);
      }
      // CFC-2: a run that stopped after these stages leaves its own uncommitted outputs, the Verify below then reads "dirty", and a Claude run committed them in two commits, which ended the Critic carry-forward
      // (VEP-CVL-CARRY-RANGE; a human had to reset). Only a tree whose every dirty path is such an output, with an evidence file proving an earlier attempt, is rolled back; the stages write the same again.
      // C22: the acceptance record is such an output too (the answer is already held in `accepted`, and written again after the package moves below).
      const ownOutputs = new Set([packageManifest, auditRequestPath, closeRequestPath, verifyPath, acceptanceTarget(root, featureId).path, `specs/${featureId}/acceptance.md`, `${evidenceDir}/human-acceptance.md`, `${evidenceDir}/dispatch-projection.json`, ...SBOM_OUTPUTS.map((name) => `${evidenceDir}/sbom/${name}`)]);
      const leftovers = runner("git", ["status", "--porcelain=v1", "--untracked-files=all"]);
      const dirtyOutputs = leftovers?.status === 0 ? String(leftovers.stdout ?? "").split("\n").filter((line) => line !== "").map((line) => ({ tracked: !line.startsWith("??"), path: line.slice(3) })) : [];
      if (dirtyOutputs.some(({ tracked, path }) => !tracked && (path === auditRequestPath || path === verifyPath)) && dirtyOutputs.every(({ path }) => ownOutputs.has(path))) {
        stages.push("discard-own-leftovers");
        for (const { tracked, path } of dirtyOutputs) {
          if (tracked) runner("git", ["checkout", "--", path]); else rmSync(resolve(root, path), { force: true });
        }
      }
      if (requalify) stages.push("requalify-candidate");
      stages.push("verify-candidate");
      const verify = runner(process.execPath, [VERIFY_PRODUCER, "--root", root, "--mode", "candidate", "--critic-packet-id", packet, "--critic-evidence-feature-id", featureId, "--out", verifyPath]);
      if (verify?.status !== 0) return stopResult("verify-candidate", "ONESHOT-VERIFY-RED", failedText(verify), `fix what the Verify output names without committing, then rerun the identical command: ${rerun(again)}`);
      stages.push("register-verify-evidence");
      const register = runner(process.execPath, [REGISTER_PACKAGE, "--root", root, "--add-verify-evidence", verifyPath]);
      if (register?.status !== 0) return stopResult("register-verify-evidence", "ONESHOT-REGISTER-FAILED", failedText(register), `register the evidence by hand to see the typed refusal: node ${REGISTER_PACKAGE} --root ${root} --add-verify-evidence ${verifyPath}`);
      const manifest = packageManifest;
      // C21C: a rerun finds the package where the last one left it. Unmoved it goes on from there; moved past its candidate it goes back through `verifying`, which rebinds it.
      const { state: packageState, moved: packageMoved } = packageAt();
      const packageMoves = packageState === "completed" ? (packageMoved ? ["verifying", "completed"] : [])
        : packageState === "verifying" ? (packageMoved ? ["implementing", "verifying", "completed"] : ["completed"])
          : ["verifying", "completed"];
      for (const nextState of packageMoves) {
        stages.push(`feature-package-${nextState}`);
        try {
          const plan = command(runner, process.execPath, [STATE_WRITER, "feature-package-plan", "--root", root, "--manifest", manifest, "--next-state", nextState], "ONESHOT-PACKAGE-PLAN");
          command(runner, process.execPath, [STATE_WRITER, "feature-package-apply", "--root", root, "--manifest", manifest, "--next-state", nextState, "--plan-sha256", plan.planSha256], "ONESHOT-PACKAGE-APPLY");
        } catch (error) { return stopResult(`feature-package-${nextState}`, error.refusalCode ?? error.code, error.message, `nothing was committed; ${repairFor(error, again)}`); }
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
      // C22 (CGR-06): after the Verify and the package moves, so the Verify ran on the tree the candidate names; the record then travels in the one close commit (specs/<feature>).
      stages.push("acceptance-record");
      writeAcceptanceRecord({ root, featureId, record: accepted, ...(deps.nowFn === undefined ? {} : { now: deps.nowFn }) });
      // C22 (CGR-12): every Critic round of the feature: the tracked exports (specs/<feature>/evidence/critic/<packet>/report.md), the rounds of the registered lineage files and the packet this close is bound to.
      // A round whose report was never exported (it lived only in a scratch directory) is named with a null path, so the bundle README states what is missing instead of omitting it.
      const rounds = new Map();
      const listed = (relative) => { try { return readdirSync(resolve(root, relative)); } catch { return []; } };
      for (const name of listed(`${evidenceDir}/critic`).filter((entry) => HEX32.test(entry))) rounds.set(name, existsSync(resolve(root, `${evidenceDir}/critic/${name}/report.md`)) ? `${evidenceDir}/critic/${name}/report.md` : null);
      for (const name of listed(evidenceDir).filter((entry) => /^critic-lineage-[a-f0-9]{64}\.json$/u.test(entry))) {
        let text = ""; try { text = readFileSync(resolve(root, `${evidenceDir}/${name}`), "utf8"); } catch { text = ""; }
        for (const match of text.matchAll(/"packetId"\s*:\s*"([a-f0-9]{32})"/gu)) if (!rounds.has(match[1])) rounds.set(match[1], null);
      }
      if (!rounds.has(packet)) rounds.set(packet, null);
      // PO tile 2026-11-10: the close fetches what is missing from the private journal itself, inside the one close commit. A round that cannot be exported stays named with a null path; this never stops the close.
      for (const [packetId, reportPath] of [...rounds]) {
        if (reportPath !== null) continue;
        const outDir = `${evidenceDir}/critic/${packetId}`;
        try { (deps.exportCriticRoundFn ?? exportCriticRoundFromJournal)({ root, packetId, outDir }); rounds.set(packetId, `${outDir}/report.md`); } catch { /* named in the bundle README as not exported */ }
      }
      const criticReports = [...rounds].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([packetId, path]) => ({ packetId, path }));
      // C28 (AC-108, WSL run): the tracked, redacted projection of the feature's dispatches (briefing texts with digests, dispatch records) goes into the feature's evidence directory, so it travels in the
      // one close commit and the bundle carries it. Nothing to project, or a source that cannot be read, writes nothing and never stops the close.
      let dispatchProjectionPath = null;
      try {
        const projection = projectCloseDispatches({ featureId, ...(deps.closeDispatchInputsFn ?? readCloseDispatchInputs)(root) });
        if (projection.dispatches.length > 0 || projection.gaps.length > 0) {
          const target = `${evidenceDir}/dispatch-projection.json`;
          mkdirSync(dirname(resolve(root, target)), { recursive: true }); writeFileSync(resolve(root, target), closeDispatchProjectionBytes(projection));
          dispatchProjectionPath = target; stages.push("dispatch-projection");
        }
      } catch { dispatchProjectionPath = null; }
      stages.push("sbom");
      for (const file of sbom.files) { mkdirSync(dirname(resolve(root, file.path)), { recursive: true }); writeFileSync(resolve(root, file.path), file.text); }
      const sbomRecordPath = sbom.recordPath;
      stages.push("audit-request");
      writeRepoJson(root, auditRequestPath, { schema: "pipeline.feature-close-audit-request.v1", manifestPath: manifest, coreVersion, packs: ["pipeline-core-baseline"], criticVerifyLifecycleId: criticVerifyLifecycle, evidence: { criticReports, ...(dispatchProjectionPath === null ? {} : { dispatchProjectionPath }), sbomRecordPath } });
      if (state.continuity !== null && typeof state.continuity === "object") {
        let current = state;
        if (state.continuity.queueHead?.nextAction !== "close") {
          stages.push("result-close-block");
          const result = state.continuity.authority?.result;
          try {
            const flags = ["--feature-id", featureId, "--expected-revision", String(state.continuity.revision), "--result-path", result?.path, "--result-sha256", result?.sha256];
            if (ownerRouteRequired) {
              const route = [OWNER_ROUTE, "run", "--root", root, "--lifecycle", ensureOwnerLifecycle(), "--"];
              const plan = command(runner, process.execPath, [...route, "continuity-result-close-plan", ...flags], "ONESHOT-RESULT-CLOSE-PLAN");
              if (!Array.isArray(plan.applyAction?.argv)) fail("ONESHOT-RESULT-CLOSE-PLAN", "The Result close plan returned no apply action.");
              command(runner, process.execPath, [...route, ...plan.applyAction.argv.slice(1)], "ONESHOT-RESULT-CLOSE-APPLY");
            } else {
              const plan = command(runner, process.execPath, [STATE_WRITER, "continuity-result-close-plan", ...flags], "ONESHOT-RESULT-CLOSE-PLAN");
              command(runner, plan.applyAction?.executable, plan.applyAction?.argv, "ONESHOT-RESULT-CLOSE-APPLY");
            }
          } catch (error) {
            return stopResult("result-close-block", error.refusalCode ?? error.code, error.message, repairFor(error, resumeLifecycleId));
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
    // C22: the calibrated handover is part of the one close commit when the close rewrote it (CGF-12).
    const status = runner("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", statePath, `specs/${closedFeatureId}`, `audit-bundles/${closedFeatureId}`, ...(existsSync(resolve(root, handoverPath)) ? [handoverPath] : [])]);
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
    // C22 (CGF-12, CGF-29): the calibrated handover is brought to the closed state by its existing writer (pipeline-state.mjs update-public-handover) BEFORE its bytes are digested, so the handover that is
    // committed no longer reads as active in design or implementation. A project whose handover does not exist, or whose layout the writer cannot update, is never blocked: the result names it.
    let handover = null;
    if (existsSync(resolve(root, handoverPath))) {
      stages.push("update-public-handover");
      const updated = runner(process.execPath, [STATE_WRITER, "update-public-handover"]);
      handover = { path: handoverPath, status: updated?.status === 0 ? "current" : "not-updated", ...(updated?.status === 0 ? {} : { reason: failedText(updated).slice(0, 300) }) };
    }
    // C22 (CGR-22): the minors of the Critic round this close is bound to are what the close leaves open (a later round supersedes an earlier one: the lineage marks carried findings fixed on a pass).
    // They go into the calibrated handover before its digest, so they travel in the one close commit. Never blocks: a packet that cannot be read adds nothing, and the line still reports what is listed.
    let openMinors = null;
    if (existsSync(resolve(root, handoverPath))) {
      try {
        const bound = criticPacketId ?? packetOfAuditRequest(`specs/${closedFeatureId}/evidence/audit-request.json`);
        const readResult = deps.readConsumedCandidateResultFn ?? readConsumedCandidateResult;
        const consumed = bound === null ? null : readResult({ controlRoot: join(common() ?? root, "agent-pipeline", "critic-packets"), packetId: bound });
        const entries = consumed === null ? [] : minorsFromVerdictFindings({ featureId: closedFeatureId, packetId: bound, findings: consumed.result.verdict.findings });
        if (entries.length > 0) recordOpenMinors({ root, handoverPath, entries });
      } catch { /* the close line below reports only what the handover really lists */ }
      openMinors = openMinorsCloseLine(summarizeOpenMinors({ root, handoverPath }), handoverPath);
    }
    // C22 (CGR-05): hash what exists. Measured, the project-defined files are the calibrated handover and the telemetry ledger the close-feature skill names (telemetry/costs.md); a project has no defined
    // file for backlog, history or retrospective (the backlog is a directory), so those keep the marked empty digest (PO rule 2026-11-01). Only resultSha256 and pipelineStateSha256 are compared by the coordinator.
    const digestOf = (relative) => { try { return sha256Hex(readFileSync(resolve(root, relative))); } catch { return EMPTY_SHA256; } };
    const trackedDigests = { resultSha256: sha256Hex(resultBytes), backlogSha256: EMPTY_SHA256, handoverSha256: digestOf(handoverPath), historySha256: EMPTY_SHA256, telemetrySha256: digestOf("telemetry/costs.md"), retrospectiveSha256: EMPTY_SHA256, pipelineStateSha256: sha256Hex(readFileSync(resolve(root, statePath))) };
    writeRepoJson(root, trackedPath, { schema: "pipeline.close-tracked-effects.v1", ...trackedDigests, emptyInputs: Object.keys(trackedDigests).filter((key) => trackedDigests[key] === EMPTY_SHA256).sort() });
    const tracked = step("tracked-close-finalized", () => transition("tracked-close-finalized", { evidence: trackedPath })); if (tracked.stop) return tracked.stop;
    const commit = commitFacts();
    return Object.freeze({ schema: "pipeline.one-shot-close.v1", status: "commit-required", featureId: closedFeatureId, lifecycleId: id, resumeLifecycleId: id, stages, commit, ...(handover === null ? {} : { handover }), ...(openMinors === null ? {} : { openMinors }),
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
      // PO tile 2026-11-10: the exact bytes those digests name, kept next to the record: a later scan may overwrite the working-tree files, and the evidence follow-up carries these.
      for (const { source, copy } of Object.values(FOLLOWUP_EVIDENCE)) writeFileSync(join(directory, copy), readFileSync(resolve(root, source)), { mode: 0o600 });
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
    // C22B (CGR-13, CGF-12): the commits of the feature range counted by kind (the commits themselves stay as they are), and the three statuses read from what exists: the coordinator's phase, the acceptance
    // record and the fact that this close never pushes. Neither can block the close: a count that cannot be read is typed unavailable.
    let commits; try { commits = featureRangeCommitSplit({ rootDir: root, featureId: closedFeatureId, runGit: (args) => runner("git", args) }); } catch { commits = { schema: CLOSE_COMMIT_SPLIT_SCHEMA, status: "unavailable", reason: "the range could not be read" }; }
    let acceptance = null; try { acceptance = readAcceptanceRecord(root, closedFeatureId); } catch { acceptance = null; }
    const closeStatus = { technicalClose: { status: phase, source: "close coordinator phase" },
      productAcceptance: acceptance === null ? { status: "not-recorded", source: "the feature's acceptance record" } : { status: "recorded", candidate: acceptance.candidate, openChecks: acceptance.openChecks, source: acceptance.path },
      push: { status: "not-done-by-the-close", source: "the close never pushes; publication and push are separate human-gated steps" } };
    // C28: the same four-fact vocabulary the State inspector prints (a closed feature: the acceptance names the candidate it was given for, so no HEAD comparison).
    let closedPackageState = null; try { const value = JSON.parse(readFileSync(resolve(root, `specs/${closedFeatureId}/lifecycle.json`), "utf8")).state; closedPackageState = typeof value === "string" ? value : null; } catch { closedPackageState = null; }
    closeStatus.statuses = featureStatusVocabulary({ packageState: closedPackageState, closed: true, acceptedCandidate: acceptance?.candidate ?? null });
    let securityDocument = null; try { securityDocument = JSON.parse(readFileSync(resolve(root, "evidence/security-latest.v2.verdict.json"), "utf8")); } catch { securityDocument = null; }
    const securityScope = closeSecurityScope(securityDocument);
    const securitySentence = describeCloseSecurityScope(securityScope);
    // R9: a project with a remote whose calibration still says local-only. Named here, never fixed here. C28-ONBOARDING-QUESTIONS: the push setup offers the switch as its own agent step and the push continues in the same feature (the Critic carry admits exactly that one-token commit).
    let declaredMode = null; try { declaredMode = declaredRepositoryMode(root)?.mode ?? null; } catch { declaredMode = null; }
    const remotes = declaredMode === "local-only" ? String(rawGit(["remote"]) ?? "").split(/\r?\n/u).map((line) => line.trim()).filter(Boolean) : [];
    const repositoryMode = remotes.length === 0 ? null : { declared: "local-only", remotes, status: "calibration-behind-the-remote", next: "Correct it before the push, in this same feature, as its own commit with repository-mode-promote.mjs --root <repo> --to remote-tracked (push-init names the step; no signature): the Critic carry admits exactly that one-token change, and Verify runs again on the new HEAD." };
    return Object.freeze({ schema: "pipeline.one-shot-close.v1", status: "closed-local", featureId: closedFeatureId, lifecycleId: id, stages, closeStatus, securityScope, commits, ...(repositoryMode === null ? {} : { repositoryMode }), ...pushEvidenceStep(closedFeatureId),
      message: `The feature is closed locally. Technical close: ${phase}. Product acceptance: ${acceptance === null ? "not recorded" : "recorded"}. Push: not done by the close. Status: ${closeStatus.statuses.summary}. ${describeCommitSplit(commits)}${securitySentence === "" ? "" : ` ${securitySentence}`}${repositoryMode === null ? "" : ` The calibration still says local-only although a remote exists (${remotes.join(", ")}): ${repositoryMode.next}`} Publication, push and release are separate human-gated steps and were not touched. To prepare the push, run pushEvidence.command when it is present, then push-init.` });
  }
  return stopResult("inspect", "ONESHOT-PHASE-UNEXPECTED", `The close coordinator is in phase ${phase}, which this command does not continue from.`, `inspect it: node ${COORDINATOR} drive --root ${root} --lifecycle ${id} --actor ${JSON.stringify(actor)}`, { resumeLifecycleId: id });
}

/**
 * `--stage` (C28c, PO decision 2026-11-11), the last argument of `--one-shot`: when the result names the commit the close needs (status commit-required, or the commit-pending stop),
 * stage exactly `commit.paths` with the add form its own first step prescribes (`git add -f --` when it says so), and report them in `staged`. It never commits: the commit
 * stays the caller's one step (the pre-commit hook admits exactly these bytes), and nothing else in the tree is staged. A path that cannot be staged stops the staging and is named.
 */
export function stageOneShotCommit(root, result) {
  const paths = result?.commit?.paths;
  if (!Array.isArray(paths) || paths.length === 0 || (result.status !== "commit-required" && result.stop?.code !== "ONESHOT-COMMIT-PENDING")) return result;
  const force = typeof result.commit.steps?.[0] === "string" && result.commit.steps[0].startsWith("git add -f --");
  const staged = [];
  for (const path of paths) {
    if (typeof path !== "string" || path === "" || isAbsolute(path) || path.split("/").includes("..")) return { ...result, staged, stageRefused: String(path) };
    const added = spawnSync("git", ["-C", root, "add", ...(force ? ["-f"] : []), "--", path], { encoding: "utf8", shell: false, timeout: 10000 });
    if (added.status !== 0) return { ...result, staged, stageRefused: path };
    staged.push(path);
  }
  return { ...result, staged };
}

function parseOneShot(argvWithStage) {
  const stage = argvWithStage.length > 0 && argvWithStage.at(-1) === "--stage";
  const argv = stage ? argvWithStage.slice(0, -1) : argvWithStage;
  const allowed = ["--root", "--by", "--architecture-impact", "--critic-packet-id", "--resume-lifecycle-id", "--human-acceptance", "--human-decline", "--open-checks", "--sbom-override"]; const value = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]; const next = argv[i + 1];
    if (!allowed.includes(flag) || next === undefined || next.startsWith("--") || Object.hasOwn(value, flag)) fail("FINISH-USAGE", "Usage: finish-feature.mjs --one-shot --by <name> --architecture-impact <value> [--root <repo>] [--critic-packet-id <32-hex>] [--resume-lifecycle-id <id>] [--open-checks \"<check; check>\"] [--human-acceptance \"<exactly the fixed yes form>\" | --human-decline \"<the human's literal answer>\"] [--sbom-override \"<the human's literal words accepting a blocked SBOM>\"] [--stage] (the first call stops once with the acceptance question for the human; a SBOM finding that blocks the close is named with its repair, and only the human's override passes it; --stage, last, stages exactly the paths of the commit the result asks for and never commits)");
    value[flag] = next;
  }
  return { rootDir: value["--root"] ?? process.cwd(), by: value["--by"], architectureImpact: value["--architecture-impact"], criticPacketId: value["--critic-packet-id"] ?? null, resumeLifecycleId: value["--resume-lifecycle-id"] ?? null, humanAcceptance: value["--human-acceptance"] ?? null, humanDecline: value["--human-decline"] ?? null, openChecks: value["--open-checks"] === undefined ? null : value["--open-checks"].split(";"), sbomOverride: value["--sbom-override"] ?? null, stage };
}

function parse(argv) {
  const value = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]; const next = argv[i + 1];
    if (!["--root", "--by", "--architecture-impact", "--audit-request", "--critic-verify-lifecycle", "--continuity-close-request", "--resume-lifecycle-id"].includes(flag) || next === undefined || next.startsWith("--") || Object.hasOwn(value, flag)) fail("FINISH-USAGE", "Usage: finish-feature.mjs --one-shot --by <name> --architecture-impact <value> [--root <repo>] [--critic-packet-id <32-hex>] [--resume-lifecycle-id <id>] (the normal close on every runner; it collects the evidence itself). With every input already at hand: finish-feature.mjs --root <repo> --by <name> --architecture-impact <value> --audit-request <repo-relative-json> --critic-verify-lifecycle <receipt-id> [--continuity-close-request <repo-relative-json>] [--resume-lifecycle-id <id>]");
    value[flag] = next;
  }
  return { rootDir: value["--root"] ?? process.cwd(), by: value["--by"], architectureImpact: value["--architecture-impact"], auditRequest: value["--audit-request"], criticVerifyLifecycle: value["--critic-verify-lifecycle"], continuityCloseRequest: value["--continuity-close-request"] ?? null, resumeLifecycleId: value["--resume-lifecycle-id"] ?? null };
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === "--one-shot") {
  // P3: the one agent command. JSON on stdout; the commit steps or the stop with its repair on stderr; exit 2 when stopped.
  try {
    const parsed = parseOneShot(process.argv.slice(3));
    const closed = oneShotClose(parsed);
    const result = parsed.stage ? stageOneShotCommit(realpathSync(resolve(parsed.rootDir)), closed) : closed;
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status === "stopped") { process.stderr.write(`finish-feature --one-shot: stopped at ${result.stage}: ${result.stop.code}: ${result.stop.reason}\nrepair: ${result.stop.repair}\n`); process.exitCode = 2; }
    else if (result.status === "commit-required") process.stderr.write(`finish-feature --one-shot: run the commit, then the next command.\n${(result.commit.steps ?? []).join("\n")}\nnext: ${result.next}\n`);
    else if (result.status === "declined") process.stderr.write(`finish-feature --one-shot: the acceptance was declined; the feature returns to a correction round. Next, in order:\n${result.next.map((line, index) => `${index + 1}. ${line}`).join("\n")}\n`);
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
