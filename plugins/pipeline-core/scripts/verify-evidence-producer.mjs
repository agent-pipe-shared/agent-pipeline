#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * Produce `pipeline.verify-evidence.v0` for a project's OWN configured verify
 * command, bound to the exact candidate commit and tree.
 *
 * THE GAP THIS CLOSES. `critic-dispatch-preflight.mjs` requires a fresh
 * candidate-bound `pipeline.verify-evidence.v0` artifact and refuses with
 * `CDP-EVIDENCE-REQUIRED` without one. Nothing in the plugin wrote one, so a
 * consumer project reaching its first Critic review had to author a verify
 * runner itself, or hand-write the JSON -- the fabricated evidence the schema
 * exists to prevent. This tool is the sanctioned, plugin-shipped way to
 * satisfy that requirement honestly (see
 * backlog/items/2026-08-08-verify-evidence-has-a-schema-consumers-and-no-producer.md,
 * direction 1).
 *
 * WHAT THIS TOOL IS, AND IS NOT. It reads the project's OWN configured verify
 * command from its calibration (`verify` field) and RUNS it; it does not
 * decide what that command should be, and it never invents one. A calibration
 * with no configured command is refused, not defaulted.
 *
 * Refuses rather than writes when:
 *   - the working tree is dirty -- but this repository's own verify entry
 *     point does not refuse silently here: it records the dirty rejection
 *     explicitly as a failing evidence artifact, and this tool follows that
 *     same convention rather than inventing a second one.
 *   - the configured verify command itself exits non-zero: no artifact at
 *     all is written. An evidence file that records a failure as if it were
 *     a pass is worse than none; this is the property the whole binding
 *     exists for.
 *   - the candidate drifts between the start of the run and the end: the
 *     same reasoning that requires binding to commit AND tree, not commit
 *     alone, requires refusing evidence for a run whose tree moved under it.
 *
 * Usage:
 *   node verify-evidence-producer.mjs [--out <repo-relative path>] [--event-out <repo-relative path>] [--root <repo>]
 *   node verify-evidence-producer.mjs --prepare [--root <repo>]
 *   node verify-evidence-producer.mjs --root <repo> --mode <boundary> [--base <ref>] [--no-reuse]
 *
 * Existing projects explicitly prepare and commit the deterministic adapter
 * first; onboarding seeds it in the portable transaction. Runs never seed it.
 * Each replacement run removes prior canonical success before any checks.
 * Baseline calibration/contract checks may resume on the identical candidate;
 * manifest validation and the opaque product command execute freshly.
 *
 * `--out` defaults to `VERIFY_EVIDENCE_DEFAULT_PATH` (../lib/verify-evidence-path.mjs)
 * -- the same path `guard-push.mjs` and `push-prepare.mjs` read -- so a bare
 * invocation with no `--out` flag produces exactly the file the push gate
 * consumes. An explicit `--out` still overrides it for a supplementary run.
 * `--event-out` is optional. When present, one aggregate terminal verification
 * action is written after source durability/readback. Without it, source output
 * and exit behavior remain unchanged.
 *
 * Exit 0: evidence written for a passing run. Exit 1: the working tree was
 * dirty -- an artifact recording that explicitly IS written. Exit 2: the
 * configured verify command failed, the candidate drifted mid-run, or the
 * calibration names no usable command -- nothing is written.
 */
