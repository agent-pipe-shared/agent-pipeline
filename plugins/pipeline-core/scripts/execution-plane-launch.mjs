#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
/**
 * ADR-0062 (Production executor, #12/#14) real end-to-end wiring.
 *
 * Drives one real local-worker-supervisor run in "fixture" mode (never
 * "codex-exec", never allowProviderExecution) through a real child process,
 * normalizes the genuinely observed worker outcome through
 * normalizeRealExecutionOutcome/reduceRealExecutionState (execution-plane-
 * contract.mjs), and projects the resulting real terminal NovaExecutionState
 * into scheduling-lifecycle.mjs's composeSchedulingLifecycle. Reuses the
 * fixture/request-construction patterns already established in
 * plugins/pipeline-core/scripts/local-worker-supervisor.test.mjs and
 * plugins/pipeline-core/lib/scheduling-lifecycle.test.mjs rather than
 * inventing new supervisor-driving or lifecycle-composing code.
 *
 * Deliberately drives the fixture worker to a nonzero exit code so the real
 * observed outcome reaches "failed" -- a genuine TERMINAL_STATE for both
 * execution-plane-contract.mjs and scheduling-lifecycle.mjs, reachable
 * without fabricating a verifier pass (which this consumer has no real
 * capability to produce). A real failure is an acceptable, honestly reported
 * result (briefing NVA-A1214-EXEC-01, field 3/4).
 *
 * USAGE (briefing NVA-A1214-SUCCESS-1). The fixture exit code above used to be
 * a literal, so selecting any other real outcome meant editing this file:
 *
 *   node plugins/pipeline-core/scripts/execution-plane-launch.mjs
 *   node plugins/pipeline-core/scripts/execution-plane-launch.mjs --fixture-exit-code 0
 *   node plugins/pipeline-core/scripts/execution-plane-launch.mjs --fixture-exit-code=0
 *
 * The flag is purely additive: with NO flag the fixture exit code is still
 * DEFAULT_FIXTURE_EXIT_CODE (7), so the sealed failure-path evidence that
 * NVA-A1214-EXEC-01 cites stays reproducible byte-for-byte. An unrecognized
 * argument or an out-of-range value FAILS CLOSED rather than falling back to
 * the default -- silently sealing evidence under the wrong exit code is the
 * one failure this parameter must not be able to cause.
 *
 * WHAT --fixture-exit-code 0 ACTUALLY REACHES, stated plainly because it is a
 * property of the frozen contract and not of this flag: exit code 0 makes the
 * real worker record "completed", which normalizeRealExecutionOutcome maps to
 * "succeeded-unverified" (execution-plane-contract.mjs ~L213). That is a real
 * success-path observation, but it is NOT in that file's TERMINAL set, and
 * scheduling-lifecycle.mjs's terminal-outcome vocabulary admits only
 * {"verified"} u TERMINAL_STATE (~L130). Step 5 below therefore rejects it --
 * correctly. Reaching "verified" needs a real verifier pass this consumer
 * cannot produce, and asserting one would be exactly the fabrication the
 * paragraph above refuses. The flag exposes the choice; it does not, and must
 * not, invent the authority the contract is missing.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, uptime } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isDirectInvocation } from "../lib/entrypoint.mjs";
import { createLocalWorkerPool } from "../lib/local-worker-pool.mjs";
import {
  LOCAL_WORKER_SUPERVISOR_REQUEST_SCHEMA,
  cleanupLocalWorkerSupervisor,
  localWorkerSupervisorPackageSha256,
  localWorkerSupervisorSha256,
  localWorkerSupervisorWorkerRequestSha256,
  planLocalWorkerSupervisor,
  runLocalWorkerSupervisor,
} from "../lib/local-worker-supervisor.mjs";
import { repairLocalSupervisorState, resolveLocalSupervisorRoot } from "../lib/local-supervisor-state.mjs";
import {
  createExecutionState,
  createExecutionSubject,
  executionStateDigest,
  executionSubjectDigest,
  reduceExecutionState,
  reduceRealExecutionState,
} from "../lib/execution-plane-contract.mjs";
import { planParallelDispatch } from "../lib/parallel-dispatch-planner.mjs";
import { composeSchedulingLifecycle, schedulingLifecycleDigest, schedulingPackageSetDigest } from "../lib/scheduling-lifecycle.mjs";

const GIT = realpathSync("/usr/bin/git");
const NODE = realpathSync(process.execPath);
const REPO_ROOT = realpathSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".."));
const ADR_PATH = join(REPO_ROOT, "docs", "adr", "0062-production-execution-and-selected-sandbox-launch.md");

/**
 * The fixture exit code used when no flag is passed. 7 is the ORIGINAL literal
 * and stays the default on purpose: it is what the sealed failure-path
 * artifact under specs/sprint-nova-epic/evidence/nova-a/a4/ was produced with,
 * and what the issue-acceptance matrix cites. Changing it would silently
 * invalidate that citation.
 */
