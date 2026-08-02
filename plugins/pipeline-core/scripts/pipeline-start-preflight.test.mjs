#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import test from "node:test";

import {
  installedPipelineIdentity, installedPipelineVersion, observePipelineStartPreflight,
  normalBootstrapPayloadReceipt, pipelineStartPreflightExitCode, SCHEMA,
} from "./pipeline-start-preflight.mjs";

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
    "nextAction", "pluginRoot", "schema", "status", "version",
  ]);
  assert.equal(result.schema, SCHEMA);
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
    ],
    mutation: false,
    requiresConfirmation: false,
    executionBoundary: "default",
    expected: {
      schema: "pipeline.project-onboarding.v4",
    },
  });
});

test("normal bootstrap receipt retains exact envelope measurement and over-budget state", () => {
  const receipt = normalBootstrapPayloadReceipt({ schema: "test", payload: "x".repeat(15_001) });
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

test("simultaneous local-development and official installations fail closed", () => {
  const official = JSON.parse(pluginList("0.4.4", "git")()).installed[0];
  const local = JSON.parse(pluginList(
    "0.4.5+test",
    "local",
    "agent-pipeline-local",
  )()).installed[0];
  const both = () => JSON.stringify({ installed: [official, local], available: [] });
  const result = observePipelineStartPreflight({
    env: {},
    pluginList: both,
    read: () => manifest,
  });
  assert.equal(result.status, "plugin-refresh-required");
  assert.equal(result.installedVersion, null);
  assert.equal(result.installedSource, "unknown");
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
