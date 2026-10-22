#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
//
// Regression pin: pipeline.session-readiness-drops-to-partial-after-bootstrap-ready (ALF-C-P1-01, AC-253).
//
// Original acceptance (backlog item, Proposal): the documented bootstrap sequence must end in the
// exact readiness state the guard evaluates -- "either the preflight emits `--intent session` for an
// interactive session, or the guard accepts a ready `bootstrap` readback". The current source takes
// the first route (pipeline-start-preflight.mjs, FLAPP1-R1): once the bootstrap probe is ready it
// also asks the `session` question the guard asks, and a project that is bootstrap-ready but not
// session-ready is pointed at the read-only `inspect --intent session`.
//
// The real preflight module runs; only its project-readiness probe (a documented dependency seam,
// `requireProjectOnboardingReadyFn`) is driven so the bootstrap-ready/session-partial state is
// deterministic. The guard's admission of the emitted command is decided by the guard's own real
// function. The concurrent-schedule cause of the intermittent `cleanup_recovery_observation_unavailable`
// (measured 2026-10-05, FLAP fixes 073a5a230 and d3c41ca5e) is covered by AC7a/AC7b over real shared
// on-disk state: a separate OS process owns a real session descriptor in an onboarded fixture repository and
// retires it at an exact point of the parent's real strict cleanup-recovery observation (AC6 starts real
// parallel processes over one deterministic probe state). Not covered (named, not claimed): SKILL.md prose,
// other concurrent writers than session descriptors, and a dense create/retire loop of sub-millisecond
// descriptors, which the bounded re-observation does not absorb (see the backlog item).

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, realpathSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { observePipelineStartPreflight } from "../../scripts/pipeline-start-preflight.mjs";
import { ProjectOnboardingReadyError } from "../project-onboarding-ready-gate.mjs";
import { isSanctionedLifecycleCommand } from "../../hooks/guard-lifecycle-ready.mjs";
import { partialCleanupRecoveryResultCore } from "../project-onboarding-v3.mjs";
import { planSessionCleanupRecovery } from "../session-cleanup-recovery.mjs";
import { listActiveSessionDescriptors, retireSessionDescriptor, startSessionDescriptor } from "../worktree-lifecycle.mjs";
import { createLegacyLayoutFixture } from "../test-session-cleanup-requester-fixture.mjs";

const CWD = resolve("/projects/current");
// The readiness guard compares `--root` against a real repository identity, so admission is checked
// with this checkout as the root (the emitted argv is otherwise unchanged).
const REAL_ROOT = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const admittedForRealRoot = (action) => {
  const argv = [...action.argv];
  argv[argv.indexOf("--root") + 1] = REAL_ROOT;
  return isSanctionedLifecycleCommand(commandOf({ ...action, argv }), REAL_ROOT);
};
const manifest = JSON.stringify({ version: "0.4.5+test" });
const pluginList = () => JSON.stringify({
  installed: [{
    pluginId: "pipeline-core@agent-pipeline",
    name: "pipeline-core",
    marketplaceName: "agent-pipeline",
    version: "0.4.5+test",
    installed: true,
    enabled: true,
    source: { source: "local", path: join(resolve("/cache/agent-pipeline"), "plugins", "pipeline-core") },
    marketplaceSource: { sourceType: "git", source: "https://github.com/agent-pipe-shared/agent-pipeline.git" },
  }],
  available: [],
});

