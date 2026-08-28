#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { validateRulesetSource } from "../lib/ruleset-source.mjs";
import { startSessionDescriptor } from "../lib/worktree-lifecycle.mjs";
import { applyInstall } from "./pre-push-hook-install.mjs";
import {
  installedPipelineIdentity, installedPipelineVersion, observePipelineStartPreflight,
  normalBootstrapPayloadReceipt, pipelineStartPreflightExitCode, freshnessHostActionForPreflight, SCHEMA,
  STATUS_SCOPE, CONCURRENT_SESSION_WARNING_SCHEMA, resolveActiveRunner,
} from "./pipeline-start-preflight.mjs";
import { formatOnboardingRerunCommand } from "./project-onboarding-v3.mjs";
import { BOOTSTRAP_PAYLOAD_MAX_BYTES } from "../lib/bootstrap-payload-budget.mjs";
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
        ? "/local/agent-pipeline/plugins/pipeline-core"
        : "/cache/agent-pipeline/plugins/pipeline-core",
    },
    marketplaceSource: sourceType === "local"
      ? { sourceType: "local", source: "/local/agent-pipeline" }
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
  projectPath: "/projects/current",
}]);
const claudeKnownMarketplaces = (
  marketplaceName = "agent-pipeline-local",
  path = "/repo",
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
  const cwd = "/projects/current";
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
    assert.equal(result.statusScope, "plugin-distribution-identity");
  }
  // Structural proof that the two readiness sources are disjoint: the preflight never
  // observes project personalization, so its `ready` can never be an answer about it.
  assert.ok(!JSON.stringify(ready).includes("pipeline.user.yaml"));
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
function preflight(options) {
  return observePipelineStartPreflight({ observe: readyObservation, ...options });
}

test("preflight reports exact identity and no-handoff without secret fields", () => {
  const cwd = "/projects/current";
  const result = preflight({
    env: {},
    pluginList: pluginList(),
    read: () => manifest,
    cwd,
  });
  assert.deepEqual(Object.keys(result).sort(), [
    "bootstrapPayload", "concurrentSessionWarning", "executionBoundary", "handoff", "installedSource",
    "installedVersion", "nextAction", "pluginRoot", "rulesetSource", "schema", "status", "statusScope",
    "version",
  ]);
  assert.equal(result.schema, SCHEMA);
  assert.equal(result.statusScope, STATUS_SCOPE);
  assert.equal(result.status, "ready");
  assert.equal(result.concurrentSessionWarning, null);
  assert.equal(result.version, "0.4.5+test");
  assert.equal(result.installedVersion, "0.4.5+test");
  assert.equal(result.installedSource, "remote");
  assert.equal(result.executionBoundary, "default");
  assert.equal(result.handoff, "none");
  assert.equal(result.bootstrapPayload.schema, "pipeline.bootstrap-payload-receipt.v1");
  assert.equal(result.bootstrapPayload.mode, "normal");
  assert.deepEqual(result.bootstrapPayload.retainedChecks, [
    "lifecycle", "authority", "calibration", "handover", "verify", "continuation",
  ]);
  assert.equal(result.bootstrapPayload.originalMeasurement.withinBudget, true);
  assert.match(result.bootstrapPayload.originalMeasurement.digestSha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(result.nextAction, {
    kind: "command",
    executable: "node",
    argv: [
      `${result.pluginRoot}/scripts/project-onboarding-v3.mjs`,
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
  const cwd = "/projects/current";
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
      `${result.pluginRoot}/scripts/onboarding-init.mjs`,
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

test("NVA-K-DRIVERREACH: an already-ready project's nextAction stays the pre-existing inspect action, unchanged", () => {
  const cwd = "/projects/current";
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
      `${result.pluginRoot}/scripts/project-onboarding-v3.mjs`,
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
    const cwd = "/projects/current";
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
  const cwd = "/projects/current";
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
      cwd: "/projects/current",
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
    rootDir: "/repo",
    read: () => CLAUDE_DEFAULT_SOURCE,
  });
  assert.equal(runner, "codex");
  const viaThread = resolveActiveRunner({
    env: { CODEX_THREAD_ID: "codex-thread-1" },
    rootDir: "/repo",
    read: () => CLAUDE_DEFAULT_SOURCE,
  });
  assert.equal(viaThread, "codex");
});

test("resolveActiveRunner: a signal-less shell in a claude-default repository resolves claude", () => {
  const runner = resolveActiveRunner({
    env: {},
    rootDir: "/repo",
    read: () => CLAUDE_DEFAULT_SOURCE,
  });
  assert.equal(runner, "claude");
});

test("resolveActiveRunner: a signal-less shell in a repository declaring nothing resolves codex", () => {
  const noRootDir = resolveActiveRunner({ env: {} });
  assert.equal(noRootDir, "codex");
  const unreadableSource = resolveActiveRunner({
    env: {},
    rootDir: "/repo",
    read: () => { throw new Error("ENOENT: pipeline.user.yaml"); },
  });
  assert.equal(unreadableSource, "codex");
  const noDeclaredDefault = resolveActiveRunner({
    env: {},
    rootDir: "/repo",
    read: () => 'schema: "pipeline.user.v3"\n',
  });
  assert.equal(noDeclaredDefault, "codex");
});

test("resolveActiveRunner: an actual CLAUDECODE/Antigravity signal is never overridden by a declared default", () => {
  assert.equal(resolveActiveRunner({
    env: { CLAUDECODE: "1" },
    rootDir: "/repo",
    read: () => CODEX_DEFAULT_SOURCE,
  }), "claude");
  assert.equal(resolveActiveRunner({
    env: { ANTIGRAVITY_AGENT: "1" },
    rootDir: "/repo",
    read: () => CODEX_DEFAULT_SOURCE,
  }), "antigravity");
});

test("a rendered PO-facing re-run command always carries --runner explicitly", () => {
  // The under-specified shape: the agent's own original invocation never spelled
  // out --runner (it was resolved implicitly via resolveOnboardingCliRunner), so
  // the byte-faithful echo of argv would otherwise hand a human an ambiguous
  // command to type into their own, possibly signal-less, attended terminal.
  const argsWithoutRunner = ["kickoff-plan", "--root", "/repo", "--goal", "ship it", "--language", "en"];
  const rendered = formatOnboardingRerunCommand(argsWithoutRunner, "claude");
  assert.match(rendered, /--runner"\s*"claude"$/u);
  assert.ok(!argsWithoutRunner.includes("--runner"), "the original argv is never mutated");

  // Already-explicit --runner is preserved verbatim, never duplicated.
  const argsWithRunner = ["kickoff-plan", "--root", "/repo", "--runner", "codex", "--goal", "g", "--language", "en"];
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
      cwd: "/projects/wsl",
    });
    assert.equal(result.executionBoundary, "host-authorized-wsl", JSON.stringify(env));
    assert.equal(result.nextAction.executionBoundary, "host-authorized-wsl", JSON.stringify(env));
    assert.equal(result.nextAction.argv[3], "/projects/wsl");
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
      cwd: "/projects/wsl",
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
      if (String(path).endsWith(".claude-plugin/plugin.json")) return claudeManifest;
      throw new Error(`unexpected manifest path for the Claude runner: ${path}`);
    },
    cwd: "/projects/current",
  });
  assert.equal(result.version, "0.5.2+claude.test");
});

