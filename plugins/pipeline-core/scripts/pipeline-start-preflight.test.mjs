#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { validateRulesetSource } from "../lib/ruleset-source.mjs";
import { snapshotPhysicalPluginRoot } from "../lib/public-core-observation.mjs";
import { startSessionDescriptor } from "../lib/worktree-lifecycle.mjs";
import { applyInstall } from "./pre-push-hook-install.mjs";
import {
  installedPipelineIdentity, installedPipelineVersion, observePipelineStartPreflight,
  observeDutyNotRuntimeLive,
  normalBootstrapPayloadReceipt, pipelineStartPreflightExitCode, freshnessHostActionForPreflight, SCHEMA,
  STATUS_SCOPE, CONCURRENT_SESSION_WARNING_SCHEMA, resolveActiveRunner, resolveCodexAttestationSourceForPreflight,
  resolvePluginManifestVersion, observeCodexRegistryContentBinding,
} from "./pipeline-start-preflight.mjs";
import { formatOnboardingRerunCommand } from "./project-onboarding-v3.mjs";
import { BOOTSTRAP_PAYLOAD_MAX_BYTES } from "../lib/bootstrap-payload-budget.mjs";
import { inspectEffectiveArchitectureDecisions } from "../lib/architecture-effective-decisions.mjs";
// NVA-K-DRIVERREACH: `ProjectOnboardingReadyError` to inject a readiness denial exactly like
// the readiness guard's own test suite does (guard-lifecycle-ready.test.mjs's `deny()`), and
// `isSanctionedLifecycleCommand` -- the SAME real admission function that guard enforces at
// runtime, imported straight from the module that owns it -- so the property test below
// cannot pass merely by restating a string both sides happen to agree on.
import {
  PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES,
  ProjectOnboardingReadyError,
} from "../lib/project-onboarding-ready-gate.mjs";
import { isSanctionedLifecycleCommand } from "../hooks/guard-lifecycle-ready.mjs";

// TR-J (T45): platform-native fixture roots. The production code requires `resolve(root) === root`
// and compares roots by their resolved form, so a hard-coded POSIX root such as "/projects/current"
// is refused on win32 (it resolves to a drive-qualified path). `resolve` is the identity on a POSIX
// host and adds the drive on win32, so each constant is byte-identical to the former literal on
// POSIX and a valid native root on win32. Fixtures and the assertions that echo them use the SAME
// constant; no expectation is weakened.
const ROOT_CURRENT = resolve("/projects/current");
const ROOT_WSL = resolve("/projects/wsl");
const ROOT_MINE = resolve("/projects/mine");
const ROOT_OTHER = resolve("/projects/other");
const ROOT_THIRD = resolve("/projects/third");
const ROOT_NOT_A_REPOSITORY = resolve("/projects/does-not-exist-as-a-repository");
const ROOT_REPO = resolve("/repo");
// TR-J-T2b: the same rule for the registry fixture's local marketplace, its cache, the Antigravity
// manifest root and the Codex attestation checkout. Each is used on both sides of its assertion.
const ROOT_LOCAL_MARKETPLACE = resolve("/local/agent-pipeline");
const ROOT_CACHE_MARKETPLACE = resolve("/cache/agent-pipeline");
const ROOT_PLUGIN = resolve("/plugins/pipeline-core");
const ROOT_PROJECT = resolve("/project");

// TR-J-T2b: a symlink needs a privilege some hosts withhold (EPERM on Windows without it). The
// attempt itself is the probe: the case is skipped, with this typed reason, only when symlinkSync
// throws EPERM. Any other error is rethrown, and there is no platform check.
// Typed skip for the owner-runtime warning cases (PHX-WP-AAC01-MULTISESSION). The session owner's
// start identity comes from `localProcessStartIdentity` in lib/worktree-lifecycle.mjs, which reads
// /proc and is Linux-only: off Linux every freshly registered descriptor carries a null
// ownerRuntime, so a LIVE other session can never be observed. Tracked defect (not a test fault):
// backlog item 2026-10-09-concurrent-session-warning-never-fires-on-native-windows.
const OWNER_RUNTIME_LINUX_ONLY_SKIP_REASON = "OWNER-RUNTIME-LINUX-ONLY: localProcessStartIdentity reads /proc and is Linux-only, so off Linux a registered session descriptor has a null ownerRuntime and cannot be observed live or reused (backlog 2026-10-09-concurrent-session-warning-never-fires-on-native-windows)";
const SYMLINK_EPERM_SKIP_REASON ="SYMLINK-EPERM: symlinkSync was refused with EPERM on this host; the assertions that need the symlink were not run";
function symlinkOrSkip(t, target, linkPath, type) {
  try {
    symlinkSync(target, linkPath, type);
    return true;
  } catch (error) {
    if (error?.code !== "EPERM") throw error;
    t.skip(SYMLINK_EPERM_SKIP_REASON);
    return false;
  }
}

const manifest = JSON.stringify({ version: "0.4.5+test" });
const pluginList = (
  version = "0.4.5+test",
  sourceType = "git",
  marketplaceName = "agent-pipeline",
) => () => JSON.stringify({
  installed: [{
    pluginId: `pipeline-core@${marketplaceName}`,
    name: "pipeline-core",
    marketplaceName,
    version,
    installed: true,
    enabled: true,
    source: {
      source: "local",
      path: sourceType === "local"
        ? join(ROOT_LOCAL_MARKETPLACE, "plugins", "pipeline-core")
        : join(ROOT_CACHE_MARKETPLACE, "plugins", "pipeline-core"),
    },
    marketplaceSource: sourceType === "local"
      ? { sourceType: "local", source: ROOT_LOCAL_MARKETPLACE }
      : { sourceType: "git", source: "https://github.com/agent-pipe-shared/agent-pipeline.git" },
  }],
  available: [],
});

const claudeManifest = JSON.stringify({ version: "0.5.2+claude.test" });
const claudePluginList = (
  version = "0.5.2+claude.test",
  id = "pipeline-core@agent-pipeline-local",
) => () => JSON.stringify([{
  id,
  version,
  scope: "local",
  enabled: true,
  installPath: "/cache/claude/plugins/cache/agent-pipeline-local/pipeline-core",
  installedAt: "2026-08-05T21:06:31.445Z",
  lastUpdated: "2026-08-05T21:06:31.445Z",
  projectPath: ROOT_CURRENT,
}]);
const claudeKnownMarketplaces = (
  marketplaceName = "agent-pipeline-local",
  path = ROOT_REPO,
) => () => JSON.stringify({
  [marketplaceName]: {
    source: { source: "directory", path },
    installLocation: path,
    lastUpdated: "2026-08-05T21:05:40.967Z",
  },
});

// SETUPSTATUS-1: `status` says "ready" about ONE question. Leaving that question implicit
// is half of the reported contradiction -- a human read `ready` as "setup is complete"
// while the SessionStart setup-check reported pipeline.user.yaml missing, both correct.
// The scope declaration is what makes the two statements reconcilable by construction
// (setup-check.mjs's `reconcileSetupObservation` refuses an undeclared scope outright).
test("preflight declares what its status ranges over, in every status", () => {
  const cwd = ROOT_CURRENT;
  // Routed through preflight() (hermetic observe default), not raw
  // observePipelineStartPreflight: this test is about status/statusScope
  // logic, not about the origin/content attestation, so it must not depend
  // on this checkout's live git state (see the "Deterministic, hermetic
  // default" comment below for the same rationale applied file-wide).
  const ready = preflight({ env: {}, pluginList: pluginList(), read: () => manifest, cwd });
  const refresh = preflight({
    env: {}, pluginList: pluginList("0.4.4+test"), read: () => manifest, cwd,
  });
  const unavailable = preflight({
    env: {}, pluginList: pluginList(), read: () => { throw new Error("manifest unreadable"); }, cwd,
  });
  assert.equal(ready.status, "ready");
  assert.equal(refresh.status, "plugin-refresh-required");
  assert.equal(unavailable.status, "plugin-identity-unavailable");
  for (const result of [ready, refresh, unavailable]) {
    assert.equal(result.statusScope, STATUS_SCOPE);
    assert.equal(result.statusScope, "plugin-distribution-identity-and-mandatory-local-hooks");
  }
  // Structural proof that the two readiness sources are disjoint: the preflight never
  // observes project personalization, so its `ready` can never be an answer about it.
  assert.ok(!JSON.stringify(ready).includes("pipeline.user.yaml"));
});

test("preflight gates mandatory local hooks and keeps pre-push advisory", () => {
  const cwd = ROOT_CURRENT;
  const provisioning = (preCommit, commitMsg, prePush = "decline") => ({
    schema: "pipeline.clone-provisioning-report.v1", status: "provisioning-required", checks: [
      { id: "pre-commit-hook", status: preCommit },
      { id: "commit-msg-hook", status: commitMsg },
      { id: "pre-push-hook", status: prePush },
    ],
  });
  const required = preflight({ cwd, checkCloneProvisioningFn: () => provisioning("install", "install") });
  assert.equal(required.status, "hook-provisioning-required");
  assert.equal(required.nextAction.argv[0], join(required.pluginRoot, "scripts", "clone-hook-readiness.mjs"));
  assert.equal(required.nextAction.requiresConfirmation, true);
  const blocked = preflight({ cwd, checkCloneProvisioningFn: () => provisioning("foreign-owner", "current") });
  assert.equal(blocked.status, "hook-provisioning-blocked");
  assert.equal(blocked.nextAction, null);
  const optionalPush = preflight({ cwd, checkCloneProvisioningFn: () => provisioning("current", "current", "decline") });
  assert.equal(optionalPush.status, "ready");
});

// Deterministic, hermetic default for the new origin/content attestation
// dependency (design: bootstrap-origin-allowlist-and-codex-wsl-freshness.md
// §A.2/§A.3) -- mirrors `readyObservation`/`baseDependencies` in
// private-overlay-activation.test.mjs, this file's own sibling that already
// injects the same `observePublicCoreIdentity`/`observeCodexPublicCoreIdentity`
// shape rather than letting a test hit the real filesystem/Git. Every
// pre-existing test below is about the version/installed-identity logic, not
// about this new attestation, so it is defaulted to "ready" and only
// overridden by the tests that specifically exercise the new attestation.
function readyObservation() {
  return {
    schema: "pipeline.public-core-observation.v1",
    status: "ready",
    candidate: {
      repository: "https://github.com/agent-pipe-shared/agent-pipeline.git",
      branch: "main",
      commit: "a".repeat(40),
      tree: "b".repeat(40),
    },
    plugin: {
      name: "pipeline-core",
      version: "0.4.5+test",
      manifestSha256: "c".repeat(64),
      contentSha256: "d".repeat(64),
    },
  };
}
// Hermetic stand-in for the real `checkCloneProvisioning(cwd)` (the default of the
// `checkCloneProvisioningFn` seam): all three clone hooks report `current`. Cases
// that call `observePipelineStartPreflight` directly (not through `preflight()`
// below, which injects an equivalent report by default) pass it explicitly so
// their `ready` assertions never depend on which hooks this machine's checkout
// happens to have installed or whether they are stale.
function readyCloneProvisioning() {
  return {
    schema: "pipeline.clone-provisioning-report.v1", status: "ready", checks: [
      { id: "pre-commit-hook", status: "current" },
      { id: "commit-msg-hook", status: "current" },
      { id: "pre-push-hook", status: "current" },
    ],
  };
}
function preflight(options) {
  return observePipelineStartPreflight({
    checkCloneProvisioningFn: () => ({ schema: "pipeline.clone-provisioning-report.v1", status: "ready", checks: [
      { id: "pre-commit-hook", status: "current" }, { id: "commit-msg-hook", status: "current" },
    ] }),
    observeGovernanceScopeFn: ({ rootDir }) => ({ schema: "pipeline.governance-scope.v1", state: "active", root: rootDir, scopeKey: "a".repeat(64), repositoryKind: "git", provenance: { kind: "isolated-unit-capability", refs: [] }, diagnostics: [], requiresEnforcement: true, hintAllowed: false }),
    observeAntigravityLoadedTopologyFn: ({ loadedPluginRoot }) => ({ schema: "pipeline.antigravity-loaded-topology.v1", status: "current", loadedKind: "direct", loadedPluginRoot, executingGuardAssurance: "not-established-by-topology" }),

    observe: readyObservation,
    inspectEffectiveArchitectureDecisionsFn: () => ({
      schema: "pipeline.architecture-effective-decisions.v1", area: "project",
      status: "advisory", code: "ARCH-DECISION-EFFECTIVE-LEGACY-WARNING",
      projectionSha256: "a".repeat(64), decisions: [], activeExceptions: [],
      findings: [{ code: "legacy-decision-without-sidecar", path: "docs/adr/legacy.md" }],
    }),
    // Hermetic stand-in for the real onboarding gate (the default of the
    // `requireProjectOnboardingReadyFn` seam). Without it the real gate runs
    // against the live checkout and, for runner codex, answers
    // `runtime-attestation-required`, which turns the refresh-advisory cases
    // into onboarding-action cases. It sits BEFORE `...options`, so a case that
    // asserts onboarding behaviour still overrides it with its own fn.
    requireProjectOnboardingReadyFn: () => ({ schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "bootstrap" }),
    ...options,
  });
}
function assertGuidedOnboardingAction(result, root, runner) {
  assert.deepEqual(result.nextAction, {
    kind: "command",
    executable: "node",
    argv: [join(result.pluginRoot, "scripts", "onboarding-init.mjs"), "--root", root, "--runner", runner],
    mutation: false,
    requiresConfirmation: false,
    executionBoundary: result.executionBoundary,
    expected: { schema: "pipeline.onboarding-init.v1" },
  });
}
function assertRefreshAdvisory(result) {
  assert.deepEqual(result.nextAction, {
    kind: "advisory",
    executable: null,
    argv: [],
    mutation: false,
    requiresConfirmation: false,
    executionBoundary: result.executionBoundary,
    expected: { schema: "pipeline.plugin-refresh-advisory.v1" },
  });
}