function preflight(requireProjectOnboardingReadyFn) {
  return observePipelineStartPreflight({
    env: {},
    pluginList,
    read: () => manifest,
    cwd: CWD,
    checkCloneProvisioningFn: () => ({
      schema: "pipeline.clone-provisioning-report.v1",
      status: "ready",
      checks: [
        { id: "pre-commit-hook", status: "current" },
        { id: "commit-msg-hook", status: "current" },
      ],
    }),
    observeGovernanceScopeFn: ({ rootDir }) => ({
      schema: "pipeline.governance-scope.v1", state: "active", root: rootDir, scopeKey: "a".repeat(64),
      repositoryKind: "git", provenance: { kind: "isolated-unit-capability", refs: [] },
      diagnostics: [], requiresEnforcement: true, hintAllowed: false,
    }),
    observeAntigravityLoadedTopologyFn: ({ loadedPluginRoot }) => ({
      schema: "pipeline.antigravity-loaded-topology.v1", status: "current", loadedKind: "direct",
      loadedPluginRoot, executingGuardAssurance: "not-established-by-topology",
    }),
    observe: () => ({
      schema: "pipeline.public-core-observation.v1",
      status: "ready",
      candidate: { repository: "https://github.com/agent-pipe-shared/agent-pipeline.git", branch: "main", commit: "a".repeat(40), tree: "b".repeat(40) },
      plugin: { name: "pipeline-core", version: "0.4.5+test", manifestSha256: "c".repeat(64), contentSha256: "d".repeat(64) },
    }),
    inspectEffectiveArchitectureDecisionsFn: () => ({
      schema: "pipeline.architecture-effective-decisions.v1", area: "project", status: "advisory",
      code: "ARCH-DECISION-EFFECTIVE-LEGACY-WARNING", projectionSha256: "a".repeat(64),
      decisions: [], activeExceptions: [], findings: [],
    }),
    requireProjectOnboardingReadyFn,
  });
}

const readyGate = (intent) => ({ schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent });
const partial = (intent) => new ProjectOnboardingReadyError(
  "PORG-NOT-READY", "session readiness is partial", { intent, lifecycleStatus: "partial" },
);
const intentOf = (action) => action.argv[action.argv.indexOf("--intent") + 1];
const commandOf = (action) => {
  const word = (value) => (/^[A-Za-z0-9_.:=-]+$/u.test(value) ? value : `'${value}'`);
  return [action.executable, ...action.argv].map(word).join(" ");
};

// Child mode (AC7): the same file, run as a separate process, is one concurrent "agent" that owns a real session
// descriptor in the SHARED on-disk repository the parent observes. It announces the descriptor, then retires it the
// instant the parent drops the signal file (the owner retiring its own session at an exact point of the parent's read).
if (process.env.ALF_PIN_OWNER_CHILD === "1") {
  const root = process.env.ALF_PIN_OWNER_ROOT;
  const signal = process.env.ALF_PIN_OWNER_SIGNAL;
  const handle = startSessionDescriptor(root, { ownerRuntime: null });
  writeSync(1, `${JSON.stringify({ sessionId: handle.sessionId, path: handle.path })}\n`);
  const deadline = Date.now() + 30_000;
  while (!existsSync(signal) && Date.now() < deadline) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2);
  if (!existsSync(signal)) process.exit(3);
  retireSessionDescriptor(root, { sessionId: handle.sessionId, ownerNonce: handle.ownerNonce, descriptorSha256: handle.descriptorSha256 });
  process.exit(0);
}

// Child mode (AC6): the same file, run as a separate process, emits the preflight action as JSON.
if (process.env.ALF_PIN_PREFLIGHT_CHILD === "1") {
  const result = preflight(({ intent }) => {
    if (intent === "session") throw partial("session");
    return readyGate(intent);
  });
  writeSync(1, JSON.stringify({ status: result.status, nextAction: result.nextAction }));
  process.exit(0);
}

test("AC1: bootstrap-ready but session-partial -> preflight emits the read-only `inspect --intent session` action", () => {
  const asked = [];
  const result = preflight(({ intent }) => {
    asked.push(intent);
    if (intent === "session") throw partial("session");
    return readyGate(intent);
  });
  assert.equal(result.status, "ready");
  assert.deepEqual(asked, ["bootstrap", "session"], "both the preflight question and the guard's question are asked");
  const action = result.nextAction;
  assert.equal(action.kind, "command");
  assert.equal(action.mutation, false);
  assert.equal(action.requiresConfirmation, false);
  assert.equal(action.argv[1], "inspect");
  assert.equal(intentOf(action), "session");
  assert.equal(action.expected.schema, "pipeline.project-onboarding.v4");
});