export const DEFAULT_FIXTURE_EXIT_CODE = 7;
export const FIXTURE_EXIT_CODE_FLAG = "--fixture-exit-code";
/** The supervisor's own validated bound for this field (local-worker-supervisor.mjs: safeInteger(fixture.exitCode, 0, 125)). */
export const FIXTURE_EXIT_CODE_MIN = 0;
export const FIXTURE_EXIT_CODE_MAX = 125;

/**
 * The whole CLI surface: one flag, both spellings, everything else refused.
 *
 * Deliberately NOT a general argument parser and deliberately not tolerant.
 * Ignoring an unrecognized argument would mean `--fixture-exitcode 0` (typo)
 * silently seals an evidence artifact recording exit code 7 while its filename
 * and the operator's memory both say 0 -- an evidence-integrity failure, not a
 * usability one. Every rejection names the offending token.
 *
 * @param {string[]} argv  arguments AFTER the script path, i.e. process.argv.slice(2)
 * @returns {number} the selected fixture exit code
 */
export function parseFixtureExitCode(argv = process.argv.slice(2)) {
  if (!Array.isArray(argv)) throw new Error("CLI-ARGV-SHAPE");
  let raw = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (typeof arg !== "string") throw new Error("CLI-ARGV-SHAPE");
    if (arg === FIXTURE_EXIT_CODE_FLAG) {
      if (index + 1 >= argv.length) throw new Error(`CLI-MISSING-VALUE:${FIXTURE_EXIT_CODE_FLAG}`);
      raw = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith(`${FIXTURE_EXIT_CODE_FLAG}=`)) {
      raw = arg.slice(FIXTURE_EXIT_CODE_FLAG.length + 1);
      continue;
    }
    throw new Error(`CLI-UNKNOWN-ARGUMENT:${arg}`);
  }
  if (raw === null) return DEFAULT_FIXTURE_EXIT_CODE;
  if (!/^(?:0|[1-9][0-9]*)$/u.test(raw)) throw new Error(`CLI-INVALID-VALUE:${raw}`);
  const value = Number(raw);
  if (value < FIXTURE_EXIT_CODE_MIN || value > FIXTURE_EXIT_CODE_MAX) throw new Error(`CLI-OUT-OF-RANGE:${raw}`);
  return value;
}

/**
 * The runner fixture block, unchanged in every field except the one this
 * dispatch parameterized. Kept as its own function purely so the "no flag
 * still means exactly the old literal" claim is a unit assertion rather than a
 * reading of the diff.
 */
export function buildRunnerFixture(exitCode) {
  return { delayMs: 200, exitCode, behavior: "none" };
}

