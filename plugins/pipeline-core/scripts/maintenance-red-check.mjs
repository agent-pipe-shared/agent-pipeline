#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * maintenance-red-check.mjs -- observe a check that is red before a maintenance dispatch (ADR-0097, D249, K-28).
 *
 *   node maintenance-red-check.mjs observe --root <repo> --check <test-path | command:<id> | verify:configured>
 *
 * A maintenance dispatch repairs a check that was already red before the feature and that no criterion of the approved Spec
 * covers. The host admits its binding only when this script has observed the check red at the exact candidate. The script:
 *   - needs the active feature in the project State and a clean tracked tree (the observation binds HEAD and its tree);
 *   - runs the check the way the host's targeted checks run it: a .test file with `node --test`, a `command:<id>` with the
 *     command the project calibration registers under verifyImpact, `verify:configured` with the calibration's `verify` command;
 *   - refuses, writing nothing, when the run timed out, could not start, or changed the tree;
 *   - otherwise records the result once under <git-common-dir>/agent-pipeline/maintenance/observations/ (the first observation at a
 *     commit stands: a rerun cannot replace red with green or the reverse).
 * verify:configured runs the project's whole verify (up to 30 minutes here). Start it as a background command, not in a foreground
 * tool call with a shorter timeout: a stopped run records nothing and has to start again.
 * Exit 0 with one JSON line when the check is observed red; exit 1 when it is green (nothing to repair, also recorded); exit 2 with
 * one `MAINTENANCE-RED-CHECK-REFUSED: <code>: <message>` line on stderr otherwise.
 *
 * After it: the proof that the check was red before the feature is a red Verify receipt at or before the plan approval, read by the
 * host itself; without one the PO acknowledges it once (`pipeline-state.mjs approve-maintenance-red-check --by <label>`). Then
 * `dispatch-briefing.mjs binding --maintenance --check <the same spelling>` generates the binding.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { resolveGitCommonDir } from "../lib/po-key-directory.mjs";
import { resolveAuthorityArtifactPath } from "../lib/project-authority-read.mjs";
import { readConsumerVerifyConfiguration } from "../lib/consumer-verify.mjs";
import { describeMaintenanceCheck, maintenanceCheckSpelling, parseMaintenanceCheckSpelling, writeMaintenanceRedObservation } from "../lib/maintenance-delivery.mjs";

const REFUSAL_PREFIX = "MAINTENANCE-RED-CHECK-REFUSED";
const USAGE = "usage: node maintenance-red-check.mjs observe --root <repo> --check <test-path | command:<id> | verify:configured>\n"
  + "  verify:configured runs the whole project verify (up to 30 minutes): start it as a background command, not a short foreground call.";
/** The host's targeted checks run for at most a minute; the configured verify of a whole project can take far longer. */
export const CHECK_TIMEOUT_MS = 60_000;
export const CONFIGURED_VERIFY_TIMEOUT_MS = 30 * 60_000;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

class Refusal extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function parseArgs(argv) {
  if (argv[0] !== "observe") throw new Refusal("MRC-USAGE", USAGE);
  const values = new Map();
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    if (!["--root", "--check"].includes(flag)) throw new Refusal("MRC-USAGE", `unknown argument ${JSON.stringify(String(flag).slice(0, 64))}; ${USAGE}`);
    if (values.has(flag)) throw new Refusal("MRC-USAGE", `${flag} given twice`);
    if (typeof argv[index + 1] !== "string") throw new Refusal("MRC-USAGE", `${flag} needs a value`);
    values.set(flag, argv[index + 1]);
  }
  for (const flag of ["--root", "--check"]) if (!values.has(flag)) throw new Refusal("MRC-USAGE", `${flag} is required; ${USAGE}`);
  const check = parseMaintenanceCheckSpelling(values.get("--check"));
  if (check === null) throw new Refusal("MRC-CHECK", "--check must be a repository-relative .test.mjs, .test.cjs or .test.js file, command:<id> of a command the calibration registers, or verify:configured (a document check is never a maintenance check)");
  return { root: values.get("--root"), check };
}