test("AC2: the emitted session action is admitted by the readiness guard's own real admission function", () => {
  const result = preflight(({ intent }) => {
    if (intent === "session") throw partial("session");
    return readyGate(intent);
  });
  assert.equal(admittedForRealRoot(result.nextAction), true);
});

test("AC3: bootstrap-ready and session-ready -> the plain bootstrap action is kept (no needless escalation)", () => {
  const result = preflight(({ intent }) => readyGate(intent));
  assert.equal(intentOf(result.nextAction), "bootstrap");
  assert.equal(result.nextAction.mutation, false);
  assert.equal(admittedForRealRoot(result.nextAction), true);
});

test("AC4: an unexpected failure of the session probe fails closed to the session action, never the plain ready path", () => {
  const result = preflight(({ intent }) => {
    if (intent === "session") throw new Error("cleanup_recovery_observation_unavailable");
    return readyGate(intent);
  });
  assert.equal(intentOf(result.nextAction), "session");
  assert.equal(result.nextAction.mutation, false);
});

test("AC5: bootstrap itself not ready -> session is not probed and the action is not the session inspect", () => {
  const asked = [];
  const result = preflight(({ intent }) => {
    asked.push(intent);
    throw new ProjectOnboardingReadyError("PORG-NOT-READY", "raw", { intent, lifecycleStatus: "draft" });
  });
  assert.deepEqual(asked, ["bootstrap"]);
  assert.notEqual(result.nextAction.argv.includes("session"), true);
  assert.equal(result.nextAction.mutation, false);
});

test("AC6: real parallel read-only preflight processes over the same probe state all see one consistent readiness snapshot", async () => {
  const run = () => new Promise((res, rej) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], {
      env: { ...process.env, ALF_PIN_PREFLIGHT_CHILD: "1" }, stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", rej);
    child.on("close", (code) => (code === 0 ? res(JSON.parse(out)) : rej(new Error(`child exit ${code}: ${err}`))));
  });
  // All children are spawned in the same tick, before any is awaited, so they genuinely overlap.
  const results = await Promise.all(Array.from({ length: 6 }, run));
  const first = JSON.stringify(results[0].nextAction);
  for (const r of results) {
    assert.equal(r.status, "ready");
    assert.equal(JSON.stringify(r.nextAction), first);
  }
  assert.equal(intentOf(results[0].nextAction), "session");
  assert.equal(results[0].nextAction.mutation, false);
});

