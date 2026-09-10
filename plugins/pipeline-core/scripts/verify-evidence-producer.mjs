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
 *   node verify-evidence-producer.mjs [--out <repo-relative path>] [--root <repo>]
 *   node verify-evidence-producer.mjs --prepare [--root <repo>]
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
 *
 * Exit 0: evidence written for a passing run. Exit 1: the working tree was
 * dirty -- an artifact recording that explicitly IS written. Exit 2: the
 * configured verify command failed, the candidate drifted mid-run, or the
 * calibration names no usable command -- nothing is written.
 */
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { resolveAuthorityArtifactPath } from "../lib/project-authority.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { VERIFY_EVIDENCE_DEFAULT_PATH } from "../lib/verify-evidence-path.mjs";
import { runVerifyJournal, sealVerifyCleanupRegistration } from "./verify-journal.mjs";
import { startSessionDescriptor, registerTemporaryIntent, finalizeTemporaryResource } from "../lib/worktree-lifecycle.mjs";
import { assertConsumerVerifyAdapter, consumerVerifyPolicy, CONSUMER_VERIFY_DISPATCHER, prepareConsumerVerify } from "../lib/consumer-verify.mjs";

export const VERIFY_EVIDENCE_SCHEMA = "pipeline.verify-evidence.v0";

export class VerifyEvidenceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "VerifyEvidenceError";
    this.code = code;
  }
}
const fail = (code, message) => { throw new VerifyEvidenceError(code, message); };

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH ?? "" },
    shell: false,
    timeout: 10_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) fail("VEP-GIT", `Git observation failed for ${args[0]}.`);
  return String(result.stdout).trim();
}

/** Same "clean iff no porcelain output" reading this repository's own verify entry point uses. */
function candidateIdentity(root) {
  const porcelain = git(root, ["status", "--porcelain=v1"]);
  return { status: porcelain.length === 0 ? "clean" : "dirty", commit: git(root, ["rev-parse", "HEAD"]), tree: git(root, ["rev-parse", "HEAD^{tree}"]) };
}

function readConfiguredVerifyCommand(root) {
  const calibration = resolveAuthorityArtifactPath("calibration", { rootDir: root });
  if (!calibration.exists) fail("VEP-NO-CALIBRATION", "No project calibration found -- nothing configures a verify command.");
  let parsed;
  try { parsed = JSON.parse(readFileSync(calibration.path, "utf8")); }
  catch { fail("VEP-CALIBRATION", "Project calibration is not valid JSON."); }
  const command = parsed?.verify;
  if (typeof command !== "string" || command.trim() === "") {
    fail("VEP-NO-COMMAND", "Project calibration names no verify command -- deciding one is out of scope for this producer.");
  }
  return { command, project: typeof parsed?.project === "string" && parsed.project.length > 0 ? parsed.project : "unspecified" };
}

function safeOutPath(root, outPath) {
  if (typeof outPath !== "string" || outPath.length === 0 || isAbsolute(outPath)) fail("VEP-PATH", "Out path must be repository-relative.");
  const target = resolve(root, outPath);
  if (relative(root, target).startsWith(`..${sep}`) || target === root) fail("VEP-PATH", "Out path escapes the repository.");
  return target;
}