test("a non-Claude-Code session still reads the Codex source manifest, never the Claude one", () => {
  const result = preflight({
    env: {},
    pluginList: pluginList(),
    read: (path) => {
      if (String(path).endsWith(".codex-plugin/plugin.json")) return manifest;
      throw new Error(`unexpected manifest path for the Codex runner: ${path}`);
    },
    cwd: "/projects/current",
  });
  assert.equal(result.version, "0.4.5+test");
});

test("a Claude bare-array registry resolves an attested local-development installation", () => {
  const result = preflight({
    env: { CLAUDECODE: "1" },
    pluginList: claudePluginList(),
    knownMarketplaces: claudeKnownMarketplaces(),
    read: () => claudeManifest,
    cwd: "/projects/current",
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
    projectPath: "/projects/mine",
  },
  {
    id: "pipeline-core@agent-pipeline", version: "0.5.4", scope: "project", enabled: true,
    projectPath: "/projects/other",
  },
]);

test("a Claude project-scope entry for an unrelated project never counts toward this session's ambiguity", () => {
  // cwd matches NEITHER project-scope entry's projectPath: both drop out of eligibility,
  // leaving the scope:"user" entry as the single match -- resolves cleanly, not ambiguous.
  const cwd = "/projects/third";
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
  const cwd = "/projects/mine";
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
      projectPath: "/projects/mine",
    },
    {
      id: "pipeline-core@agent-pipeline", version: "0.5.5", scope: "project", enabled: true,
      projectPath: "/projects/mine",
    },
  ]);
  const cwd = "/projects/mine";
  const identity = installedPipelineIdentity(duplicateProjectFixture, "claude", claudeKnownMarketplaces(), cwd);
  assert.deepEqual(identity, { version: null, source: "unknown", ambiguous: true });
  const result = observePipelineStartPreflight({
    env: { CLAUDECODE: "1" },
    pluginList: duplicateProjectFixture,
    knownMarketplaces: claudeKnownMarketplaces(),
    read: () => JSON.stringify({ version: "0.5.4" }),
    cwd,
  });
  assert.equal(result.status, "plugin-refresh-required");
  assert.equal(result.installedVersion, null);
  assert.equal(result.installedSource, "unknown");
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
    () => JSON.stringify({ "agent-pipeline-local": { source: { source: "github", path: "/repo" } } }),
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

test("an unattested origin folds into the soft plugin-refresh-required advisory, never a new hard status", () => {
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
  assert.deepEqual(result.nextAction, {
    kind: "advisory",
    executable: null,
    argv: [],
    mutation: false,
    requiresConfirmation: false,
    executionBoundary: "default",
    expected: { schema: "pipeline.plugin-refresh-advisory.v1" },
  });
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

test("a rejected observation (dirty tree, missing git, any SNT-A2-* code) folds into the same soft advisory", () => {
  const result = preflight({
    env: {},
    pluginList: pluginList(),
    read: () => manifest,
    observe: () => ({ schema: "pipeline.public-core-observation.v1", status: "rejected", reasonCodes: ["SNT-A2-SOURCE-DIRTY"] }),
  });
  assert.equal(result.status, "plugin-refresh-required");
  assert.equal(pipelineStartPreflightExitCode(result), 0);
  assert.equal(result.nextAction.kind, "advisory");
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
    assert.equal(result.nextAction.kind, "advisory");
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

test("PHX-WP-AAC01-MULTISESSION: another session's LIVE descriptor surfaces a typed same-repo warning; status/nextAction never change", () => {
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

test("PHX-WP-AAC01-MULTISESSION: not-live, reused, unavailable, and unobserved descriptors never trigger the warning", () => {
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
    cwd: "/projects/does-not-exist-as-a-repository",
  });
  assert.equal(result.concurrentSessionWarning, null);
  assert.equal(result.status, "ready");
});
