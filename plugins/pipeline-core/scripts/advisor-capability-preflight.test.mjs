#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { runAdvisorCapabilityPreflight } from "./advisor-capability-preflight.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

test("productive preflight emits one closed model-free observation", () => {
  let output = "";
  const code = runAdvisorCapabilityPreflight([
    "--runner", "codex", "--profile", "feature", "--consent", "approved",
  ], (value) => { output += value; });
  assert.equal(code, 0);
  const evidence = JSON.parse(output);
  assert.equal(evidence.schema, "pipeline.advisory-capability-preflight.v2");
  assert.equal(evidence.state, "unknown");
  assert.deepEqual(evidence.effects, {
    childLaunches: 0,
    modelRequests: 0,
    questionExports: 0,
    receipts: 0,
    consultationBudgetMs: 0,
  });
});

test("malformed or additional CLI input fails before output", () => {
  for (const argv of [
    [],
    ["--runner", "codex", "--profile", "feature"],
    ["--runner", "codex", "--profile", "feature", "--consent", "approved", "--root", "/repo"],
    ["--runner", "other", "--profile", "feature", "--consent", "approved"],
  ]) assert.throws(() => runAdvisorCapabilityPreflight(argv, () => {}));
});

test("native process preflight on the current platform emits no adapter protocol or model effect", () => {
  for (const runner of ["claude", "codex"]) {
    const result = spawnSync(process.execPath, [
      join(HERE, "advisor-capability-preflight.mjs"),
      "--runner", runner,
      "--profile", "epic",
      "--consent", "approved",
    ], { encoding: "utf8", timeout: 5_000 });
    assert.equal(result.error, undefined, String(result.error));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout.includes("adapter.request"), false);
    const evidence = JSON.parse(result.stdout);
    assert.equal(Object.hasOwn(evidence, "question"), false);
    assert.equal(Object.hasOwn(evidence, "receipt"), false);
    assert.equal(evidence.effects.childLaunches, 0);
    assert.equal(evidence.effects.modelRequests, 0);
    assert.equal(evidence.effects.consultationBudgetMs, 0);
  }
});