import { randomBytes, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { resolveAuthorityArtifactPath } from "../lib/project-authority.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { isSuccessfulSpawn } from "../lib/successful-spawn.mjs";
import { VERIFY_EVIDENCE_DEFAULT_PATH } from "../lib/verify-evidence-path.mjs";
import { readBoundConsumedCriticReceipt, readCriticVerifyLifecycle, recordCriticVerifyLifecycle } from "../lib/critic-verify-lifecycle.mjs";
import { runVerifyJournal, sealVerifyCleanupRegistration, verifySuiteArtifactName } from "./verify-journal.mjs";
import { startSessionDescriptor, registerTemporaryIntent, finalizeTemporaryResource, releaseCompletedVerifyRunSession, retireSessionDescriptor } from "../lib/worktree-lifecycle.mjs";
import { createPublicVerifyRunEvidence } from "../lib/verify-resume.mjs";
import { planVerifySelection } from "../lib/verify-selection.mjs";
import { assertConsumerVerifyAdapter, consumerVerifyPolicy, CONSUMER_VERIFY_DISPATCHER, prepareConsumerVerify, readConsumerVerifyConfiguration } from "../lib/consumer-verify.mjs";
import { assessPushHookBackstop as realAssessPushHookBackstop } from "./check-clone-provisioning.mjs";
import {
  GOVERNANCE_VERIFICATION_TERMINAL_SCHEMA,
  buildGovernanceVerificationAction,
  buildGovernanceVerificationRetry,
  preflightGovernanceVerificationActionOutput,
  writeGovernanceVerificationAction,
} from "../lib/governance-verification-action.mjs";

export const VERIFY_EVIDENCE_SCHEMA = "pipeline.verify-evidence.v0";
const CLI_HELP = [
  "Usage: verify-evidence-producer.mjs [--root <repo>] [--out <repo-relative path>] [--event-out <repo-relative path>] [--mode <work|critic|push|candidate|release>] [--base <ref>] [--no-reuse]",
  "       verify-evidence-producer.mjs --prepare [--root <repo>]",
  "       verify-evidence-producer.mjs --help",
  "",
  "Runs the repository's configured Verify command and writes candidate-bound evidence.",
].join("\n");

export class VerifyEvidenceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "VerifyEvidenceError";
    this.code = code;
  }
}
const fail = (code, message) => { throw new VerifyEvidenceError(code, message); };
const LIFECYCLE_ID = /^[a-f0-9]{64}$/u;

export function summarizeVerifyFailures(run) {
  return (Array.isArray(run.steps) ? run.steps : []).filter(step => step.exitCode !== 0).slice(0, 32).map(step => {
    const suite = typeof step.name === "string" && /^[a-zA-Z0-9_-]{1,100}$/u.test(step.name) ? step.name : "unknown";
    const result = { suite, exitCode: Number.isSafeInteger(step.exitCode) ? step.exitCode : null, findings: [], diagnostics: "unavailable" };
    if (suite === "unknown") return result;
    const artifact = verifySuiteArtifactName(suite);
    result.logRef = `logs/${artifact}.log`;
    try {
      const logPath = join(run.runDir, result.logRef);
      const stat = lstatSync(logPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) return result;
      const bytes = readFileSync(logPath);
      const receipt = JSON.parse(readFileSync(join(run.runDir, "receipts", `${artifact}.json`), "utf8"));
      if (receipt.suite !== suite || receipt.exitCode !== step.exitCode || receipt.receiptSha256 !== step.receiptSha256 || receipt.log?.fileSha256 !== createHash("sha256").update(bytes).digest("hex")) return result;
      result.diagnostics = "retained-private-log";
      if (suite !== "baseline-repository") return result;
      const parsed = JSON.parse(bytes.toString("utf8"));
      if (parsed.schema !== "pipeline.consumer-baseline-result.v1" || parsed.status !== "failed" || !Array.isArray(parsed.findings)) return result;
      result.findings = parsed.findings.slice(0, 16).filter(f => ["invalid-json", "unreadable-tracked-text", "merge-conflict-marker", "git-diff-check"].includes(f?.code)
        && (f.path === null || (typeof f.path === "string" && f.path.length <= 240 && !/^(?:[\\/]|[a-z]:)/iu.test(f.path) && !f.path.split(/[\\/]/u).includes("..") && !/[\x00-\x1f]/u.test(f.path))))
        .map(f => ({ code: f.code, path: f.path }));
    } catch { /* Missing/malformed diagnostics never change the failed result. */ }
    return result;
  });
}

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH ?? "" },
    shell: false,
    timeout: 10_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (!isSuccessfulSpawn(result)) fail("VEP-GIT", `Git observation failed for ${args[0]}.`);
  return String(result.stdout).trim();
}
/** Same "clean iff no porcelain output" reading this repository's own verify entry point uses. */
function candidateIdentity(root) {
  const porcelain = git(root, ["status", "--porcelain=v1"]);
  return { status: porcelain.length === 0 ? "clean" : "dirty", commit: git(root, ["rev-parse", "HEAD"]), tree: git(root, ["rev-parse", "HEAD^{tree}"]) };
}