function writeEvidence(target, evidence) {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(evidence, null, 2)}\n`);
}

/**
 * Run the project's configured verify command and, only on an honest pass,
 * write `pipeline.verify-evidence.v0` bound to the exact commit and tree that
 * was verified. Never creates history, never invents a command.
 */
export async function produceVerifyEvidence({ rootDir = process.cwd(), outPath = VERIFY_EVIDENCE_DEFAULT_PATH }) {
  const root = resolve(rootDir);
  const target = safeOutPath(root, outPath);
  // Invalidate prior success before configuration, candidate checks or execution.
  // An interrupted replacement attempt must never leave consumable stale green.
  for (const path of new Set([target, safeOutPath(root, VERIFY_EVIDENCE_DEFAULT_PATH)])) rmSync(path, { force: true });
  const { command, project } = readConfiguredVerifyCommand(root);
  const started = candidateIdentity(root);
  const startedAt = new Date().toISOString();

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
    writeEvidence(target, evidence);
    return { status: "dirty", evidence, outPath: target };
  }

  const file = assertConsumerVerifyAdapter(root);
  const policyInputs = consumerVerifyPolicy(root);
  const attempt = randomBytes(16).toString("hex");
  const suites = [
    { name: "baseline-calibration", file, args: [CONSUMER_VERIFY_DISPATCHER, "calibration"] },
    // Manifest semantics include time and external policy data: always recheck.
    { name: "baseline-manifest", file, args: [CONSUMER_VERIFY_DISPATCHER, "manifest", attempt] },
    { name: "baseline-verify-contract", file, args: [CONSUMER_VERIFY_DISPATCHER, "contract"] },
    { name: "configured-verify", file, args: [CONSUMER_VERIFY_DISPATCHER, "product", attempt], dependsOn: ["baseline-calibration", "baseline-manifest", "baseline-verify-contract"] },
  ];
  let registration;
  const run = await runVerifyJournal({
    repoRoot: root,
    gitCommonDir: resolve(root, git(root, ["rev-parse", "--git-common-dir"])),
    candidate: { commit: started.commit, tree: started.tree },
    suites, policyInputs, allowCrossCandidateReuse: false,
    registerRun({ runId, runPath }) {
      const descriptor = startSessionDescriptor(root);
      const resourceId = `consumer-${attempt}`;
      registration = { sessionId: descriptor.sessionId, ownerNonce: descriptor.ownerNonce, resourceId };
      registerTemporaryIntent(root, { ...registration, type: "verify-run-directory", path: runPath, contentClass: "verify-recovery", soleCopy: false, cleanupPolicy: "remove-directory" });
      return sealVerifyCleanupRegistration({ status: "registered", runId, runPath, sessionId: descriptor.sessionId, descriptorSha256: descriptor.descriptorSha256, resourceId, registeredAt: new Date().toISOString() });
    },
  });
  // Keep the real private descriptor and resource available for recovery/resume.
  // Interrupted runs retain their creating intent rather than inventing a seal.
  finalizeTemporaryResource(root, { ...registration, canaryRelative: "terminal.json" });
  if (run.terminal.status !== "passed") fail("VEP-VERIFY-FAILED", "Required consumer Verify checks failed; no success evidence was written.");
  if (JSON.stringify(consumerVerifyPolicy(root)) !== JSON.stringify(policyInputs)) fail("VEP-DRIFT", "Installed implementation or declared inputs changed during Verify.");

  const finished = candidateIdentity(root);
  if (finished.status !== "clean" || finished.commit !== started.commit || finished.tree !== started.tree) {
    fail("VEP-DRIFT", "The candidate commit or tree changed while the verify command ran -- no evidence was written.");
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
    verifyRun: { runId: run.runId, policySha256: run.policySha256, terminalSha256: run.terminal.terminalSha256 },
    exitCode: 0,
  };
  writeEvidence(target, evidence);
  return { status: "passed", evidence, outPath: target };
}

function parseArgs(argv) {
  const value = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--prepare") { value.prepare = true; continue; }
    if (!["--root", "--out"].includes(flag)) fail("VEP-USAGE", `Unknown option: ${flag}`);
    const next = argv[++index];
    if (!flag?.startsWith("--") || next === undefined || next.startsWith("--")) {
      fail("VEP-USAGE", "Usage: verify-evidence-producer.mjs [--out <repo-relative path>] [--root <repo>]");
    }
    value[flag] = next;
  }
  return { prepare: value.prepare === true, rootDir: value["--root"] ?? process.cwd(), outPath: value["--out"] ?? VERIFY_EVIDENCE_DEFAULT_PATH };
}

if (isDirectInvocation(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = args.prepare ? prepareConsumerVerify(args) : await produceVerifyEvidence(args);
    process.stdout.write(`${JSON.stringify({ status: result.status, outPath: result.outPath, ...result.evidence }, null, 2)}\n`);
    if (result.status === "dirty") process.exitCode = 1;
  } catch (error) {
    const code = error instanceof VerifyEvidenceError ? error.code : "VEP-ERROR";
    process.stderr.write(`verify-evidence-producer: ${code}: ${error.message}\n`);
    process.exitCode = 2;
  }
}