// AC7: the measured intermittent cause (2026-10-05: 2 of 60 `inspect --intent session` runs under 4-5 concurrent
// agents) was ANOTHER session's descriptor being retired by its owner while the cleanup-recovery plan listed and loaded
// it. These cases reproduce that over REAL shared on-disk state: an onboarded fixture repository, a separate OS
// process that owns a real session descriptor in it and retires it at an exact point of this process's read, and
// the real strict cleanup-recovery observation (the function behind `inspect --intent session`). The retire is
// scheduled by a handshake (the owner retires only after the parent has read the descriptor), so the schedule is
// exact and never depends on timing. A dense create/retire loop is deliberately NOT asserted: a descriptor that lives
// for a fraction of a millisecond is outside any bounded re-observation (measured, see the backlog item).
async function withDescriptorOwnedByAnotherProcess(run) {
  const root = realpathSync(createLegacyLayoutFixture({ prefix: "pin-flap", name: "owner", goal: "Concurrent readiness pin" }));
  const signal = join(root, ".git", "pin-retire-now.signal");
  let child = null;
  try {
    child = spawn(process.execPath, [fileURLToPath(import.meta.url)], {
      env: { ...process.env, ALF_PIN_OWNER_CHILD: "1", ALF_PIN_OWNER_ROOT: root, ALF_PIN_OWNER_SIGNAL: signal }, stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stderr.on("data", (d) => { err += d; });
    const announced = await new Promise((res, rej) => {
      child.on("error", rej);
      child.on("close", (code) => rej(new Error(`owner exited before announcing its descriptor (${code}): ${err}`)));
      child.stdout.on("data", (d) => { out += d; if (out.includes("\n")) res(JSON.parse(out.split("\n")[0])); });
    });
    const closed = new Promise((res) => child.on("close", res));
    // Retire the descriptor in the OTHER process and wait until this process sees it gone.
    const retireInOtherProcess = () => {
      writeFileSync(signal, "retire\n");
      const deadline = Date.now() + 20_000;
      while (existsSync(announced.path) && Date.now() < deadline) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2);
      assert.equal(existsSync(announced.path), false, "the owning process retired its descriptor");
    };
    assert.equal(existsSync(announced.path), true, "positive control: the descriptor existed on shared disk before the race");
    await run({ root, announced, retireInOtherProcess });
    assert.equal(await closed, 0, "the owning process retired cleanly");
  } finally {
    child?.kill();
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

function observeStrict(root, planDeps) {
  let planCalls = 0;
  const result = partialCleanupRecoveryResultCore({
    root, runner: "claude", intent: "session", repository: {}, strict: true,
    deps: {
      sleepSync: () => {},
      planSessionCleanupRecovery: (args) => { planCalls += 1; return planSessionCleanupRecovery({ ...args, deps: planDeps(planCalls) }); },
    },
  });
  return { result, planCalls };
}

test("AC7a: a descriptor retired by another process between the directory read and its load is skipped; the observation is ready on the first attempt", async () => {
  await withDescriptorOwnedByAnotherProcess(({ root, retireInOtherProcess }) => {
    let raced = false;
    const { result, planCalls } = observeStrict(root, () => ({
      listActiveSessionDescriptorsFn: (rootDir, options = {}) => listActiveSessionDescriptors(rootDir, {
        ...options,
        descriptorStageHook: (stage) => { if (stage === "listed" && !raced) { raced = true; retireInOtherProcess(); } },
      }),
    }));
    assert.equal(raced, true, "the race really happened: the descriptor was listed, then retired by its owner, then loaded");
    assert.equal(result?.diagnostics?.[0]?.message ?? null, null, "the observation is ready (null), not a partial");
    assert.ok(result === null);
    assert.equal(planCalls, 1, "no re-observation was needed");
  });
});

test("AC7b: a descriptor retired by another process after it was listed, before it is inspected, is absorbed by the bounded re-observation", async () => {
  await withDescriptorOwnedByAnotherProcess(({ root, retireInOtherProcess }) => {
    let raced = false;
    const { result, planCalls } = observeStrict(root, () => ({
      listActiveSessionDescriptorsFn: (rootDir, options = {}) => {
        const listed = listActiveSessionDescriptors(rootDir, options);
        if (!raced) { raced = true; retireInOtherProcess(); }
        return listed;
      },
    }));
    assert.equal(raced, true, "the race really happened: the stale listing named a descriptor its owner had already retired");
    assert.equal(result?.diagnostics?.[0]?.message ?? null, null, "the observation is ready (null), not a partial");
    assert.ok(result === null);
    assert.equal(planCalls, 2, "the plan was re-observed exactly once, then converged");
  });
});

// Typed-reason cases (AC-253, ALF-C-P1-01C). The preflight result carries an additive
// `sessionReadiness: { reasonCode, lifecycleStatus }` when the session probe is not clean:
// PORG-NOT-READY + lifecycleStatus for the typed denial, `session-probe-failed` + null otherwise.
const TYPED_PARTIAL_CAUSES = [
  { name: "typed PORG-NOT-READY partial", thrown: () => partial("session"), reasonCode: "PORG-NOT-READY", lifecycleStatus: "partial" },
  { name: "unexpected probe failure", thrown: () => new Error("cleanup_recovery_observation_unavailable"), reasonCode: "session-probe-failed", lifecycleStatus: null },
];
for (const cause of TYPED_PARTIAL_CAUSES) {
  test(`${cause.name}: preflight result carries a typed session-readiness reason`, () => {
    const result = preflight(({ intent }) => {
      if (intent === "session") throw cause.thrown();
      return readyGate(intent);
    });
    const reason = result.sessionReadiness;
    assert.ok(reason && typeof reason === "object", "result.sessionReadiness typed reason object is absent");
    assert.equal(reason.reasonCode, cause.reasonCode);
    assert.equal(reason.lifecycleStatus, cause.lifecycleStatus);
  });
}