function resolveCommit(root, ref) {
  if (ref === null) return null;
  try { return git(root, ["rev-parse", "--verify", `${ref}^{commit}`]); } catch { return null; }
}

function selectionInputs(root, mode, base, candidateCommit) {
  const baseCommit = resolveCommit(root, base) ?? (mode === "release" ? null : resolveCommit(root, "HEAD^1"));
  if (baseCommit === null) return { baseCommit, changedPaths: null, forceFullReason: null };
  if (baseCommit === candidateCommit) return { baseCommit, changedPaths: null, forceFullReason: "invalid-base" };
  try { git(root, ["merge-base", "--is-ancestor", baseCommit, candidateCommit]); }
  catch { return { baseCommit, changedPaths: null, forceFullReason: "invalid-base" }; }
  try { return { baseCommit, changedPaths: git(root, ["diff", "--name-only", "-z", baseCommit, candidateCommit, "--"]).split("\0").filter(Boolean) }; }
  catch { return { baseCommit, changedPaths: null, forceFullReason: null }; }
}

function safeOutPath(root, outPath) {
  if (typeof outPath !== "string" || outPath.length === 0 || isAbsolute(outPath)) fail("VEP-PATH", "Out path must be repository-relative.");
  const target = resolve(root, outPath);
  const rel = relative(root, target);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel) || target === root) fail("VEP-PATH", "Out path escapes the repository.");
  if (realpathSync(root) !== root) fail("VEP-PATH", "Repository root must be a physical path.");
  let current = root;
  for (const component of rel.split(sep)) {
    current = resolve(current, component);
    let info;
    try { info = lstatSync(current); }
    catch (error) { if (error.code === "ENOENT") break; throw error; }
    if (info.isSymbolicLink() || realpathSync(current) !== current
      || (current !== target ? !info.isDirectory() : !info.isFile() || info.nlink !== 1)) {
      fail("VEP-PATH", "Out path must contain only physical directories and an ordinary file.");
    }
  }
  return target;
}