test("all three runner bootstraps expose the same nonblocking decision digest", () => {
  const expected = "b".repeat(64);
  const inspect = ({ rootDir, area }) => {
    assert.equal(rootDir, ROOT_CURRENT);
    assert.equal(area, "project");
    return {
      schema: "pipeline.architecture-effective-decisions.v1", area,
      status: "advisory", code: "ARCH-DECISION-EFFECTIVE-LEGACY-WARNING",
      projectionSha256: expected,
      decisions: [{ id: "ADR-1", digest: "c".repeat(64), scope: "project", path: "docs/adr/0001.md" }],
      activeExceptions: [],
      findings: [{ code: "legacy-decision-without-sidecar", path: "docs/adr/old.md" }],
    };
  };
  for (const env of [{ CLAUDECODE: "1" }, { CODEX_SESSION_ID: "codex-session" }, { ANTIGRAVITY_AGENT: "1" }]) {
    const result = preflight({ env, pluginList: pluginList(), read: () => manifest,
      cwd: ROOT_CURRENT, inspectEffectiveArchitectureDecisionsFn: inspect });
    assert.equal(result.effectiveDecisions.projectionSha256, expected);
    assert.equal(result.effectiveDecisions.decisionCount, 1);
    assert.equal(result.effectiveDecisions.taskScopeResolved, false);
    assert.notEqual(result.status, "architecture-decision-blocked",
      "a legacy warning cannot turn bootstrap into an implementation gate");
  }
  const malformed = preflight({ env: { CODEX_SESSION_ID: "codex-session" },
    pluginList: pluginList(), read: () => manifest, cwd: ROOT_CURRENT,
    inspectEffectiveArchitectureDecisionsFn: () => ({ status: "ready", projectionSha256: expected }) });
  assert.equal(malformed.effectiveDecisions.status, "unavailable");
  assert.equal(malformed.effectiveDecisions.projectionSha256, null);
});

