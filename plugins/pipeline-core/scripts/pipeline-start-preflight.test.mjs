#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import test from "node:test";

import {
  installedPipelineIdentity, installedPipelineVersion, observePipelineStartPreflight,
  normalBootstrapPayloadReceipt, pipelineStartPreflightExitCode, SCHEMA, STATUS_SCOPE,
} from "./pipeline-start-preflight.mjs";
import { BOOTSTRAP_PAYLOAD_MAX_BYTES } from "../lib/bootstrap-payload-budget.mjs";

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
  const ready = observePipelineStartPreflight({ env: {}, pluginList: pluginList(), read: () => manifest, cwd });
  const refresh = observePipelineStartPreflight({
    env: {}, pluginList: pluginList("0.4.4+test"), read: () => manifest, cwd,
  });
  const unavailable = observePipelineStartPreflight({
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

test("preflight reports exact identity and no-handoff without secret fields", () => {
  const cwd = "/projects/current";
  const result = observePipelineStartPreflight({
    env: {},
    pluginList: pluginList(),
    read: () => manifest,
    cwd,
  });
  assert.deepEqual(Object.keys(result).sort(), [
    "bootstrapPayload", "executionBoundary", "handoff", "installedSource", "installedVersion",
    "nextAction", "pluginRoot", "schema", "status", "statusScope", "version",
  ]);
  assert.equal(result.schema, SCHEMA);
  assert.equal(result.statusScope, STATUS_SCOPE);
  assert.equal(result.status, "ready");
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

test("preflight declares the Claude runner when CLAUDECODE marks the session", () => {
  const cwd = "/projects/current";
  const result = observePipelineStartPreflight({
    env: { CLAUDECODE: "1" },
    pluginList: pluginList(),
    read: () => manifest,
    cwd,
  });
  assert.deepEqual(result.nextAction.argv.slice(-2), ["--runner", "claude"]);
});

test("preflight keeps the Codex runner default for any non-Claude-Code session", () => {
  for (const env of [{}, { CLAUDECODE: "0" }, { CLAUDECODE: "true" }]) {
    const result = observePipelineStartPreflight({
      env,
      pluginList: pluginList(),
      read: () => manifest,
      cwd: "/projects/current",
    });
    assert.deepEqual(result.nextAction.argv.slice(-2), ["--runner", "codex"], JSON.stringify(env));
  }
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

test("preflight selects one host-authorized capability boundary for WSL", () => {
  for (const env of [
    { WSL_DISTRO_NAME: "Ubuntu" },
    { WSL_INTEROP: "/run/WSL/1_interop" },
  ]) {
    const result = observePipelineStartPreflight({
      env,
      pluginList: pluginList(),
      read: () => manifest,
      cwd: "/projects/wsl",
    });
    assert.equal(result.executionBoundary, "host-authorized-wsl");
    assert.equal(result.nextAction.executionBoundary, "host-authorized-wsl");
    assert.equal(result.nextAction.argv[3], "/projects/wsl");
  }
});

test("preflight distinguishes complete and malformed handoff by presence only", () => {
  const ready = observePipelineStartPreflight({
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
    assert.equal(observePipelineStartPreflight({
      env,
      pluginList: pluginList(),
      read: () => manifest,
    }).handoff, "malformed");
  }
});

test("preflight turns a loaded/installed mismatch into a typed refresh handoff", () => {
  const result = observePipelineStartPreflight({
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
  const result = observePipelineStartPreflight({
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
  const result = observePipelineStartPreflight({
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
    const result = observePipelineStartPreflight({
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
    const result = observePipelineStartPreflight({
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
  const result = observePipelineStartPreflight({
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
  const result = observePipelineStartPreflight({
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
  const result = observePipelineStartPreflight({
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
  const result = observePipelineStartPreflight({
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
  const result = observePipelineStartPreflight({
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
  const result = observePipelineStartPreflight({
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
    const result = observePipelineStartPreflight({
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
  const result = observePipelineStartPreflight({
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
