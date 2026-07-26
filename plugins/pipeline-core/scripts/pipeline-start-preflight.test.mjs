#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import test from "node:test";

import {
  installedPipelineVersion, observePipelineStartPreflight,
  pipelineStartPreflightExitCode, SCHEMA,
} from "./pipeline-start-preflight.mjs";

const manifest = JSON.stringify({ version: "0.4.5+test" });
const pluginList = (version = "0.4.5+test") => () => JSON.stringify({
  installed: [{
    pluginId: "pipeline-core@agent-pipeline",
    name: "pipeline-core",
    marketplaceName: "agent-pipeline",
    version,
    installed: true,
    enabled: true,
  }],
  available: [],
});

test("preflight reports exact identity and no-handoff without secret fields", () => {
  const result = observePipelineStartPreflight({
    env: {},
    pluginList: pluginList(),
    read: () => manifest,
  });
  assert.deepEqual(Object.keys(result).sort(), [
    "handoff", "installedVersion", "pluginRoot", "schema", "status", "version",
  ]);
  assert.equal(result.schema, SCHEMA);
  assert.equal(result.status, "ready");
  assert.equal(result.version, "0.4.5+test");
  assert.equal(result.installedVersion, "0.4.5+test");
  assert.equal(result.handoff, "none");
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
