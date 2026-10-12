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
// function. Not covered (named, not claimed): the concurrent-schedule cause of intermittent
// `cleanup_recovery_observation_unavailable` (measured 2026-10-05, separate FLAP fix), and
// SKILL.md prose.

import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { observePipelineStartPreflight } from "../../scripts/pipeline-start-preflight.mjs";
import { ProjectOnboardingReadyError } from "../project-onboarding-ready-gate.mjs";
import { isSanctionedLifecycleCommand } from "../../hooks/guard-lifecycle-ready.mjs";

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

test("AC6: the readiness snapshot is consistent -- concurrent preflights over the same probe state emit identical actions", async () => {
  const gate = ({ intent }) => {
    if (intent === "session") throw partial("session");
    return readyGate(intent);
  };
  const results = await Promise.all(Array.from({ length: 8 }, () => Promise.resolve().then(() => preflight(gate))));
  const first = JSON.stringify(results[0].nextAction);
  for (const r of results) assert.equal(JSON.stringify(r.nextAction), first);
  assert.equal(intentOf(results[0].nextAction), "session");
});