function git(args, cwd) {
  return execFileSync(GIT, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" },
  }).trim();
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function capacity() {
  // effective.concurrentTasks must exceed supervisor.recoveryReserve (minimum
  // 1, LWS-REQUEST-INVALID's own bound) by at least the one worker in this
  // request, or planLocalWorkerSupervisor legitimately returns
  // LWS-SERIAL-FALLBACK-REQUIRED (local-worker-supervisor.mjs ~L571-590).
  return {
    configured: { concurrentTasks: 2, required: true },
    operator: { concurrentTasks: 2, required: true },
    certified: { concurrentTasks: 2, required: true },
    observed: { concurrentTasks: 2, required: true },
    pressure: { concurrentTasks: 2, required: false },
    reserved: { elephant: 0, verify: 0, critic: 0 },
    effective: { status: "available", concurrentTasks: 2, reasonCodes: [] },
  };
}

function buildFixtureRepo() {
  const root = mkdtempSync(join(homedir(), ".pipeline-a4-launch-"));
  const sourceRoot = join(root, "source");
  const stateBase = join(root, "state");
  mkdirSync(sourceRoot);
  mkdirSync(stateBase);
  git(["init", "-q"], sourceRoot);
  git(["config", "user.email", "nva-a1214-exec-01@example.invalid"], sourceRoot);
  git(["config", "user.name", "NVA-A1214-EXEC-01 real launch"], sourceRoot);
  mkdirSync(join(sourceRoot, "src"));
  writeFileSync(join(sourceRoot, "src", "e2e.txt"), "e2e\n", "utf8");
  git(["add", "src/e2e.txt"], sourceRoot);
  git(["commit", "-q", "-m", "nva-a1214-exec-01 fixture"], sourceRoot);
  const commit = git(["rev-parse", "HEAD"], sourceRoot);
  const tree = git(["rev-parse", `${commit}^{tree}`], sourceRoot);
  return { root, sourceRoot: realpathSync(sourceRoot), stateBase, commit, tree };
}