function gitIn(root) {
  return (args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8", shell: false, timeout: 15000, maxBuffer: 8 * 1024 * 1024 });
}

/** HEAD, its tree and the tracked status: the observation binds all three and they must not move while the check runs. */
function snapshot(git) {
  const commit = git(["rev-parse", "--verify", "--quiet", "HEAD"]), tree = git(["rev-parse", "--verify", "--quiet", "HEAD^{tree}"]);
  const status = git(["status", "--porcelain=v1", "--untracked-files=no"]);
  if ([commit, tree, status].some((run) => run.error || run.status !== 0)) throw new Refusal("MRC-HEAD-UNAVAILABLE", "HEAD, its tree or the tracked status could not be read");
  return { commit: commit.stdout.trim(), tree: tree.stdout.trim(), status: status.stdout };
}

function checkEnvironment() {
  const env = { ...process.env };
  // The same exclusions as the host's targeted checks: an inherited test-runner context makes a nested `node --test` exit 0 with
  // empty output even when its test fails, and an outer Verify recorder descriptor belongs to that suite, not to this run.
  delete env.NODE_TEST_CONTEXT;
  delete env.PIPELINE_VERIFY_CASE_COMPLETION_FD;
  delete env.PIPELINE_VERIFY_CASE_COMPLETION_MAX_BYTES;
  return env;
}

/** How the check runs: the executable and arguments, or a shell command, plus its timeout. */
function checkInvocation(root, check, readConfiguration = readConsumerVerifyConfiguration) {
  if (check.path !== undefined) return { executable: process.execPath, args: ["--test", resolve(root, check.path)], shell: false, timeout: CHECK_TIMEOUT_MS };
  let registry;
  try { registry = readConfiguration(root); }
  catch (error) { throw new Refusal("MRC-CALIBRATION", `the project calibration could not be read: ${String(error.message).slice(0, 300)}`); }
  if (check.verify === "configured") {
    if (registry.fullCommand === null) throw new Refusal("MRC-VERIFY-UNCONFIGURED", "the calibration has no verify command; verify:configured names the calibration's top-level verify command");
    return { executable: registry.fullCommand, args: [], shell: true, timeout: CONFIGURED_VERIFY_TIMEOUT_MS };
  }
  const entry = [...registry.baseline, ...registry.areas.flatMap((area) => area.commands)].find((row) => row.id === check.command);
  if (!entry) throw new Refusal("MRC-COMMAND-UNREGISTERED", `command ${check.command} is not registered under verifyImpact in the calibration`);
  return { executable: entry.command, args: [], shell: true, timeout: CHECK_TIMEOUT_MS };
}

/**
 * Observe one check. In tests `dependencies.run` replaces the process start ({ status, signal, error, stdout, stderr }) and
 * `dependencies.readConsumerVerify` the calibration reader.
 * Returns `{ exitCode, result }` where exitCode is 0 (red), 1 (green) and result is the printed object.
 */
export function observeMaintenanceRedCheck({ root: rootInput, check }, dependencies = {}) {
  let root;
  try { root = realpathSync(resolve(rootInput)); } catch { throw new Refusal("MRC-ROOT", "--root is not a readable directory"); }
  const commonDir = resolveGitCommonDir(root);
  if (commonDir === null) throw new Refusal("MRC-NOT-A-REPOSITORY", "--root is not inside a git repository");
  let state;
  try { state = JSON.parse(readFileSync(resolveAuthorityArtifactPath("state", { rootDir: root }).path, "utf8")); }
  catch { throw new Refusal("MRC-STATE-UNAVAILABLE", "the project State could not be read"); }
  const featureId = state?.activeFeature?.id;
  if (typeof featureId !== "string" || featureId === "") throw new Refusal("MRC-NO-FEATURE", "a maintenance check belongs to the active feature; there is none");
  const git = gitIn(root);
  const before = snapshot(git);
  if (before.status.trim() !== "") throw new Refusal("MRC-DIRTY", "the observation binds the clean HEAD; commit or restore the tracked changes first");
  if (check.path !== undefined) {
    // A test file that is not committed at HEAD is no check of this candidate: `node --test` on a missing file is red for the wrong reason.
    const listed = git(["ls-tree", "--name-only", "HEAD", "--", check.path]);
    if (listed.error || listed.status !== 0 || listed.stdout.trim() !== check.path) throw new Refusal("MRC-CHECK-UNTRACKED", `${check.path} is not a file committed at HEAD; a maintenance check is a test of the candidate`);
  }
  const invocation = checkInvocation(root, check, dependencies.readConsumerVerify);
  const run = (dependencies.run ?? ((spec) => spawnSync(spec.executable, spec.args, { cwd: root, env: checkEnvironment(), shell: spec.shell, timeout: spec.timeout, maxBuffer: MAX_OUTPUT_BYTES })))(invocation);
  if (run.error?.code === "ETIMEDOUT") throw new Refusal("MRC-TIMEOUT", `${describeMaintenanceCheck(check)} did not finish within ${Math.round(invocation.timeout / 1000)} s; a run that was stopped proves neither red nor green, so nothing was recorded`);
  if (run.error) throw new Refusal("MRC-RUN-FAILED", `${describeMaintenanceCheck(check)} could not be started (${run.error.code ?? "error"}); nothing was recorded`);
  // A shell reports a command it cannot find (127) or cannot execute (126) as an exit code: that is a broken command, not a red check.
  if (invocation.shell && (run.status === 126 || run.status === 127)) {
    throw new Refusal("MRC-COMMAND-NOT-RUNNABLE", `the shell could not ${run.status === 127 ? "find" : "execute"} the command of ${describeMaintenanceCheck(check)} (exit ${run.status}); fix the command or the toolchain first, nothing was recorded`);
  }
  const after = snapshot(git);
  if (after.commit !== before.commit || after.tree !== before.tree || after.status !== before.status) {
    throw new Refusal("MRC-DRIFT", `HEAD or the tracked files changed while ${describeMaintenanceCheck(check)} ran; restore them and observe again (nothing was recorded)`);
  }
  const outputSha256 = createHash("sha256").update(Buffer.concat([Buffer.from(run.stdout ?? ""), Buffer.from(run.stderr ?? "")])).digest("hex");
  const written = writeMaintenanceRedObservation({ commonDir, featureId, check, candidate: { commit: before.commit, tree: before.tree },
    exitCode: Number.isSafeInteger(run.status) ? run.status : null, signal: typeof run.signal === "string" ? run.signal : null, outputSha256,
    observedAt: (dependencies.now ?? (() => new Date()))().toISOString() });
  if (!written.ok) throw new Refusal(written.code, "the observation could not be recorded");
  const record = written.record;
  const result = { status: record.red ? "red" : "green", check: maintenanceCheckSpelling(record.check), featureId, candidate: record.candidate,
    exitCode: record.exitCode, signal: record.signal, observedAt: record.observedAt, existing: written.existing,
    next: record.red
      ? `generate the binding: dispatch-briefing.mjs binding --maintenance --check ${maintenanceCheckSpelling(record.check)} (the host reads a red Verify receipt at or before the plan approval; without one the PO acknowledges the check once: pipeline-state.mjs approve-maintenance-red-check --by <label>)`
      : `${describeMaintenanceCheck(record.check)} is green at this commit: there is nothing to repair${written.existing ? " (an earlier observation at this commit stands)" : ""}` };
  return { exitCode: record.red ? 0 : 1, result };
}

export function main(argv = process.argv.slice(2), io = { stdout: process.stdout, stderr: process.stderr }, dependencies = {}) {
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) { io.stdout.write(`${USAGE}\n`); return 0; }
  try {
    const { exitCode, result } = observeMaintenanceRedCheck(parseArgs(argv), dependencies);
    io.stdout.write(`${JSON.stringify(result)}\n`);
    return exitCode;
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    io.stderr.write(`${REFUSAL_PREFIX}: ${error.code}: ${error.message}\n`);
    return 2;
  }
}

if (isDirectInvocation(import.meta.url)) process.exitCode = main();