test("AC19 source parity uses the same physical decision projection for fresh runner bootstrap invocations", (t) => {
  const root = mkdtempSync(join(tmpdir(), "pipeline-ac19-bootstrap-parity-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "docs", "adr"), { recursive: true });
  const body = Buffer.from("# Shared project decision\n\nAll supported runners read this exact decision.\n", "utf8");
  writeFileSync(join(root, "docs", "adr", "ADR-0001.md"), body);
  writeFileSync(join(root, "docs", "adr", "ADR-0001.json"), `${JSON.stringify({
    schema: "pipeline.architecture-decision.v1",
    id: "ADR-0001",
    title: "Shared project decision",
    status: "accepted",
    digest: createHash("sha256").update(body).digest("hex"),
    scope: "project",
    date: "2026-09-27",
  })}\n`);

  const invocations = [
    ["claude", { CLAUDECODE: "1" }],
    ["codex", { CODEX_SESSION_ID: "fresh-codex-session" }],
    ["antigravity", { ANTIGRAVITY_AGENT: "1" }],
  ].map(([runner, env]) => {
    const result = preflight({ env, pluginList: pluginList(), read: () => manifest, cwd: root,
      inspectEffectiveArchitectureDecisionsFn: inspectEffectiveArchitectureDecisions });
    assert.equal(resolveActiveRunner({ env }), runner);
    assert.equal(result.effectiveDecisions.area, "project");
    assert.equal(result.effectiveDecisions.status, "ready");
    assert.equal(result.effectiveDecisions.decisionCount, 1);
    assert.equal(result.effectiveDecisions.taskScopeResolved, false);
    return result.effectiveDecisions;
  });

  assert.deepEqual(invocations[1], invocations[0]);
  assert.deepEqual(invocations[2], invocations[0]);
});

test("preflight reports exact identity and no-handoff without secret fields", () => {
  const cwd = ROOT_CURRENT;
  const result = preflight({
    env: {},
    pluginList: pluginList(),
    read: () => manifest,
    cwd,
  });
  assert.deepEqual(Object.keys(result).sort(), [
    "architectureOrientation", "bootstrapPayload", "cloneProvisioning", "concurrentSessionWarning", "effectiveDecisions", "executionBoundary", "handoff", "installedPluginAttestation",
    "installedSource", "installedVersion", "mandatoryHookReadiness", "nextAction", "pluginRoot", "rulesetSource", "schema", "status", "statusScope",
    "version",
  ]);
  assert.equal(result.schema, SCHEMA);
  assert.equal(result.statusScope, STATUS_SCOPE);
  assert.equal(result.status, "ready");
  assert.equal(result.concurrentSessionWarning, null);
  assert.equal(result.version, "0.4.5+test");
  assert.equal(result.installedVersion, "0.4.5+test");
  assert.equal(result.installedSource, "remote");
  assert.equal(result.installedPluginAttestation.status, "not-required");
  assert.equal(result.executionBoundary, "default");
  assert.equal(result.handoff, "none");
  assert.deepEqual(result.effectiveDecisions, {
    schema: "pipeline.architecture-decision-bootstrap-observation.v1",
    area: "project", status: "advisory", code: "ARCH-DECISION-EFFECTIVE-LEGACY-WARNING",
    projectionSha256: "a".repeat(64), decisionCount: 0, findingCount: 1,
    taskScopeResolved: false,
  });
  assert.ok(result.cloneProvisioning);
  assert.equal(result.cloneProvisioning.schema, "pipeline.clone-provisioning-report.v1");
  assert.equal(result.bootstrapPayload.schema, "pipeline.bootstrap-payload-receipt.v1");
  assert.equal(result.bootstrapPayload.mode, "normal");
  assert.deepEqual(result.bootstrapPayload.retainedChecks, [
    "lifecycle", "authority", "calibration", "handover", "verify", "continuation", "architecture",
  ]);
  assert.equal(result.bootstrapPayload.originalMeasurement.withinBudget, true);
  assert.match(result.bootstrapPayload.originalMeasurement.digestSha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(result.nextAction, {
    kind: "command",
    executable: "node",
    argv: [
      join(result.pluginRoot, "scripts", "project-onboarding-v3.mjs"),
      "inspect",
      "--root",
      cwd,
      "--intent",
      "bootstrap",
      "--runner",
      "codex",
    ],
    mutation: false,
    requiresConfirmation: false,
    executionBoundary: "default",
    expected: {
      schema: "pipeline.project-onboarding.v4",
    },
  });
});

test("normal bootstrap surfaces brownfield architecture adoption as a read-only actionable proposal without changing readiness", () => {
  const cwd = ROOT_CURRENT;
  const result = preflight({
    env: {}, pluginList: pluginList(), read: () => manifest, cwd,
    requireProjectOnboardingReadyFn() { return { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "bootstrap" }; },
    observeArchitectureAdoptionOrientationFn: () => ({
      schema: "pipeline.architecture-adoption-orientation.v1",
      status: "adoption-required",
      root: cwd,
      adoption: { state: "adoption-required", scope: null, decisionRef: null, coverageClass: "unavailable", confidence: "estimated" },
      physicalMap: { greenfieldScaffold: false, status: "not-classified" },
      guidance: "review proposal",
    }),
  });
  assert.equal(result.status, "ready", "plugin identity status remains narrowly scoped");
  assert.equal(result.architectureOrientation.status, "adoption-required");
  assert.deepEqual(result.architectureOrientation.nextAction, {
    kind: "command",
    executable: "node",
    argv: [
      join(result.pluginRoot, "scripts", "architecture-adoption.mjs"), "propose", "--root", cwd, "--json",
    ],
    mutation: false,
    requiresConfirmation: false,
    executionBoundary: "default",
    expected: { schema: "pipeline.adoption-proposal.v1" },
  });
});

test("a durable deferral with a missing physical map retains its decision and offers a read-only map-first proposal", () => {
  const cwd = ROOT_CURRENT;
  const result = preflight({
    env: {}, pluginList: pluginList(), read: () => manifest, cwd,
    requireProjectOnboardingReadyFn() { return { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "bootstrap" }; },
    observeArchitectureAdoptionOrientationFn: () => ({
      schema: "pipeline.architecture-adoption-orientation.v1",
      status: "decision-recorded",
      root: cwd,
      adoption: { state: "deferred-valid-until-review", scope: ["src/"], decisionRef: "po-architecture-17", coverageClass: "excepted", confidence: "measured" },
      physicalMap: { greenfieldScaffold: false, status: "missing" },
      guidance: "preserve the decision and materialize the map",
    }),
  });
  assert.equal(result.status, "ready");
  assert.equal(result.architectureOrientation.adoption.decisionRef, "po-architecture-17");
  assert.deepEqual(result.architectureOrientation.nextAction, {
    kind: "command",
    executable: "node",
    argv: [join(result.pluginRoot, "scripts", "architecture-adoption.mjs"), "propose", "--root", cwd, "--json"],
    mutation: false,
    requiresConfirmation: false,
    executionBoundary: "default",
    expected: { schema: "pipeline.adoption-proposal.v1" },
  });
});

test("a durable decision with a present physical map does not repeatedly propose adoption", () => {
  const result = preflight({
    env: {}, pluginList: pluginList(), read: () => manifest, cwd: ROOT_CURRENT,
    requireProjectOnboardingReadyFn() { return { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "bootstrap" }; },
    observeArchitectureAdoptionOrientationFn: () => ({
      schema: "pipeline.architecture-adoption-orientation.v1",
      status: "decision-recorded",
      root: ROOT_CURRENT,
      adoption: { state: "deferred-valid-until-review", scope: ["src/"], decisionRef: "po-architecture-17", coverageClass: "excepted", confidence: "measured" },
      physicalMap: { greenfieldScaffold: false, status: "present-unvalidated" },
      guidance: "verify at implementation boundary",
    }),
  });
  assert.equal(result.status, "ready");
  assert.equal(result.architectureOrientation.nextAction, null);
});

test("normal bootstrap reports a real greenfield scaffold as design-pending rather than falsely adopted", () => {
  const cwd = ROOT_CURRENT;
  const result = preflight({
    env: {}, pluginList: pluginList(), read: () => manifest, cwd,
    observeArchitectureAdoptionOrientationFn: () => ({
      schema: "pipeline.architecture-adoption-orientation.v1",
      status: "design-pending",
      root: cwd,
      adoption: { state: "adoption-required", scope: null, decisionRef: null, coverageClass: "unavailable", confidence: "estimated" },
      physicalMap: { greenfieldScaffold: true, status: "design-pending" },
      guidance: "complete initial design",
    }),
  });
  assert.equal(result.architectureOrientation.status, "design-pending");
  assert.equal(result.architectureOrientation.nextAction.kind, "advisory");
  assert.equal(result.architectureOrientation.nextAction.mutation, false);
});

// Architecture orientation is carried by the one normal preflight envelope,
// not by a runner-specific prose hint.  Re-entering an existing project must
// therefore preserve the same non-mutating Brownfield proposal for every
// supported session carrier.  The two passes model a first SessionStart and a
// later resume: preflight has no event-specific escape hatch, so either pass
// becoming different would strand one entry route without the proposal.
test("Brownfield architecture orientation is identical and actionable on fresh entry and resume for Claude, Codex, and Antigravity", () => {
  const cwd = ROOT_CURRENT;
  const orientation = {
    schema: "pipeline.architecture-adoption-orientation.v1",
    status: "adoption-required",
    root: cwd,
    adoption: { state: "adoption-required", scope: null, decisionRef: null, coverageClass: "unavailable", confidence: "estimated" },
    physicalMap: { greenfieldScaffold: false, status: "not-classified" },
    guidance: "Review the staged read-only adoption proposal with the PO before implementation.",
  };
  const runners = [
    { name: "codex", env: { CODEX_SESSION_ID: "codex-entry" }, list: pluginList() },
    { name: "claude", env: { CLAUDECODE: "1" }, list: claudePluginList("0.4.5+test") },
    {
      name: "antigravity",
      env: { ANTIGRAVITY_AGENT: "1" },
      list: pluginList(),
      antigravity: () => ({
        schema: "pipeline.antigravity-hard-enforcement-observation.v1",
        observed: true,
        freshWindowMs: 1,
        warning: null,
      }),
    },
  ];
  const proposals = [];
  for (const entry of ["fresh", "resume"]) {
    for (const runner of runners) {
      let observedCalls = 0;
      assert.equal(resolveActiveRunner({ env: runner.env }), runner.name);
      const result = preflight({
        env: { ...runner.env, PIPELINE_TEST_ENTRY: entry },
        pluginList: runner.list,
        read: () => manifest,
        cwd,
        observeAntigravityHardEnforcementFn: runner.antigravity,
        requireProjectOnboardingReadyFn: () => ({ schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "bootstrap" }),
        observeArchitectureAdoptionOrientationFn: ({ rootDir }) => {
          observedCalls += 1;
          assert.equal(rootDir, cwd);
          return orientation;
        },
      });
      assert.equal(observedCalls, 1, `${runner.name}/${entry}: orientation is read exactly once from the normal entry envelope`);
      // Runner distribution checks may legitimately differ (the Antigravity
      // adapter has its own enforcement attestation), but an unresolved
      // architecture estate must never become a bootstrap status. It is an
      // orientation plus a later implementation-boundary concern.
      assert.ok(["ready", "plugin-refresh-required"].includes(result.status), `${runner.name}/${entry}: ${result.status}`);
      assert.equal(result.architectureOrientation.status, "adoption-required");
      assert.equal(result.architectureOrientation.nextAction.mutation, false);
      assert.equal(result.architectureOrientation.nextAction.requiresConfirmation, false);
      assert.deepEqual(result.architectureOrientation.nextAction.expected, { schema: "pipeline.adoption-proposal.v1" });
      proposals.push(result.architectureOrientation.nextAction);
    }
  }
  for (const proposal of proposals.slice(1)) assert.deepEqual(proposal, proposals[0]);
});

test("all three runner entry routes retain a valid deferral while proposing a missing map on fresh entry and resume", () => {
  const cwd = ROOT_CURRENT;
  const orientation = {
    schema: "pipeline.architecture-adoption-orientation.v1",
    status: "decision-recorded",
    root: cwd,
    adoption: { state: "deferred-valid-until-review", scope: ["src/"], decisionRef: "po-architecture-17", coverageClass: "excepted", confidence: "measured" },
    physicalMap: { greenfieldScaffold: false, status: "missing" },
    guidance: "Preserve the decision and materialize the map before implementation.",
  };
  const runners = [
    { name: "codex", env: { CODEX_SESSION_ID: "codex-entry" }, list: pluginList() },
    { name: "claude", env: { CLAUDECODE: "1" }, list: claudePluginList("0.4.5+test") },
    { name: "antigravity", env: { ANTIGRAVITY_AGENT: "1" }, list: pluginList(), antigravity: () => ({
      schema: "pipeline.antigravity-hard-enforcement-observation.v1", observed: true, freshWindowMs: 1, warning: null,
    }) },
  ];
  const proposals = [];
  for (const entry of ["fresh", "resume"]) {
    for (const runner of runners) {
      let observedCalls = 0;
      assert.equal(resolveActiveRunner({ env: runner.env }), runner.name);
      const result = preflight({
        env: { ...runner.env, PIPELINE_TEST_ENTRY: entry }, pluginList: runner.list,
        read: () => manifest, cwd, observeAntigravityHardEnforcementFn: runner.antigravity,
        requireProjectOnboardingReadyFn: () => ({ schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "bootstrap" }),
        observeArchitectureAdoptionOrientationFn: ({ rootDir }) => {
          observedCalls += 1;
          assert.equal(rootDir, cwd);
          return orientation;
        },
      });
      assert.equal(observedCalls, 1, `${runner.name}/${entry}: decision readback must happen once`);
      assert.ok(["ready", "plugin-refresh-required"].includes(result.status), `${runner.name}/${entry}: ${result.status}`);
      assert.equal(result.architectureOrientation.adoption.decisionRef, "po-architecture-17");
      assert.equal(result.architectureOrientation.nextAction.kind, "command");
      assert.equal(result.architectureOrientation.nextAction.mutation, false);
      assert.equal(result.architectureOrientation.nextAction.requiresConfirmation, false);
      assert.deepEqual(result.architectureOrientation.nextAction.expected, { schema: "pipeline.adoption-proposal.v1" });
      proposals.push(result.architectureOrientation.nextAction);
    }
  }
  for (const proposal of proposals.slice(1)) assert.deepEqual(proposal, proposals[0]);
});

// NVA-K-DRIVERREACH (backlog: 2026-08-28-the-guided-driver-is-neither-discoverable-nor-
// runnable.md). Before this dispatch the bootstrap's own `nextAction` named the bare
// `inspect` for a not-yet-onboarded project too -- the one place the pipeline-start skill
// already instructs an agent to execute the returned action verbatim, and therefore the one
// place discovery of the driver actually had to happen. `requireProjectOnboardingReadyFn` is
// injected here exactly like the readiness guard's own test suite injects a denial
// (guard-lifecycle-ready.test.mjs's `deny()`), never a real filesystem/git observation.
function commandFromNextAction(action) {
  const word = (value) => (/^[A-Za-z0-9_.:=-]+$/u.test(value) ? value : `'${value}'`);
  return [action.executable, ...action.argv].map(word).join(" ");
}

test("NVA-K-DRIVERREACH: a not-ready project's nextAction names the guided driver, in its exact admitted shape", () => {
  const cwd = ROOT_CURRENT;
  const result = preflight({
    env: {},
    pluginList: pluginList(),
    read: () => manifest,
    cwd,
    requireProjectOnboardingReadyFn() {
      throw new ProjectOnboardingReadyError(
        "PORG-NOT-READY",
        "raw lifecycle message",
        { intent: "bootstrap", lifecycleStatus: "kickoff-required" },
      );
    },
  });
  assert.equal(result.status, "ready");
  assert.deepEqual(result.nextAction, {
    kind: "command",
    executable: "node",
    argv: [
      join(result.pluginRoot, "scripts", "onboarding-init.mjs"),
      "--root",
      cwd,
      "--runner",
      "codex",
    ],
    mutation: false,
    requiresConfirmation: false,
    executionBoundary: "default",
    expected: {
      schema: "pipeline.onboarding-init.v1",
    },
  });
});

test("a soft plugin refresh still exposes the not-ready project's onboarding action", () => {
  const result = preflight({
    env: {}, pluginList: pluginList("0.4.5+new"), read: () => manifest,
    cwd: ROOT_CURRENT,
    requireProjectOnboardingReadyFn() {
      throw new ProjectOnboardingReadyError("PORG-NOT-READY", "onboarding pending", {
        intent: "bootstrap", lifecycleStatus: "intake-required",
      });
    },
  });
  assert.equal(result.status, "plugin-refresh-required");
  assert.equal(result.nextAction.kind, "command");
  assert.equal(result.nextAction.argv[0], join(result.pluginRoot, "scripts", "onboarding-init.mjs"));
  assert.equal(result.nextAction.expected.schema, "pipeline.onboarding-init.v1");
});
test("NVA-K-DRIVERREACH: an already-ready project's nextAction stays the pre-existing inspect action, unchanged", () => {
  const cwd = ROOT_CURRENT;
  const result = preflight({
    env: {},
    pluginList: pluginList(),
    read: () => manifest,
    cwd,
    requireProjectOnboardingReadyFn() {
      return { schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "bootstrap" };
    },
  });
  assert.deepEqual(result.nextAction, {
    kind: "command",
    executable: "node",
    argv: [
      join(result.pluginRoot, "scripts", "project-onboarding-v3.mjs"),
      "inspect",
      "--root",
      cwd,
      "--intent",
      "bootstrap",
      "--runner",
      "codex",
    ],
    mutation: false,
    requiresConfirmation: false,
    executionBoundary: "default",
    expected: {
      schema: "pipeline.project-onboarding.v4",
    },
  });
});

// AC-3: the property, not the string. Whatever command the bootstrap's own `nextAction`
// names -- for every one of PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES, not just the
// one status the two tests above happen to use -- the readiness guard's own real admission
// function must admit it. The two cannot diverge: this repository has already been bitten
// once by a refusal naming a command the guard refused (backlog:
// 2026-08-28-the-readiness-guard-blocks-the-recovery-command-it-names.md).
test("NVA-K-DRIVERREACH: whatever command a not-ready bootstrap's nextAction names, the readiness guard admits it -- the property, not a string", () => {
  for (const lifecycleStatus of PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES) {
    const cwd = ROOT_CURRENT;
    const result = preflight({
      env: {},
      pluginList: pluginList(),
      read: () => manifest,
      cwd,
      requireProjectOnboardingReadyFn() {
        throw new ProjectOnboardingReadyError(
          "PORG-NOT-READY",
          "raw lifecycle message",
          { intent: "bootstrap", lifecycleStatus },
        );
      },
    });
    assert.equal(result.nextAction.kind, "command", lifecycleStatus);
    assert.equal(result.nextAction.mutation, false, lifecycleStatus);
    const command = commandFromNextAction(result.nextAction);
    assert.equal(isSanctionedLifecycleCommand(command, cwd), true, `${lifecycleStatus}: ${command}`);
  }
});

test("preflight declares the Claude runner when CLAUDECODE marks the session", () => {
  const cwd = ROOT_CURRENT;
  const result = preflight({
    env: { CLAUDECODE: "1" },
    pluginList: pluginList(),
    read: () => manifest,
    cwd,
  });
  assert.deepEqual(result.nextAction.argv.slice(-2), ["--runner", "claude"]);
});

test("preflight keeps the Codex runner default for any non-Claude-Code session", () => {
  for (const env of [{}, { CLAUDECODE: "0" }, { CLAUDECODE: "true" }]) {
    const result = preflight({
      env,
      pluginList: pluginList(),
      read: () => manifest,
      cwd: ROOT_CURRENT,
    });
    assert.deepEqual(result.nextAction.argv.slice(-2), ["--runner", "codex"], JSON.stringify(env));
  }
});

// Backlog: a-po-ceremony-in-the-po-s-own-terminal-resolves-the-wrong-runner.md.
// resolveActiveRunner is the ONE shared implementation both project-onboarding-v3.mjs
// and pipeline-start-preflight.mjs route through -- these pin its own contract
// directly, independent of either call site's own wiring choices.
const CLAUDE_DEFAULT_SOURCE = 'schema: "pipeline.user.v3"\nrunners:\n  default: "claude"\n';
const CODEX_DEFAULT_SOURCE = 'schema: "pipeline.user.v3"\nrunners:\n  default: "codex"\n';

test("resolveActiveRunner: a genuine Codex session resolves codex even in a claude-default repository", () => {
  const runner = resolveActiveRunner({
    env: { CODEX_SESSION_ID: "codex-session-1" },
    rootDir: ROOT_REPO,
    read: () => CLAUDE_DEFAULT_SOURCE,
  });
  assert.equal(runner, "codex");
  const viaThread = resolveActiveRunner({
    env: { CODEX_THREAD_ID: "codex-thread-1" },
    rootDir: ROOT_REPO,
    read: () => CLAUDE_DEFAULT_SOURCE,
  });
  assert.equal(viaThread, "codex");
});

test("resolveActiveRunner: a signal-less shell in a claude-default repository resolves claude", () => {
  const runner = resolveActiveRunner({
    env: {},
    rootDir: ROOT_REPO,
    read: () => CLAUDE_DEFAULT_SOURCE,
  });
  assert.equal(runner, "claude");
});

test("resolveActiveRunner: a signal-less shell in a repository declaring nothing resolves codex", () => {
  const noRootDir = resolveActiveRunner({ env: {} });
  assert.equal(noRootDir, "codex");
  const unreadableSource = resolveActiveRunner({
    env: {},
    rootDir: ROOT_REPO,
    read: () => { throw new Error("ENOENT: pipeline.user.yaml"); },
  });
  assert.equal(unreadableSource, "codex");
  const noDeclaredDefault = resolveActiveRunner({
    env: {},
    rootDir: ROOT_REPO,
    read: () => 'schema: "pipeline.user.v3"\n',
  });
  assert.equal(noDeclaredDefault, "codex");
});

test("resolveActiveRunner: an actual CLAUDECODE/Antigravity signal is never overridden by a declared default", () => {
  assert.equal(resolveActiveRunner({
    env: { CLAUDECODE: "1" },
    rootDir: ROOT_REPO,
    read: () => CODEX_DEFAULT_SOURCE,
  }), "claude");
  assert.equal(resolveActiveRunner({
    env: { ANTIGRAVITY_AGENT: "1" },
    rootDir: ROOT_REPO,
    read: () => CODEX_DEFAULT_SOURCE,
  }), "antigravity");
});

test("a rendered PO-facing re-run command always carries --runner explicitly", () => {
  // The under-specified shape: the agent's own original invocation never spelled
  // out --runner (it was resolved implicitly via resolveOnboardingCliRunner), so
  // the byte-faithful echo of argv would otherwise hand a human an ambiguous
  // command to type into their own, possibly signal-less, attended terminal.
  const argsWithoutRunner = ["kickoff-plan", "--root", ROOT_REPO, "--goal", "ship it", "--language", "en"];
  const rendered = formatOnboardingRerunCommand(argsWithoutRunner, "claude");
  assert.match(rendered, /--runner"\s*"claude"$/u);
  assert.ok(!argsWithoutRunner.includes("--runner"), "the original argv is never mutated");

  // Already-explicit --runner is preserved verbatim, never duplicated.
  const argsWithRunner = ["kickoff-plan", "--root", ROOT_REPO, "--runner", "codex", "--goal", "g", "--language", "en"];
  const renderedExplicit = formatOnboardingRerunCommand(argsWithRunner, "codex");
  assert.equal((renderedExplicit.match(/--runner/gu) ?? []).length, 1);
});

test("normal bootstrap receipt retains exact envelope measurement and over-budget state", () => {
  // Derived from the owner, never a literal: this probe must prove "over budget"
  // for whatever the budget is. As a literal one budget behind it silently became
  // an UNDER-budget payload when the budget was raised, inverting both assertions.
  const receipt = normalBootstrapPayloadReceipt({ schema: "test", payload: "x".repeat(BOOTSTRAP_PAYLOAD_MAX_BYTES + 1) });
  assert.equal(receipt.overBudget, true);
  assert.equal(receipt.truncated, false);
  assert.equal(receipt.originalMeasurement.withinBudget, false);
});

test("preflight selects one host-authorized capability boundary for WSL under Codex, including an explicit CLAUDECODE=0", () => {
  for (const env of [
    { WSL_DISTRO_NAME: "Ubuntu" },
    { WSL_INTEROP: "/run/WSL/1_interop" },
    { CLAUDECODE: "0", WSL_DISTRO_NAME: "Ubuntu" },
  ]) {
    const result = preflight({
      env,
      pluginList: pluginList(),
      read: () => manifest,
      cwd: ROOT_WSL,
    });
    assert.equal(result.executionBoundary, "host-authorized-wsl", JSON.stringify(env));
    assert.equal(result.nextAction.executionBoundary, "host-authorized-wsl", JSON.stringify(env));
    assert.equal(result.nextAction.argv[3], ROOT_WSL);
  }
});

// PX0-AC-13 rework: the pre-fix formula (`wsl ? "host-authorized-wsl" : "default"`)
// granted the Codex-only host-authorized boundary to a Claude Code session
// under WSL too, because it never consulted `runner`. This test discriminates
// exactly that defect: reverting the one-line fix in
// pipeline-start-preflight.mjs's `executionBoundary` computation (back to the
// runner-blind formula) turns this assertion red, while every other test in
// this file (all of which leave CLAUDECODE unset when combined with a WSL env,
// or leave WSL env unset when combined with CLAUDECODE) stays green -- proven
// manually during this task's verification pass, not left to reviewer trust.
test("PX0-AC-13: a Claude Code session under WSL never receives the Codex-only host-authorized boundary", () => {
  for (const env of [
    { CLAUDECODE: "1", WSL_DISTRO_NAME: "Ubuntu" },
    { CLAUDECODE: "1", WSL_INTEROP: "/run/WSL/1_interop" },
  ]) {
    const result = preflight({
      env,
      pluginList: pluginList(),
      read: () => manifest,
      cwd: ROOT_WSL,
    });
    assert.equal(result.executionBoundary, "default", JSON.stringify(env));
    assert.equal(result.nextAction.executionBoundary, "default", JSON.stringify(env));
    assert.deepEqual(result.nextAction.argv.slice(-2), ["--runner", "claude"], JSON.stringify(env));
  }
});

test("preflight distinguishes complete and malformed handoff by presence only", () => {
  const ready = preflight({
    env: {
      PIPELINE_CODEX_ONBOARDING_TICKET_ID: "private-ticket",
      PIPELINE_CODEX_ONBOARDING_TOKEN: "private-token",
    },
    pluginList: pluginList(),
    read: () => manifest,
  });
  assert.equal(ready.handoff, "ready");
  assert.equal(JSON.stringify(ready).includes("private-ticket"), false);
  assert.equal(JSON.stringify(ready).includes("private-token"), false);

  for (const env of [
    { PIPELINE_CODEX_ONBOARDING_TICKET_ID: "private-ticket" },
    { PIPELINE_CODEX_ONBOARDING_TOKEN: "private-token" },
    { PIPELINE_CODEX_ONBOARDING_TICKET_ID: "", PIPELINE_CODEX_ONBOARDING_TOKEN: "private-token" },
  ]) {
    assert.equal(preflight({
      env,
      pluginList: pluginList(),
      read: () => manifest,
    }).handoff, "malformed");
  }
});

test("preflight turns a loaded/installed mismatch into a typed refresh handoff", () => {
  const result = preflight({
    env: {},
    pluginList: pluginList("0.4.5+new"),
    read: () => manifest,
  });
  assert.equal(result.status, "plugin-refresh-required");
  assert.equal(result.version, "0.4.5+test");
  assert.equal(result.installedVersion, "0.4.5+new");
  assert.equal(pipelineStartPreflightExitCode(result), 0);
});

test("an exact registered local marketplace is a visible development source", () => {
  const result = preflight({
    env: {},
    pluginList: pluginList("0.4.5+test", "local"),
    read: () => manifest,
  });
  assert.equal(result.status, "ready");
  assert.equal(result.installedVersion, "0.4.5+test");
  assert.equal(result.installedSource, "local-development");
  assert.deepEqual(installedPipelineIdentity(pluginList("0.4.5+test", "local")), {
    version: "0.4.5+test",
    source: "local-development",
  });
});

// NVA-PLUGIN-PRECEDENCE / D5: an attested local-development entry (exact local
// marketplace source + exact local install path) is an explicit, machine-local
// act of intent and wins over a coexisting eligible official entry for the same
// repository -- this used to fail closed as ambiguous; that was exactly the
// friction this task fixes (`codexAttestedLocalWinsOverOfficial`).
test("an attested local-development entry wins over a coexisting official entry (Codex, D5)", () => {
  const official = JSON.parse(pluginList("0.4.4", "git")()).installed[0];
  const local = JSON.parse(pluginList(
    "0.4.5+test",
    "local",
    "agent-pipeline-local",
  )()).installed[0];
  const both = () => JSON.stringify({ installed: [official, local], available: [] });
  assert.deepEqual(installedPipelineIdentity(both), { version: "0.4.5+test", source: "local-development" });
  const result = preflight({
    env: {},
    pluginList: both,
    read: () => manifest,
  });
  assert.equal(result.status, "ready");
  assert.equal(result.installedVersion, "0.4.5+test");
  assert.equal(result.installedSource, "local-development");
});

test("the isolated development id is accepted only from its exact local marketplace root", () => {
  for (const invalid of [
    pluginList("0.4.5+test", "git", "agent-pipeline-local"),
    () => {
      const entry = JSON.parse(pluginList(
        "0.4.5+test",
        "local",
        "agent-pipeline-local",
      )()).installed[0];
      entry.marketplaceSource.source = "/other/local-marketplace";
      return JSON.stringify({ installed: [entry], available: [] });
    },
  ]) {
    assert.equal(installedPipelineIdentity(invalid), null);
  }
});

test("unavailable registry remains non-blocking when the loaded identity is coherent", () => {
  for (const unavailable of [
    () => { throw new Error("unavailable"); },
    () => "{",
    () => JSON.stringify({ installed: [] }),
  ]) {
    const result = preflight({
      env: {},
      pluginList: unavailable,
      read: () => manifest,
    });
    assert.equal(result.status, "ready");
    assert.equal(result.installedVersion, null);
    assert.equal(result.installedSource, "unknown");
  }
});

test("installed version accepts only one exact enabled Agent-Pipeline entry", () => {
  assert.equal(installedPipelineVersion(pluginList()), "0.4.5+test");
  for (const invalid of [
    () => JSON.stringify({}),
    () => JSON.stringify({ installed: "invalid" }),
    () => JSON.stringify({ installed: [{
      pluginId: "pipeline-core@other",
      name: "pipeline-core",
      marketplaceName: "other",
      version: "9",
      installed: true,
      enabled: true,
      source: { source: "local", path: "/cache/other/plugins/pipeline-core" },
      marketplaceSource: { sourceType: "git", source: "https://example.invalid/other.git" },
    }] }),
    () => JSON.stringify({ installed: [
      JSON.parse(pluginList()()).installed[0],
      JSON.parse(pluginList("0.4.5+other")()).installed[0],
    ] }),
  ]) assert.equal(installedPipelineVersion(invalid), null);
});

test("missing or malformed manifest fails identity closed", () => {
  for (const read of [
    () => { throw new Error("missing"); },
    () => "{}",
    () => "{",
  ]) {
    const result = preflight({
      env: {},
      pluginList: pluginList(),
      read,
    });
    assert.equal(result.status, "plugin-identity-unavailable");
    assert.equal(result.version, null);
    assert.equal(pipelineStartPreflightExitCode(result), 2);
  }
});

test("a Claude session reads the Claude source manifest, never the Codex one", () => {
  const result = preflight({
    env: { CLAUDECODE: "1" },
    pluginList: () => JSON.stringify([]),
    read: (path) => {
      if (String(path).replaceAll("\\", "/").endsWith(".claude-plugin/plugin.json")) return claudeManifest;
      throw new Error(`unexpected manifest path for the Claude runner: ${path}`);
    },
    cwd: ROOT_CURRENT,
  });
  assert.equal(result.version, "0.5.2+claude.test");
});

test("a non-Claude-Code session still reads the Codex source manifest, never the Claude one", () => {
  const result = preflight({
    env: {},
    pluginList: pluginList(),
    read: (path) => {
      if (String(path).replaceAll("\\", "/").endsWith(".codex-plugin/plugin.json")) return manifest;
      throw new Error(`unexpected manifest path for the Codex runner: ${path}`);
    },
    cwd: ROOT_CURRENT,
  });
  assert.equal(result.version, "0.4.5+test");
});

test("Antigravity reads its own plugin manifest, never the Codex-shaped manifest", () => {
  const paths = [];
  const version = resolvePluginManifestVersion(ROOT_PLUGIN, "antigravity", (path) => {
    paths.push(String(path));
    if (String(path).replaceAll("\\", "/").endsWith("/plugin.json")) return JSON.stringify({ version: "0.6.2+antigravity.test" });
    throw new Error(`unexpected manifest path for Antigravity: ${path}`);
  });
  assert.equal(version, "0.6.2+antigravity.test");
  assert.deepEqual(paths, [join(ROOT_PLUGIN, "plugin.json")]);
});

test("a Claude bare-array registry resolves an attested local-development installation", () => {
  const result = preflight({
    env: { CLAUDECODE: "1" },
    pluginList: claudePluginList(),
    knownMarketplaces: claudeKnownMarketplaces(),
    read: () => claudeManifest,
    cwd: ROOT_CURRENT,
  });
  assert.equal(result.status, "ready");
  assert.equal(result.installedVersion, "0.5.2+claude.test");
  assert.equal(result.installedSource, "local-development");
  assert.deepEqual(
    installedPipelineIdentity(claudePluginList(), "claude", claudeKnownMarketplaces()),
    { version: "0.5.2+claude.test", source: "local-development" },
  );
});

// NVA-PLUGIN-PRECEDENCE / D1: an attested local-development entry (registered as
// a `directory`-source marketplace in the host's own `known_marketplaces.json`,
// as `claudeKnownMarketplaces()`'s default fixture is) is an explicit,
// machine-local act of intent and wins over a coexisting eligible official
// entry -- this used to fail closed as ambiguous; that was exactly the bug
// this task fixes (`claudeAttestedLocalWinsOverOfficial`).
test("an attested local-development entry wins over a coexisting official entry (D1)", () => {
  const both = () => JSON.stringify([
    { id: "pipeline-core@agent-pipeline-local", version: "0.5.2+claude.test", scope: "local", enabled: true },
    { id: "pipeline-core@agent-pipeline", version: "0.5.1+claude.b", scope: "local", enabled: true },
  ]);
  assert.deepEqual(
    installedPipelineIdentity(both, "claude", claudeKnownMarketplaces()),
    { version: "0.5.2+claude.test", source: "local-development" },
  );
  const result = preflight({
    env: { CLAUDECODE: "1" },
    pluginList: both,
    knownMarketplaces: claudeKnownMarketplaces(),
    read: () => claudeManifest,
  });
  assert.equal(result.status, "ready");
  assert.equal(result.installedVersion, "0.5.2+claude.test");
  assert.equal(result.installedSource, "local-development");
});

// D2: an UNATTESTED local id carries no proven intent, so it must not silently
// win over a coexisting official entry either -- the pair stays exactly the
// pre-existing ambiguous/fail-closed outcome, unchanged by D1.
test("an unattested local-development entry does not win over a coexisting official entry", () => {
  const both = () => JSON.stringify([
    { id: "pipeline-core@agent-pipeline-local", version: "0.5.2+claude.a", scope: "local", enabled: true },
    { id: "pipeline-core@agent-pipeline", version: "0.5.1+claude.b", scope: "local", enabled: true },
  ]);
  const unattested = () => JSON.stringify({});
  assert.deepEqual(
    installedPipelineIdentity(both, "claude", unattested),
    { version: null, source: "unknown", ambiguous: true },
  );
});

// D4: two eligible LOCAL entries are a genuine registry duplicate, not an
// expression of intent -- they must still fail closed as ambiguous.
test("two eligible Claude local-development entries still collide as ambiguous", () => {
  const twoLocal = () => JSON.stringify([
    { id: "pipeline-core@agent-pipeline-local", version: "0.5.2+claude.a", scope: "local", enabled: true },
    { id: "pipeline-core@agent-pipeline-local", version: "0.5.3+claude.b", scope: "user", enabled: true },
  ]);
  assert.deepEqual(
    installedPipelineIdentity(twoLocal, "claude", claudeKnownMarketplaces()),
    { version: null, source: "unknown", ambiguous: true },
  );
});

// GF-111: a `scope: "project"` entry belonging to a DIFFERENT project on the same
// host must never count toward THIS session's ambiguity check -- only entries
// for the current project (or scope "user"/"local", which are not project-scoped
// at all) can ever conflict with each other for the running cwd. Fixture: one
// scope:"user" entry (no projectPath) plus two scope:"project" entries for two
// different projects, all sharing id `pipeline-core@agent-pipeline`.
const threeEntriesFixture = () => JSON.stringify([
  { id: "pipeline-core@agent-pipeline", version: "0.5.4", scope: "user", enabled: true },
  {
    id: "pipeline-core@agent-pipeline", version: "0.5.4", scope: "project", enabled: true,
    projectPath: ROOT_MINE,
  },
  {
    id: "pipeline-core@agent-pipeline", version: "0.5.4", scope: "project", enabled: true,
    projectPath: ROOT_OTHER,
  },
]);

test("a Claude project-scope entry for an unrelated project never counts toward this session's ambiguity", () => {
  // cwd matches NEITHER project-scope entry's projectPath: both drop out of eligibility,
  // leaving the scope:"user" entry as the single match -- resolves cleanly, not ambiguous.
  const cwd = ROOT_THIRD;
  const identity = installedPipelineIdentity(threeEntriesFixture, "claude", claudeKnownMarketplaces(), cwd);
  assert.deepEqual(identity, { version: "0.5.4", source: "unknown" });
  // Routed through preflight() (hermetic observe default): this test is
  // about scope-eligibility logic, not the origin/content attestation.
  const result = preflight({
    env: { CLAUDECODE: "1" },
    pluginList: threeEntriesFixture,
    knownMarketplaces: claudeKnownMarketplaces(),
    read: () => JSON.stringify({ version: "0.5.4" }),
    cwd,
  });
  assert.equal(result.status, "ready");
  assert.equal(result.installedVersion, "0.5.4");
  assert.equal(result.installedSource, "unknown");
});

// PO decision 2026-08-11 (backlog/items/2026-08-11-preflight-user-and-matching-project-
// scope-still-collide-as-ambiguous.md, option 2): a repo-committed scope:"project"
// registration is a team decision and beats a machine-wide scope:"user" default for the
// same id -- it now SHADOWS the coexisting scope:"user" entry rather than merely coexisting
// with it as ambiguous. This supersedes the prior "explicitly forbidden" precedence-rule
// stance: the PO has now explicitly authorized this precedence.
test("a Claude project-scope entry matching cwd shadows a coexisting unrelated user-scope entry", () => {
  const cwd = ROOT_MINE;
  const identity = installedPipelineIdentity(threeEntriesFixture, "claude", claudeKnownMarketplaces(), cwd);
  assert.deepEqual(identity, { version: "0.5.4", source: "unknown" });
  // Routed through preflight() (hermetic observe default): this test is
  // about scope-precedence logic, not the origin/content attestation.
  const result = preflight({
    env: { CLAUDECODE: "1" },
    pluginList: threeEntriesFixture,
    knownMarketplaces: claudeKnownMarketplaces(),
    read: () => JSON.stringify({ version: "0.5.4" }),
    cwd,
  });
  assert.equal(result.status, "ready");
  assert.equal(result.installedVersion, "0.5.4");
  assert.equal(result.installedSource, "unknown");
});

// The shadowing rule is never a hardcoded "collapse to 1": two genuinely eligible
// scope:"project" entries for the SAME id and the SAME cwd are a real registry duplicate,
// not a scope-precedence case, and must still fail closed as ambiguous.
test("two eligible Claude project-scope entries for the same id and cwd still collide as ambiguous", () => {
  const duplicateProjectFixture = () => JSON.stringify([
    {
      id: "pipeline-core@agent-pipeline", version: "0.5.4", scope: "project", enabled: true,
      projectPath: ROOT_MINE,
    },
    {
      id: "pipeline-core@agent-pipeline", version: "0.5.5", scope: "project", enabled: true,
      projectPath: ROOT_MINE,
    },
  ]);
  const cwd = ROOT_MINE;
  const identity = installedPipelineIdentity(duplicateProjectFixture, "claude", claudeKnownMarketplaces(), cwd);
  assert.deepEqual(identity, { version: null, source: "unknown", ambiguous: true });
  const result = preflight({
    env: { CLAUDECODE: "1" },
    pluginList: duplicateProjectFixture,
    knownMarketplaces: claudeKnownMarketplaces(),
    read: () => JSON.stringify({ version: "0.5.4" }),
    cwd,
  });
  assert.equal(result.status, "plugin-refresh-required");
  assert.equal(result.installedVersion, null);
  assert.equal(result.installedSource, "unknown");
  assertRefreshAdvisory(result);
});

test("a malformed, non-array, or empty Claude registry yields no identity without crashing", () => {
  for (const invalid of [
    () => { throw new Error("unavailable"); },
    () => "{",
    () => JSON.stringify({}),
    () => JSON.stringify([]),
  ]) {
    assert.equal(installedPipelineIdentity(invalid, "claude", claudeKnownMarketplaces()), null);
    const result = preflight({
      env: { CLAUDECODE: "1" },
      pluginList: invalid,
      knownMarketplaces: claudeKnownMarketplaces(),
      read: () => claudeManifest,
    });
    assert.equal(result.status, "ready");
    assert.equal(result.installedVersion, null);
    assert.equal(result.installedSource, "unknown");
  }
});

test("a Claude version mismatch between loaded and installed identity requires refresh", () => {
  const result = preflight({
    env: { CLAUDECODE: "1" },
    pluginList: claudePluginList("0.5.2+claude.other"),
    knownMarketplaces: claudeKnownMarketplaces(),
    read: () => claudeManifest,
  });
  assert.equal(result.status, "plugin-refresh-required");
  assert.equal(result.version, "0.5.2+claude.test");
  assert.equal(result.installedVersion, "0.5.2+claude.other");
  assert.equal(pipelineStartPreflightExitCode(result), 0);
});

test("the Claude local-development id is accepted only from an attested directory-source marketplace", () => {
  for (const knownMarketplaces of [
    claudeKnownMarketplaces("agent-pipeline-local", "relative/path"),
    () => JSON.stringify({ "agent-pipeline-local": { source: { source: "github", path: ROOT_REPO } } }),
    () => JSON.stringify({}),
    () => JSON.stringify({ "agent-pipeline-local": { source: { source: "directory", path: "/repo/./x/.." } } }),
    () => { throw new Error("registry unavailable"); },
    () => "{",
  ]) {
    assert.equal(
      installedPipelineIdentity(claudePluginList(), "claude", knownMarketplaces),
      null,
    );
  }
});

// Greenfield runner regression: a cache directory can retain an old installer
// while keeping the same cachebuster/manifest version as its marketplace
// source. Version comparison alone would call this current; the binding must
// compare the complete physical snapshots and make the discrepancy actionable.
test("Codex registry binding rejects equal manifest versions with stale cached installer bytes", (t) => {
  const base = mkdtempSync(join(tmpdir(), "preflight-codex-registry-content-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const sourceRoot = join(base, "marketplace", "plugins", "pipeline-core");
  const installedRoot = join(base, "cache", "pipeline-core", "candidate");
  const version = "0.6.2+codex.20260917090016.4c10f238";
  const writePlugin = (root, installer) => {
    mkdirSync(join(root, ".codex-plugin"), { recursive: true });
    mkdirSync(join(root, "scripts"), { recursive: true });
    writeFileSync(join(root, ".codex-plugin", "plugin.json"), JSON.stringify({ name: "pipeline-core", version }));
    writeFileSync(join(root, "scripts", "pre-push-hook-install.mjs"), installer);
  };
  writePlugin(sourceRoot, "export const installer = 'current';\n");
  writePlugin(installedRoot, "export const installer = 'current';\n");

  assert.deepEqual(observeCodexRegistryContentBinding({
    registrySourcePluginRoot: sourceRoot,
    installedPluginRoot: installedRoot,
    plugin: { name: "pipeline-core", version },
  }), {
    status: "ready", reasonCodes: [],
    contentSha256: snapshotPhysicalPluginRoot(sourceRoot).contentSha256,
  });

  writeFileSync(join(installedRoot, "scripts", "pre-push-hook-install.mjs"), "export const installer = 'stale';\n");
  assert.deepEqual(observeCodexRegistryContentBinding({
    registrySourcePluginRoot: sourceRoot,
    installedPluginRoot: installedRoot,
    plugin: { name: "pipeline-core", version },
  }), {
    status: "unavailable",
    reasonCodes: ["IPA-HOST-REGISTRY-CONTENT-MISMATCH"],
  });

  const manifestPath = ".codex-plugin/plugin.json";
  const stableContentSha256 = "e".repeat(64);
  const manifestSnapshot = (bytes, contentSha256 = stableContentSha256, files = true) => (root) => ({
    root,
    contentSha256,
    files: files ? [{ path: manifestPath, sha256: "a".repeat(64), bytes: Buffer.from(bytes) }] : [],
  });
  assert.deepEqual(observeCodexRegistryContentBinding({
    registrySourcePluginRoot: sourceRoot,
    installedPluginRoot: installedRoot,
    plugin: { name: "pipeline-core", version },
    snapshot: manifestSnapshot(JSON.stringify({ name: "other-plugin", version })),
  }), {
    status: "unavailable", reasonCodes: ["IPA-HOST-REGISTRY-MANIFEST-MISMATCH"],
  });
  assert.deepEqual(observeCodexRegistryContentBinding({
    registrySourcePluginRoot: sourceRoot,
    installedPluginRoot: installedRoot,
    plugin: { name: "pipeline-core", version },
    snapshot: manifestSnapshot(JSON.stringify({ name: "pipeline-core", version }), "malformed"),
  }), {
    status: "unavailable", reasonCodes: ["IPA-HOST-REGISTRY-CONTENT-MISMATCH"],
  });
  assert.deepEqual(observeCodexRegistryContentBinding({
    registrySourcePluginRoot: sourceRoot,
    installedPluginRoot: installedRoot,
    plugin: { name: "pipeline-core", version },
    snapshot: manifestSnapshot("", stableContentSha256, false),
  }), {
    status: "unavailable", reasonCodes: ["IPA-HOST-REGISTRY-CONTENT-MISMATCH"],
  });
  const aliasRoot = join(base, "marketplace-alias", "plugins", "pipeline-core");
  mkdirSync(join(base, "marketplace-alias", "plugins"), { recursive: true });
  if (!symlinkOrSkip(t, sourceRoot, aliasRoot, "dir")) return;
  assert.deepEqual(observeCodexRegistryContentBinding({
    registrySourcePluginRoot: aliasRoot,
    installedPluginRoot: installedRoot,
    plugin: { name: "pipeline-core", version },
  }), {
    status: "unavailable", reasonCodes: ["SNT-A2-SOURCE-ROOT-UNSAFE"],
  });
});

test("Codex direct local registry binding supplies its verified content identity", (t) => {
  const base = mkdtempSync(join(tmpdir(), "preflight-codex-registry-identity-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const marketplaceRoot = join(base, "marketplace");
  const registrySourcePluginRoot = join(marketplaceRoot, "plugins", "pipeline-core");
  const installedPluginRoot = join(base, "cache", "pipeline-core", "0.4.5-test");
  const version = "0.4.5+test";
  const pluginManifest = JSON.stringify({ name: "pipeline-core", version, hooks: "./hooks/codex-hooks.json" });
  for (const root of [registrySourcePluginRoot, installedPluginRoot]) {
    mkdirSync(join(root, ".codex-plugin"), { recursive: true });
    mkdirSync(join(root, "scripts"), { recursive: true });
    writeFileSync(join(root, ".codex-plugin", "plugin.json"), pluginManifest);
    writeFileSync(join(root, "scripts", "pipeline-start-preflight.mjs"), "export {};\n");
  }
  const scriptUrl = pathToFileURL(join(installedPluginRoot, "scripts", "pipeline-start-preflight.mjs")).href;
  const contentSha256 = snapshotPhysicalPluginRoot(installedPluginRoot).contentSha256;
  const result = preflight({
    env: { CODEX_SESSION_ID: "controlled-test" },
    cwd: ROOT_CURRENT,
    scriptUrl,
    read: () => JSON.stringify({ version }),
    pluginList: () => JSON.stringify({ installed: [{
      pluginId: "pipeline-core@agent-pipeline-local", name: "pipeline-core",
      marketplaceName: "agent-pipeline-local", version,
      installed: true, enabled: true,
      source: { source: "local", path: registrySourcePluginRoot },
      marketplaceSource: { sourceType: "local", source: marketplaceRoot },
    }], available: [] }),
  });
  assert.equal(result.status, "ready");
  assert.equal(result.installedPluginAttestation.status, "not-required");
  assert.deepEqual(result.rulesetSource.loadedIdentity, {
    status: "available", algorithm: "content-sha256", value: contentSha256,
  });
  assert.deepEqual(result.rulesetSource.installedIdentity, result.rulesetSource.loadedIdentity);
});

test("a Gitless Codex local-development install is ready only with its installer-owned receipt", (t) => {
  const base = mkdtempSync(join(tmpdir(), "preflight-installed-receipt-"));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const installedRoot = join(base, "cache", "pipeline-core", "0.4.5-test");
  const marketplaceRoot = join(base, "marketplace");
  const registrySourcePluginRoot = join(marketplaceRoot, "plugins", "pipeline-core");
  mkdirSync(join(installedRoot, "scripts"), { recursive: true });
  mkdirSync(registrySourcePluginRoot, { recursive: true });
  const scriptUrl = pathToFileURL(join(installedRoot, "scripts", "pipeline-start-preflight.mjs")).href;
  const localPluginList = () => JSON.stringify({ installed: [{
    pluginId: "pipeline-core@agent-pipeline-local", name: "pipeline-core", marketplaceName: "agent-pipeline-local",
    version: "0.4.5+test", installed: true, enabled: true,
    source: { source: "local", path: registrySourcePluginRoot },
    marketplaceSource: { sourceType: "local", source: marketplaceRoot },
  }], available: [] });
  const contentSha256 = "9".repeat(64);
  const verified = preflight({
    env: {}, pluginList: localPluginList,
    read: () => manifest, scriptUrl,
    verifyLocalInstalledPluginReceiptFn(input) {
      assert.equal(input.installedPluginRoot, installedRoot);
      assert.equal(input.provider, "codex");
      assert.equal(input.registrySourcePluginRoot, registrySourcePluginRoot);
      return {
        schema: "pipeline.installed-plugin-attestation-verification.v1", status: "verified",
        request: { installedContentSha256: contentSha256 }, receiptId: "a".repeat(64), externalReceiptIdentitySha256: "b".repeat(64),
      };
    },
  });
  assert.equal(verified.status, "ready");
  assert.equal(verified.installedPluginAttestation.status, "verified");
  assert.deepEqual(verified.rulesetSource.loadedIdentity, { status: "available", algorithm: "content-sha256", value: contentSha256 });
  assert.deepEqual(verified.rulesetSource.installedIdentity, verified.rulesetSource.loadedIdentity);

  const unavailable = preflight({
    env: {}, pluginList: localPluginList,
    read: () => manifest, scriptUrl,
    verifyLocalInstalledPluginReceiptFn: () => ({
      schema: "pipeline.installed-plugin-attestation-verification.v1", status: "unavailable", reasonCodes: ["IPA-HOST-LOCATOR-UNAVAILABLE"],
    }),
    resolveCodexAttestationSourceFn: () => ({ status: "registry-source", sourcePluginRoot: null, reasonCodes: [] }),
  });
  assert.equal(unavailable.status, "plugin-attestation-required");
  assert.equal(pipelineStartPreflightExitCode(unavailable), 2);
  assert.equal(unavailable.installedPluginAttestation.reasonCodes[0], "IPA-HOST-LOCATOR-UNAVAILABLE");
  assert.equal(unavailable.installedPluginAttestation.setupAction.kind, "host-postinstall");
  assert.equal(unavailable.installedPluginAttestation.setupAction.requiresPoApproval, false);
  assert.equal(unavailable.installedPluginAttestation.setupAction.argv.includes("write-local-from-codex-registry"), true);
  assert.equal(unavailable.installedPluginAttestation.setupAction.argv.includes("--source-plugin-root"), false,
    "the host writer must resolve Codex's registered marketplace source rather than inherit an arbitrary checkout");
  assert.deepEqual(unavailable.installedPluginAttestation.terminalTemplate, {
    templateId: "installed-plugin-attestation-setup",
    builderId: "installed-plugin-attestation-setup",
    revision: 1,
    values: { provider: "codex", version: "0.4.5+test", installedPluginRoot: installedRoot },
  });
  assert.equal(unavailable.nextAction.kind, "host-postinstall");
  assert.equal(unavailable.nextAction.executionBoundary, "host");

  const staleCheckout = preflight({
    env: {}, pluginList: localPluginList,
    read: () => manifest, scriptUrl,
    verifyLocalInstalledPluginReceiptFn: () => ({
      schema: "pipeline.installed-plugin-attestation-verification.v1", status: "unavailable", reasonCodes: ["IPA-HOST-LOCATOR-UNAVAILABLE"],
    }),
    resolveCodexAttestationSourceFn: () => ({
      status: "unavailable",
      reasonCodes: ["IPA-HOST-SOURCE-MISMATCH", "SNT-A2-MANIFEST-MISMATCH"],
    }),
  });
  assert.equal(staleCheckout.status, "plugin-attestation-required");
  assert.deepEqual(staleCheckout.installedPluginAttestation.reasonCodes, [
    "IPA-HOST-LOCATOR-UNAVAILABLE", "IPA-HOST-SOURCE-MISMATCH", "SNT-A2-MANIFEST-MISMATCH",
  ]);
  assert.equal(staleCheckout.installedPluginAttestation.setupAction, undefined);
  assert.equal(staleCheckout.nextAction, null, "a divergent checkout must never render a deterministically failing host action");

  const exactCheckout = preflight({
    env: {}, pluginList: localPluginList,
    read: () => manifest, scriptUrl,
    verifyLocalInstalledPluginReceiptFn: () => ({
      schema: "pipeline.installed-plugin-attestation-verification.v1", status: "unavailable", reasonCodes: ["IPA-HOST-LOCATOR-UNAVAILABLE"],
    }),
    resolveCodexAttestationSourceFn: () => ({
      status: "checkout-source", sourcePluginRoot: "/trusted/source/plugins/pipeline-core", reasonCodes: [],
    }),
  });
  assert.equal(exactCheckout.nextAction.argv.includes("--source-plugin-root"), true);
  assert.equal(exactCheckout.nextAction.argv.includes("/trusted/source/plugins/pipeline-core"), true);

  const mismatchedRegistry = () => JSON.stringify({ installed: [{
    pluginId: "pipeline-core@agent-pipeline-local", name: "pipeline-core", marketplaceName: "agent-pipeline-local",
    version: "0.4.4+test", installed: true, enabled: true,
    source: { source: "local", path: registrySourcePluginRoot },
    marketplaceSource: { sourceType: "local", source: marketplaceRoot },
  }], available: [] });
  const mismatch = preflight({
    env: {}, pluginList: mismatchedRegistry, read: () => manifest, scriptUrl,
    verifyLocalInstalledPluginReceiptFn: () => { throw new Error("missing attestation must be resolved before soft refresh"); },
  });
  assert.equal(mismatch.status, "plugin-attestation-required");
  assert.equal(pipelineStartPreflightExitCode(mismatch), 2);
  assert.equal(mismatch.nextAction, null, "an unresolved registry source cannot produce a host writer action");
});

test("Agy managed copy missing a receipt has an exact host recovery action from a Git source", () => {
  const installedRoot = mkdtempSync(join(tmpdir(), "agy-managed-copy-"));
  const sourceRoot = fileURLToPath(new URL("../", import.meta.url));
  try {
    const value = preflight({
      cwd: process.cwd(), env: { ANTIGRAVITY_AGENT: "1" },
      read: () => JSON.stringify({ version: "0.7.0+antigravity.test" }),
      scriptUrl: pathToFileURL(join(installedRoot, "scripts", "pipeline-start-preflight.mjs")).href,
      observeAntigravityLoadedTopologyFn: ({ loadedPluginRoot }) => ({
        schema: "pipeline.antigravity-loaded-topology.v1", status: "current",
        loadedKind: "managed-copy", loadedPluginRoot, sourcePluginRoot: sourceRoot,
        executingGuardAssurance: "not-established-by-topology",
      }),
      verifyLocalInstalledPluginReceiptFn: () => ({
        schema: "pipeline.installed-plugin-attestation-verification.v1",
        status: "unavailable", reasonCodes: ["IPA-HOST-LOCATOR-UNAVAILABLE"],
      }),
    });
    assert.equal(value.status, "plugin-attestation-required");
    assert.equal(value.nextAction?.kind, "host-postinstall");
    assert.equal(value.nextAction?.argv.includes("write-local"), true);
    assert.equal(value.nextAction?.argv.includes(sourceRoot), true);
    assert.equal(value.nextAction?.argv.includes(installedRoot), true);
    assert.equal(value.nextAction?.requiresPoApproval, false);
  } finally { rmSync(installedRoot, { recursive: true, force: true }); }
});

test("Codex attestation source selection binds only a verified checkout and retains sanitized observation codes", () => {
  const plugin = { name: "pipeline-core", version: "0.4.5+test" };
  const registrySourcePluginRoot = "/marketplace/plugins/pipeline-core";
  const ready = { schema: "pipeline.public-core-observation.v1", status: "ready", plugin };
  const gitlessRegistry = { schema: "pipeline.public-core-observation.v1", status: "rejected", reasonCodes: ["SNT-A2-GIT-MISSING"] };
  const exact = resolveCodexAttestationSourceForPreflight({
    cwd: ROOT_PROJECT, registrySourcePluginRoot, plugin,
    observe: ({ sourcePluginRoot }) => sourcePluginRoot === registrySourcePluginRoot ? gitlessRegistry : ready,
  });
  assert.deepEqual(exact, {
    status: "checkout-source",
    sourcePluginRoot: join(ROOT_PROJECT, "plugins", "pipeline-core"),
    reasonCodes: [],
  });

  const stale = resolveCodexAttestationSourceForPreflight({
    cwd: "/old-project", registrySourcePluginRoot, plugin,
    observe: () => ({ schema: "pipeline.public-core-observation.v1", status: "rejected", reasonCodes: ["SNT-A2-MANIFEST-MISMATCH"] }),
  });
  assert.equal(stale.status, "unavailable");
  assert.deepEqual(stale.reasonCodes, ["IPA-HOST-SOURCE-MISMATCH", "SNT-A2-MANIFEST-MISMATCH"]);

  const registryGitSource = resolveCodexAttestationSourceForPreflight({
    cwd: "/irrelevant-project", registrySourcePluginRoot, plugin,
    observe: () => ready,
  });
  assert.deepEqual(registryGitSource, { status: "registry-source", sourcePluginRoot: null, reasonCodes: [] });
});

test("a non-local Claude installation id reports unknown source without touching the host marketplace registry", () => {
  const officialList = claudePluginList("0.5.2+claude.test", "pipeline-core@agent-pipeline");
  assert.deepEqual(
    installedPipelineIdentity(officialList, "claude", () => {
      throw new Error("must not read the host marketplace registry for a non-local id");
    }),
    { version: "0.5.2+claude.test", source: "unknown" },
  );
});

// ---- origin/content attestation (design: bootstrap-origin-allowlist-and-codex-wsl-freshness.md §A) ----

test("preflight calls observe self-referentially with the loaded plugin root on both sides", () => {
  const calls = [];
  const result = preflight({
    env: {},
    pluginList: pluginList(),
    read: () => manifest,
    observe(input) { calls.push(input); return readyObservation(); },
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { sourcePluginRoot: result.pluginRoot, installedPluginRoot: result.pluginRoot });
  assert.equal(result.status, "ready");
});

test("an unattested origin keeps plugin refresh required and returns a non-executable advisory", () => {
  const result = preflight({
    env: {},
    pluginList: pluginList(),
    read: () => manifest,
    observe: () => ({
      ...readyObservation(),
      candidate: { ...readyObservation().candidate, repository: "https://example.invalid/fork.git" },
    }),
  });
  assert.equal(result.status, "plugin-refresh-required");
  assert.equal(pipelineStartPreflightExitCode(result), 0);
  assertRefreshAdvisory(result);
});

test("the second reviewed origin (SSH form) also attests as ready", () => {
  const result = preflight({
    env: {},
    pluginList: pluginList(),
    read: () => manifest,
    observe: () => ({
      ...readyObservation(),
      candidate: { ...readyObservation().candidate, repository: "git@github-public:agent-pipe-shared/agent-pipeline.git" },
    }),
  });
  assert.equal(result.status, "ready");
});

test("a rejected observation keeps plugin refresh required and returns a non-executable advisory", () => {
  const result = preflight({
    env: {},
    pluginList: pluginList(),
    read: () => manifest,
    observe: () => ({ schema: "pipeline.public-core-observation.v1", status: "rejected", reasonCodes: ["SNT-A2-SOURCE-DIRTY"] }),
  });
  assert.equal(result.status, "plugin-refresh-required");
  assert.equal(pipelineStartPreflightExitCode(result), 0);
  assertRefreshAdvisory(result);
});

test("a missing manifest still hard-fails to plugin-identity-unavailable without invoking the attestation", () => {
  let called = false;
  const result = preflight({
    env: {},
    pluginList: pluginList(),
    read: () => { throw new Error("missing"); },
    observe: () => { called = true; return readyObservation(); },
  });
  assert.equal(result.status, "plugin-identity-unavailable");
  assert.equal(result.nextAction, null);
  assert.equal(called, false);
  assert.equal(pipelineStartPreflightExitCode(result), 2);
});

test("plugin-identity-unavailable keeps nextAction null even under a failing attestation", () => {
  const result = preflight({
    env: {},
    pluginList: pluginList(),
    read: () => { throw new Error("missing"); },
    observe: () => ({ schema: "pipeline.public-core-observation.v1", status: "rejected", reasonCodes: ["SNT-A2-GIT-UNAVAILABLE"] }),
  });
  assert.equal(result.status, "plugin-identity-unavailable");
  assert.equal(result.nextAction, null);
});

// ---- .git-presence gate (Critic findings F2/F4, WP2-WP3-partA-rework-1) ----

function fixtureScriptUrl(pluginRoot) {
  return pathToFileURL(join(pluginRoot, "scripts", "pipeline-start-preflight.mjs")).href;
}

/**
 * A real, minimal, valid `.codex-plugin/plugin.json`-bearing git checkout
 * laid out exactly like self-application (`<gitRoot>/plugins/pipeline-core`),
 * with its origin set to an allowlisted Public-Core URL and a clean working
 * tree -- everything `observeGit`/`resolveSourceLayout`/`parseManifest`
 * require for a genuine "ready" attestation. Built with real `git` calls
 * (mkdtempSync fixture, not further stubbing) so the real default-selection
 * line in `observePipelineStartPreflight` actually executes end to end.
 *
 * Corrected per Critic finding F-C (MINOR, delta re-review `7aa84f0`): the
 * `mkdtempSync` root is canonicalized via `realpathSync` immediately, before
 * any git/fixture operation uses it, so `physicalDirectory()`'s
 * `realpathSync(path) !== path` check (`public-core-observation.mjs`) does
 * not fail closed on hosts where `os.tmpdir()` resolves through a symlink
 * (e.g. macOS `/var/folders`, some Windows TEMP setups) -- not a present red
 * on this host, where `os.tmpdir()` already is its own realpath.
 */
function buildSelfApplicationGitFixture() {
  const gitRoot = realpathSync(mkdtempSync(join(tmpdir(), "pipeline-start-preflight-git-fixture-")));
  const pluginRoot = join(gitRoot, "plugins", "pipeline-core");
  mkdirSync(join(pluginRoot, ".codex-plugin"), { recursive: true });
  writeFileSync(join(pluginRoot, ".codex-plugin", "plugin.json"), JSON.stringify({
    name: "pipeline-core",
    description: "fixture",
    hooks: "./hooks/codex-hooks.json",
    author: "fixture",
    license: "SUL-1.0",
    interface: "fixture",
    version: "0.0.1+fixture",
  }));
  const git = (args) => execFileSync("git", args, { cwd: gitRoot, stdio: ["ignore", "pipe", "pipe"] });
  git(["init", "--quiet", "--initial-branch=main"]);
  git(["config", "user.email", "fixture@example.invalid"]);
  git(["config", "user.name", "fixture"]);
  git(["remote", "add", "origin", "https://github.com/agent-pipe-shared/agent-pipeline.git"]);
  git(["add", "-A"]);
  git(["commit", "--quiet", "-m", "fixture"]);
  return { gitRoot, pluginRoot, scriptUrl: fixtureScriptUrl(pluginRoot) };
}

test("F2: attestation still runs, unmodified, when the loaded plugin root sits inside a real git checkout", () => {
  const calls = [];
  const result = preflight({
    env: {},
    pluginList: pluginList(),
    read: () => manifest,
    observe(input) { calls.push(input); return readyObservation(); },
  });
  assert.equal(calls.length, 1,
    "this test's own real checkout has a real .git two levels above plugins/pipeline-core -- attestation must still be attempted");
  assert.equal(result.status, "ready");
});

test("F2: attestation is skipped entirely (not attempted, not failed) for a real installed-plugin-cache-style layout with no .git at all", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "pipeline-start-preflight-no-git-"));
  const pluginRoot = join(fixtureRoot, "cache", "agent-pipeline-local", "pipeline-core", "0.5.2");
  mkdirSync(pluginRoot, { recursive: true });
  let called = false;
  const result = observePipelineStartPreflight({
    env: {},
    pluginList: pluginList(),
    read: () => manifest,
    scriptUrl: fixtureScriptUrl(pluginRoot),
    checkCloneProvisioningFn: readyCloneProvisioning,
    observe: () => { called = true; return readyObservation(); },
  });
  assert.equal(called, false, "the observer must never be invoked when no .git exists");
  assert.equal(result.status, "ready",
    "falls through to the pre-existing version/installedVersion-only decision, not plugin-refresh-required");
  rmSync(fixtureRoot, { recursive: true, force: true });
});

test("F4(c): the .git-presence gate skips real attestation for a no-.git fixture without injecting any observe stub", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "pipeline-start-preflight-f4c-"));
  const pluginRoot = join(fixtureRoot, "cache", "agent-pipeline-local", "pipeline-core", "0.5.2");
  mkdirSync(pluginRoot, { recursive: true });
  const result = observePipelineStartPreflight({
    env: {},
    pluginList: pluginList(),
    read: () => manifest,
    scriptUrl: fixtureScriptUrl(pluginRoot),
    checkCloneProvisioningFn: readyCloneProvisioning,
  });
  assert.equal(result.status, "ready");
  assert.equal(result.pluginRoot, pluginRoot);
  rmSync(fixtureRoot, { recursive: true, force: true });
});

test("F4(a): runner claude reaches the real observePublicCoreIdentity default path, without any observe stub", () => {
  const fixture = buildSelfApplicationGitFixture();
  try {
    const result = observePipelineStartPreflight({
      env: { CLAUDECODE: "1" },
      pluginList: () => JSON.stringify({ installed: [] }),
      read: () => JSON.stringify({ version: "0.0.1+fixture" }),
      scriptUrl: fixture.scriptUrl,
      checkCloneProvisioningFn: readyCloneProvisioning,
    });
    assert.equal(result.status, "ready",
      "the real observePublicCoreIdentity path succeeds against this valid, allowlisted, clean self-application fixture");
  } finally {
    rmSync(fixture.gitRoot, { recursive: true, force: true });
  }
});

test("F4(b): runner codex reaches the real observeCodexPublicCoreIdentity default path, without any observe stub", () => {
  const fixture = buildSelfApplicationGitFixture();
  try {
    const result = observePipelineStartPreflight({
      env: {},
      pluginList: () => JSON.stringify({ installed: [] }),
      read: () => JSON.stringify({ version: "0.0.1+fixture" }),
      scriptUrl: fixture.scriptUrl,
      // This case calls observePipelineStartPreflight directly, so the
      // preflight() helper's hermetic onboarding default never reaches it. Same
      // stand-in, passed here: the case is about the refresh advisory, not about
      // whether this machine's live checkout is onboarded.
      requireProjectOnboardingReadyFn: () => ({ schema: "pipeline.project-onboarding-ready-gate.v1", status: "ready", intent: "bootstrap" }),
    });
    // The identical fixture that lets runner "claude" succeed (F4(a) above)
    // fails closed here: observeCodexPublicCoreIdentity performs an
    // additional, Codex-only host-plugin-list attestation this test
    // environment cannot genuinely satisfy for a synthetic tmp path (no real
    // Codex host selects it, or a real host selects something else and
    // SNT-A2-CODEX-HOST-MISMATCH fires) -- this divergence from F4(a)'s
    // outcome, on the identical fixture, is the proof that the codex-only
    // default branch (not observePublicCoreIdentity) was genuinely reached.
    assert.equal(result.status, "plugin-refresh-required");
    assertRefreshAdvisory(result);
    assert.equal(pipelineStartPreflightExitCode(result), 0);
  } finally {
    rmSync(fixture.gitRoot, { recursive: true, force: true });
  }
});

// ---- ruleset-source observation (PX0-AC-08) ----

test("PX0-AC-08(a): a self-application/dev-checkout run emits a closed rulesetSource classed self-application with an available content-hash identity", () => {
  const result = preflight({
    env: {},
    pluginList: pluginList(),
    read: () => manifest,
  });
  assert.equal(result.status, "ready");
  assert.ok(result.rulesetSource, "this checkout has a real .git two levels above plugins/pipeline-core");
  assert.equal(result.rulesetSource.schema, "pipeline.ruleset-source.v1");
  assert.equal(result.rulesetSource.runner, "codex");
  assert.equal(result.rulesetSource.source.class, "self-application");
  assert.deepEqual(result.rulesetSource.loadedIdentity, {
    status: "available", algorithm: "content-sha256", value: "d".repeat(64),
  });
  assert.deepEqual(result.rulesetSource.installedIdentity, result.rulesetSource.loadedIdentity);
  assert.deepEqual(validateRulesetSource(result.rulesetSource), { valid: true, errors: [] });
});

test("PX0-AC-08(b): an ordinary no-.git installed-copy run emits a closed rulesetSource classed marketplace-public with honestly-unavailable identities that still validate", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "pipeline-start-preflight-rulesetsource-nogit-"));
  const pluginRoot = join(fixtureRoot, "cache", "agent-pipeline", "pipeline-core", "0.4.5");
  mkdirSync(pluginRoot, { recursive: true });
  try {
    const result = observePipelineStartPreflight({
      env: {},
      pluginList: pluginList(),
      read: () => manifest,
      scriptUrl: fixtureScriptUrl(pluginRoot),
      checkCloneProvisioningFn: readyCloneProvisioning,
    });
    assert.equal(result.status, "ready");
    assert.equal(result.installedSource, "remote");
    assert.ok(result.rulesetSource);
    assert.equal(result.rulesetSource.source.class, "marketplace-public");
    assert.deepEqual(result.rulesetSource.loadedIdentity, { status: "unavailable" });
    assert.deepEqual(result.rulesetSource.installedIdentity, { status: "unavailable" });
    assert.deepEqual(validateRulesetSource(result.rulesetSource), { valid: true, errors: [] });
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("PX0-AC-08(c): the previously-dangling freshnessHostActionForPreflight read of preflight.rulesetSource now observably binds a real value", () => {
  const wslEnv = { WSL_DISTRO_NAME: "Ubuntu" };
  const observeWithHash = (hash) => () => ({
    ...readyObservation(),
    plugin: { ...readyObservation().plugin, contentSha256: hash },
  });
  const resultA = preflight({
    env: wslEnv,
    pluginList: pluginList(),
    read: () => manifest,
    observe: observeWithHash("d".repeat(64)),
  });
  const resultB = preflight({
    env: wslEnv,
    pluginList: pluginList(),
    read: () => manifest,
    observe: observeWithHash("e".repeat(64)),
  });
  assert.equal(resultA.status, "ready");
  assert.equal(resultB.status, "ready");
  assert.notEqual(resultA.rulesetSource.loadedIdentity.value, resultB.rulesetSource.loadedIdentity.value);
  const actionA = freshnessHostActionForPreflight(resultA);
  const actionB = freshnessHostActionForPreflight(resultB);
  assert.ok(actionA && actionB, "both preflight results are ready under the host-authorized-wsl boundary");
  assert.notEqual(
    actionA.preflightSha256,
    actionB.preflightSha256,
    "if rulesetSource were still dangling/undefined, these two otherwise-identical preflights would bind the same digest",
  );
});

// ---- same-repo concurrent-session warning (PHX-WP-AAC01-MULTISESSION) ----

/**
 * A minimal real git checkout, independent of the plugin-identity/self-
 * application fixtures above -- used purely as the physical repository root
 * for session-descriptor registration/inspection. `cwd` for these tests is
 * this fixture root, decoupled from `scriptUrl`/`observe` (which stay on
 * this actual repo's own real self-application checkout, as in every other
 * test in this file).
 *
 * Also installs the pre-push hook (pre-push-hook-install.mjs's own
 * `applyInstall`) so this fixture represents a fully-set-up repository --
 * since commit f225bc23 the preflight reports PRE_PUSH_HOOK_NOT_INSTALLED_STATUS
 * for a repo with no hook installed, which is not what these multi-session
 * descriptor tests are about.
 */
function buildConcurrencyRepoFixture() {
  const gitRoot = realpathSync(mkdtempSync(join(tmpdir(), "pipeline-start-preflight-concurrency-")));
  const git = (args) => execFileSync("git", args, { cwd: gitRoot, stdio: ["ignore", "pipe", "pipe"] });
  git(["init", "--quiet", "--initial-branch=main"]);
  git(["config", "user.email", "fixture@example.invalid"]);
  git(["config", "user.name", "fixture"]);
  writeFileSync(join(gitRoot, "README.md"), "fixture\n");
  git(["add", "-A"]);
  git(["commit", "--quiet", "-m", "fixture"]);
  const install = applyInstall({ rootDir: gitRoot });
  if (install.status !== "installed") {
    throw new Error(`buildConcurrencyRepoFixture: pre-push hook install failed (${JSON.stringify(install)})`);
  }
  return gitRoot;
}

test("PHX-WP-AAC01-MULTISESSION: another session's LIVE descriptor surfaces a typed same-repo warning; status/nextAction never change", {
  skip: process.platform !== "linux" ? OWNER_RUNTIME_LINUX_ONLY_SKIP_REASON : false,
}, () => {
  const gitRoot = buildConcurrencyRepoFixture();
  try {
    const mine = startSessionDescriptor(gitRoot, {
      sessionId: "session-this-one",
      ownerNonce: "owner-nonce-mine-0000000001",
    });
    const preflightOptions = {
      env: {},
      pluginList: pluginList(),
      read: () => manifest,
      cwd: gitRoot,
      currentSessionId: mine.sessionId,
      checkCloneProvisioningFn: readyCloneProvisioning,
    };

    const beforeOther = preflight(preflightOptions);
    assert.equal(beforeOther.concurrentSessionWarning, null, "only this session's own descriptor is registered so far");
    assert.equal(beforeOther.status, "ready");

    const other = startSessionDescriptor(gitRoot, {
      sessionId: "session-another-live",
      ownerNonce: "owner-nonce-other-0000000001",
    });
    const afterOther = preflight(preflightOptions);
    assert.deepEqual(afterOther.concurrentSessionWarning, {
      schema: CONCURRENT_SESSION_WARNING_SCHEMA,
      sessionId: other.sessionId,
      descriptorSha256: other.descriptorSha256,
      status: "live",
    });
    assert.equal(JSON.stringify(afterOther.concurrentSessionWarning).includes(other.ownerNonce), false,
      "the warning must never leak the other session's owner nonce");

    // The warning is informational only: every other decision field of the
    // preflight result stays identical between the warning-absent and the
    // warning-present run (bootstrapPayload's own size/digest measurement is
    // deliberately excluded from this comparison -- it mechanically reflects
    // the serialized size of the whole payload, including this new field's
    // value, by design; that is not a decision output).
    for (const key of [
      "schema", "status", "version", "installedVersion", "installedSource",
      "executionBoundary", "pluginRoot", "handoff",
    ]) {
      assert.deepEqual(afterOther[key], beforeOther[key], `field ${key} must stay identical`);
    }
    assert.deepEqual(afterOther.nextAction, beforeOther.nextAction);
    assert.deepEqual(afterOther.rulesetSource, beforeOther.rulesetSource);
  } finally {
    rmSync(gitRoot, { recursive: true, force: true });
  }
});

test("PHX-WP-AAC01-MULTISESSION: not-live, reused, unavailable, and unobserved descriptors never trigger the warning", {
  skip: process.platform !== "linux" ? OWNER_RUNTIME_LINUX_ONLY_SKIP_REASON : false,
}, () => {
  const gitRoot = buildConcurrencyRepoFixture();
  try {
    const mine = startSessionDescriptor(gitRoot, {
      sessionId: "session-this-one-negative",
      ownerNonce: "owner-nonce-mine-0000000002",
    });

    // not-live: a syntactically valid ownerRuntime whose pid has no running
    // process -- inspectSessionOwnerRuntime's status is derived purely from
    // process.kill(pid, 0) at inspection time, so this does not require ever
    // having run a real process at that pid.
    const notLive = startSessionDescriptor(gitRoot, {
      sessionId: "session-not-live",
      ownerNonce: "owner-nonce-not-live-00000001",
    });
    const notLiveDescriptor = JSON.parse(readFileSync(notLive.path, "utf8"));
    notLiveDescriptor.ownerRuntime = { schema: "pipeline.session-owner-runtime.v1", pid: 999999999, processStartId: "1" };
    writeFileSync(notLive.path, `${JSON.stringify(notLiveDescriptor, null, 2)}\n`, { mode: 0o600 });

    // reused: a real still-live pid (this test process), but a recorded
    // processStartId that no longer matches -- same technique as
    // worktree-lifecycle.test.mjs's own "D0 session owner runtime status" check.
    const reused = startSessionDescriptor(gitRoot, {
      sessionId: "session-reused",
      ownerNonce: "owner-nonce-reused-000000001",
    });
    const reusedDescriptor = JSON.parse(readFileSync(reused.path, "utf8"));
    reusedDescriptor.ownerRuntime.processStartId = `${Number(reusedDescriptor.ownerRuntime.processStartId) + 1}`;
    writeFileSync(reused.path, `${JSON.stringify(reusedDescriptor, null, 2)}\n`, { mode: 0o600 });

    // unavailable: registered with a pid that never resolves to a running process.
    startSessionDescriptor(gitRoot, {
      sessionId: "session-unavailable",
      ownerNonce: "owner-nonce-unavailable-0000001",
      ownerPid: -1,
    });

    // unobserved: a legacy v1 descriptor, deliberately never guessed dead.
    const legacy = startSessionDescriptor(gitRoot, {
      sessionId: "session-unobserved",
      ownerNonce: "owner-nonce-unobserved-0000001",
    });
    const legacyDescriptor = JSON.parse(readFileSync(legacy.path, "utf8"));
    delete legacyDescriptor.ownerRuntime;
    legacyDescriptor.schema = "pipeline.session-descriptor.v1";
    writeFileSync(legacy.path, `${JSON.stringify(legacyDescriptor, null, 2)}\n`, { mode: 0o600 });

    const result = preflight({
      env: {},
      pluginList: pluginList(),
      read: () => manifest,
      cwd: gitRoot,
      currentSessionId: mine.sessionId,
    });
    assert.equal(result.concurrentSessionWarning, null,
      "not-live/reused/unavailable/unobserved descriptors must never be treated as a live concurrent session");
    assert.equal(result.status, "ready");
  } finally {
    rmSync(gitRoot, { recursive: true, force: true });
  }
});

// Runs on EVERY host: a descriptor whose ownerRuntime is null (what a non-Linux host registers, and
// what a Linux host registers for an unresolvable owner pid) is inconclusive evidence. It must never
// surface as a live concurrent session, and it must change nothing else in the preflight result.
// The null is written explicitly, so the case does not depend on which host produced the descriptor.
test("PHX-WP-AAC01-MULTISESSION: a descriptor with a null ownerRuntime never warns; status/nextAction never change", () => {
  const gitRoot = buildConcurrencyRepoFixture();
  try {
    const mine = startSessionDescriptor(gitRoot, {
      sessionId: "session-this-one-null-runtime",
      ownerNonce: "owner-nonce-mine-0000000003",
    });
    const preflightOptions = {
      env: {},
      pluginList: pluginList(),
      read: () => manifest,
      cwd: gitRoot,
      currentSessionId: mine.sessionId,
      checkCloneProvisioningFn: readyCloneProvisioning,
    };
    const beforeOther = preflight(preflightOptions);
    assert.equal(beforeOther.concurrentSessionWarning, null, "only this session's own descriptor is registered so far");
    assert.equal(beforeOther.status, "ready");

    const other = startSessionDescriptor(gitRoot, {
      sessionId: "session-null-owner-runtime",
      ownerNonce: "owner-nonce-null-runtime-000001",
    });
    const otherDescriptor = JSON.parse(readFileSync(other.path, "utf8"));
    otherDescriptor.ownerRuntime = null;
    writeFileSync(other.path, `${JSON.stringify(otherDescriptor, null, 2)}\n`, { mode: 0o600 });
    assert.equal(JSON.parse(readFileSync(other.path, "utf8")).ownerRuntime, null,
      "the fixture really carries a null ownerRuntime on this host");

    const afterOther = preflight(preflightOptions);
    assert.equal(afterOther.concurrentSessionWarning, null,
      "an unavailable owner runtime must never be treated as a live concurrent session");
    assert.equal(afterOther.status, "ready");
    assert.equal(afterOther.status, beforeOther.status);
    assert.deepEqual(afterOther.nextAction, beforeOther.nextAction);
  } finally {
    rmSync(gitRoot, { recursive: true, force: true });
  }
});

test("PHX-WP-AAC01-MULTISESSION: a repository root with no registered descriptors at all never warns and never throws", () => {
  const gitRoot = buildConcurrencyRepoFixture();
  try {
    const result = preflight({
      env: {},
      pluginList: pluginList(),
      read: () => manifest,
      cwd: gitRoot,
    });
    assert.equal(result.concurrentSessionWarning, null);
    assert.equal(result.status, "ready");
  } finally {
    rmSync(gitRoot, { recursive: true, force: true });
  }
});

test("PHX-WP-AAC01-MULTISESSION: an unresolvable cwd (no repository at all) degrades to no warning, never throws", () => {
  const result = preflight({
    env: {},
    pluginList: pluginList(),
    read: () => manifest,
    cwd: ROOT_NOT_A_REPOSITORY,
  });
  assert.equal(result.concurrentSessionWarning, null);
  assert.equal(result.status, "ready");
});
test("observeDutyNotRuntimeLive reports in-force when roots are identical or match", () => {
  const base = mkdtempSync(join(tmpdir(), "duty-live-test-"));
  try {
    const rootA = join(base, "a");
    const rootB = join(base, "b");
    mkdirSync(join(rootA, "agents"), { recursive: true });
    mkdirSync(join(rootB, "agents"), { recursive: true });
    writeFileSync(join(rootA, "agents", "critic.md"), "# Critic\n");
    writeFileSync(join(rootB, "agents", "critic.md"), "# Critic\n");

    const same = observeDutyNotRuntimeLive({ checkoutPluginRoot: rootA, installedPluginRoot: rootA });
    assert.equal(same.status, "in-force");

    const matching = observeDutyNotRuntimeLive({ checkoutPluginRoot: rootA, installedPluginRoot: rootB });
    assert.equal(matching.status, "in-force");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("observeDutyNotRuntimeLive recognizes two paths to one physical plugin root", (t) => {
  const base = mkdtempSync(join(tmpdir(), "duty-live-alias-"));
  try {
    const physicalRoot = join(base, "physical");
    const aliasRoot = join(base, "alias");
    mkdirSync(physicalRoot);
    if (!symlinkOrSkip(t, physicalRoot, aliasRoot, "dir")) return;
    const result = observeDutyNotRuntimeLive({
      checkoutPluginRoot: physicalRoot,
      installedPluginRoot: aliasRoot,
      read: () => { throw new Error("one physical root must not be read as two copies"); },
    });
    assert.deepEqual(result, { status: "in-force" });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("observeDutyNotRuntimeLive reports differing and lists differing files when modified", () => {
  const base = mkdtempSync(join(tmpdir(), "duty-live-diff-"));
  try {
    const checkoutRoot = join(base, "checkout");
    const installedRoot = join(base, "installed");
    mkdirSync(join(checkoutRoot, "agents"), { recursive: true });
    mkdirSync(join(installedRoot, "agents"), { recursive: true });
    writeFileSync(join(checkoutRoot, "agents", "critic.md"), "# Critic with route precheck\n");
    writeFileSync(join(installedRoot, "agents", "critic.md"), "# Old critic\n");

    const diff = observeDutyNotRuntimeLive({ checkoutPluginRoot: checkoutRoot, installedPluginRoot: installedRoot });
    assert.equal(diff.status, "differing");
    assert.equal(diff.diagnostic, "DUTY-NOT-RUNTIME-LIVE");
    assert.deepEqual(diff.differingFiles, ["agents/critic.md"]);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("observeDutyNotRuntimeLive reports not-applicable when roots are missing or null", () => {
  assert.equal(observeDutyNotRuntimeLive({ checkoutPluginRoot: null, installedPluginRoot: null }).status, "not-applicable");
  assert.equal(observeDutyNotRuntimeLive({ checkoutPluginRoot: "/non/existent/a", installedPluginRoot: "/non/existent/b" }).status, "not-applicable");
});

test("NVA-B8-11: gitless Claude recovery references survive a skill-only installation", () => {
  const sourceSkill = fileURLToPath(new URL("../skills/pipeline-start/", import.meta.url));
  const base = mkdtempSync(join(tmpdir(), "pipeline-start-skill-only-"));
  const installedSkill = join(base, "skills", "pipeline-start");
  try {
    cpSync(sourceSkill, installedSkill, { recursive: true });
    const skill = readFileSync(join(installedSkill, "SKILL.md"), "utf8");
    const references = new Set(Array.from(
      skill.matchAll(/references\/[A-Za-z0-9._/-]+\.md/gu),
      (match) => match[0],
    ));
    assert.ok(references.size >= 15, "the installed skill's reference inventory must be checked, not one hardcoded link");
    for (const reference of references) {
      assert.equal(existsSync(join(installedSkill, reference)), true, reference);
    }
    const recovery = readFileSync(join(installedSkill, "references/local-plugin-attestation.md"), "utf8");
    assert.match(skill, /Claude or Antigravity `plugin-attestation-required` result with no\s+`nextAction`, stop and load `references\/local-plugin-attestation\.md`/u);
    assert.match(recovery, /A missing\s+`nextAction` is deliberate/u);
    assert.match(recovery, /gitless Claude cache or copied marketplace tree cannot recover\s+its clean Git source from the registry, so it returns\s+`plugin-attestation-required` with `nextAction: null`/u);
    assert.doesNotMatch(recovery, /(?:^|\s)(?:docs|specs|architecture)\//mu,
      "the isolated installed skill must not depend on an unavailable repository-root document");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// AM-W-T2 (Critic AM-D1, dispatcher rulings 50 and 55; design note agy-snapshot-central-2026-10-08 sections 3-4): pins that the
// start preflight is a caller of observeAgyStartHint. Test-only; the structural pin is expected RED until the AM-W wiring slice
// lands, and the behaviour cases are todo until that slice exposes an injectable seam (the real agy CLI and the real home are
// never touched). observeAgyStartHint is defined in lib/agy-start-hint.mjs; the central refresh module is accepted as an
// equivalent import source in case the wiring slice re-exports it there.
function amW2CodeOf(url) {
  return readFileSync(url, "utf8").split(/\r?\n/u).filter((line) => !/^\s*(?:\/\/|\/\*|\*)/u.test(line)).join("\n");
}

test("AM-W-T2: pipeline-start-preflight.mjs imports observeAgyStartHint and calls it (structural stand-in)", () => {
  const code = amW2CodeOf(new URL("./pipeline-start-preflight.mjs", import.meta.url));
  assert.match(code, /import\s*\{[^}]*\bobserveAgyStartHint\b[^}]*\}\s*from\s*["']\.\.\/lib\/(?:agy-start-hint|agy-central-refresh)\.mjs["']/u);
  assert.match(code, /\bobserveAgyStartHint\s*\(/u);
});

test("AM-W-T2: a governed-but-not-loaded agy workspace surfaces the agy hint in the preflight output", (t) => {
  t.todo("missing seam: observePipelineStartPreflight() must accept an injectable observeAgyStartHint (or the workspace root, config root and loaded plugin root it reads) before this can be pinned against a fixture governed workspace whose loaded agy plugin root differs from the managed copy, without touching the real home or resolving the real agy CLI. The wiring slice must provide that seam; the case then asserts that the agy hint appears in the preflight output. The output field name is the wiring slice's to choose and is deliberately not pinned here.");
});

test("AM-W-T2: a governed-and-loaded or an ungoverned agy workspace adds no agy hint to the preflight output", (t) => {
  t.todo("missing seam: same injectable seam as the case above. The wiring slice must provide it; the case then asserts, for a governed workspace whose loaded agy plugin root is the managed copy and for an ungoverned workspace, that the preflight output carries no agy hint and is otherwise byte-identical to the output of a run without the agy observation.");
});