async function main({ fixtureExitCode = DEFAULT_FIXTURE_EXIT_CODE } = {}) {
  const fixture = buildFixtureRepo();
  const log = { steps: [] };
  try {
    // --- 1. Real execution-plane subject, shared across the LWS request and
    // the scheduling-lifecycle package/subject for full cross-system traceability.
    const authoritySha256 = sha256File(ADR_PATH);
    const dispatchId = "nva-a1214-exec-01-e2e";
    const packageId = "nova-a4-e2e";
    const executionSubject = createExecutionSubject({
      repository: "self",
      baseCommit: fixture.commit,
      baseTree: fixture.tree,
      candidateCommit: fixture.commit,
      candidateTree: fixture.tree,
      packageId,
      dispatchId,
      attempt: 0,
      queueRevision: 0,
      authorityDigests: [{ kind: "adr-0062", sha256: authoritySha256 }],
      writePaths: ["src/e2e.txt"],
      resources: ["cpu"],
    });
    const subjectSha256 = executionSubjectDigest(executionSubject);
    log.steps.push({ step: "execution-subject", subjectSha256 });

    // --- 2. Real local-worker-supervisor request: ONE worker, fixture adapter,
    // deterministic nonzero exit (no write) -- the same "keeps a failed real
    // child attributable" pattern already covered by
    // scripts/local-worker-supervisor.test.mjs.
    // planLocalWorkerSupervisor/runLocalWorkerSupervisor resolve the state
    // root internally via resolveLocalSupervisorRoot({repositoryFingerprint})
    // (default env = process.env, local-supervisor-state.mjs), so the
    // override must be the real process environment, not a passed-in object.
    process.env.XDG_STATE_HOME = fixture.stateBase;
    const resolved = resolveLocalSupervisorRoot({ repositoryFingerprint: localWorkerSupervisorSha256(fixture.sourceRoot) });
    if (!resolved.ok) throw new Error(`LWS-STATE-ROOT:${resolved.code}`);
    const stateRoot = resolved.root;
    const repaired = repairLocalSupervisorState({ root: stateRoot, repositoryFingerprint: localWorkerSupervisorSha256(fixture.sourceRoot), candidate: localWorkerSupervisorSha256(fixture.commit), subject: "nova-a1214-exec-01" });
    if (!repaired.ok) throw new Error(`LWS-STATE-REPAIR:${repaired.code}`);

    const worker = {
      taskId: "task-a4-e2e",
      subjectSha256,
      leaseId: "lease-a4-e2e",
      writePaths: ["src/e2e.txt"],
      instruction: "Edit only src/e2e.txt.",
      instructionSha256: localWorkerSupervisorSha256("Edit only src/e2e.txt."),
      heartbeatIntervalMs: 1_000,
      orphanAfterMs: 3_000,
    };
    const dispatch = { dispatchId, attempt: 0, queueRevision: 0, packageSha256: null };
    dispatch.packageSha256 = localWorkerSupervisorPackageSha256({ ...dispatch, workers: [worker] });
    const fingerprint = localWorkerSupervisorSha256(fixture.sourceRoot);
    // Real system-uptime-based monotonic clock, matching local-worker-supervisor.mjs's
    // own `monotonicMs()` helper -- a fixed literal here would fall behind a
    // long-uptime host and fail the lease's real-time bound.
    const nowMonotonicMs = Math.floor(uptime() * 1000);
    const pool = createLocalWorkerPool({
      poolId: "pool-nva-a1214-exec-01",
      candidate: { repositorySha256: fingerprint, baseCommit: fixture.commit, candidateCommit: fixture.commit },
      queueRevision: 0,
      capacity: capacity(),
      workers: [{
        subjectSha256,
        workspaceLease: {
          leaseId: worker.leaseId, subjectSha256, repository: fingerprint, baseCommit: fixture.commit, candidateCommit: fixture.commit,
          worktreePathSha256: localWorkerSupervisorSha256(join(stateRoot, "workspaces", worker.leaseId)),
          writePaths: worker.writePaths, ownerNonce: `owner-${worker.leaseId}`, issuedMonotonicMs: nowMonotonicMs, expiresMonotonicMs: nowMonotonicMs + 600_000, cleanupState: "active", evidenceSha256: authoritySha256,
        },
        process: { identitySha256: authoritySha256, separation: "observed", assuranceEvidenceSha256: authoritySha256 },
        heartbeat: { intervalMs: 1_000, orphanAfterMs: 3_000, lastObservedMonotonicMs: 1, evidenceSha256: authoritySha256 },
        state: "admitted",
        lastTransitionMonotonicMs: 1,
        stateEvidenceSha256: authoritySha256,
      }],
      admissionSet: [{ taskId: worker.taskId, subjectSha256, requestSha256: localWorkerSupervisorWorkerRequestSha256(worker), baseCommit: fixture.commit, candidateCommit: fixture.commit, writePaths: worker.writePaths, state: "admitted" }],
      cleanupOwner: { subjectSha256, ownerNonce: `owner-${worker.leaseId}`, evidenceSha256: authoritySha256 },
      serialFallback: false,
    });
    const request = {
      schema: LOCAL_WORKER_SUPERVISOR_REQUEST_SCHEMA,
      repository: { fingerprint, sourceRoot: fixture.sourceRoot, sourceRootSha256: localWorkerSupervisorSha256(fixture.sourceRoot), baseCommit: fixture.commit, candidateCommit: fixture.commit, candidateSha256: localWorkerSupervisorSha256(fixture.commit) },
      dispatch,
      supervisor: { subject: "nova-a1214-exec-01", ownerNonce: "supervisor-owner", heartbeatMs: 1_000, orphanAfterMs: 3_000, cleanupLeaseMs: 60_000, recoveryReserve: 1 },
      git: { executable: GIT, executableSha256: sha256File(GIT) },
      pool,
      runner: { kind: "fixture", executable: NODE, executableSha256: sha256File(NODE), model: null, effort: null, timeoutMs: 5_000, maxOutputBytes: 65_536, fixture: buildRunnerFixture(fixtureExitCode) },
      workers: [worker],
    };

    const planned = planLocalWorkerSupervisor({ request, stateRoot });
    if (!planned.ok || planned.plan.status !== "ready") throw new Error(`LWS-PLAN:${planned.code}`);
    log.steps.push({ step: "lws-plan", code: planned.code, planSha256: planned.plan.planSha256, requestSha256: planned.plan.requestSha256 });

    // --- 3. The real child process: this is the actual real-worker-supervisor run.
    const run = await runLocalWorkerSupervisor({ request, stateRoot, expectedPlanSha256: planned.plan.planSha256, activate: true });
    log.steps.push({ step: "lws-run", code: run.code, ok: run.ok, workerState: run.record?.workers?.[0]?.state ?? null });
    if (run.record === null) throw new Error(`LWS-RUN-NO-RECORD:${run.code}`);
    const recordWorker = run.record.workers[0];

    // --- 4. Real outcome -> execution-plane-contract. Admission/running are
    // plane bookkeeping (still the synthetic path, per execution-plane-
    // contract.mjs's own doc comment on reduceRealExecutionState); the
    // terminal outcome itself is the real one.
    const created = createExecutionState(executionSubject);
    const admissionEvidence = planned.plan.requestSha256;
    const syntheticOutcome = (kind) => ({ dispatchId, attempt: 0, candidateCommit: fixture.commit, kind, evidenceSha256: admissionEvidence, result: null });
    const admitted = reduceExecutionState(created, syntheticOutcome("admitted"));
    if (!admitted.ok) throw new Error(`EPC-ADMIT:${admitted.code}`);
    const running = reduceExecutionState(admitted.state, syntheticOutcome("running"));
    if (!running.ok) throw new Error(`EPC-RUNNING:${running.code}`);
    const realOutcome = { dispatchId, attempt: 0, candidateCommit: fixture.commit, worker: recordWorker };
    const finalReduction = reduceRealExecutionState(running.state, realOutcome);
    if (!finalReduction.ok) throw new Error(`EPC-REAL-OUTCOME:${finalReduction.code}`);
    const finalState = finalReduction.state;
    log.steps.push({ step: "execution-plane-real-outcome", state: finalState.state, code: finalReduction.code, observationSource: finalState.observation.source });

    // --- 5. Project into scheduling-lifecycle's simpler terminal-outcome shape
    // and drive composeSchedulingLifecycle for real (fixture-construction
    // pattern reused from scheduling-lifecycle.test.mjs). A second,
    // independent "companion" package is included so the remaining open
    // package set at revision 1 is never empty once the real e2e package
    // closes -- planParallelDispatch/validateParallelDispatchReceipt both
    // reject a genuinely empty package set (PDP-PACKAGE-LIMIT), and this
    // wiring script is a caller of that frozen contract, not a redesigner
    // of it.
    const companionPackageId = "nova-a4-e2e-companion";
    const companionSubject = createExecutionSubject({
      repository: "self", baseCommit: fixture.commit, baseTree: fixture.tree, candidateCommit: fixture.commit, candidateTree: fixture.tree,
      packageId: companionPackageId, dispatchId: "nva-a1214-exec-01-companion", attempt: 0, queueRevision: 0,
      authorityDigests: [{ kind: "adr-0062", sha256: authoritySha256 }], writePaths: ["src/companion.txt"], resources: ["cpu"],
    });
    const packages = [
      { id: packageId, dependencies: [], writePaths: ["src/e2e.txt"], resources: ["cpu"], kind: "implementation" },
      { id: companionPackageId, dependencies: [], writePaths: ["src/companion.txt"], resources: ["cpu"], kind: "implementation" },
    ];
    const subjects = [executionSubject, companionSubject];
    const authorityDigests = [{ kind: "adr-0062", sha256: authoritySha256 }];
    const queue0 = { queueId: "nva-a1214-exec-01", candidate: { commit: fixture.commit, tree: fixture.tree }, revision: 0, packagesSha256: schedulingPackageSetDigest(packages) };
    const plannerInput0 = { schema: "pipeline.parallel-dispatch-input.v1", maxParallel: 2, reservedSlots: 0, completed: [], packages };
    const plannerReceipt0 = planParallelDispatch(plannerInput0);
    const lifecycle0 = composeSchedulingLifecycle({ queue: queue0, plannerInput: plannerInput0, plannerReceipt: plannerReceipt0, subjects, authorityDigests, prior: null, terminalOutcomes: [] });
    log.steps.push({ step: "scheduling-lifecycle-rev0", selected: lifecycle0.selected.map((entry) => entry.packageId) });

    const projectedOutcome = { packageId, state: finalState.state, evidenceSha256: executionStateDigest(finalState), subjectSha256 };
    const queue1 = { ...queue0, revision: 1 };
    const plannerInput1 = { ...plannerInput0, completed: [] };
    const effectivePackages = packages.filter((entry) => entry.id !== packageId);
    const plannerReceipt1 = planParallelDispatch({ ...plannerInput1, packages: effectivePackages });
    const lifecycle1 = composeSchedulingLifecycle({
      queue: queue1,
      plannerInput: plannerInput1,
      plannerReceipt: plannerReceipt1,
      subjects,
      authorityDigests,
      prior: { lifecycle: lifecycle0, lifecycleSha256: schedulingLifecycleDigest(lifecycle0) },
      terminalOutcomes: [projectedOutcome],
    });
    log.steps.push({ step: "scheduling-lifecycle-rev1", failed: lifecycle1.failed, cancelled: lifecycle1.cancelled, invalidated: lifecycle1.invalidated, completed: lifecycle1.completed });

    const cleanup = cleanupLocalWorkerSupervisor({ stateRoot, expectedRecordSha256: run.record.recordSha256, activate: true });
    log.steps.push({ step: "lws-cleanup", code: cleanup.code });

    return {
      ok: true,
      lwsRecord: run.record,
      finalExecutionState: finalState,
      projectedOutcome,
      lifecycle0,
      lifecycle1,
      log,
    };
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

function sealEvidence(outcome) {
  const shortSha = git(["rev-parse", "--short", "HEAD"], REPO_ROOT);
  const evidenceDir = join(REPO_ROOT, "specs", "sprint-nova-epic", "evidence", "nova-a", "a4");
  mkdirSync(evidenceDir, { recursive: true });
  const evidencePath = join(evidenceDir, `execution-plane-launch-record-${shortSha}.json`);
  const evidence = {
    schema: "pipeline.nva-a1214-exec-01-real-launch-evidence.v1",
    dispatchId: "nva-a1214-exec-01-e2e",
    candidateShortSha: shortSha,
    realWorkerOutcomeObserved: outcome.lwsRecord.workers[0],
    localWorkerSupervisorRecord: outcome.lwsRecord,
    executionPlaneRealOutcome: outcome.finalExecutionState,
    schedulingLifecycleProjectedOutcome: outcome.projectedOutcome,
    schedulingLifecycleRev0: outcome.lifecycle0,
    schedulingLifecycleRev1: outcome.lifecycle1,
    steps: outcome.log.steps,
  };
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return evidencePath;
}

// Run only as the process entrypoint (lib/entrypoint.mjs, the plugin's one
// spelling of this check -- symlink-safe). Before this dispatch the run was
// unconditional at module load, so importing the file for ANY reason spawned a
// real child process and sealed an evidence artifact; a test could not reach
// parseFixtureExitCode without that side effect. Invoked as
// `node execution-plane-launch.mjs` the behaviour is unchanged.
if (isDirectInvocation(import.meta.url)) {
  const outcome = await main({ fixtureExitCode: parseFixtureExitCode(process.argv.slice(2)) });
  const evidencePath = sealEvidence(outcome);
  process.stdout.write(`${JSON.stringify({ ok: outcome.ok, finalState: outcome.finalExecutionState.state, steps: outcome.log.steps.length, evidencePath })}\n`);
}
export { main };