function writeEvidence(root, target, evidence) {
  safeOutPath(root, relative(root, target));
  mkdirSync(dirname(target), { recursive: true });
  safeOutPath(root, relative(root, target));
  // Refuse a newly appeared leaf, including a symlink or hardlink, rather than
  // following it when publishing the replacement evidence.
  writeFileSync(target, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
}

/**
 * Full release Verify is the production consumer for the content-bound Critic
 * contract. First qualification supplies its packet. A deterministic rerun
 * supplies a previous lifecycle receipt, which must still chain to the exact
 * old release evidence and the same consumed private Critic receipt.
 */
function preflightReleaseCriticAdmission({ root, candidate: sourceCandidate, criticPacketId, criticReverifyReceiptId }) {
  if ((criticPacketId === null) === (criticReverifyReceiptId === null)) {
    fail("VEP-CRITIC-REQUIRED", "Release Verify requires exactly one of --critic-packet-id or --critic-reverify-receipt-id.");
  }
  const gitCommonDir = resolve(root, git(root, ["rev-parse", "--git-common-dir"]));
  if (criticPacketId !== null) {
    try { readBoundConsumedCriticReceipt({ gitCommonDir, criticPacketId, candidate: sourceCandidate }); }
    catch (error) { fail(`VEP-${error?.code ?? "CRITIC-INVALID"}`, error?.message ?? "Release Verify Critic admission failed."); }
    return Object.freeze({ criticPacketId, reusedLifecycleId: null });
  }
  if (!LIFECYCLE_ID.test(criticReverifyReceiptId ?? "")) fail("VEP-CRITIC-REVERIFY-ID", "Release Verify recheck receipt ID is invalid.");
  let metadata;
  try { metadata = readCriticVerifyLifecycle({ gitCommonDir, id: criticReverifyReceiptId, candidate: sourceCandidate }); }
  catch (error) { fail(`VEP-${error?.code ?? "CRITIC-REVERIFY"}`, error?.message ?? "Release Verify recheck receipt is unavailable."); }
  const priorPath = metadata.receipt.verify.evidencePath;
  let priorEvidence;
  try { priorEvidence = JSON.parse(readFileSync(safeOutPath(root, priorPath), "utf8")); }
  catch { fail("VEP-CRITIC-REVERIFY-EVIDENCE", "Release Verify recheck requires the prior exact release evidence."); }
  try { readCriticVerifyLifecycle({ gitCommonDir, id: criticReverifyReceiptId, candidate: sourceCandidate, evidencePath: priorPath, evidence: priorEvidence }); }
  catch (error) { fail(`VEP-${error?.code ?? "CRITIC-REVERIFY"}`, error?.message ?? "Release Verify recheck evidence does not match its private receipt."); }
  if (priorEvidence?.schema !== VERIFY_EVIDENCE_SCHEMA || priorEvidence?.exitCode !== 0
    || priorEvidence?.selection?.mode !== "release" || priorEvidence?.selection?.execution !== "full") {
    fail("VEP-CRITIC-REVERIFY-NOT-RELEASE", "Release Verify recheck requires a prior passing full release Verify evidence artifact.");
  }
  try {
    const bound = readBoundConsumedCriticReceipt({ gitCommonDir, criticPacketId: metadata.receipt.critic.packetId, candidate: sourceCandidate });
    if (bound.criticReceiptSha256 !== metadata.receipt.critic.receiptSha256
      || bound.critic.packetDigest !== metadata.receipt.critic.packetDigest
      || bound.critic.verdictSha256 !== metadata.receipt.critic.verdictSha256
      || JSON.stringify(bound.critic.reviewRange) !== JSON.stringify(metadata.receipt.critic.reviewRange)) {
      fail("VEP-CRITIC-REVERIFY-CRITIC", "Release Verify recheck Critic receipt differs from its private lifecycle binding.");
    }
  } catch (error) {
    if (error instanceof VerifyEvidenceError) throw error;
    fail(`VEP-${error?.code ?? "CRITIC-REVERIFY"}`, error?.message ?? "Release Verify recheck Critic receipt is unavailable.");
  }
  return Object.freeze({ criticPacketId: metadata.receipt.critic.packetId, reusedLifecycleId: criticReverifyReceiptId });
}

/**
 * Run the project's configured verify command and, only on an honest pass,
 * write `pipeline.verify-evidence.v0` bound to the exact commit and tree that
 * was verified. Never creates history, never invents a command.
 */
export async function produceVerifyEvidence({ rootDir = process.cwd(), outPath = VERIFY_EVIDENCE_DEFAULT_PATH, eventOutPath = null, mode = "candidate", base = null, reuseReceipts = true, criticPacketId = null, criticReverifyReceiptId = null, assessPushHookBackstop = realAssessPushHookBackstop }) {
  const root = resolve(rootDir);
  // Release/push evidence is used to clear the push boundary. Do not mint it
  // while a manifest-declared blocking gate lacks its git-level backstop.
  if (mode === "release" || mode === "push") {
    const backstop = assessPushHookBackstop(root);
    if (backstop.blocking && !backstop.backed) fail("VEP-UNBACKED_GATE", `${backstop.message} ${backstop.remedy}`);
  }
  const target = safeOutPath(root, outPath);
  const canonicalTarget = safeOutPath(root, VERIFY_EVIDENCE_DEFAULT_PATH);
  let eventPlan = null;
  let configuration;
  let started;
  let startedAt;
  let file;
  let policyInputs;
  if (eventOutPath !== null) {
    eventPlan = preflightGovernanceVerificationActionOutput({ rootDir: root, eventOutPath });
    const collides = [target, canonicalTarget].some((sourceTarget) => eventPlan.target === sourceTarget
      || eventPlan.target.startsWith(`${sourceTarget}${sep}`) || sourceTarget.startsWith(`${eventPlan.target}${sep}`));
    if (collides) fail("VEP-EVENT-PATH", "Action event output must be separate from Verify evidence outputs.");
    // With an event request, both target and source are preflighted before the
    // replacement run invalidates prior public evidence.
    try { configuration = readConsumerVerifyConfiguration(root); }
    catch (error) { fail("VEP-CALIBRATION", error.message); }
    if (configuration.fullCommand === null) fail("VEP-NO-COMMAND", `${mode} Verify requires configured product verification.`);
    started = candidateIdentity(root);
    startedAt = new Date().toISOString();
    if (started.status !== "clean") fail("VEP-EVENT-SOURCE", "Action event output requires a clean exact candidate before source execution.");
    file = assertConsumerVerifyAdapter(root);
    policyInputs = consumerVerifyPolicy(root);
  }
  // A release Verify-only rerun validates its prior public evidence before it
  // is removed. Other modes retain the historic eager invalidation behavior.
  started ??= candidateIdentity(root);
  startedAt ??= new Date().toISOString();
  if (configuration === undefined) {
    try { configuration = readConsumerVerifyConfiguration(root); }
    catch (error) { fail("VEP-CALIBRATION", error.message); }
    if (configuration.fullCommand === null) fail("VEP-NO-COMMAND", `${mode} Verify requires configured product verification.`);
  }
  const releaseCritic = mode === "release" && started.status === "clean"
    ? preflightReleaseCriticAdmission({ root, candidate: { commit: started.commit, tree: started.tree }, criticPacketId, criticReverifyReceiptId })
    : null;
  // Invalidate prior success before configuration, candidate checks or execution.
  // An interrupted replacement attempt must never leave consumable stale green.
  for (const path of new Set([target, canonicalTarget])) rmSync(path, { force: true });
  if (configuration === undefined) {
    try { configuration = readConsumerVerifyConfiguration(root); }
    catch (error) { fail("VEP-CALIBRATION", error.message); }
  }
  const { fullCommand: command, project } = configuration;
  if (command === null) fail("VEP-NO-COMMAND", `${mode} Verify requires configured product verification.`);
  started ??= candidateIdentity(root);
  startedAt ??= new Date().toISOString();

  if (started.status === "dirty") {
    // Same convention as this repository's own verify entry point: the dirty
    // rejection is recorded explicitly rather than silently producing nothing.
    const evidence = {
      schema: VERIFY_EVIDENCE_SCHEMA,
      project,
      command,
      commit: started.commit,
      tree: started.tree,
      candidate: { commit: started.commit, tree: started.tree },
      startedAt,
      finishedAt: new Date().toISOString(),
      steps: [{ name: "candidate-preflight", exitCode: 1 }],
      exitCode: 1,
    };
    writeEvidence(root, target, evidence);
    return { status: "dirty", evidence, outPath: target };
  }

  file ??= assertConsumerVerifyAdapter(root);
  policyInputs ??= consumerVerifyPolicy(root);
  const attempt = randomBytes(16).toString("hex");
  const standardSuites = [
    { name: "baseline-calibration", file, args: [CONSUMER_VERIFY_DISPATCHER, "calibration"] },
    // Manifest semantics include time and external policy data: always recheck.
    { name: "baseline-manifest", file, args: [CONSUMER_VERIFY_DISPATCHER, "manifest", attempt] },
    { name: "baseline-repository", file, args: [CONSUMER_VERIFY_DISPATCHER, "repository-baseline"] },
    { name: "baseline-verify-contract", file, args: [CONSUMER_VERIFY_DISPATCHER, "contract"] },
  ];
  const configuredBaselineSuites = configuration.baseline.map((entry) => ({ name: `project-${entry.id}`, file, args: [CONSUMER_VERIFY_DISPATCHER, "configured-command", entry.id], dependsOn: standardSuites.map((suite) => suite.name) }));
  const configuredAreaSuites = configuration.areas.flatMap((area) => area.commands.map((entry) => ({ name: `project-${entry.id}`, file, args: [CONSUMER_VERIFY_DISPATCHER, "configured-command", entry.id], dependsOn: standardSuites.map((suite) => suite.name) })));
  const fullSuite = command === null ? null : { name: "configured-verify", file, args: [CONSUMER_VERIFY_DISPATCHER, "product", attempt], dependsOn: standardSuites.map((suite) => suite.name) };
  const selectionInput = selectionInputs(root, mode, base, started.commit);
  const baselineIds = [...standardSuites, ...configuredBaselineSuites].map((suite) => suite.name);
  let registry = [...standardSuites, ...configuredBaselineSuites, ...configuredAreaSuites];
  let areas = configuration.areas.map((area) => ({ id: area.id, paths: area.paths, suites: area.commands.map((entry) => `project-${entry.id}`) }));
  if (mode === "release") {
    registry = [...standardSuites, ...configuredBaselineSuites, ...configuredAreaSuites, fullSuite];
    areas = [{ id: "whole-project", paths: ["**"], suites: registry.map((suite) => suite.name) }];
  } else if (areas.length === 0) {
    if (fullSuite !== null) registry.push(fullSuite);
    areas = [{ id: "whole-project", paths: ["**"], suites: registry.map((suite) => suite.name) }];
  }
  let selection = planVerifySelection({ mode, baseCommit: selectionInput.baseCommit, candidateCommit: started.commit, changedPaths: selectionInput.changedPaths, registeredSuiteIds: registry.map((suite) => suite.name), policy: { schema: "pipeline.verify-selection.v1", baseline: baselineIds, areas }, forceFullReason: selectionInput.forceFullReason });
  if (selection.execution === "full" && fullSuite !== null && !registry.some((suite) => suite.name === fullSuite.name)) {
    const fallbackReason = selection.fallbackReason;
    registry = [...standardSuites, ...configuredBaselineSuites, ...configuredAreaSuites, fullSuite];
    selection = planVerifySelection({ mode, baseCommit: selectionInput.baseCommit, candidateCommit: started.commit, changedPaths: selectionInput.changedPaths, registeredSuiteIds: registry.map((suite) => suite.name), policy: { schema: "pipeline.verify-selection.v1", baseline: baselineIds, areas }, forceFullReason: fallbackReason });
  }
  const selected = new Set(selection.selectedSuiteIds);
  const suites = registry.filter((suite) => selected.has(suite.name));
  let registration;
  const run = await runVerifyJournal({
    repoRoot: root,
    gitCommonDir: resolve(root, git(root, ["rev-parse", "--git-common-dir"])),
    candidate: { commit: started.commit, tree: started.tree },
    suites, policyInputs: { ...policyInputs, selectionSha256: selection.selectionSha256 }, allowCrossCandidateReuse: selection.execution === "impacted", reuseReceipts,
    registerRun({ runId, runPath }) {
      const descriptor = startSessionDescriptor(root);
      const resourceId = `consumer-${attempt}`;
      registration = {
        sessionId: descriptor.sessionId,
        ownerNonce: descriptor.ownerNonce,
        descriptorSha256: descriptor.descriptorSha256,
        resourceId,
      };
      registerTemporaryIntent(root, { ...registration, type: "verify-run-directory", path: runPath, contentClass: "verify-recovery", soleCopy: false, cleanupPolicy: "remove-directory" });
      return sealVerifyCleanupRegistration({ status: "registered", runId, runPath, sessionId: descriptor.sessionId, descriptorSha256: descriptor.descriptorSha256, resourceId, registeredAt: new Date().toISOString() });
    },
  });
  // A process interruption before this point retains the creating intent for
  // recovery. Once a terminal run was returned, drain its private run
  // directory and retire the exact descriptor before evaluating its outcome.
  finalizeTemporaryResource(root, { ...registration, canaryRelative: "terminal.json" });
  const failures = run.terminal.status === "passed" ? null : summarizeVerifyFailures(run);
  let terminalSource = run.terminal;
  let terminalReadbackFailure = null;
  if (eventPlan !== null) {
    try { terminalSource = JSON.parse(readFileSync(join(run.runDir, "terminal.json"), "utf8")); }
    catch { terminalReadbackFailure = "Terminal Verify evidence could not be read back after persistence."; }
    if (terminalReadbackFailure === null && JSON.stringify(terminalSource) !== JSON.stringify(run.terminal)) {
      terminalReadbackFailure = "Terminal Verify evidence readback did not match the completed run.";
    }
  }
  const cleanup = releaseCompletedVerifyRunSession(root, registration);
  if (!cleanup.ok) fail("VEP-CLEANUP-FAILED", `Completed Verify run could not be retired safely: ${JSON.stringify(cleanup.receipt.outcomes)}`);
  retireSessionDescriptor(root, registration);
  if (terminalReadbackFailure !== null) fail("VEP-SOURCE-READBACK", terminalReadbackFailure);
  if (run.terminal.status !== "passed" && eventPlan === null) {
    fail("VEP-VERIFY-FAILED", `Required consumer Verify checks failed; no success evidence was written. Private diagnostic run: ${run.runId}. Failed checks: ${JSON.stringify(failures)}`);
  }
  if (JSON.stringify(consumerVerifyPolicy(root)) !== JSON.stringify(policyInputs)) fail("VEP-DRIFT", "Installed implementation or declared inputs changed during Verify.");

  const finished = candidateIdentity(root);
  if (finished.status !== "clean" || finished.commit !== started.commit || finished.tree !== started.tree) {
    fail("VEP-DRIFT", "The candidate commit or tree changed while the verify command ran -- no evidence was written.");
  }

  const actionEvent = eventPlan === null ? null : buildGovernanceVerificationAction({
    schema: GOVERNANCE_VERIFICATION_TERMINAL_SCHEMA,
    terminalEvidenceSha256: terminalSource.terminalSha256,
    outcome: terminalSource.status,
    candidate: terminalSource.candidate,
    featureId: { state: "not-applicable" },
    sessionId: { state: "not-applicable" },
  });

  if (run.terminal.status !== "passed") {
    try {
      const eventWrite = writeGovernanceVerificationAction({ rootDir: root, eventOutPath: eventPlan.eventOutPath, event: actionEvent });
      return { status: "failed", evidence: null, outPath: target, actionEvent, eventOutPath: eventWrite.outPath };
    } catch {
      return {
        status: "source-complete/event-unavailable", sourceStatus: "failed", evidence: null, outPath: target,
        actionEvent, eventRetry: buildGovernanceVerificationRetry({ eventOutPath: eventPlan.eventOutPath, event: actionEvent }),
      };
    }
  }

  const evidence = {
    schema: VERIFY_EVIDENCE_SCHEMA,
    project,
    command,
    commit: started.commit,
    tree: started.tree,
    candidate: { commit: started.commit, tree: started.tree },
    startedAt,
    finishedAt: new Date().toISOString(),
    steps: run.steps,
    verifyRun: createPublicVerifyRunEvidence({
      runId: run.runId, policySha256: run.policySha256,
      resumePlanSha256: run.plan.planSha256, terminalSha256: run.terminal.terminalSha256,
      registeredSuiteCount: suites.length, terminalReceiptCount: run.terminal.receipts.length,
      terminalStatus: run.terminal.status,
      receiptReuse: reuseReceipts ? "allowed" : "disabled",
    }),
    selection,
    coverage: "project-calibrated",
    exitCode: 0,
  };
  writeEvidence(root, target, evidence);
  // A critic packet is optional for ordinary Verify consumers.  The governed
  // close lane supplies one and therefore gains a private, revalidated receipt
  // rather than relying on a caller-provided green status object.
  let criticLifecycle = null;
  const lifecyclePacketId = releaseCritic?.criticPacketId ?? criticPacketId;
  if (lifecyclePacketId !== null) {
    try {
      criticLifecycle = recordCriticVerifyLifecycle({
        gitCommonDir: resolve(root, git(root, ["rev-parse", "--git-common-dir"])),
        criticPacketId: lifecyclePacketId,
        candidate: evidence.candidate,
        evidencePath: relative(root, target).replaceAll("\\", "/"),
        evidence,
      });
    } catch (error) {
      fail(error?.code ?? "VEP-CRITIC-LIFECYCLE", error?.message ?? "Critic/Verify lifecycle receipt could not be persisted.");
    }
  }
  if (eventPlan === null) return { status: "passed", evidence, outPath: target, ...(criticLifecycle === null ? {} : { criticLifecycle }) };
  // The event follows source persistence and a physical source readback.
  let observed;
  try { observed = JSON.parse(readFileSync(target, "utf8")); } catch { fail("VEP-SOURCE-READBACK", "Verify evidence could not be read back after persistence."); }
  if (JSON.stringify(observed) !== JSON.stringify(evidence)) fail("VEP-SOURCE-READBACK", "Verify evidence readback did not match the terminal source.");
  try {
    const eventWrite = writeGovernanceVerificationAction({ rootDir: root, eventOutPath: eventPlan.eventOutPath, event: actionEvent });
    return { status: "passed", evidence, outPath: target, actionEvent, eventOutPath: eventWrite.outPath, ...(criticLifecycle === null ? {} : { criticLifecycle }) };
  } catch {
    return {
      status: "source-complete/event-unavailable", sourceStatus: "passed", evidence, outPath: target,
      actionEvent, eventRetry: buildGovernanceVerificationRetry({ eventOutPath: eventPlan.eventOutPath, event: actionEvent }), ...(criticLifecycle === null ? {} : { criticLifecycle }),
    };
  }
}

function parseArgs(argv) {
  const value = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--prepare") { value.prepare = true; continue; }
    if (flag === "--no-reuse") { value.reuseReceipts = false; continue; }
    if (!["--root", "--out", "--event-out", "--mode", "--base", "--critic-packet-id", "--critic-reverify-receipt-id"].includes(flag)) fail("VEP-USAGE", `Unknown option: ${flag}`);
    const next = argv[++index];
    if (!flag?.startsWith("--") || next === undefined || next.startsWith("--")) {
      fail("VEP-USAGE", "Usage: verify-evidence-producer.mjs [--out <repo-relative path>] [--root <repo>]");
    }
    value[flag] = next;
  }
  const mode = value["--mode"] ?? "candidate";
  if (!["work", "critic", "push", "candidate", "release"].includes(mode)) fail("VEP-USAGE", `Unknown Verify mode: ${mode}`);
  return { prepare: value.prepare === true, rootDir: value["--root"] ?? process.cwd(), outPath: value["--out"] ?? VERIFY_EVIDENCE_DEFAULT_PATH, eventOutPath: value["--event-out"] ?? null, mode, base: value["--base"] ?? null, reuseReceipts: value.reuseReceipts !== false, criticPacketId: value["--critic-packet-id"] ?? null, criticReverifyReceiptId: value["--critic-reverify-receipt-id"] ?? null };
}

if (isDirectInvocation(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv.length === 1 && argv[0] === "--help") {
    process.stdout.write(`${CLI_HELP}\n`);
  } else try {
    const args = parseArgs(argv);
    const result = args.prepare ? prepareConsumerVerify(args) : await produceVerifyEvidence(args);
    const output = result.actionEvent === undefined
      ? { status: result.status, outPath: result.outPath, ...result.evidence }
      : { status: result.status, sourceStatus: result.sourceStatus, outPath: result.outPath, eventOutPath: result.eventOutPath, ...result.evidence, actionEvent: result.actionEvent, eventRetry: result.eventRetry };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    if (result.status === "dirty") process.exitCode = 1;
    if (["failed", "source-complete/event-unavailable"].includes(result.status)) process.exitCode = 2;
  } catch (error) {
    const code = error instanceof VerifyEvidenceError ? error.code : "VEP-ERROR";
    process.stderr.write(`verify-evidence-producer: ${code}: ${error.message}\n`);
    process.exitCode = 2;
  }
}
